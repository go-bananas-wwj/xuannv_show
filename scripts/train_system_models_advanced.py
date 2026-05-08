#!/usr/bin/env python3
"""使用更强的下游头（MLP）重新训练系统模型.

Usage:
    cd /workspace/xuannv_show
    conda run -n xuannv python scripts/train_system_models_advanced.py --task jrc_water --head mlp
    conda run -n xuannv python scripts/train_system_models_advanced.py --task dynamic_world --head mlp3
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import rasterio
import torch
import torch.nn as nn
import torch.optim as optim
from PIL import Image
from sklearn.metrics import balanced_accuracy_score, f1_score
from sklearn.preprocessing import StandardScaler
from torch.utils.data import DataLoader, TensorDataset
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
        "model_file": "jrc_water_mlp.pkl",
        "class_names": ["非水体", "水体"],
        "colors": [(180, 180, 180), (0, 100, 200)],
        "f1_average": "binary",
    },
    "dynamic_world": {
        "gt_source": "dynamic_world",
        "model_file": "dynamic_world_mlp.pkl",
        "class_names": ["水体", "树木", "草地", "flooded vegetation", "农田", "灌丛", "建筑", "裸地", "冰雪"],
        "colors": [
            (0, 100, 200), (0, 120, 0), (150, 200, 50), (0, 180, 180),
            (200, 180, 0), (200, 100, 0), (200, 0, 0), (200, 200, 200), (255, 255, 255),
        ],
        "f1_average": "macro",
    },
    "worldcover": {
        "gt_source": "worldcover",
        "gt_file": "static.tif",
        "model_file": "worldcover_mlp.pkl",
        "class_names": ["森林", "灌丛", "草地", "农田", "建筑", "裸地", "冰雪", "水体", "湿地", "红树林", "苔藓"],
        "colors": [
            (0, 100, 0), (150, 150, 0), (200, 200, 0), (200, 180, 0), (200, 0, 0),
            (200, 200, 200), (255, 255, 255), (0, 100, 200), (0, 150, 100), (0, 80, 60), (150, 200, 150),
        ],
        "f1_average": "macro",
    },
    "building_extraction": {
        "gt_source": "osm_buildings",
        "gt_file": "static.tif",
        "model_file": "building_mlp.pkl",
        "class_names": ["非建筑", "建筑"],
        "colors": [(100, 100, 100), (250, 0, 0)],
        "f1_average": "binary",
    },
}

HEAD_CONFIG = {
    "mlp": [256, 128],
    "mlp3": [256, 256, 128],
    "mlp_small": [128, 64],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True, choices=list(TASK_CONFIG.keys()))
    parser.add_argument("--head", default="mlp", choices=list(HEAD_CONFIG.keys()))
    parser.add_argument("--max-samples-per-class", type=int, default=40000)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=4096)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--device", default="cuda:6" if torch.cuda.is_available() else "cpu")
    return parser.parse_args()


def load_gt(task: str, patch_id: str, month: str, target_h: int, target_w: int) -> np.ndarray | None:
    cfg = TASK_CONFIG[task]
    if task == "jrc_water":
        gt_path = RAW_DIR / cfg["gt_source"] / patch_id / cfg["gt_file"]
        if not gt_path.exists():
            return None
        with rasterio.open(str(gt_path)) as src:
            raw = src.read(1)
        gt = np.full(raw.shape, fill_value=-1, dtype=np.int32)
        gt[raw == -128] = -1
        gt[raw == 255] = -1
        gt[raw == 0] = 0
        gt[(raw > 0) & (raw != 255)] = 1
    elif task == "dynamic_world":
        gt_dir = RAW_DIR / "dynamic_world" / patch_id
        if not gt_dir.exists():
            return None
        tifs = list(gt_dir.glob("*.tif"))
        if not tifs:
            return None
        year, mon = month.split("-")
        quarter = ((int(mon) - 1) // 3) + 1
        quarter_pattern = f"{year}Q{quarter}"
        matched = [t for t in tifs if quarter_pattern in t.name]
        selected = matched[0] if matched else sorted(tifs)[-1]
        with rasterio.open(str(selected)) as src:
            gt = src.read(1).astype(np.int32)
    elif task == "worldcover":
        gt_path = RAW_DIR / cfg["gt_source"] / patch_id / cfg["gt_file"]
        if not gt_path.exists():
            return None
        with rasterio.open(str(gt_path)) as src:
            gt = src.read(1).astype(np.int32)
    elif task == "building_extraction":
        gt_path = RAW_DIR / cfg["gt_source"] / patch_id / cfg["gt_file"]
        if not gt_path.exists():
            return None
        with rasterio.open(str(gt_path)) as src:
            gt = src.read(1).astype(np.int32)
    else:
        return None

    if gt.shape != (target_h, target_w):
        gt_u8 = np.where(gt < 0, 255, gt).astype(np.uint8)
        gt = np.array(Image.fromarray(gt_u8).resize((target_w, target_h), Image.Resampling.NEAREST), dtype=np.int32)
        gt[gt == 255] = -1
    return gt


class PixelMLP(nn.Module):
    def __init__(self, in_dim: int, hidden_dims: list[int], num_classes: int, dropout: float = 0.2):
        super().__init__()
        layers = []
        prev = in_dim
        for h in hidden_dims:
            layers.append(nn.Linear(prev, h))
            layers.append(nn.ReLU())
            layers.append(nn.Dropout(dropout))
            prev = h
        layers.append(nn.Linear(prev, num_classes))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def main():
    args = parse_args()
    cfg = TASK_CONFIG[args.task]
    device = torch.device(args.device)

    emb_paths = sorted(EMB_DIR.glob("patch_*_2025-*.npy"))
    print(f"Total embedding files: {len(emb_paths)}")

    # Build training set with per-class sampling limit
    class_samples: dict[int, list[tuple[np.ndarray, int]]] = {}
    valid_patches = 0

    for emb_path in tqdm(emb_paths, desc=f"Loading for {args.task}"):
        patch_id, month = emb_path.stem.rsplit("_", 1)
        emb = np.load(emb_path)
        D, H, W = emb.shape
        if D != 128:
            continue

        gt = load_gt(args.task, patch_id, month, H, W)
        if gt is None:
            continue

        emb_flat = emb.reshape(D, -1).T
        gt_flat = gt.flatten()

        valid_mask = gt_flat >= 0
        if not valid_mask.any():
            continue

        emb_flat = emb_flat[valid_mask]
        gt_flat = gt_flat[valid_mask]
        valid_patches += 1

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

    print(f"Valid patches: {valid_patches}")
    present_classes = sorted(class_samples.keys())
    print(f"Classes: {present_classes}")
    for cls in present_classes:
        print(f"  Class {cls}: {len(class_samples[cls])} samples")

    if not present_classes:
        print("No training data!")
        sys.exit(1)

    # Build dataset
    X_list, y_list = [], []
    for cls in present_classes:
        samples = class_samples[cls]
        if not samples:
            continue
        X_list.append(np.stack([s[0] for s in samples]))
        y_list.append(np.array([s[1] for s in samples]))

    X = np.vstack(X_list)
    y = np.concatenate(y_list)
    print(f"Total samples: {len(y)}")

    # Scale features
    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)

    # Remap labels to contiguous 0..C-1
    label_map = {old: new for new, old in enumerate(present_classes)}
    y_mapped = np.array([label_map[v] for v in y])
    num_classes = len(present_classes)

    # Torch dataset
    X_tensor = torch.from_numpy(X_s).float()
    y_tensor = torch.from_numpy(y_mapped).long()
    dataset = TensorDataset(X_tensor, y_tensor)
    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True)

    # Model
    model = PixelMLP(in_dim=X.shape[1], hidden_dims=HEAD_CONFIG[args.head], num_classes=num_classes).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=args.lr)
    scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=10, gamma=0.5)

    # Train
    model.train()
    for epoch in range(args.epochs):
        total_loss = 0.0
        for xb, yb in loader:
            xb, yb = xb.to(device), yb.to(device)
            optimizer.zero_grad()
            logits = model(xb)
            loss = criterion(logits, yb)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * xb.size(0)
        scheduler.step()
        avg_loss = total_loss / len(dataset)
        if (epoch + 1) % 5 == 0 or epoch == 0:
            print(f"Epoch {epoch+1}/{args.epochs}, Loss: {avg_loss:.4f}")

    # Evaluate
    model.eval()
    with torch.no_grad():
        all_preds = []
        for xb, _ in loader:
            xb = xb.to(device)
            logits = model(xb)
            preds = logits.argmax(dim=1).cpu().numpy()
            all_preds.append(preds)
    y_pred = np.concatenate(all_preds)

    # Remap predictions back to original labels
    inv_label_map = {new: old for old, new in label_map.items()}
    y_pred_orig = np.array([inv_label_map[p] for p in y_pred])
    y_orig = y

    bacc = balanced_accuracy_score(y_orig, y_pred_orig)
    try:
        f1 = f1_score(y_orig, y_pred_orig, average=cfg["f1_average"])
    except ValueError:
        f1 = f1_score(y_orig, y_pred_orig, average="macro")

    print(f"Balanced accuracy: {bacc:.4f}")
    print(f"F1 ({cfg['f1_average']}):       {f1:.4f}")

    # Save model (compatible format with system_models.py)
    model_data = {
        "scaler": scaler,
        "model": model.cpu(),
        "classes": present_classes,
        "class_names": [cfg["class_names"][c] if c < len(cfg["class_names"]) else f"Class_{c}" for c in present_classes],
        "colors": [cfg["colors"][c] if c < len(cfg["colors"]) else (128, 128, 128) for c in present_classes],
        "label_map": label_map,
        "trained_at": "2026-04-29",
        "n_samples": len(y),
        "n_classes": num_classes,
        "head_type": args.head,
    }
    model_path = MODEL_DIR / cfg["model_file"]
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model_data, model_path)
    print(f"Saved model to {model_path}")

    # Update metrics
    metrics = []
    if METRICS_PATH.exists():
        with open(METRICS_PATH) as f:
            metrics = json.load(f)
    new_metric = {
        "task": f"{args.task}_{args.head}",
        "n_samples": len(y),
        "n_classes": num_classes,
        "balanced_accuracy": bacc,
        "f1_score": f1,
        "f1_average": cfg["f1_average"],
    }
    metrics = [m for m in metrics if m.get("task") != new_metric["task"]]
    metrics.append(new_metric)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    print(f"Updated metrics.json")


if __name__ == "__main__":
    main()
