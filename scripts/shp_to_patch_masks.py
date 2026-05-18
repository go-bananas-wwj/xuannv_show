#!/usr/bin/env python3
"""
SHP → Patch Mask 转换脚本
将哈尔滨新区的 SHP 标注多边形转换为 64×64 的 Patch 级 binary mask。

输入:
  - data/harbin/patches_meta.json  (patch 元数据, EPSG:32652)
  - /workspace/哈尔滨松北新区变化检测汇总文件/变化检测shp文件/*.shp  (EPSG:4490)

输出:
  - data/harbin/labels/<task_name>/<patch_id>.npy  (64×64 binary mask)
  - data/harbin/labels/<task_name>/meta.json  (标签统计信息)

任务映射:
  construction      → SAR建筑工地.shp
  building_change   → October.shp + SAR房屋拆除.shp + SAR疑似违建.shp
  farmland          → SAR非农非粮.shp
"""

import json
import os
import numpy as np
import geopandas as gpd
from shapely.geometry import box
from shapely.ops import transform
import pyproj
from tqdm import tqdm
from concurrent.futures import ProcessPoolExecutor, as_completed
import argparse

# ============ 配置 ============
SHP_DIR = "/workspace/哈尔滨松北新区变化检测汇总文件/变化检测shp文件"
PATCHES_META_PATH = "/workspace/xuannv_show/data/harbin/patches_meta.json"
OUTPUT_DIR = "/workspace/xuannv_show/data/harbin/labels"
GRID_SIZE = 64  # embedding 空间分辨率

TASKS = {
    "construction": {
        "files": ["SAR建筑工地.shp"],
        "description": "建筑工地监测",
    },
    "building_change": {
        "files": ["October.shp", "SAR房屋拆除.shp", "SAR疑似违建.shp"],
        "description": "建筑变化监测",
    },
    "farmland": {
        "files": ["SAR非农非粮.shp"],
        "description": "耕地非农非粮监测",
    },
}

# 坐标转换: EPSG:4490 → EPSG:32652
CRS_SRC = "EPSG:4490"
CRS_DST = "EPSG:32652"


def load_patches_meta(path: str):
    """加载 patch 元数据并构建空间索引。"""
    with open(path) as f:
        patches = json.load(f)

    # 构建 GeoDataFrame 作为空间索引
    records = []
    for p in patches:
        b = p["bounds"]
        records.append({
            "patch_id": p["patch_id"],
            "ix": p["ix"],
            "iy": p["iy"],
            "bounds_utm": b,
            "geometry": box(b[0], b[1], b[2], b[3]),
        })

    gdf = gpd.GeoDataFrame(records, crs=CRS_DST)
    return gdf


def load_and_merge_shp(task_name: str, task_config: dict) -> gpd.GeoDataFrame:
    """加载并合并一个任务的所有 shp 文件。"""
    all_geoms = []
    for fname in task_config["files"]:
        fpath = os.path.join(SHP_DIR, fname)
        if not os.path.exists(fpath):
            print(f"  ⚠️ 文件不存在，跳过: {fpath}")
            continue
        gdf = gpd.read_file(fpath)
        if gdf.crs is None:
            print(f"  ⚠️ {fname} 无 CRS，假设为 {CRS_SRC}")
            gdf.set_crs(CRS_SRC, inplace=True)
        # 坐标转换
        if str(gdf.crs) != CRS_DST:
            gdf = gdf.to_crs(CRS_DST)
        all_geoms.append(gdf)
        print(f"  ✅ {fname}: {len(gdf)} polygons")

    if not all_geoms:
        raise ValueError(f"Task {task_name}: no valid SHP files found")

    merged = gpd.GeoDataFrame(pd.concat(all_geoms, ignore_index=True), crs=CRS_DST)
    print(f"  📊 {task_name} 总计: {len(merged)} polygons")
    return merged


def rasterize_polygon_to_patch(patch_info, polygons_gdf):
    """
    将一个 patch 与所有 polygon 做交集，生成 64×64 binary mask。

    patch_info: dict with keys: patch_id, bounds_utm, geometry
    polygons_gdf: GeoDataFrame with polygons (already in CRS_DST)

    Returns: dict or None
    """
    patch_geom = patch_info["geometry"]
    b = patch_info["bounds_utm"]
    xmin, ymin, xmax, ymax = b

    # 快速空间过滤: 只找与 patch 相交的 polygon
    intersects = polygons_gdf[polygons_gdf.intersects(patch_geom)]
    if len(intersects) == 0:
        return None

    # 计算 patch 内每个像素是否被 polygon 覆盖
    # 每个像素大小: (xmax-xmin)/GRID_SIZE × (ymax-ymin)/GRID_SIZE
    pixel_w = (xmax - xmin) / GRID_SIZE
    pixel_h = (ymax - ymin) / GRID_SIZE

    mask = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.uint8)

    for idx, row in intersects.iterrows():
        poly = row.geometry
        # 取交集（限制在 patch 范围内）
        inter = poly.intersection(patch_geom)
        if inter.is_empty:
            continue

        # 栅格化: 对每个像素中心点做包含判断
        # 使用向量化加速
        for i in range(GRID_SIZE):
            px_min = xmin + i * pixel_w
            px_max = px_min + pixel_w
            for j in range(GRID_SIZE):
                py_min = ymin + j * pixel_h
                py_max = py_min + pixel_h
                pixel_box = box(px_min, py_min, px_max, py_max)
                # 如果 pixel 与 polygon 交集面积 > 0，标记为 1
                if pixel_box.intersects(inter):
                    mask[j, i] = 1

    # 只保存有正样本的 mask
    if mask.sum() == 0:
        return None

    return {
        "patch_id": patch_info["patch_id"],
        "mask": mask,
        "polygon_count": len(intersects),
        "positive_pixels": int(mask.sum()),
    }


def process_task(task_name: str, task_config: dict, patches_gdf: gpd.GeoDataFrame, num_workers: int = 8):
    """处理单个任务。"""
    print(f"\n{'='*60}")
    print(f"🚀 处理任务: {task_name} ({task_config['description']})")
    print(f"{'='*60}")

    # 加载并合并 shp
    polygons_gdf = load_and_merge_shp(task_name, task_config)

    # 创建输出目录
    task_out_dir = os.path.join(OUTPUT_DIR, task_name)
    os.makedirs(task_out_dir, exist_ok=True)

    # 准备 patch 列表
    patch_records = patches_gdf.to_dict("records")

    # 并行处理每个 patch
    results = []
    if num_workers > 1:
        with ProcessPoolExecutor(max_workers=num_workers) as executor:
            futures = {
                executor.submit(rasterize_polygon_to_patch, rec, polygons_gdf): rec
                for rec in patch_records
            }
            for future in tqdm(as_completed(futures), total=len(futures), desc=f"  {task_name}"):
                try:
                    res = future.result()
                    if res is not None:
                        results.append(res)
                except Exception as e:
                    rec = futures[future]
                    print(f"    ⚠️ patch {rec['patch_id']} 处理失败: {e}")
    else:
        for rec in tqdm(patch_records, desc=f"  {task_name}"):
            res = rasterize_polygon_to_patch(rec, polygons_gdf)
            if res is not None:
                results.append(res)

    # 保存 mask 文件
    meta_list = []
    for res in results:
        patch_id = res["patch_id"]
        mask = res["mask"]
        out_path = os.path.join(task_out_dir, f"{patch_id}.npy")
        np.save(out_path, mask)
        meta_list.append({
            "patch_id": patch_id,
            "polygon_count": res["polygon_count"],
            "positive_pixels": res["positive_pixels"],
            "positive_ratio": round(res["positive_pixels"] / (GRID_SIZE * GRID_SIZE), 4),
        })

    # 保存 meta.json
    meta = {
        "task": task_name,
        "description": task_config["description"],
        "grid_size": GRID_SIZE,
        "total_polygons": len(polygons_gdf),
        "total_patches": len(patches_gdf),
        "positive_patches": len(meta_list),
        "negative_patches": len(patches_gdf) - len(meta_list),
        "patches": meta_list,
    }
    meta_path = os.path.join(task_out_dir, "meta.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    print(f"  ✅ 正样本 patch: {len(meta_list)} / {len(patches_gdf)}")
    print(f"  📁 输出目录: {task_out_dir}")
    return meta


def main():
    parser = argparse.ArgumentParser(description="Convert SHP polygons to patch masks")
    parser.add_argument("--tasks", nargs="+", default=list(TASKS.keys()),
                        help=f"Tasks to process (default: {' '.join(TASKS.keys())})")
    parser.add_argument("--workers", type=int, default=8, help="Number of parallel workers")
    args = parser.parse_args()

    print("🔧 加载 patch 元数据...")
    patches_gdf = load_patches_meta(PATCHES_META_PATH)
    print(f"  ✅ {len(patches_gdf)} patches loaded, CRS={patches_gdf.crs}")

    all_meta = {}
    for task_name in args.tasks:
        if task_name not in TASKS:
            print(f"❌ 未知任务: {task_name}")
            continue
        meta = process_task(task_name, TASKS[task_name], patches_gdf, num_workers=args.workers)
        all_meta[task_name] = meta

    # 保存总览
    summary_path = os.path.join(OUTPUT_DIR, "summary.json")
    with open(summary_path, "w") as f:
        json.dump(all_meta, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print("🎉 全部完成!")
    print(f"{'='*60}")
    for task_name, meta in all_meta.items():
        print(f"  {task_name}: {meta['positive_patches']} positive / {meta['total_patches']} total")


if __name__ == "__main__":
    import pandas as pd
    main()
