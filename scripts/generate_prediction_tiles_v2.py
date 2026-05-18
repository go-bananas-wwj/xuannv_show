#!/usr/bin/env python3
"""
将概率图 (.npy) 转换为 PNG tiles 和 mosaic 大图 — v2 版本
支持 predictions_v2/<task>/<period>/ 目录结构

输出:
  - data/harbin/results_v2/<task>/<period>/tiles/<patch_id>.png
  - data/harbin/results_v2/<task>/<period>/<period>.png
"""

import argparse
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image
from tqdm import tqdm
import matplotlib.cm as cm

PREDICTIONS_DIR = "/workspace/xuannv_show/data/harbin/predictions_v2"
PATCHES_META_PATH = "/workspace/xuannv_show/data/harbin/patches_meta.json"
OUTPUT_BASE = "/workspace/xuannv_show/data/harbin/results_v2"

try:
    _CMAP = cm.colormaps["jet"]
except AttributeError:
    _CMAP = cm.get_cmap("jet")


def prob_to_rgb(prob: np.ndarray) -> np.ndarray:
    prob_norm = np.clip(prob, 0, 1)
    rgb = (_CMAP(prob_norm)[:, :, :3] * 255).astype(np.uint8)
    return rgb


def build_mosaic(task_name: str, period: str, patch_size: int = 128):
    with open(PATCHES_META_PATH) as f:
        patches = json.load(f)

    all_ix = [p["ix"] for p in patches]
    all_iy = [p["iy"] for p in patches]
    ix_min, ix_max = min(all_ix), max(all_ix)
    iy_min, iy_max = min(all_iy), max(all_iy)

    nx = ix_max - ix_min + 1
    ny = iy_max - iy_min + 1
    mosaic = np.zeros((ny * patch_size, nx * patch_size, 3), dtype=np.uint8)

    pred_dir = Path(PREDICTIONS_DIR) / task_name / period
    missing = 0

    for p in tqdm(patches, desc=f"Mosaic {task_name}/{period}", leave=False):
        ix = p["ix"] - ix_min
        iy = p["iy"] - iy_min
        patch_id = p["patch_id"]

        pred_path = pred_dir / f"{patch_id}.npy"
        if not pred_path.exists():
            missing += 1
            continue

        prob = np.load(pred_path)
        rgb = prob_to_rgb(prob)
        img = Image.fromarray(rgb)
        img = img.resize((patch_size, patch_size), Image.Resampling.NEAREST)
        rgb_resized = np.array(img)

        y0 = iy * patch_size
        x0 = ix * patch_size
        mosaic[y0:y0 + patch_size, x0:x0 + patch_size] = rgb_resized

    out_dir = Path(OUTPUT_BASE) / task_name / period
    out_dir.mkdir(parents=True, exist_ok=True)
    mosaic_path = out_dir / f"{period}.png"
    Image.fromarray(mosaic).save(mosaic_path)
    print(f"  Mosaic: {mosaic_path} ({mosaic.shape[1]}×{mosaic.shape[0]}), missing={missing}")


def build_tiles(task_name: str, period: str, tile_size: int = 128):
    pred_dir = Path(PREDICTIONS_DIR) / task_name / period
    out_dir = Path(OUTPUT_BASE) / task_name / period / "tiles"
    out_dir.mkdir(parents=True, exist_ok=True)

    pred_files = sorted(pred_dir.glob("*.npy"))
    for pred_path in tqdm(pred_files, desc=f"Tiles {task_name}/{period}", leave=False):
        prob = np.load(pred_path)
        rgb = prob_to_rgb(prob)
        img = Image.fromarray(rgb)
        img = img.resize((tile_size, tile_size), Image.Resampling.NEAREST)
        out_path = out_dir / pred_path.name.replace(".npy", ".png")
        img.save(out_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", type=str, required=True)
    parser.add_argument("--period", type=str, required=True)
    parser.add_argument("--tile_size", type=int, default=128)
    args = parser.parse_args()

    build_tiles(args.task, args.period, args.tile_size)
    build_mosaic(args.task, args.period, args.tile_size)


if __name__ == "__main__":
    main()
