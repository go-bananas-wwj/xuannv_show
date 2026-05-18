#!/usr/bin/env python3
"""
将概率图 (.npy) 转换为 PNG tiles 和 mosaic 大图。

输入: data/harbin/predictions/<task>/<patch_id>_2025-10.npy
输出: 
  - data/harbin/results/<task>/tiles/<patch_id>_2025-10.png  (128×128 tile)
  - data/harbin/results/<task>/mosaic_2025-10.png  (全局大图)
"""

import argparse
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image
from tqdm import tqdm

PREDICTIONS_DIR = "/workspace/xuannv_show/data/harbin/predictions"
PATCHES_META_PATH = "/workspace/xuannv_show/data/harbin/patches_meta.json"
OUTPUT_BASE = "/workspace/xuannv_show/data/harbin/results"

# 颜色映射: 概率 0→1 映射到 蓝→青→绿→黄→红 (类似 jet)
import matplotlib.cm as cm
_CMAP = cm.get_cmap("jet")


def prob_to_rgb(prob: np.ndarray) -> np.ndarray:
    """概率图 [H, W] → RGB [H, W, 3]."""
    # 归一化到 0-1 (按全局统计，但这里用固定范围)
    prob_norm = np.clip(prob, 0, 1)
    rgb = (_CMAP(prob_norm)[:, :, :3] * 255).astype(np.uint8)
    return rgb


def build_mosaic(task_name: str, month: str, patch_size: int = 128):
    """拼接全局 mosaic 大图。"""
    # 加载 patches 元数据
    with open(PATCHES_META_PATH) as f:
        patches = json.load(f)

    all_ix = [p["ix"] for p in patches]
    all_iy = [p["iy"] for p in patches]
    ix_min, ix_max = min(all_ix), max(all_ix)
    iy_min, iy_max = min(all_iy), max(all_iy)

    nx = ix_max - ix_min + 1
    ny = iy_max - iy_min + 1

    mosaic = np.zeros((ny * patch_size, nx * patch_size, 3), dtype=np.uint8)

    pred_dir = Path(PREDICTIONS_DIR) / task_name
    missing = 0

    for p in tqdm(patches, desc=f"Mosaic {task_name}"):
        ix = p["ix"] - ix_min
        iy = p["iy"] - iy_min
        patch_id = p["patch_id"]

        pred_path = pred_dir / f"{patch_id}_{month}.npy"
        if not pred_path.exists():
            missing += 1
            continue

        prob = np.load(pred_path)
        rgb = prob_to_rgb(prob)

        # Resize to patch_size
        img = Image.fromarray(rgb)
        img = img.resize((patch_size, patch_size), Image.Resampling.NEAREST)
        rgb_resized = np.array(img)

        y0 = iy * patch_size
        x0 = ix * patch_size
        mosaic[y0:y0 + patch_size, x0:x0 + patch_size] = rgb_resized

    print(f"  Missing tiles: {missing}/{len(patches)}")

    # 保存
    out_dir = Path(OUTPUT_BASE) / task_name
    out_dir.mkdir(parents=True, exist_ok=True)
    mosaic_path = out_dir / f"mosaic_{month}.png"
    Image.fromarray(mosaic).save(mosaic_path)
    print(f"  Mosaic saved: {mosaic_path} ({mosaic.shape[1]}×{mosaic.shape[0]})")


def build_tiles(task_name: str, month: str, tile_size: int = 128):
    """生成每个 patch 的 tile PNG。"""
    pred_dir = Path(PREDICTIONS_DIR) / task_name
    out_dir = Path(OUTPUT_BASE) / task_name / "tiles"
    out_dir.mkdir(parents=True, exist_ok=True)

    pred_files = sorted(pred_dir.glob(f"*_{month}.npy"))
    print(f"[{task_name}] 生成 {len(pred_files)} 个 tiles...")

    for pred_path in tqdm(pred_files, desc=f"Tiles {task_name}"):
        prob = np.load(pred_path)
        rgb = prob_to_rgb(prob)

        img = Image.fromarray(rgb)
        img = img.resize((tile_size, tile_size), Image.Resampling.NEAREST)

        out_path = out_dir / pred_path.name.replace(".npy", ".png")
        img.save(out_path)

    print(f"  Tiles saved: {out_dir}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", type=str, required=True, choices=["construction", "building_change", "farmland"])
    parser.add_argument("--month", type=str, default="2025-10")
    parser.add_argument("--tile_size", type=int, default=128)
    parser.add_argument("--skip_mosaic", action="store_true")
    parser.add_argument("--skip_tiles", action="store_true")
    args = parser.parse_args()

    if not args.skip_tiles:
        build_tiles(args.task, args.month, args.tile_size)
    if not args.skip_mosaic:
        build_mosaic(args.task, args.month, args.tile_size)


if __name__ == "__main__":
    main()
