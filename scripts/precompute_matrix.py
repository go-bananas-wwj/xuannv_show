#!/usr/bin/env python3
"""预生成所有 patch 的 Time×Source 矩阵图到静态目录."""
from __future__ import annotations

import os
import sys
import warnings
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

warnings.filterwarnings("ignore")

from _paths import add_backend_to_path, ensure_env_raw_scenes, get_raw_scenes_dir, static_assets_dir

add_backend_to_path()
ensure_env_raw_scenes()

from app.services.matrix_renderer import render_time_source_matrix


OUTPUT_DIR = static_assets_dir() / "data" / "matrix"


def render_one(patch_id: str) -> tuple[str, float, int]:
    t0 = __import__("time").time()
    try:
        png_bytes = render_time_source_matrix(patch_id)
        if png_bytes is None:
            return patch_id, 0.0, 0
        out_path = OUTPUT_DIR / f"{patch_id}.jpg"
        out_path.write_bytes(png_bytes)
        elapsed = __import__("time").time() - t0
        return patch_id, elapsed, len(png_bytes)
    except Exception as e:
        return patch_id, 0.0, -1


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 获取所有 patch_id
    raw_dir = get_raw_scenes_dir() / "s2"
    patch_ids = sorted([d.name for d in raw_dir.iterdir() if d.is_dir() and d.name.startswith("patch_")])
    total = len(patch_ids)
    print(f"Total patches to render: {total}")

    # 过滤掉已存在的
    todo = [pid for pid in patch_ids if not (OUTPUT_DIR / f"{pid}.png").exists()]
    print(f"Remaining: {len(todo)}")

    if not todo:
        print("All matrices already precomputed.")
        return

    n_workers = min(8, os.cpu_count() or 4)
    done = 0
    errors = 0

    with ProcessPoolExecutor(max_workers=n_workers) as ex:
        futures = {ex.submit(render_one, pid): pid for pid in todo}
        for fut in as_completed(futures):
            pid, elapsed, size = fut.result()
            done += 1
            if size < 0:
                errors += 1
                print(f"  [{done}/{len(todo)}] {pid} FAILED")
            else:
                print(f"  [{done}/{len(todo)}] {pid} OK ({elapsed:.1f}s, {size/1024:.0f}KB)")

    print(f"\nDone. Total: {done}, Errors: {errors}")


if __name__ == "__main__":
    main()
