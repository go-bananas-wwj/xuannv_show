#!/usr/bin/env python3
"""
可视化 labels_v2 的标注样本
对每个任务的每个 period 的正样本 patch：
  - 左：S2 前期影像 + mask 红框 + 红色半透明 overlay
  - 右：S2 后期影像 + mask 红框 + 红色半透明 overlay
  - 下方：mask 本身（上采样到 128x128）
输出到 data/harbin/label_vis_v2/
"""

import json
import os
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image, ImageDraw, ImageFont

LABELS_DIR = Path("/workspace/xuannv_show/data/harbin/labels_v2")
S2_DIR = Path("/workspace/raw/harbin_scenes/s2")
OUTPUT_DIR = Path("/workspace/xuannv_show/data/harbin/label_vis_v2")
GRID_SIZE = 64


from typing import Optional
def load_s2_rgb(patch_id: str, month: str) -> Optional[np.ndarray]:
    """加载 S2 RGB 影像 [H, W, 3] uint8."""
    s2_dir = S2_DIR / patch_id
    if not s2_dir.exists():
        return None
    year, mon = month.split("-")
    prefix = f"{year}{mon}"
    tifs = sorted(s2_dir.glob(f"{prefix}*.tif"))
    if not tifs:
        return None
    tif_path = tifs[len(tifs) // 2]
    try:
        with rasterio.open(str(tif_path)) as ds:
            data = ds.read()
        if data.shape[0] >= 4:
            rgb = data[[2, 1, 0]].astype(np.float32)
        elif data.shape[0] >= 3:
            rgb = data[:3].astype(np.float32)
        else:
            return None
        # 固定范围归一化 [0, 3500] -> [0, 255]
        rgb = np.clip(rgb / 3500.0 * 255, 0, 255).astype(np.uint8)
        rgb = np.transpose(rgb, (1, 2, 0))
        return rgb
    except Exception as e:
        print(f"  Error loading {tif_path}: {e}")
        return None


def get_mask_bbox(mask_128: np.ndarray):
    """获取 mask 的边界框 (xmin, ymin, xmax, ymax) in pixel coords."""
    ys, xs = np.where(mask_128 > 0)
    if len(xs) == 0:
        return None
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)


def draw_overlay(img_arr: np.ndarray, mask_128: np.ndarray, bbox, color=(255, 0, 0), alpha=0.4):
    """在影像上画红色半透明 overlay 和红色边界框."""
    img = Image.fromarray(img_arr)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # 半透明 overlay
    mask_bool = mask_128 > 0
    for y in range(mask_bool.shape[0]):
        for x in range(mask_bool.shape[1]):
            if mask_bool[y, x]:
                draw.point((x, y), fill=(*color, int(255 * alpha)))

    # 红框
    if bbox:
        draw.rectangle(bbox, outline=(255, 0, 0), width=2)

    img_rgba = img.convert("RGBA")
    blended = Image.alpha_composite(img_rgba, overlay)
    return blended.convert("RGB")


def visualize_task_period(task: str, period: str, max_samples: int = 15):
    """可视化一个任务+period 的正样本."""
    period_dir = LABELS_DIR / task / period
    meta_path = period_dir / "meta.json"
    if not meta_path.exists():
        return

    with open(meta_path) as f:
        meta = json.load(f)

    before, after = period.split("_vs_")
    patches = meta.get("patches", [])

    out_dir = OUTPUT_DIR / task / period
    out_dir.mkdir(parents=True, exist_ok=True)

    drawn = 0
    for p_info in patches:
        patch_id = p_info["patch_id"]
        mask_path = period_dir / f"{patch_id}.npy"
        if not mask_path.exists():
            continue

        mask = np.load(mask_path)  # [64, 64]
        # 上采样到 128x128
        mask_img = Image.fromarray((mask * 255).astype(np.uint8))
        mask_128 = np.array(mask_img.resize((128, 128), Image.Resampling.NEAREST)) > 0

        # 加载 S2 影像
        s2_before = load_s2_rgb(patch_id, before)
        s2_after = load_s2_rgb(patch_id, after)
        if s2_before is None or s2_after is None:
            print(f"  [{task}/{period}] {patch_id}: S2 影像缺失，跳过")
            continue

        # 计算 bbox
        bbox = get_mask_bbox(mask_128.astype(np.uint8))

        # 画 overlay
        left = draw_overlay(s2_before, mask_128, bbox)
        right = draw_overlay(s2_after, mask_128, bbox)

        # mask 单独图
        mask_vis = Image.new("RGB", (128, 128), (0, 0, 0))
        mask_draw = ImageDraw.Draw(mask_vis)
        ys, xs = np.where(mask_128)
        for y, x in zip(ys, xs):
            mask_draw.point((x, y), fill=(255, 0, 0))
        if bbox:
            mask_draw.rectangle(bbox, outline=(0, 255, 255), width=1)

        # 拼接：左 + 中(mask) + 右
        total_w = 128 * 3 + 4  # 2px gaps
        total_h = 128 + 40     # 文字高度
        canvas = Image.new("RGB", (total_w, total_h), (30, 30, 30))
        canvas.paste(left, (0, 0))
        canvas.paste(mask_vis, (130, 0))
        canvas.paste(right, (260, 0))

        # 添加文字标签
        draw = ImageDraw.Draw(canvas)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 10)
        except Exception:
            font = ImageFont.load_default()

        label = f"{patch_id} | pos={p_info['positive_pixels']}({p_info['positive_ratio']:.3f}) | polygons={p_info['polygon_count']}"
        draw.text((4, 130), f"S2 {before}  (before)", fill=(200, 200, 200), font=font)
        draw.text((134, 130), "Mask", fill=(200, 200, 200), font=font)
        draw.text((264, 130), f"S2 {after}  (after)", fill=(200, 200, 200), font=font)
        draw.text((4, 145), label, fill=(255, 255, 0), font=font)

        out_path = out_dir / f"{patch_id}.png"
        canvas.save(out_path)
        drawn += 1

        if drawn >= max_samples:
            break

    print(f"  [{task}/{period}] 画了 {drawn}/{len(patches)} 个样本 -> {out_dir}")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    tasks = ["construction", "demolition", "land_conversion"]
    periods = ["2025-04_vs_2025-06", "2025-08_vs_2025-09", "2025-09_vs_2025-10"]

    for task in tasks:
        for period in periods:
            period_dir = LABELS_DIR / task / period
            if not period_dir.exists():
                continue
            visualize_task_period(task, period, max_samples=15)

    print(f"\n✅ 全部完成！输出目录: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
