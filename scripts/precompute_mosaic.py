#!/usr/bin/env python3
"""预生成 mosaic 区域大图静态文件."""
from __future__ import annotations

import os
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

from _paths import add_backend_to_path, ensure_env_raw_scenes, static_assets_dir

add_backend_to_path()
ensure_env_raw_scenes()

from app.routers.patches import _build_mosaic_image

OUTPUT_DIR = static_assets_dir() / "data" / "mosaic"

SOURCES = ["s2", "s1", "landsat"]
MONTHS = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10"]
TILE_SIZE = 128
REGION = os.environ.get("REGION", "harbin")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    todo = []
    for source in SOURCES:
        for month in MONTHS:
            out_path = OUTPUT_DIR / source / f"{month}_{TILE_SIZE}.jpg"
            if not out_path.exists():
                todo.append((source, month, out_path))

    print(f"Mosaic images to generate: {len(todo)}")
    if not todo:
        print("All mosaic images already precomputed.")
        return

    for i, (source, month, out_path) in enumerate(todo, 1):
        print(f"  [{i}/{len(todo)}] Generating {source}/{month} ...", flush=True)
        try:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            jpeg_bytes = _build_mosaic_image(REGION, month, source, TILE_SIZE)
            out_path.write_bytes(jpeg_bytes)
            print(f"  [{i}/{len(todo)}] {source}/{month} OK ({len(jpeg_bytes)/1024/1024:.1f}MB)")
        except Exception as e:
            print(f"  [{i}/{len(todo)}] {source}/{month} FAILED: {e}")

    print("\nDone.")


if __name__ == "__main__":
    main()
