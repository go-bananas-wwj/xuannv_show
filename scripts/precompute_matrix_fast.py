#!/usr/bin/env python3
"""快速并行预生成所有 patch 的 Time×Source 矩阵图."""
from __future__ import annotations

import os
import sys
import time
import warnings
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

warnings.filterwarnings("ignore")

OUTPUT_DIR = Path("/workspace/xuannv_show/frontend/public/data/matrix")


def init_worker():
    """每个子进程初始化时设置环境."""
    sys.path.insert(0, "/workspace/xuannv_show/backend")
    sys.path.insert(0, "/workspace/xuannv")
    os.environ.setdefault("RAW_SCENES_DIR", "/workspace/raw/harbin_scenes")


def render_one(patch_id: str) -> tuple[str, float, int]:
    t0 = time.time()
    try:
        from app.services.matrix_renderer import render_time_source_matrix
        png_bytes = render_time_source_matrix(patch_id)
        if png_bytes is None:
            return patch_id, 0.0, 0
        out_path = OUTPUT_DIR / f"{patch_id}.png"
        out_path.write_bytes(png_bytes)
        elapsed = time.time() - t0
        return patch_id, elapsed, len(png_bytes)
    except Exception as e:
        return patch_id, 0.0, -1


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    raw_dir = Path("/workspace/raw/harbin_scenes/s2")
    patch_ids = sorted([d.name for d in raw_dir.iterdir() if d.is_dir() and d.name.startswith("patch_")])
    total = len(patch_ids)
    print(f"Total patches to render: {total}")

    todo = [pid for pid in patch_ids if not (OUTPUT_DIR / f"{pid}.png").exists()]
    print(f"Remaining: {len(todo)}")

    if not todo:
        print("All matrices already precomputed.")
        return

    n_workers = min(8, os.cpu_count() or 4)
    done = 0
    errors = 0
    t_start = time.time()

    with ProcessPoolExecutor(max_workers=n_workers, initializer=init_worker) as ex:
        futures = {ex.submit(render_one, pid): pid for pid in todo}
        for fut in as_completed(futures):
            pid, elapsed, size = fut.result()
            done += 1
            if size < 0:
                errors += 1
                print(f"  [{done}/{len(todo)}] {pid} FAILED")
            else:
                print(f"  [{done}/{len(todo)}] {pid} OK ({elapsed:.1f}s, {size/1024:.0f}KB)")

    total_time = time.time() - t_start
    print(f"\nDone in {total_time:.0f}s. Total: {done}, Errors: {errors}")


if __name__ == "__main__":
    main()
