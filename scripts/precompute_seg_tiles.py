#!/usr/bin/env python3
"""预生成分类任务 (worldcover/dynamic_world/jrc_water/building_extraction) 的 mosaic tile 静态文件."""
from __future__ import annotations

import os
import sys
import time
import warnings
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

warnings.filterwarnings("ignore")

OUTPUT_DIR = Path("/workspace/xuannv_show/frontend/public/data/seg_tiles")

HEAD_IDS = ["worldcover", "dynamic_world", "jrc_water", "building_extraction"]
MONTHS = ["2025-04", "2025-06", "2025-08", "2025-09", "2025-10"]


def init_worker():
    sys.path.insert(0, "/workspace/xuannv_show/backend")
    sys.path.insert(0, "/workspace/xuannv")
    os.environ.setdefault("RAW_SCENES_DIR", "/workspace/raw/harbin_scenes")


def render_one(head_id: str, month: str, patch_id: str) -> tuple[str, str, str, float, int]:
    t0 = time.time()
    try:
        from app.routers.heads import _render_seg_tile_cached
        png_bytes = _render_seg_tile_cached(head_id, patch_id, month)
        out_path = OUTPUT_DIR / head_id / month / f"{patch_id}.png"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(png_bytes)
        elapsed = time.time() - t0
        return head_id, month, patch_id, elapsed, len(png_bytes)
    except Exception as e:
        return head_id, month, patch_id, 0.0, -1


def main():
    raw_dir = Path("/workspace/raw/harbin_scenes/s2")
    patch_ids = sorted([d.name for d in raw_dir.iterdir() if d.is_dir() and d.name.startswith("patch_")])
    total = len(patch_ids)
    print(f"Patches: {total}, Tasks: {len(HEAD_IDS)}, Months: {len(MONTHS)}")

    # 构建待生成列表
    todo = []
    for head_id in HEAD_IDS:
        for month in MONTHS:
            for pid in patch_ids:
                if not (OUTPUT_DIR / head_id / month / f"{pid}.png").exists():
                    todo.append((head_id, month, pid))

    print(f"Remaining tiles to generate: {len(todo)}")
    if not todo:
        print("All seg tiles already precomputed.")
        return

    n_workers = min(8, os.cpu_count() or 4)
    done = 0
    errors = 0
    t_start = time.time()

    with ProcessPoolExecutor(max_workers=n_workers, initializer=init_worker) as ex:
        futures = {ex.submit(render_one, h, m, p): (h, m, p) for h, m, p in todo}
        for fut in as_completed(futures):
            head_id, month, pid, elapsed, size = fut.result()
            done += 1
            if size < 0:
                errors += 1
                if done % 100 == 0:
                    print(f"  [{done}/{len(todo)}] {head_id}/{month}/{pid} FAILED")
            else:
                if done % 500 == 0:
                    print(f"  [{done}/{len(todo)}] {head_id}/{month}/{pid} OK ({elapsed:.2f}s)")

    total_time = time.time() - t_start
    print(f"\nDone in {total_time:.0f}s. Total: {done}, Errors: {errors}")


if __name__ == "__main__":
    main()
