#!/usr/bin/env python3
"""重新训练 building_extraction Linear Probe 模型.

GT 修复后，building_extraction 使用 OSM [0,1] 数据而非 WorldCover Built-up (50)。
Usage:
    cd /workspace/xuannv_show
    conda run -n xuannv python scripts/train_building_probe.py
"""
from __future__ import annotations

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
GT_DIR = Path("/workspace/raw/harbin_scenes/osm_buildings")
MODEL_PATH = Path(__file__).resolve().parent.parent / "backend" / "models" / "building_linear_probe.pkl"
METRICS_PATH = Path(__file__).resolve().parent.parent / "backend" / "models" / "metrics.json"

MONTH = "2025-04"

# Colors: [Non-building gray, Building red]
COLORS = [(100, 100, 100), (250, 0, 0)]
CLASS_NAMES = ["Non-building", "Building"]


def main():
    emb_paths = sorted(EMB_DIR.glob(f"patch_*_{MONTH}.npy"))
    print(f"Total embedding files for {MONTH}: {len(emb_paths)}")

    X_list, y_list = [], []
    valid_patches = 0

    for emb_path in tqdm(emb_paths, desc="Loading patches"):
        patch_id = emb_path.stem.rsplit("_", 1)[0]
        gt_path = GT_DIR / patch_id / "static.tif"
        if not gt_path.exists():
            continue

        emb = np.load(emb_path)  # [D, 64, 64]
        D, H, W = emb.shape
        if D != 128:
            # Skip unexpected shape
            continue

        with rasterio.open(str(gt_path)) as src:
            gt = src.read(1)  # [H_gt, W_gt]

        # Resize GT to 64x64 to match embedding
        gt_pil = Image.fromarray(gt.astype(np.uint8))
        gt_64 = np.array(gt_pil.resize((W, H), Image.Resampling.NEAREST), dtype=np.int32)

        emb_flat = emb.reshape(D, -1).T  # [H*W, D]
        gt_flat = gt_64.flatten()          # [H*W]

        # OSM GT is [0, 1]; 0 = non-building, 1 = building
        # We need balanced sampling
        pos_idx = np.where(gt_flat == 1)[0]
        neg_idx = np.where(gt_flat == 0)[0]

        if len(pos_idx) == 0:
            continue

        valid_patches += 1

        # Use all positive samples
        X_list.append(emb_flat[pos_idx])
        y_list.append(np.ones(len(pos_idx), dtype=np.int32))

        # Subsample negative samples to balance (max 3x positive)
        n_neg = min(len(neg_idx), len(pos_idx) * 3)
        if n_neg > 0:
            neg_sample = np.random.choice(neg_idx, n_neg, replace=False)
            X_list.append(emb_flat[neg_sample])
            y_list.append(np.zeros(n_neg, dtype=np.int32))

    print(f"Valid patches: {valid_patches}")
    if not X_list:
        print("No training data!")
        sys.exit(1)

    X = np.vstack(X_list)
    y = np.concatenate(y_list)
    print(f"Total samples: {len(y)} (pos={np.sum(y==1)}, neg={np.sum(y==0)})")

    # Train
    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)

    clf = LogisticRegression(max_iter=1000, solver="lbfgs")
    clf.fit(X_s, y)

    # Metrics
    y_pred = clf.predict(X_s)
    bacc = balanced_accuracy_score(y, y_pred)
    f1 = f1_score(y, y_pred, average="binary")

    print(f"Balanced accuracy: {bacc:.4f}")
    print(f"F1 (binary):       {f1:.4f}")

    # Save
    model_data = {
        "scaler": scaler,
        "model": clf,
        "classes": [0, 1],
        "class_names": CLASS_NAMES,
        "colors": COLORS,
        "trained_at": "2026-04-29",
        "n_samples": len(y),
        "n_classes": 2,
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model_data, MODEL_PATH)
    print(f"Saved model to {MODEL_PATH}")

    # Update metrics.json
    import json
    metrics = []
    if METRICS_PATH.exists():
        with open(METRICS_PATH) as f:
            metrics = json.load(f)
    # Replace or append building_extraction metric
    new_metric = {
        "task": "building_extraction",
        "n_samples": len(y),
        "n_classes": 2,
        "balanced_accuracy": bacc,
        "f1_score": f1,
        "f1_average": "binary",
    }
    metrics = [m for m in metrics if m.get("task") != "building_extraction"]
    metrics.append(new_metric)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    print(f"Updated metrics.json")


if __name__ == "__main__":
    main()
