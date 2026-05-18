#!/usr/bin/env python3
"""生成全域语义预设 Mosaic 图.

Usage:
    conda run -n xuannv python scripts/generate_global_semantic_mosaics.py \
        --embeddings-dir /path/to/monthly_embeddings \
        --patches-meta data/harbin/patches_meta.json \
        --output-dir frontend/public/data/embeddings/semantic \
        --tile-size 256 \
        --month 2025-04
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app.services.preset_analyzer import get_preset_configs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate global semantic preset mosaics")
    parser.add_argument("--embeddings-dir", required=True, help="Path to monthly embeddings dir")
    parser.add_argument("--patches-meta", required=True, help="Path to patches_meta.json")
    parser.add_argument("--output-dir", required=True, help="Output directory for PNGs")
    parser.add_argument("--tile-size", type=int, default=256, help="Output tile size per patch")
    parser.add_argument("--month", default="2025-04", help="Target month")
    parser.add_argument(
        "--presets", default="", help="Comma-separated preset IDs (empty=all)"
    )
    return parser.parse_args()


def load_patches_meta(path: str) -> list[dict]:
    with open(path) as f:
        return json.load(f)


def gather_embeddings_for_month(
    emb_dir: Path, patches: list[dict], month: str
) -> dict[str, np.ndarray]:
    """Gather all valid embedding arrays for a given month."""
    embs = {}
    for p in tqdm(patches, desc=f"Loading {month}", leave=False):
        pid = p["patch_id"]
        fpath = emb_dir / f"{pid}_{month}.npy"
        if fpath.exists():
            embs[pid] = np.load(fpath)
    return embs


def compute_global_norm(all_embs: dict[str, np.ndarray], dims: list[int]) -> tuple:
    """Compute global min/max for specified dimensions across all patches."""
    all_values = {d: [] for d in dims}
    for emb in all_embs.values():
        for d in dims:
            all_values[d].extend(emb[d].flatten().tolist())

    vmin = {}
    vmax = {}
    for d in dims:
        arr = np.array(all_values[d])
        vmin[d] = float(np.percentile(arr, 1))
        vmax[d] = float(np.percentile(arr, 99))

    return vmin, vmax


def patch_to_semantic_rgb(
    emb: np.ndarray,
    ch_r: int,
    ch_g: int,
    ch_b: int,
    vmin: dict,
    vmax: dict,
    tile_size: int,
) -> Image.Image:
    """Convert a single patch embedding to semantic RGB PIL Image."""
    H, W = emb.shape[1], emb.shape[2]

    rgb = np.stack([emb[ch_r], emb[ch_g], emb[ch_b]], axis=-1)

    # Global normalization
    rgb[..., 0] = (rgb[..., 0] - vmin[ch_r]) / (vmax[ch_r] - vmin[ch_r] + 1e-8)
    rgb[..., 1] = (rgb[..., 1] - vmin[ch_g]) / (vmax[ch_g] - vmin[ch_g] + 1e-8)
    rgb[..., 2] = (rgb[..., 2] - vmin[ch_b]) / (vmax[ch_b] - vmin[ch_b] + 1e-8)

    rgb = np.clip(rgb, 0, 1)
    rgb_uint8 = (rgb * 255).astype(np.uint8)
    img = Image.fromarray(rgb_uint8)
    if tile_size != H:
        img = img.resize((tile_size, tile_size), Image.Resampling.LANCZOS)

    # Feather edges
    blurred = img.filter(ImageFilter.GaussianBlur(radius=0.6))
    edge_mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(edge_mask)
    draw.rectangle([0, 0, img.width - 1, img.height - 1], outline=255, width=2)
    img = Image.composite(blurred, img, edge_mask)
    return img


def build_mosaic(
    patches: list[dict],
    emb_dict: dict[str, np.ndarray],
    ch_r: int,
    ch_g: int,
    ch_b: int,
    vmin: dict,
    vmax: dict,
    tile_size: int,
) -> Image.Image:
    """Build full mosaic canvas from patches."""
    ixs = [p["ix"] for p in patches]
    iys = [p["iy"] for p in patches]
    ix_min, ix_max = min(ixs), max(ixs)
    iy_min, iy_max = min(iys), max(iys)

    n_cols = ix_max - ix_min + 1
    n_rows = iy_max - iy_min + 1

    canvas_w = n_cols * tile_size
    canvas_h = n_rows * tile_size
    canvas = Image.new("RGB", (canvas_w, canvas_h), (26, 26, 46))

    for p in tqdm(patches, desc="Building mosaic", leave=False):
        pid = p["patch_id"]
        if pid not in emb_dict:
            continue
        emb = emb_dict[pid]
        img = patch_to_semantic_rgb(emb, ch_r, ch_g, ch_b, vmin, vmax, tile_size)
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

    patches = load_patches_meta(args.patches_meta)
    month = args.month

    # Get presets
    presets = get_preset_configs()
    if args.presets:
        wanted = {p.strip() for p in args.presets.split(",")}
        presets = [p for p in presets if p["id"] in wanted]

    print(f"[semantic_mosaic] Patches: {len(patches)}")
    print(f"[semantic_mosaic] Month: {month}")
    print(f"[semantic_mosaic] Presets: {[p['id'] for p in presets]}")
    print(f"[semantic_mosaic] Tile size: {args.tile_size}")

    # Load embeddings once (shared across presets)
    print(f"\n[semantic_mosaic] Loading embeddings for {month} ...")
    embs = gather_embeddings_for_month(emb_dir, patches, month)
    if not embs:
        print(f"[semantic_mosaic] No embeddings found for {month}, aborting")
        return
    print(f"[semantic_mosaic] Loaded {len(embs)} patches")

    for preset in presets:
        preset_id = preset["id"]
        top3 = preset["top3"]
        ch_r, ch_g, ch_b = top3[0], top3[1], top3[2]

        print(f"\n[semantic_mosaic] Processing preset: {preset['name']} (dims {top3})")

        # Compute global normalization for this preset's 3 dims
        vmin, vmax = compute_global_norm(embs, top3)
        print(f"  Global norm: R=[{vmin[ch_r]:.3f}, {vmax[ch_r]:.3f}], "
              f"G=[{vmin[ch_g]:.3f}, {vmax[ch_g]:.3f}], "
              f"B=[{vmin[ch_b]:.3f}, {vmax[ch_b]:.3f}]")

        mosaic = build_mosaic(patches, embs, ch_r, ch_g, ch_b, vmin, vmax, args.tile_size)

        preset_dir = output_dir / preset_id
        preset_dir.mkdir(parents=True, exist_ok=True)
        out_path = preset_dir / f"{month}.png"
        mosaic.save(out_path, "PNG")
        print(f"  Saved: {out_path} ({mosaic.size[0]}x{mosaic.size[1]})")

    print("\n[semantic_mosaic] All done!")


if __name__ == "__main__":
    main()
