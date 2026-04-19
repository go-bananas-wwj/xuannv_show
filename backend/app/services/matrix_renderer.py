"""Time×Source Matrix 渲染服务 — 为单个 patch 生成数据源×时间矩阵图."""
from __future__ import annotations

import io
import re
from pathlib import Path

import matplotlib
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from PIL import Image

matplotlib.use("Agg")

# 设置中文字体
plt.rcParams["font.sans-serif"] = ["WenQuanYi Micro Hei", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False

# ── 路径常量 ──
RAW_DIR = Path("/workspace/raw/harbin_scenes")
FALLBACK_RAW_DIR = Path("/workspace/raw/harbin")

# ── 数据源显示名称 ──
SOURCE_DISPLAY_NAMES = {
    "s2": "Sentinel-2",
    "s1": "Sentinel-1",
    "landsat": "Landsat",
    "s2_hr": "高分光学 (S2-HR)",
    "s1_hr": "高分雷达 (S1-HR)",
    "dem": "DEM",
    "worldcover": "WorldCover",
    "dynamic_world": "Dynamic World",
    "jrc_water": "JRC Water",
    "modis_ndvi": "MODIS NDVI",
    "modis_lst": "MODIS LST",
    "era5": "ERA5",
    "highres": "高分影像",
}

# ── WorldCover 颜色表 ──
WORLDCOVER_COLORS = {
    10: (65, 155, 223),
    20: (57, 125, 73),
    30: (136, 176, 83),
    40: (255, 187, 34),
    50: (255, 255, 76),
    60: (187, 85, 29),
    70: (222, 222, 222),
    80: (170, 170, 170),
    90: (120, 80, 20),
    95: (140, 140, 140),
    100: (100, 100, 100),
}


def _colorize_worldcover(wc_arr: np.ndarray) -> np.ndarray:
    """WorldCover 标签 [H, W] → RGB [H, W, 3] uint8."""
    h, w = wc_arr.shape
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    for v, color in WORLDCOVER_COLORS.items():
        rgb[wc_arr == v] = color
    return rgb


def _fig_to_png_bytes(fig: plt.Figure) -> bytes:
    """matplotlib Figure → PNG bytes."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor="white")
    buf.seek(0)
    return buf.getvalue()


def render_time_source_matrix(patch_id: str) -> bytes | None:
    """渲染 时间×数据源 矩阵，返回 PNG bytes.

    数据来源:
        - 主目录: /workspace/raw/harbin_scenes/{source}/{patch_id}/
        - 回退:   /workspace/raw/harbin/{source}/{patch_id}/
    """
    patch_id_name = patch_id  # e.g. "patch_000000"

    TEMPORAL_ORDER = [
        "s2", "s1", "landsat", "s2_hr", "s1_hr",
        "highres", "modis_ndvi", "modis_lst", "era5",
    ]
    STATIC_ORDER = [
        "dem", "dem_derived", "worldcover", "io_lulc",
        "osm_buildings", "osm_landuse", "osm_roads",
        "osm_waterways", "osm_railway",
    ]

    def _src_dir(src: str) -> Path:
        return RAW_DIR / src / patch_id_name

    def _fallback_src_dir(src: str) -> Path:
        return FALLBACK_RAW_DIR / src / patch_id_name

    def _extract_date(fname: str) -> str | None:
        m = re.search(r'(\d{8})', fname)
        if m:
            return m.group(1)
        m = re.search(r'(\d{4}Q\d)', fname)
        if m:
            return m.group(1)
        return None

    def _month_label(date_str: str) -> str:
        if 'Q' in date_str:
            year = date_str[:4]
            quarter = int(date_str[-1])
            month_map = {1: '02', 2: '05', 3: '08', 4: '11'}
            return f"{year}-{month_map[quarter]}"
        return f"{date_str[:4]}-{date_str[4:6]}"

    def _render_thumb(ax, tif_path: Path, src_name: str) -> None:
        """渲染单个缩略图到 axes."""
        try:
            with rasterio.open(str(tif_path)) as ds:
                data = ds.read()
            if src_name in ("s2", "landsat", "s2_hr", "highres") and data.shape[0] >= 3:
                if src_name in ("s2", "s2_hr") and data.shape[0] >= 4:
                    rgb = data[[2, 1, 0]].astype(np.float32)
                else:
                    rgb = data[:3].astype(np.float32)
                valid = rgb[rgb > 0]
                if len(valid) > 0:
                    p2, p98 = np.percentile(valid, [2, 98])
                    if p98 > p2:
                        rgb = (rgb - p2) / (p98 - p2)
                rgb = np.clip(rgb, 0, 1).transpose(1, 2, 0)
                ax.imshow(rgb)
            elif src_name == "worldcover":
                ax.imshow(_colorize_worldcover(data[0]))
            elif src_name in ("dem", "dem_derived"):
                ax.imshow(data[0], cmap="terrain")
            elif src_name == "modis_ndvi":
                ax.imshow(data[0], cmap="YlGn")
            elif src_name == "modis_lst":
                ax.imshow(data[0], cmap="RdYlBu_r")
            elif src_name in ("s1", "s1_hr"):
                if data.shape[0] >= 2 and data[1].max() > 0:
                    vv = data[0].astype(np.float32)
                    vh = data[1].astype(np.float32)
                    vv_n = np.clip((vv + 25) / 35, 0, 1)
                    vh_n = np.clip((vh + 30) / 35, 0, 1)
                    rgb = np.stack([vv_n, vh_n, vv_n / (vh_n + 1e-6) * 0.3], axis=-1)
                    rgb = np.clip(rgb, 0, 1)
                    ax.imshow(rgb)
                else:
                    vv = data[0].astype(np.float32)
                    vv_n = np.clip((vv + 25) / 35, 0, 1)
                    ax.imshow(vv_n, cmap="gray")
            else:
                ax.imshow(data[0], cmap="viridis")
        except Exception:
            ax.set_facecolor("white")
            for spine in ax.spines.values():
                spine.set_visible(False)

    # ── 收集时序数据 ──
    temporal_available: list[tuple[str, dict[str, list[Path]]]] = []
    all_months: set[str] = set()

    for src in TEMPORAL_ORDER:
        month_groups: dict[str, list[Path]] = {}
        src_dir = _src_dir(src)
        if src_dir.exists():
            for f in sorted(src_dir.glob("*.tif")):
                date = _extract_date(f.stem)
                if date:
                    ml = _month_label(date)
                    month_groups.setdefault(ml, []).append(f)
                    all_months.add(ml)
        fb_dir = _fallback_src_dir(src)
        if fb_dir.exists():
            for f in sorted(fb_dir.glob("*.tif")):
                date = _extract_date(f.stem)
                if date:
                    ml = _month_label(date)
                    if ml not in month_groups:
                        month_groups[ml] = [f]
                        all_months.add(ml)
        if month_groups:
            temporal_available.append((src, month_groups))

    # ── 收集静态数据 ──
    static_available: list[tuple[str, Path]] = []
    for src in STATIC_ORDER:
        src_dir = _src_dir(src)
        if src_dir.exists():
            files = sorted(src_dir.glob("*.tif"))
            if files:
                static_available.append((src, files[0]))
                continue
        fb_dir = _fallback_src_dir(src)
        if fb_dir.exists():
            files = sorted(fb_dir.glob("*.tif"))
            if files:
                static_available.append((src, files[0]))

    if not temporal_available and not static_available:
        fig, ax = plt.subplots(figsize=(8, 2), dpi=100)
        ax.text(0.5, 0.5, "No data sources available",
                ha="center", va="center", fontsize=14)
        ax.axis("off")
        png = _fig_to_png_bytes(fig)
        plt.close(fig)
        return png

    sorted_months = sorted(all_months)
    n_temporal = len(temporal_available)
    n_months = len(sorted_months)
    n_static = len(static_available)
    has_static = n_static > 0

    n_cols = max(n_months, n_static, 1)
    n_rows = n_temporal + (1 if has_static else 0)

    cell_w, cell_h = 2.0, 1.8
    fig_w = 2.5 + cell_w * n_cols + 0.5
    fig_h = 1.5 + cell_h * n_rows + 0.5
    fig, axes = plt.subplots(
        n_rows, n_cols,
        figsize=(max(fig_w, 12), max(fig_h, 5)),
        dpi=120, squeeze=False,
    )

    # ── 渲染时序行 ──
    for row, (src_name, month_groups) in enumerate(temporal_available):
        for col in range(n_cols):
            ax = axes[row, col]
            ax.set_xticks([])
            ax.set_yticks([])
            if col < n_months:
                month = sorted_months[col]
                files = month_groups.get(month, [])
                if files:
                    _render_thumb(ax, files[0], src_name)
                    if len(files) > 1:
                        ax.text(
                            0.95, 0.05, f"x{len(files)}",
                            transform=ax.transAxes, fontsize=7,
                            color="white", ha="right", va="bottom",
                            bbox=dict(boxstyle="round,pad=0.1",
                                      fc="black", alpha=0.6),
                        )
                else:
                    ax.set_facecolor("white")
                    for spine in ax.spines.values():
                        spine.set_visible(False)
            else:
                ax.axis("off")

    # 时序列标题（月份）
    for col in range(min(n_months, n_cols)):
        axes[0, col].set_title(sorted_months[col], fontsize=10,
                               fontweight="bold", pad=8)

    # 时序行标签
    for row, (src_name, _) in enumerate(temporal_available):
        display = SOURCE_DISPLAY_NAMES.get(src_name, src_name)
        axes[row, 0].set_ylabel(display, fontsize=11, rotation=0,
                                labelpad=100, va="center", ha="right")

    # ── 渲染静态行 ──
    if has_static:
        static_row = n_rows - 1
        for col in range(n_cols):
            ax = axes[static_row, col]
            ax.set_xticks([])
            ax.set_yticks([])
            if col < n_static:
                src_name, tif_path = static_available[col]
                _render_thumb(ax, tif_path, src_name)
                display = SOURCE_DISPLAY_NAMES.get(src_name, src_name)
                ax.set_xlabel(display, fontsize=8, labelpad=4)
            else:
                ax.axis("off")
        axes[static_row, 0].set_ylabel(
            "Static", fontsize=11, rotation=0,
            labelpad=100, va="center", ha="right", fontweight="bold",
        )

    fig.suptitle(f"Time × Source Matrix : {patch_id}",
                 fontsize=15, fontweight="bold", y=0.98)
    fig.patch.set_facecolor("white")
    fig.subplots_adjust(left=0.12, right=0.98, top=0.90, bottom=0.06,
                        wspace=0.08, hspace=0.20)
    png = _fig_to_png_bytes(fig)
    plt.close(fig)
    return png
