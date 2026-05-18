#!/usr/bin/env python3
"""修复 labels_v2 中所有 mask 的上下翻转问题。"""

import json
from pathlib import Path
import numpy as np

LABELS_DIR = Path("/workspace/xuannv_show/data/harbin/labels_v2")


def fix_masks():
    for task_dir in sorted(LABELS_DIR.iterdir()):
        if not task_dir.is_dir():
            continue
        task = task_dir.name
        for period_dir in sorted(task_dir.iterdir()):
            if not period_dir.is_dir():
                continue
            period = period_dir.name
            npy_files = list(period_dir.glob("*.npy"))
            if not npy_files:
                continue
            for npy_path in npy_files:
                mask = np.load(npy_path)
                if mask.shape != (64, 64):
                    continue
                # 上下翻转：j=0(south) -> j=0(image top=north)
                flipped = mask[::-1, :]
                np.save(npy_path, flipped)
            print(f"  ✅ {task}/{period}: 翻转了 {len(npy_files)} 个 mask")


if __name__ == "__main__":
    fix_masks()
    print("\n全部完成！")
