#!/usr/bin/env python3
"""重新训练系统预训练分类头 (jrc_water / dynamic_world / worldcover).

Usage:
    cd /workspace/xuannv_show
    conda run -n xuannv python scripts/train_system_models.py --task jrc_water
    conda run -n xuannv python scripts/train_system_models.py --task dynamic_world
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import rasterio
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score, f1_score
from sklearn.preprocessing import StandardScaler
from tqdm import tqdm

# ── Paths ──
EMB_DIR = Path("/workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025")
RAW_DIR = Path("/workspace/raw/harbin_scenes")
MODEL_DIR = Path(__file__).resolve().parent.parent / "backend" / "models"
METRICS_PATH = MODEL_DIR / "metrics.json"

# ── Task configs ──
TASK_CONFIG = {
    "jrc_water": {
        "gt_source": "jrc_water",
        "gt_file": "static.tif",
        "model_file": "jrc_water_linear_probe.pkl",
        "class_names": ["非水体", "水体"],
        "colors": [(180, 180, 180), (0, 100, 200)],
        "multi_class": "auto",
        "f1_average": "binary",
    },
    "dynamic_world": {
        "gt_source": "dynamic_world",
        "model_file": "dynamic_world_linear_probe.pkl",
        "class_names": ["水体", "树木", "草地", " flooded vegetation", "农田", "灌丛", "建筑", "裸地", "冰雪"],
        "colors": [
            (0, 100, 200),    # Water
            (0, 120, 0),      # Trees
            (150, 200, 50),   # Grass
            (0, 180, 180),    # Flooded veg
            (200, 180, 0),    # Crops
            (200, 100, 0),    # Shrub
            (200, 0, 0),      # Built
            (200, 200, 200),  # Bare
            (255, 255, 255),  # Snow
        ],
        "multi_class": "multinomial",
        "f1_average": "macro",
    },
    "worldcover": {
        "gt_source": "worldcover",
        "gt_file": "static.tif",
        "model_file": "worldcover_linear_probe.pkl",
        "class_names": ["森林", "灌丛", "草地", "农田", "建筑", "裸地", "冰雪", "水体", "湿地", "红树林", "苔藓"],
        "colors": [
            (0, 100, 0),      # Tree
            (150, 150, 0),    # Shrubland
            (200, 200, 0),    # Grassland
            (200, 180, 0),    # Cropland
            (200, 0, 0),      # Built-up
            (200, 200, 200),  # Bare
            (255, 255, 255),  # Snow
            (0, 100, 200),    # Water
            (0, 150, 100),    # Wetland
            (0, 80, 60),      # Mangroves
            (150, 200, 150),  # Moss
        ],
        "multi_class": "multinomial",
        "f1_average": "macro",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True, choices=list(TASK_CONFIG.keys()))
    parser.add_argument("--max-samples-per-class", type=int, default=50000,
                        help="每类最大采样数（防止内存爆炸）")
    return parser.parse_args()


def load_gt_jrc_water(gt_path: Path, target_h: int, target_w: int) -> np.ndarray | None:
    """JRC Water: -128=no-data, 0=non-water, >0=water."""
    with rasterio.open(str(gt_path)) as src:
        raw = src.read(1)
    gt = np.full(raw.shape, fill_value=-1, dtype=np.int32)
    gt[raw == -128] = -1
    gt[raw == 255] = -1
    gt[raw == 0] = 0
    gt[(raw > 0) & (raw != 255)] = 1
    if gt.shape != (target_h, target_w):
        gt_u8 = np.where(gt < 0, 255, gt).astype(np.uint8)
        gt = np.array(Image.fromarray(gt_u8).resize((target_w, target_h), Image.Resampling.NEAREST), dtype=np.int32)
        gt[gt == 255] = -1
    return gt


def load_gt_dynamic_world(patch_id: str, month: str, target_h: int, target_w: int) -> np.ndarray | None:
    """Dynamic World: 按季度匹配文件."""
    gt_dir = RAW_DIR / "dynamic_world" / patch_id
    if not gt_dir.exists():
        return None
    tifs = list(gt_dir.glob("*.tif"))
    if not tifs:
        return None

    # Match quarter
    year, mon = month.split("-")
    quarter = ((int(mon) - 1) // 3) + 1
    quarter_pattern = f"{year}Q{quarter}"
    matched = [t for t in tifs if quarter_pattern in t.name]
    if matched:
        selected = matched[0]
    else:
        # Fallback to most recent quarter
        selected = sorted(tifs)[-1]

    with rasterio.open(str(selected)) as src:
        raw = src.read(1)
    gt = raw.astype(np.int32)
    # Dynamic World classes: 0-8 (some may be missing in this region)
    if gt.shape != (target_h, target_w):
        gt_u8 = np.where(gt < 0, 255, gt).astype(np.uint8)
        gt = np.array(Image.fromarray(gt_u8).resize((target_w, target_h), Image.Resampling.NEAREST), dtype=np.int32)
        gt[gt == 255] = -1
    return gt


def load_gt_worldcover(gt_path: Path, target_h: int, target_w: int) -> np.ndarray | None:
    """WorldCover: direct class values."""
    with rasterio.open(str(gt_path)) as src:
        raw = src.read(1)
    gt = raw.astype(np.int32)
    if gt.shape != (target_h, target_w):
        gt_u8 = np.where(gt < 0, 255, gt).astype(np.uint8)
        gt = np.array(Image.fromarray(gt_u8).resize((target_w, target_h), Image.Resampling.NEAREST), dtype=np.int32)
        gt[gt == 255] = -1
    return gt


def main():
    args = parse_args()
    cfg = TASK_CONFIG[args.task]

    # Collect all embeddings
    emb_paths = sorted(EMB_DIR.glob("patch_*_2025-*.npy"))
    print(f"Total embedding files: {len(emb_paths)}")

    # Build training set with per-class sampling limit
    class_samples: dict[int, list[tuple[np.ndarray, int]]] = {}
    valid_patches = 0
    skipped_no_gt = 0

    for emb_path in tqdm(emb_paths, desc=f"Loading for {args.task}"):
        patch_id, month = emb_path.stem.rsplit("_", 1)

        emb = np.load(emb_path)
        D, H, W = emb.shape
        if D != 128:
            continue

        # Load GT
        if args.task == "jrc_water":
            gt_path = RAW_DIR / cfg["gt_source"] / patch_id / cfg["gt_file"]
            if not gt_path.exists():
                skipped_no_gt += 1
                continue
            gt = load_gt_jrc_water(gt_path, H, W)
        elif args.task == "dynamic_world":
            gt = load_gt_dynamic_world(patch_id, month, H, W)
            if gt is None:
                skipped_no_gt += 1
                continue
        elif args.task == "worldcover":
            gt_path = RAW_DIR / cfg["gt_source"] / patch_id / cfg["gt_file"]
            if not gt_path.exists():
                skipped_no_gt += 1
                continue
            gt = load_gt_worldcover(gt_path, H, W)
        else:
            continue

        emb_flat = emb.reshape(D, -1).T  # [H*W, D]
        gt_flat = gt.flatten()             # [H*W]

        # Filter valid pixels
        valid_mask = gt_flat >= 0
        if not valid_mask.any():
            continue

        emb_flat = emb_flat[valid_mask]
        gt_flat = gt_flat[valid_mask]

        valid_patches += 1

        # Accumulate per-class samples (with limit)
        for cls in np.unique(gt_flat):
            cls = int(cls)
            idx = np.where(gt_flat == cls)[0]
            if cls not in class_samples:
                class_samples[cls] = []
            remaining = args.max_samples_per_class - len(class_samples[cls])
            if remaining <= 0:
                continue
            if len(idx) > remaining:
                idx = np.random.choice(idx, remaining, replace=False)
            class_samples[cls].extend([(emb_flat[i], cls) for i in idx])

    print(f"Valid patches: {valid_patches}, skipped (no GT): {skipped_no_gt}")
    print(f"Classes found: {sorted(class_samples.keys())}")
    for cls, samples in sorted(class_samples.items()):
        print(f"  Class {cls}: {len(samples)} samples")

    if not class_samples:
        print("No training data!")
        sys.exit(1)

    # Build balanced dataset
    X_list, y_list = [], []
    for cls, samples in sorted(class_samples.items()):
        if not samples:
            continue
        X_list.append(np.stack([s[0] for s in samples]))
        y_list.append(np.array([s[1] for s in samples]))

    X = np.vstack(X_list)
    y = np.concatenate(y_list)
    print(f"Total samples: {len(y)}")

    # Train
    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)

    clf = LogisticRegression(
        max_iter=1000,
        solver="lbfgs",
        class_weight="balanced",
    )
    clf.fit(X_s, y)

    # Metrics
    y_pred = clf.predict(X_s)
    bacc = balanced_accuracy_score(y, y_pred)
    try:
        f1 = f1_score(y, y_pred, average=cfg["f1_average"])
    except ValueError:
        # Fallback for binary with missing class in predictions
        f1 = f1_score(y, y_pred, average="macro")

    print(f"Balanced accuracy: {bacc:.4f}")
    print(f"F1 ({cfg['f1_average']}):       {f1:.4f}")

    # Save model
    # Determine actual classes present in training data
    present_classes = sorted(class_samples.keys())
    model_data = {
        "scaler": scaler,
        "model": clf,
        "classes": present_classes,
        "class_names": [cfg["class_names"][c] if c < len(cfg["class_names"]) else f"Class_{c}" for c in present_classes],
        "colors": [cfg["colors"][c] if c < len(cfg["colors"]) else (128, 128, 128) for c in present_classes],
        "trained_at": "2026-04-29",
        "n_samples": len(y),
        "n_classes": len(present_classes),
    }
    model_path = MODEL_DIR / cfg["model_file"]
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model_data, model_path)
    print(f"Saved model to {model_path}")

    # Update metrics.json
    metrics = []
    if METRICS_PATH.exists():
        with open(METRICS_PATH) as f:
            metrics = json.load(f)
    new_metric = {
        "task": args.task,
        "n_samples": len(y),
        "n_classes": len(present_classes),
        "balanced_accuracy": bacc,
        "f1_score": f1,
        "f1_average": cfg["f1_average"],
    }
    metrics = [m for m in metrics if m.get("task") != args.task]
    metrics.append(new_metric)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    print(f"Updated metrics.json")


if __name__ == "__main__":
    main()
