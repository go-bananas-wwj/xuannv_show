#!/usr/bin/env python3
"""将预计算 embedding 转为 PCA-RGB 预览图.

Usage:
    python scripts/generate_embedding_tiles.py \
        --embeddings-dir /path/to/embeddings \
        --output-dir data/<region>/embeddings/v2 \
        --max-patches 500
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.decomposition import PCA


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate embedding PCA-RGB previews")
    parser.add_argument("--embeddings-dir", required=True, help="Path to embeddings dir")
    parser.add_argument("--output-dir", required=True, help="Output directory for PNGs")
    parser.add_argument("--max-patches", type=int, default=0, help="Max patches to process (0=all)")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    emb_dir = Path(args.embeddings_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    emb_path = emb_dir / "embedding_maps.npy"
    ids_path = emb_dir / "patch_ids.json"

    if not emb_path.exists():
        print(f"[generate_embedding_tiles] Embedding file not found: {emb_path}")
        return
    if not ids_path.exists():
        print(f"[generate_embedding_tiles] Patch IDs file not found: {ids_path}")
        return

    print(f"[generate_embedding_tiles] Loading embeddings from {emb_path}")
    embedding_maps = np.load(emb_path)
    with open(ids_path) as f:
        patch_ids = json.load(f)

    N, D, H, W = embedding_maps.shape
    print(f"[generate_embedding_tiles] Shape: {embedding_maps.shape}, patches: {len(patch_ids)}")

    max_patches = args.max_patches if args.max_patches > 0 else N
    max_patches = min(max_patches, N)

    print(f"[generate_embedding_tiles] Fitting PCA on {max_patches} patches...")
    flat = embedding_maps[:max_patches].reshape(max_patches * H * W, D)
    if flat.shape[0] > 500000:
        indices = np.random.choice(flat.shape[0], 500000, replace=False)
        flat_sample = flat[indices]
    else:
        flat_sample = flat

    pca = PCA(n_components=3)
    pca.fit(flat_sample)

    rgb_all = pca.transform(flat_sample)
    vmin = rgb_all.min(axis=0)
    vmax = rgb_all.max(axis=0)

    print(f"[generate_embedding_tiles] Generating preview images...")
    for i in range(max_patches):
        pid = patch_ids[i]
        emb = embedding_maps[i]
        flat_emb = emb.reshape(D, -1).T
        rgb = pca.transform(flat_emb).reshape(H, W, 3)
        rgb = (rgb - vmin) / (vmax - vmin + 1e-8)
        rgb = np.clip(rgb, 0, 1)
        rgb_uint8 = (rgb * 255).astype(np.uint8)

        img = Image.fromarray(rgb_uint8)
        img.save(output_dir / f"{pid}.png")

        if (i + 1) % 100 == 0:
            print(f"[generate_embedding_tiles] Processed {i + 1}/{max_patches}")

    print(f"[generate_embedding_tiles] Done. Output: {output_dir}")


if __name__ == "__main__":
    main()
