#!/usr/bin/env python3
"""
SHP → Patch Mask 转换脚本 v2

改进点：
  1. 按时间对分组（before_month vs after_month）
  2. 按变化类型分类（construction / demolition / land_conversion）
  3. 每个 polygon 使用正确的两期 embedding 月份

输入:
  - Excel 变化检测清单（含备注/变化类型）
  - SHP 多边形文件（EPSG:4490）
  - data/harbin/patches_meta.json（EPSG:32652）

输出:
  - data/harbin/labels_v2/<task>/<period>/<patch_id>.npy
  - data/harbin/labels_v2/<task>/<period>/meta.json
"""

import json
import os
import re
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import box
from tqdm import tqdm

# ============ 配置 ============
SHP_DIR = "/workspace/哈尔滨松北新区变化检测汇总文件/变化检测shp文件"
EXCEL_DIR = "/workspace/哈尔滨松北新区变化检测汇总文件/变化检测清单"
PATCHES_META_PATH = "/workspace/xuannv_show/data/harbin/patches_meta.json"
OUTPUT_DIR = "/workspace/xuannv_show/data/harbin/labels_v2"
GRID_SIZE = 64
CRS_SRC = "EPSG:4490"
CRS_DST = "EPSG:32652"

# Excel → SHP → 时间对 映射
PERIOD_CONFIGS = [
    {
        "period": "2025-04_vs_2025-06",
        "before": "2025-04",
        "after": "2025-06",
        "shp": "june.shp",
        "excel": "4-6月份变化检测图斑.xlsx",
    },
    {
        "period": "2025-08_vs_2025-09",
        "before": "2025-08",
        "after": "2025-09",
        "shp": "September.shp",
        "excel": "8-9月份变化检测图斑.xlsx",
    },
    {
        "period": "2025-09_vs_2025-10",
        "before": "2025-09",
        "after": "2025-10",
        "shp": "October.shp",
        "excel": "9-10月份变化检测图斑.xlsx",
    },
]


def classify_change(note: str) -> str | None:
    """根据备注文本分类变化类型。"""
    note = str(note)
    if "建筑工地" in note or "施工" in note or "建造房屋" in note or "道路" in note or "新建房屋" in note:
        return "construction"
    elif "房屋拆除" in note:
        return "demolition"
    elif ("裸地开挖" in note and ("水塘" in note or "农田" in note or "水田" in note)) or \
         ("水塘填埋" in note) or ("转换为裸地" in note):
        return "land_conversion"
    else:
        return None


def load_patches_meta(path: str):
    with open(path) as f:
        patches = json.load(f)
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


def rasterize_polygon_to_patch(patch_info, polygons_gdf):
    patch_geom = patch_info["geometry"]
    b = patch_info["bounds_utm"]
    xmin, ymin, xmax, ymax = b

    intersects = polygons_gdf[polygons_gdf.intersects(patch_geom)]
    if len(intersects) == 0:
        return None

    pixel_w = (xmax - xmin) / GRID_SIZE
    pixel_h = (ymax - ymin) / GRID_SIZE
    mask = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.uint8)

    for idx, row in intersects.iterrows():
        poly = row.geometry
        inter = poly.intersection(patch_geom)
        if inter.is_empty:
            continue
        for i in range(GRID_SIZE):
            px_min = xmin + i * pixel_w
            px_max = px_min + pixel_w
            for j in range(GRID_SIZE):
                py_min = ymin + j * pixel_h
                py_max = py_min + pixel_h
                pixel_box = box(px_min, py_min, px_max, py_max)
                if pixel_box.intersects(inter):
                    mask[j, i] = 1

    if mask.sum() == 0:
        return None

    # 关键修复：mask[j=0] 对应地理 ymin(south)，但影像 row=0 对应地理 ymax(north)
    # 上下翻转使 mask 与影像坐标对齐
    mask = mask[::-1, :]

    return {
        "patch_id": patch_info["patch_id"],
        "mask": mask,
        "polygon_count": len(intersects),
        "positive_pixels": int(mask.sum()),
    }


def process_period(period_cfg: dict, patches_gdf: gpd.GeoDataFrame):
    period = period_cfg["period"]
    shp_name = period_cfg["shp"]
    excel_name = period_cfg["excel"]

    print(f"\n{'='*60}")
    print(f"📅 处理时间对: {period}")
    print(f"{'='*60}")

    # 加载 SHP
    shp_path = os.path.join(SHP_DIR, shp_name)
    gdf_shp = gpd.read_file(shp_path)
    if gdf_shp.crs is None:
        gdf_shp.set_crs(CRS_SRC, inplace=True)
    if str(gdf_shp.crs) != CRS_DST:
        gdf_shp = gdf_shp.to_crs(CRS_DST)
    print(f"  ✅ SHP: {shp_name}, {len(gdf_shp)} polygons")

    # 加载 Excel
    excel_path = os.path.join(EXCEL_DIR, excel_name)
    df_excel = pd.read_excel(excel_path)
    print(f"  ✅ Excel: {excel_name}, {len(df_excel)} records")

    # 确保 FID/Id 对应
    if "Id" in gdf_shp.columns and "FID" in df_excel.columns:
        id_col = "Id"
        excel_id_col = "FID"
    elif "Id" in gdf_shp.columns and "Id" in df_excel.columns:
        id_col = "Id"
        excel_id_col = "Id"
    else:
        raise ValueError(f"Cannot match IDs: SHP cols={list(gdf_shp.columns)}, Excel cols={list(df_excel.columns)}")

    # 为每个 polygon 标注变化类型
    gdf_shp["task"] = None
    for _, row in df_excel.iterrows():
        fid = row[excel_id_col]
        note = row.get("备注", "")
        task = classify_change(note)
        gdf_shp.loc[gdf_shp[id_col] == fid, "task"] = task
        gdf_shp.loc[gdf_shp[id_col] == fid, "note"] = note

    # 按任务分组
    task_counts = gdf_shp["task"].value_counts(dropna=False)
    print(f"  📊 变化类型分布:")
    for task, count in task_counts.items():
        print(f"    {task}: {count}")

    all_meta = {}

    for task in ["construction", "demolition", "land_conversion"]:
        task_gdf = gdf_shp[gdf_shp["task"] == task]
        if len(task_gdf) == 0:
            print(f"  ⚠️ 任务 {task} 无 polygon，跳过")
            continue

        task_out_dir = os.path.join(OUTPUT_DIR, task, period)
        os.makedirs(task_out_dir, exist_ok=True)

        # 栅格化
        results = []
        for rec in tqdm(patches_gdf.to_dict("records"), desc=f"  {task}", leave=False):
            res = rasterize_polygon_to_patch(rec, task_gdf)
            if res is not None:
                results.append(res)

        # 保存 mask
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

        meta = {
            "task": task,
            "period": period,
            "grid_size": GRID_SIZE,
            "total_polygons": len(task_gdf),
            "total_patches": len(patches_gdf),
            "positive_patches": len(meta_list),
            "negative_patches": len(patches_gdf) - len(meta_list),
            "patches": meta_list,
        }
        meta_path = os.path.join(task_out_dir, "meta.json")
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)

        print(f"  ✅ {task}: {len(meta_list)} 正样本 / {len(patches_gdf)} 总 patch")
        all_meta[task] = meta

    return all_meta


def main():
    print("🔧 加载 patch 元数据...")
    patches_gdf = load_patches_meta(PATCHES_META_PATH)
    print(f"  ✅ {len(patches_gdf)} patches, CRS={patches_gdf.crs}")

    global_meta = {}
    for cfg in PERIOD_CONFIGS:
        meta = process_period(cfg, patches_gdf)
        global_meta[cfg["period"]] = meta

    # 保存全局汇总
    summary_path = os.path.join(OUTPUT_DIR, "summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(global_meta, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print("🎉 全部完成!")
    print(f"{'='*60}")
    for period, tasks in global_meta.items():
        print(f"\n📅 {period}:")
        for task, meta in tasks.items():
            print(f"  {task}: {meta['positive_patches']} 正样本 / {meta['total_patches']} 总 patch ({meta['total_polygons']} polygons)")


if __name__ == "__main__":
    main()
