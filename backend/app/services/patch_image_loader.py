"""Patch 影像加载器 — 替代 demo_v2.engines.patch_image_loader.

直接从 /workspace/raw/harbin_scenes 读取 TIFF 文件，不依赖 demo_v2 模块。
"""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image

from app.config import settings

# ── 时间窗口定义（从 demo_v2/utils/constants.py 恢复）──
TIME_WINDOWS = {
    "2023-01": (1672531200000.0, 1675209600000.0),
    "2023-02": (1675209600000.0, 1677628800000.0),
    "2023-03": (1677628800000.0, 1680307200000.0),
    "2023-04": (1680307200000.0, 1682899200000.0),
    "2023-05": (1682899200000.0, 1685577600000.0),
    "2023-06": (1685577600000.0, 1688169600000.0),
    "2023-07": (1688169600000.0, 1690848000000.0),
    "2023-08": (1690848000000.0, 1693526400000.0),
    "2023-09": (1693526400000.0, 1696118400000.0),
    "2023-10": (1696118400000.0, 1698796800000.0),
    "2024-01": (1704067200000.0, 1706745600000.0),
    "2024-02": (1706745600000.0, 1709251200000.0),
    "2024-03": (1709251200000.0, 1711929600000.0),
    "2024-04": (1711929600000.0, 1714521600000.0),
    "2024-05": (1714521600000.0, 1717200000000.0),
    "2024-06": (1717200000000.0, 1719792000000.0),
    "2024-07": (1719792000000.0, 1722470400000.0),
    "2024-08": (1722470400000.0, 1725148800000.0),
    "2024-09": (1725148800000.0, 1727740800000.0),
    "2024-10": (1727740800000.0, 1730419200000.0),
    "2025-01": (1735689600000.0, 1738368000000.0),
    "2025-02": (1738368000000.0, 1740787200000.0),
    "2025-03": (1740787200000.0, 1743465600000.0),
    "2025-04": (1743465600000.0, 1746057600000.0),
    "2025-05": (1746057600000.0, 1748736000000.0),
    "2025-06": (1748736000000.0, 1751328000000.0),
    "2025-07": (1751328000000.0, 1754006400000.0),
    "2025-08": (1754006400000.0, 1756684800000.0),
    "2025-09": (1756684800000.0, 1759276800000.0),
    "2025-10": (1759276800000.0, 1761955200000.0),
    "2023 Q1-Q2": (1672531200000.0, 1688169600000.0),
    "2023 Q3-Q4": (1688169600000.0, 1703980800000.0),
    "2024 Q1-Q2": (1704067200000.0, 1719792000000.0),
    "2024 Q3-Q4": (1719792000000.0, 1735603200000.0),
    "2025 Q1-Q2": (1735689600000.0, 1751328000000.0),
    "2023 全年": (1672531200000.0, 1703980800000.0),
    "2024 全年": (1704067200000.0, 1735603200000.0),
    "2025 全年": (1735689600000.0, 1767225600000.0),
}

RAW_DIR = settings.raw_scenes_dir


# ── 内部工具函数 ──
def _extract_date_ms(fname: str) -> float | None:
    """从文件名提取日期时间戳（毫秒）.

    支持格式:
      - YYYYMMDD  (e.g. 20230113)
      - YYYYQN    (e.g. 2023Q1)
    """
    m = re.search(r"(\d{8})", fname)
    if m:
        dt = datetime.strptime(m.group(1), "%Y%m%d")
        return dt.timestamp() * 1000.0

    m = re.search(r"(\d{4}Q\d)", fname)
    if m:
        q_str = m.group(1)
        year = int(q_str[:4])
        quarter = int(q_str[-1])
        month_map = {1: 2, 2: 5, 3: 8, 4: 11}
        month = month_map[quarter]
        dt = datetime(year, month, 15)
        return dt.timestamp() * 1000.0

    return None


def _find_best_tif(source_dir: Path, window_start_ms: float, window_end_ms: float) -> Path | None:
    """在 source_dir 中找到时间窗口内最接近窗口中点的 TIFF 文件."""
    if not source_dir.exists():
        return None

    candidates = []
    for f in sorted(source_dir.glob("*.tif")):
        t = _extract_date_ms(f.stem)
        if t is None:
            continue
        if window_start_ms <= t <= window_end_ms:
            candidates.append((f, t))

    if not candidates:
        return None

    mid = (window_start_ms + window_end_ms) / 2.0
    best = min(candidates, key=lambda x: abs(x[1] - mid))
    return best[0]


def load_patch_source_rgb(
    patch_id: str,
    source: str,
    window: tuple[float, float],
    out_size: int = 256,
) -> np.ndarray | None:
    """加载指定 patch、数据源和时间窗口的 RGB 影像.

    返回: uint8 ndarray [H, W, 3] 或 None.
    """
    source_dir = RAW_DIR / source / patch_id
    tif_path = _find_best_tif(source_dir, window[0], window[1])
    if tif_path is None:
        return None

    try:
        with rasterio.open(str(tif_path)) as ds:
            data = ds.read()  # [C, H, W]
    except Exception:
        return None

    # ── 光学影像 (s2, s2_hr, landsat, highres) ──
    if source in ("s2", "s2_hr", "landsat", "highres"):
        if data.shape[0] >= 4 and source in ("s2", "s2_hr"):
            rgb = data[[2, 1, 0]].astype(np.float32)
        elif data.shape[0] >= 3:
            rgb = data[:3].astype(np.float32)
        else:
            return None

        valid = rgb[rgb > 0]
        if len(valid) > 0:
            p2, p98 = np.percentile(valid, [2, 98])
            if p98 > p2:
                rgb = (rgb - p2) / (p98 - p2)

        rgb = np.clip(rgb, 0, 1)
        rgb = rgb.transpose(1, 2, 0)
        rgb = (rgb * 255).astype(np.uint8)

    # ── SAR 影像 (s1, s1_hr) ──
    elif source in ("s1", "s1_hr"):
        if data.shape[0] >= 2:
            vv = data[0].astype(np.float32)
            vh = data[1].astype(np.float32)
            vv_n = np.clip((vv + 25) / 35, 0, 1)
            vh_n = np.clip((vh + 30) / 35, 0, 1)
            rgb = np.stack(
                [vv_n, vh_n, vv_n / (vh_n + 1e-6) * 0.3],
                axis=-1,
            )
            rgb = np.clip(rgb, 0, 1)
            rgb = (rgb * 255).astype(np.uint8)
        elif data.shape[0] >= 1:
            band = data[0].astype(np.float32)
            band_n = np.clip((band + 25) / 35, 0, 1)
            rgb = np.stack([band_n, band_n, band_n], axis=-1)
            rgb = (rgb * 255).astype(np.uint8)
        else:
            return None

    # ── 其他单波段数据源 ──
    else:
        band = data[0].astype(np.float32)
        valid = band[band > 0]
        if len(valid) > 0:
            p2, p98 = np.percentile(valid, [2, 98])
            if p98 > p2:
                band = (band - p2) / (p98 - p2)
        band = np.clip(band, 0, 1)
        rgb = np.stack([band, band, band], axis=-1)
        rgb = (rgb * 255).astype(np.uint8)

    # Resize if needed
    if rgb.shape[0] != out_size or rgb.shape[1] != out_size:
        img = Image.fromarray(rgb)
        img = img.resize((out_size, out_size), Image.Resampling.LANCZOS)
        rgb = np.array(img)

    return rgb


def load_s2_rgb_natural(
    patch_id: str,
    month: str,
    out_size: int = 256,
) -> np.ndarray | None:
    """加载 S2 RGB 原始影像，固定反射率范围归一化.

    返回 float32 ndarray [H, W, 3]，值域 [0, 1].
    """
    window = TIME_WINDOWS.get(month)
    if window is None:
        return None

    source_dir = RAW_DIR / "s2" / patch_id
    tif_path = _find_best_tif(source_dir, window[0], window[1])
    if tif_path is None:
        return None

    try:
        with rasterio.open(str(tif_path)) as ds:
            data = ds.read()
    except Exception:
        return None

    if data.shape[0] >= 4:
        rgb = data[[2, 1, 0]].astype(np.float32)
    elif data.shape[0] >= 3:
        rgb = data[:3].astype(np.float32)
    else:
        return None

    rgb = np.clip(rgb / 3500.0, 0, 1)
    rgb = rgb.transpose(1, 2, 0)

    if rgb.shape[0] != out_size or rgb.shape[1] != out_size:
        pil = Image.fromarray((rgb * 255).astype(np.uint8))
        pil = pil.resize((out_size, out_size), Image.Resampling.LANCZOS)
        rgb = np.array(pil).astype(np.float32) / 255.0

    return rgb
