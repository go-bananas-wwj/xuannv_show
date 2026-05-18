#!/usr/bin/env python3
"""生成全域语义预设 Mosaic 图（概率热力图版）.

使用 Linear Probe / MLP 模型在每个像素上推理，生成概率热力图，
替代原来的 Top-3 维度 RGB 映射（后者因 embedding 维度本身无空间结构而不可解释）。

Usage:
    conda run -n xuannv python scripts/generate_semantic_prob_mosaics.py \
        --embeddings-dir /path/to/monthly_embeddings \
        --patches-meta data/harbin/patches_meta.json \
        --output-dir frontend/public/data/embeddings/semantic \
        --month 2025-04
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))


# ── 预设配置 ──
PRESETS = [
    {
        "id": "water",
        "name": "水体",
        "model_file": "jrc_water_linear_probe.pkl",
        "class_idx": 0,  # binary positive class
        "color": np.array([0x00, 0x64, 0xC8], dtype=np.uint8),
    },
    {
        "id": "building",
        "name": "建筑",
        "model_file": "building_linear_probe.pkl",
        "class_idx": 0,  # binary positive class
        "color": np.array([0xFA, 0x00, 0x00], dtype=np.uint8),
    },
    {
        "id": "forest",
        "name": "森林",
        "model_file": "dynamic_world_linear_probe.pkl",
        "class_idx": 1,  # Dynamic World: trees
        "color": np.array([0x00, 0x64, 0x00], dtype=np.uint8),
    },
    {
        "id": "cropland",
        "name": "农田",
        "model_file": "dynamic_world_linear_probe.pkl",
        "class_idx": 4,  # Dynamic World: crops
        "color": np.array([0xFF, 0xBB, 0x22], dtype=np.uint8),
    },
    {
        "id": "bare",
        "name": "裸地",
        "model_file": "dynamic_world_linear_probe.pkl",
        "class_idx": 7,  # Dynamic World: bare
        "color": np.array([0xB4, 0xB4, 0xB4], dtype=np.uint8),
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate semantic probability mosaics")
    parser.add_argument("--embeddings-dir", required=True)
    parser.add_argument("--patches-meta", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--month", default="2025-04")
    parser.add_argument("--tile-size", type=int, default=256)
    parser.add_argument("--presets", default="", help="Comma-separated IDs")
    return parser.parse_args()


def load_patches_meta(path: str) -> list[dict]:
    with open(path) as f:
        return json.load(f)


def load_model(model_path: Path):
    """Load sklearn model + scaler."""
    data = joblib.load(model_path)
    return data["model"], data.get("scaler")


def predict_probabilities(
    emb: np.ndarray,
    model,
    scaler,
    class_idx: int,
) -> np.ndarray:
    """Run model on embedding [128, H, W] -> probability map [H, W]."""
    c, h, w = emb.shape
    flat = emb.reshape(c, -1).T  # [H*W, 128]

    if scaler is not None:
        flat = scaler.transform(flat)

    probs = model.predict_proba(flat)

    # Find the column index for class_idx
    if probs.shape[1] == 1:
        # Some old binary models may return single column
        prob_vec = probs[:, 0]
    elif probs.shape[1] == 2:
        # Binary: take positive class (column 1)
        prob_vec = probs[:, 1]
    else:
        # Multi-class: find class_idx in model.classes_
        cls_positions = {cls: i for i, cls in enumerate(model.classes_)}
        col = cls_positions.get(class_idx, class_idx)
        prob_vec = probs[:, col]

    return prob_vec.reshape(h, w)


def prob_to_heatmap(prob_map: np.ndarray, color: np.ndarray) -> np.ndarray:
    """Convert probability map [H,W] to RGB heatmap [H,W,3]."""
    h, w = prob_map.shape
    heatmap = np.zeros((h, w, 3), dtype=np.uint8)

    # Dark background + colored glow
    bg = np.full((h, w, 3), 15, dtype=np.uint8)  # near-black background
    for i in range(3):
        heatmap[:, :, i] = (prob_map * color[i]).astype(np.uint8)

    # Blend: prob determines color intensity, bg provides contrast
    alpha = prob_map[:, :, np.newaxis]
    heatmap = (heatmap * alpha + bg * (1 - alpha)).astype(np.uint8)
    return heatmap


def build_mosaic(
    patches: list[dict],
    emb_dir: Path,
    model,
    scaler,
    class_idx: int,
    color: np.ndarray,
    tile_size: int,
    month: str,
) -> Image.Image:
    """Build full mosaic from probability heatmaps."""
    ixs = [p["ix"] for p in patches]
    iys = [p["iy"] for p in patches]
    ix_min, ix_max = min(ixs), max(ixs)
    iy_min, iy_max = min(iys), max(iys)

    n_cols = ix_max - ix_min + 1
    n_rows = iy_max - iy_min + 1

    canvas_w = n_cols * tile_size
    canvas_h = n_rows * tile_size
    canvas = Image.new("RGB", (canvas_w, canvas_h), (15, 15, 15))

    for p in tqdm(patches, desc="Building mosaic", leave=False):
        pid = p["patch_id"]
        fpath = emb_dir / f"{pid}_{month}.npy"
        if not fpath.exists():
            continue

        emb = np.load(fpath)
        prob_map = predict_probabilities(emb, model, scaler, class_idx)
        heatmap = prob_to_heatmap(prob_map, color)

        img = Image.fromarray(heatmap)
        if tile_size != emb.shape[1]:
            img = img.resize((tile_size, tile_size), Image.Resampling.LANCZOS)

        # Feather edges
        blurred = img.filter(ImageFilter.GaussianBlur(radius=0.6))
        edge_mask = Image.new("L", img.size, 0)
        draw = ImageDraw.Draw(edge_mask)
        draw.rectangle([0, 0, img.width - 1, img.height - 1], outline=255, width=2)
        img = Image.composite(blurred, img, edge_mask)

        col = p["ix"] - ix_min
        row = p["iy"] - iy_min
        x = col * tile_size
        y = (n_rows - 1 - row) * tile_size  # flip Y
        canvas.paste(img, (x, y))

    return canvas


def main() -> None:
    args = parse_args()
    emb_dir = Path(args.embeddings_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    models_dir = Path(__file__).resolve().parent.parent / "backend" / "models"

    patches = load_patches_meta(args.patches_meta)
    month = args.month

    presets = PRESETS
    if args.presets:
        wanted = {p.strip() for p in args.presets.split(",")}
        presets = [p for p in presets if p["id"] in wanted]

    print(f"[prob_mosaic] Patches: {len(patches)}")
    print(f"[prob_mosaic] Month: {month}")
    print(f"[prob_mosaic] Presets: {[p['id'] for p in presets]}")

    for preset in presets:
        preset_id = preset["id"]
        model_path = models_dir / preset["model_file"]

        print(f"\n[prob_mosaic] Processing preset: {preset['name']}")
        print(f"  Model: {model_path}")

        model, scaler = load_model(model_path)
        mosaic = build_mosaic(
            patches, emb_dir, model, scaler,
            preset["class_idx"], preset["color"],
            args.tile_size, month,
        )

        preset_dir = output_dir / preset_id
        preset_dir.mkdir(parents=True, exist_ok=True)
        out_path = preset_dir / f"{month}.png"
        mosaic.save(out_path, "PNG")
        print(f"  Saved: {out_path} ({mosaic.size[0]}x{mosaic.size[1]})")

    print("\n[prob_mosaic] All done!")


if __name__ == "__main__":
    main()
