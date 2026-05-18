"""Embedding 通道预览引擎 — 从128维中提取指定3维生成RGB PNG."""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image

from app.config import settings


def load_embedding_npy(patch_id: str, month: str) -> np.ndarray | None:
    """加载指定 patch 和月份的 embedding .npy 文件.

    Returns:
        (128, 64, 64) float32 array, or None if not found.
    """
    path = settings.embeddings_dir / f"{patch_id}_{month}.npy"
    if not path.exists():
        return None
    return np.load(path)


def extract_channels(
    embedding: np.ndarray,
    ch_r: int,
    ch_g: int,
    ch_b: int,
    norm: str = "local",
    global_stats: dict | None = None,
) -> np.ndarray:
    """从 embedding 中提取3个通道并归一化为 [0, 255] uint8.

    Args:
        embedding: (D, H, W) array, D >= max(ch_r, ch_g, ch_b) + 1
        ch_r, ch_g, ch_b: 通道索引 (0-127)
        norm: "local" 每通道独立min-max | "global" 使用全局统计量
        global_stats: 全局统计量 dict，仅在 norm="global" 时使用

    Returns:
        (H, W, 3) uint8 array.
    """
    rgb = np.stack([embedding[ch_r], embedding[ch_g], embedding[ch_b]], axis=-1)

    if norm == "global" and global_stats is not None:
        # 使用全局 percentile 进行归一化
        for i, ch in enumerate([ch_r, ch_g, ch_b]):
            vmin = global_stats.get(f"dim_{ch}_p1", rgb[..., i].min())
            vmax = global_stats.get(f"dim_{ch}_p99", rgb[..., i].max())
            rgb[..., i] = (rgb[..., i] - vmin) / (vmax - vmin + 1e-8)
    else:
        # 局部归一化：每通道独立 min-max
        for i in range(3):
            vmin = rgb[..., i].min()
            vmax = rgb[..., i].max()
            rgb[..., i] = (rgb[..., i] - vmin) / (vmax - vmin + 1e-8)

    rgb = np.clip(rgb, 0, 1)
    rgb = (rgb * 255).astype(np.uint8)
    return rgb


def generate_preview_png(
    patch_id: str,
    month: str,
    ch_r: int = 0,
    ch_g: int = 1,
    ch_b: int = 2,
    norm: str = "local",
    target_size: int = 256,
) -> bytes | None:
    """生成通道预览 PNG 字节.

    Args:
        patch_id: Patch ID, e.g. "patch_000000"
        month: Month string, e.g. "2025-04"
        ch_r, ch_g, ch_b: Channel indices (0-127)
        norm: "local" or "global"
        target_size: Output image size (H=W)

    Returns:
        PNG bytes, or None if embedding not found.
    """
    embedding = load_embedding_npy(patch_id, month)
    if embedding is None:
        return None

    rgb = extract_channels(embedding, ch_r, ch_g, ch_b, norm=norm)

    img = Image.fromarray(rgb)
    if target_size != rgb.shape[0]:
        img = img.resize((target_size, target_size), Image.Resampling.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_preview_for_preset(
    patch_id: str,
    month: str,
    preset_id: str,
    norm: str = "local",
    target_size: int = 256,
) -> bytes | None:
    """为指定语义预设生成预览 PNG.

    自动从 preset_analyzer 获取 top3 维度。
    """
    from .preset_analyzer import get_preset_by_id

    preset = get_preset_by_id(preset_id)
    if preset is None:
        return None

    top3 = preset["top3"]
    return generate_preview_png(
        patch_id, month,
        ch_r=top3[0], ch_g=top3[1], ch_b=top3[2],
        norm=norm, target_size=target_size,
    )


# ── 全局统计量（可选，用于 global 归一化）──
# 懒加载：首次请求时计算并缓存
_global_stats_cache: dict | None = None


def compute_global_stats(sample_n: int = 1000) -> dict:
    """计算全局维度统计量（用于 global 归一化）.

    随机采样 N 个 patch-month 的 embedding，计算每个维度的 1% 和 99% percentile。
    """
    import random

    npy_files = list(settings.embeddings_dir.glob("patch_*_2025-04.npy"))
    if len(npy_files) > sample_n:
        npy_files = random.sample(npy_files, sample_n)

    all_values = [[] for _ in range(128)]
    for path in npy_files:
        emb = np.load(path)
        for d in range(128):
            all_values[d].extend(emb[d].flatten().tolist())

    stats = {}
    for d in range(128):
        arr = np.array(all_values[d])
        stats[f"dim_{d}_p1"] = float(np.percentile(arr, 1))
        stats[f"dim_{d}_p99"] = float(np.percentile(arr, 99))

    return stats


def get_global_stats() -> dict:
    """获取全局统计量（带缓存）."""
    global _global_stats_cache
    if _global_stats_cache is None:
        _global_stats_cache = compute_global_stats()
    return _global_stats_cache
