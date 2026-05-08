#!/usr/bin/env python3
"""使用 sklearn MLPClassifier 训练系统模型（与 Linear Probe 直接对比）.

Usage:
    conda run -n xuannv python scripts/train_system_models_sklearn_mlp.py --task jrc_water
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
from sklearn.metrics import balanced_accuracy_score, f1_score
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from tqdm import tqdm

EMB_DIR = Path("/workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025")
RAW_DIR = Path("/workspace/raw/harbin_scenes")
MODEL_DIR = Path(__file__).resolve().parent.parent / "backend" / "models"
METRICS_PATH = MODEL_DIR / "metrics.json"

TASK_CONFIG = {
    "jrc_water": {
        "gt_source": "jrc_water", "gt_file": "static.tif", "model_file": "jrc_water_sklearn_mlp.pkl",
        "class_names": ["非水体", "水体"], "colors": [(180, 180, 180), (0, 100, 200)],
        "f1_average": "binary",
    },
    "dynamic_world": {
        "gt_source": "dynamic_world", "model_file": "dynamic_world_sklearn_mlp.pkl",
        "class_names": ["水体", "树木", "草地", "flooded veg", "农田", "灌丛", "建筑", "裸地", "冰雪"],
        "colors": [(0,100,200),(0,120,0),(150,200,50),(0,180,180),(200,180,0),(200,100,0),(200,0,0),(200,200,200),(255,255,255)],
        "f1_average": "macro",
    },
    "worldcover": {
        "gt_source": "worldcover", "gt_file": "static.tif", "model_file": "worldcover_sklearn_mlp.pkl",
        "class_names": ["森林","灌丛","草地","农田","建筑","裸地","冰雪","水体","湿地","红树林","苔藓"],
        "colors": [(0,100,0),(150,150,0),(200,200,0),(200,180,0),(200,0,0),(200,200,200),(255,255,255),(0,100,200),(0,150,100),(0,80,60),(150,200,150)],
        "f1_average": "macro",
    },
    "building_extraction": {
        "gt_source": "osm_buildings", "gt_file": "static.tif", "model_file": "building_sklearn_mlp.pkl",
        "class_names": ["非建筑", "建筑"], "colors": [(200,200,200),(250,0,0)],
        "f1_average": "binary",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True, choices=list(TASK_CONFIG.keys()))
    parser.add_argument("--max-samples-per-class", type=int, default=40000)
    parser.add_argument("--hidden", default="256,128", help="隐藏层大小，逗号分隔")
    return parser.parse_args()


def load_gt(task: str, patch_id: str, month: str, target_h: int, target_w: int) -> np.ndarray | None:
    cfg = TASK_CONFIG[task]
    if task == "jrc_water":
        gt_path = RAW_DIR / cfg["gt_source"] / patch_id / cfg["gt_file"]
        if not gt_path.exists(): return None
        with rasterio.open(str(gt_path)) as src:
            raw = src.read(1)
        gt = np.full(raw.shape, fill_value=-1, dtype=np.int32)
        gt[raw == -128] = -1; gt[raw == 255] = -1; gt[raw == 0] = 0; gt[(raw > 0) & (raw != 255)] = 1
    elif task == "dynamic_world":
        gt_dir = RAW_DIR / "dynamic_world" / patch_id
        if not gt_dir.exists(): return None
        tifs = list(gt_dir.glob("*.tif"))
        if not tifs: return None
        year, mon = month.split("-")
        quarter = ((int(mon) - 1) // 3) + 1
        matched = [t for t in tifs if f"{year}Q{quarter}" in t.name]
        selected = matched[0] if matched else sorted(tifs)[-1]
        with rasterio.open(str(selected)) as src:
            gt = src.read(1).astype(np.int32)
    elif task == "worldcover":
        gt_path = RAW_DIR / cfg["gt_source"] / patch_id / cfg["gt_file"]
        if not gt_path.exists(): return None
        with rasterio.open(str(gt_path)) as src:
            gt = src.read(1).astype(np.int32)
    elif task == "building_extraction":
        gt_path = RAW_DIR / cfg["gt_source"] / patch_id / cfg["gt_file"]
        if not gt_path.exists(): return None
        with rasterio.open(str(gt_path)) as src:
            gt = src.read(1).astype(np.int32)
    else:
        return None

    if gt.shape != (target_h, target_w):
        gt_u8 = np.where(gt < 0, 255, gt).astype(np.uint8)
        gt = np.array(Image.fromarray(gt_u8).resize((target_w, target_h), Image.Resampling.NEAREST), dtype=np.int32)
        gt[gt == 255] = -1
    return gt


def main():
    args = parse_args()
    cfg = TASK_CONFIG[args.task]
    hidden_layers = tuple(int(x) for x in args.hidden.split(","))

    emb_paths = sorted(EMB_DIR.glob("patch_*_2025-*.npy"))
    class_samples: dict[int, list] = {}
    valid_patches = 0

    for emb_path in tqdm(emb_paths, desc=f"Loading {args.task}"):
        patch_id, month = emb_path.stem.rsplit("_", 1)
        emb = np.load(emb_path)
        D, H, W = emb.shape
        if D != 128: continue
        gt = load_gt(args.task, patch_id, month, H, W)
        if gt is None: continue
        emb_flat = emb.reshape(D, -1).T
        gt_flat = gt.flatten()
        valid_mask = gt_flat >= 0
        if not valid_mask.any(): continue
        emb_flat = emb_flat[valid_mask]
        gt_flat = gt_flat[valid_mask]
        valid_patches += 1
        for cls in np.unique(gt_flat):
            cls = int(cls)
            idx = np.where(gt_flat == cls)[0]
            if cls not in class_samples: class_samples[cls] = []
            remaining = args.max_samples_per_class - len(class_samples[cls])
            if remaining <= 0: continue
            if len(idx) > remaining: idx = np.random.choice(idx, remaining, replace=False)
            class_samples[cls].extend([(emb_flat[i], cls) for i in idx])

    present_classes = sorted(class_samples.keys())
    print(f"Valid patches: {valid_patches}, classes: {present_classes}")
    for cls in present_classes:
        print(f"  Class {cls}: {len(class_samples[cls])}")

    X_list, y_list = [], []
    for cls in present_classes:
        samples = class_samples[cls]
        if not samples: continue
        X_list.append(np.stack([s[0] for s in samples]))
        y_list.append(np.array([s[1] for s in samples]))
    X = np.vstack(X_list)
    y = np.concatenate(y_list)
    print(f"Total samples: {len(y)}")

    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)

    # Remap labels
    label_map = {old: new for new, old in enumerate(present_classes)}
    y_mapped = np.array([label_map[v] for v in y])

    clf = MLPClassifier(
        hidden_layer_sizes=hidden_layers,
        max_iter=500,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=20,
        random_state=42,
    )
    clf.fit(X_s, y_mapped)
    print(f"Converged in {clf.n_iter_} iterations, loss={clf.loss_:.4f}")

    y_pred = clf.predict(X_s)
    inv_map = {new: old for old, new in label_map.items()}
    y_pred_orig = np.array([inv_map[p] for p in y_pred])
    y_orig = y

    bacc = balanced_accuracy_score(y_orig, y_pred_orig)
    try:
        f1 = f1_score(y_orig, y_pred_orig, average=cfg["f1_average"])
    except ValueError:
        f1 = f1_score(y_orig, y_pred_orig, average="macro")

    print(f"Balanced accuracy: {bacc:.4f}")
    print(f"F1 ({cfg['f1_average']}):       {f1:.4f}")

    model_data = {
        "scaler": scaler,
        "model": clf,
        "classes": present_classes,
        "class_names": [cfg["class_names"][c] if c < len(cfg["class_names"]) else f"Class_{c}" for c in present_classes],
        "colors": [cfg["colors"][c] if c < len(cfg["colors"]) else (128,128,128) for c in present_classes],
        "label_map": label_map,
        "trained_at": "2026-04-29",
        "n_samples": len(y),
        "head_type": f"sklearn_mlp_{args.hidden}",
    }
    model_path = MODEL_DIR / cfg["model_file"]
    joblib.dump(model_data, model_path)
    print(f"Saved to {model_path}")

    metrics = json.load(open(METRICS_PATH)) if METRICS_PATH.exists() else []
    metrics = [m for m in metrics if m.get("task") != f"{args.task}_sklearn_mlp"]
    metrics.append({
        "task": f"{args.task}_sklearn_mlp",
        "n_samples": len(y), "n_classes": len(present_classes),
        "balanced_accuracy": bacc, "f1_score": f1, "f1_average": cfg["f1_average"],
    })
    json.dump(metrics, open(METRICS_PATH, "w"), ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
