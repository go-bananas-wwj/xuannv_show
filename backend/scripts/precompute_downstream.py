#!/usr/bin/env python3
"""预计算下游任务结果 — 为所有 patch 生成 mosaic tile 和 detail 图."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, "/workspace/xuannv_show/backend")

from PIL import Image
from tqdm import tqdm

from app.services.task_engine import ChangeDetectionEngine, EMBEDDING_DIR

# ── Config ──
RESULTS_DIR = Path("/workspace/outputs/aef_qwen_v4_official/results")
TILE_SIZE = 128
PANEL_SIZE = 256

# 需要预计算的月份对 (before, after)
PERIOD_PAIRS = [
    ("2025-04", "2025-10"),
    ("2025-06", "2025-10"),
    ("2025-08", "2025-10"),
    ("2025-04", "2025-06"),
    ("2025-06", "2025-08"),
    ("2025-08", "2025-09"),
    ("2025-09", "2025-10"),
]


def precompute_change_detection():
    engine = ChangeDetectionEngine()
    patches = list(engine.patches_meta.keys())
    print(f"Loaded {len(patches)} patches, grid: {engine.ix_max - engine.ix_min + 1} x {engine.iy_max - engine.iy_min + 1}")

    for before, after in PERIOD_PAIRS:
        period = f"{before}_vs_{after}"
        print(f"\n{'='*60}")
        print(f"Processing period: {period}")
        print(f"{'='*60}")

        out_dir = RESULTS_DIR / "change_detection"
        tile_dir = out_dir / "tiles"
        detail_dir = out_dir / "detail"
        tile_dir.mkdir(parents=True, exist_ok=True)
        detail_dir.mkdir(parents=True, exist_ok=True)

        # 1. Generate tiles for all patches
        print("Generating mosaic tiles...")
        for pid in tqdm(patches, desc="Tiles"):
            tile_path = tile_dir / f"{pid}_{period}.png"
            if tile_path.exists():
                continue
            try:
                tile = engine.render_mosaic_tile(pid, before, after, size=TILE_SIZE)
                tile.save(tile_path, "PNG")
            except FileNotFoundError:
                pass  # Skip if embedding missing

        # 2. Generate mosaic
        mosaic_path = out_dir / f"mosaic_{period}.png"
        print("Building mosaic...")
        mosaic = engine.build_mosaic(before, after, tile_size=TILE_SIZE)
        mosaic.save(mosaic_path, "PNG")
        print(f"Saved mosaic: {mosaic_path} ({mosaic.size})")

        # 3. Generate detail figures for all patches
        print("Generating detail figures...")
        for pid in tqdm(patches, desc="Details"):
            detail_path = detail_dir / f"{pid}_{period}.png"
            if detail_path.exists():
                continue
            try:
                detail = engine.render_detail_figure(pid, before, after, panel_size=PANEL_SIZE)
                detail.save(detail_path, "PNG")
            except FileNotFoundError:
                pass

    print(f"\nAll results saved to {RESULTS_DIR}")


if __name__ == "__main__":
    precompute_change_detection()
