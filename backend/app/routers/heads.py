"""Heads API — 下游任务头结果."""
from __future__ import annotations

import functools
import io
import re
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image, ImageDraw, ImageFont
from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from app.services.data_loader import data_loader
from app.services.task_engine import get_cd_engine
from app.services.segmentation_engine import get_seg_engine

router = APIRouter(prefix="/heads", tags=["heads"])

# 合法 head_id 白名单
_VALID_HEAD_IDS = {"change_detection", "worldcover", "dynamic_world", "jrc_water", "building_extraction", "construction", "land_conversion"}
# 基于 Few-Shot Task Head v2 训练的新任务（两期差分输入，结果从 data/harbin/results_v2/ 读取）
_CUSTOM_HEAD_IDS = {"construction", "land_conversion"}
_VALID_PERIOD_RE = re.compile(r"^[\w\-_.]+$")
_VALID_REGION_RE = re.compile(r"^[a-zA-Z0-9_]+$")
_VALID_VERSION_RE = re.compile(r"^v\d+$")
_VALID_PATCH_ID_RE = re.compile(r"^patch_\d{6}$")

from app.config import settings

# 预计算结果目录
RESULTS_DIR = settings.results_dir


@router.get("")
async def list_heads() -> list[dict[str, str]]:
    """列出所有可用的 task heads."""
    return data_loader.list_available_heads()


@router.get("/{head_id}/result", response_model=None)
async def get_head_result(
    head_id: str,
    period: str = Query(..., description="Time period, e.g. 2023-10_vs_2024-10"),
    region: str = Query("harbin", description="Region name"),
    version: str = Query("v2", description="Model version, e.g. v2 or v4"),
) -> Response:
    """返回某 head 在指定时间段的结果图 (兼容旧接口)."""
    if head_id not in _VALID_HEAD_IDS:
        raise HTTPException(status_code=400, detail="Invalid head_id")
    if not _VALID_PERIOD_RE.match(period):
        raise HTTPException(status_code=400, detail="Invalid period format")
    if not _VALID_REGION_RE.match(region):
        raise HTTPException(status_code=400, detail="Invalid region format")
    if not _VALID_VERSION_RE.match(version):
        raise HTTPException(status_code=400, detail="Invalid version format")

    path = data_loader.get_head_result_path(head_id, period, region, version)
    if path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Result for head={head_id} period={period} not found",
        )
    media_type = "image/png" if path.suffix == ".png" else "image/tiff" if path.suffix in (".tif", ".tiff") else "image/jpeg"
    return FileResponse(path, media_type=media_type)


@router.get("/{head_id}/mosaic", response_model=None)
async def get_mosaic(
    head_id: str,
    period: str = Query(..., description="Time period, e.g. 2025-04_vs_2025-10"),
) -> Response:
    """返回某任务的 mosaic 拼接大图."""
    if head_id not in _VALID_HEAD_IDS:
        raise HTTPException(status_code=400, detail="Invalid head_id")
    if not _VALID_PERIOD_RE.match(period):
        raise HTTPException(status_code=400, detail="Invalid period format")

    # Few-Shot 新任务 v2: 从 data/harbin/results_v2/ 读取
    if head_id in _CUSTOM_HEAD_IDS:
        path = settings.project_root / "data" / settings.region / "results_v2" / head_id / period / f"{period}.png"
        if path.exists():
            return FileResponse(path, media_type="image/png")
        raise HTTPException(
            status_code=404,
            detail=f"Mosaic for head={head_id} period={period} not found",
        )

    # 目前仅 change_detection 有预计算结果
    if head_id != "change_detection":
        raise HTTPException(status_code=404, detail=f"Mosaic not available for head={head_id}")

    path = RESULTS_DIR / head_id / f"mosaic_{period}.png"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Mosaic for head={head_id} period={period} not found",
        )
    return FileResponse(path, media_type="image/png")


@functools.lru_cache(maxsize=128)
def _render_detail_cached(patch_id: str, period: str) -> bytes:
    """缓存渲染的 detail 图 PNG bytes."""
    before, after = period.split("_vs_")
    img = get_cd_engine().render_detail_figure(patch_id, before, after, panel_size=256)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@functools.lru_cache(maxsize=128)
def _render_seg_detail_cached(head_id: str, patch_id: str, month: str) -> bytes:
    """缓存分类任务的 detail 图 PNG bytes."""
    img = get_seg_engine().render_detail_figure(head_id, patch_id, month, panel_size=256)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@router.get("/{head_id}/patch/{patch_id}/detail", response_model=None)
async def get_patch_detail(
    head_id: str,
    patch_id: str,
    period: str = Query(..., description="Time period"),
) -> Response:
    """返回单 patch 的详情图 (弹窗用).

    优先使用内存缓存，未命中时在线程池中动态渲染。
    """
    if head_id not in _VALID_HEAD_IDS:
        raise HTTPException(status_code=400, detail="Invalid head_id")
    if not _VALID_PATCH_ID_RE.match(patch_id):
        raise HTTPException(status_code=400, detail="Invalid patch_id format")
    if not _VALID_PERIOD_RE.match(period):
        raise HTTPException(status_code=400, detail="Invalid period format")

    if head_id in _CUSTOM_HEAD_IDS:
        # Few-Shot 新任务 v2：渲染三列详情图（S2前期 | S2后期 | 变化热力图）
        if "_vs_" not in period:
            raise HTTPException(status_code=400, detail="Invalid period format, expected 'YYYY-MM_vs_YYYY-MM'")
        try:
            png_bytes = await run_in_threadpool(_render_custom_detail_cached, head_id, patch_id, period)
            return Response(content=png_bytes, media_type="image/png")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to render detail: {e}")

    if head_id == "change_detection":
        # 变化检测：双期 period="YYYY-MM_vs_YYYY-MM"
        if "_vs_" not in period:
            raise HTTPException(status_code=400, detail="Invalid period format, expected 'YYYY-MM_vs_YYYY-MM'")
        try:
            png_bytes = _render_detail_cached(patch_id, period)
            return Response(content=png_bytes, media_type="image/png")
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to render detail: {e}")
    else:
        # 分类任务：单期 period="YYYY-MM"
        try:
            png_bytes = _render_seg_detail_cached(head_id, patch_id, period)
            return Response(content=png_bytes, media_type="image/png")
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to render detail: {e}")


@functools.lru_cache(maxsize=256)
def _render_seg_tile_cached(head_id: str, patch_id: str, month: str) -> bytes:
    """缓存分类任务的 tile 渲染结果."""
    img = get_seg_engine().render_mosaic_tile(head_id, patch_id, month, size=128)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _load_s2_rgb_for_month(patch_id: str, month: str, out_size: int = 256) -> Image.Image | None:
    """加载指定 patch 和月份的 S2 RGB 影像."""
    s2_dir = Path("/workspace/raw/harbin_scenes/s2") / patch_id
    if not s2_dir.exists():
        return None

    # month = "2025-04" → 找 202504*.tif
    year, mon = month.split("-")
    prefix = f"{year}{mon}"
    tifs = sorted(s2_dir.glob(f"{prefix}*.tif"))
    if not tifs:
        return None

    # 取中间日期的影像
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

        rgb = np.clip(rgb / 3500.0, 0, 1)
        rgb = rgb.transpose(1, 2, 0)

        if rgb.shape[0] != out_size or rgb.shape[1] != out_size:
            pil = Image.fromarray((rgb * 255).astype(np.uint8))
            pil = pil.resize((out_size, out_size), Image.Resampling.LANCZOS)
            rgb = np.array(pil).astype(np.float32) / 255.0

        return Image.fromarray((rgb * 255).astype(np.uint8))
    except Exception:
        return None


def _load_sar_rgb_for_month(patch_id: str, month: str, out_size: int = 256) -> Image.Image | None:
    """加载指定 patch 和月份的 Sentinel-1 SAR 伪彩色影像.

    SAR 通常为 2 波段 (VV, VH)，dB 值。渲染为伪彩色：
      R = VV 归一化, G = VH 归一化, B = VV - VH (差异) 归一化
    若只有 1 波段，则渲染为灰度图。
    """
    s1_dir = Path("/workspace/raw/harbin_scenes/s1") / patch_id
    if not s1_dir.exists():
        return None

    year, mon = month.split("-")
    prefix = f"{year}{mon}"
    tifs = sorted(s1_dir.glob(f"{prefix}*.tif"))
    if not tifs:
        return None

    tif_path = tifs[len(tifs) // 2]

    try:
        with rasterio.open(str(tif_path)) as ds:
            data = ds.read()  # [C, H, W]

        if data.shape[0] >= 2:
            vv = data[0].astype(np.float32)  # VV
            vh = data[1].astype(np.float32)  # VH
            # dB 值典型范围 [-30, 0]，裁剪到 [-25, 5] 映射到 [0, 1]
            vv_norm = np.clip((vv + 25.0) / 30.0, 0, 1)
            vh_norm = np.clip((vh + 25.0) / 30.0, 0, 1)
            diff = vv - vh
            diff_norm = np.clip((diff + 10.0) / 20.0, 0, 1)
            rgb = np.stack([vv_norm, vh_norm, diff_norm], axis=-1)
        elif data.shape[0] == 1:
            # 单波段，渲染为灰度
            band = data[0].astype(np.float32)
            gray = np.clip((band + 25.0) / 30.0, 0, 1)
            rgb = np.stack([gray, gray, gray], axis=-1)
        else:
            return None

        if rgb.shape[0] != out_size or rgb.shape[1] != out_size:
            pil = Image.fromarray((rgb * 255).astype(np.uint8))
            pil = pil.resize((out_size, out_size), Image.Resampling.LANCZOS)
            rgb = np.array(pil).astype(np.float32) / 255.0

        return Image.fromarray((rgb * 255).astype(np.uint8))
    except Exception:
        return None


def _make_placeholder_img(size: int, text: str) -> Image.Image:
    """生成灰色占位图."""
    img = Image.new("RGB", (size, size), (200, 200, 200))
    draw = ImageDraw.Draw(img)
    font_path = settings.effective_font_path
    if font_path:
        font = ImageFont.truetype(str(font_path), 14)
    else:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    draw.text(((size - text_w) // 2, (size - text_h) // 2), text, fill="#888888", font=font)
    return img


@functools.lru_cache(maxsize=128)
def _render_custom_detail_cached(head_id: str, patch_id: str, period: str) -> bytes:
    """为新任务渲染五列详情图：S2前期 | SAR前期 | SAR后期 | S2后期 | 变化热力图."""
    before, after = period.split("_vs_")
    panel_size = 156
    gap = 12
    total_w = panel_size * 5 + gap * 4
    total_h = panel_size + 8  # 上下各留 4px 边距

    canvas = Image.new("RGB", (total_w, total_h), (30, 30, 30))

    def _paste_panel(img, col_idx):
        x = col_idx * (panel_size + gap) + 4  # 左右边距
        y = 4
        canvas.paste(img, (x, y))

    # 1. S2 前期影像
    s2_before = _load_s2_rgb_for_month(patch_id, before, panel_size)
    if s2_before is None:
        s2_before = _make_placeholder_img(panel_size, f"S2 {before}\n无影像")
    _paste_panel(s2_before, 0)

    # 2. SAR 前期影像
    sar_before = _load_sar_rgb_for_month(patch_id, before, panel_size)
    if sar_before is None:
        sar_before = _make_placeholder_img(panel_size, f"SAR {before}\n无影像")
    _paste_panel(sar_before, 1)

    # 3. SAR 后期影像
    sar_after = _load_sar_rgb_for_month(patch_id, after, panel_size)
    if sar_after is None:
        sar_after = _make_placeholder_img(panel_size, f"SAR {after}\n无影像")
    _paste_panel(sar_after, 2)

    # 4. S2 后期影像
    s2_after = _load_s2_rgb_for_month(patch_id, after, panel_size)
    if s2_after is None:
        s2_after = _make_placeholder_img(panel_size, f"S2 {after}\n无影像")
    _paste_panel(s2_after, 3)

    # 5. 变化概率热力图
    heatmap_path = settings.project_root / "data" / settings.region / "results_v2" / head_id / period / "tiles" / f"{patch_id}.png"
    if heatmap_path.exists():
        heatmap = Image.open(heatmap_path).convert("RGB")
        heatmap = heatmap.resize((panel_size, panel_size), Image.Resampling.NEAREST)
    else:
        heatmap = _make_placeholder_img(panel_size, "变化热力图\n未找到")
    _paste_panel(heatmap, 4)

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


@router.get("/{head_id}/patch/{patch_id}/tile", response_model=None)
@router.head("/{head_id}/patch/{patch_id}/tile", response_model=None, include_in_schema=False)
async def get_patch_tile(
    head_id: str,
    patch_id: str,
    period: str = Query(..., description="Time period"),
) -> Response:
    """返回单 patch 的 mosaic tile 图."""
    if head_id not in _VALID_HEAD_IDS:
        raise HTTPException(status_code=400, detail="Invalid head_id")
    if not _VALID_PATCH_ID_RE.match(patch_id):
        raise HTTPException(status_code=400, detail="Invalid patch_id format")
    if not _VALID_PERIOD_RE.match(period):
        raise HTTPException(status_code=400, detail="Invalid period format")

    if head_id in _CUSTOM_HEAD_IDS:
        # Few-Shot 新任务 v2：读取预计算 tile
        path = settings.project_root / "data" / settings.region / "results_v2" / head_id / period / "tiles" / f"{patch_id}.png"
        if not path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Tile for {patch_id} period={period} not found",
            )
        return FileResponse(path, media_type="image/png")

    if head_id == "change_detection":
        # 变化检测：读取预计算文件
        path = RESULTS_DIR / head_id / "tiles" / f"{patch_id}_{period}.png"
        if not path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Tile for {patch_id} period={period} not found",
            )
        return FileResponse(path, media_type="image/png")
    else:
        # 分类任务：优先使用预生成的静态 tile，不存在时动态生成
        static_path = settings.static_assets_base / "data" / "seg_tiles" / head_id / period / f"{patch_id}.png"
        if static_path.exists():
            return FileResponse(static_path, media_type="image/png")
        try:
            png_bytes = await run_in_threadpool(
                _render_seg_tile_cached, head_id, patch_id, period
            )
            return Response(content=png_bytes, media_type="image/png")
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to render tile: {e}")


@router.get("/{head_id}/available-months")
async def get_available_months(head_id: str) -> dict:
    """返回某任务可用的月份/月份对列表."""
    if head_id not in _VALID_HEAD_IDS:
        raise HTTPException(status_code=400, detail="Invalid head_id")

    if head_id in _CUSTOM_HEAD_IDS:
        # Few-Shot 新任务 v2：变化检测，返回时间对
        return {
            "periods": [
                {"label": "2025年4月 vs 6月", "value": "2025-04_vs_2025-06"},
                {"label": "2025年8月 vs 9月", "value": "2025-08_vs_2025-09"},
                {"label": "2025年9月 vs 10月", "value": "2025-09_vs_2025-10"},
            ]
        }

    if head_id == "change_detection":
        return {
            "periods": [
                {"label": "2025年4月 vs 10月", "value": "2025-04_vs_2025-10"},
                {"label": "2025年6月 vs 10月", "value": "2025-06_vs_2025-10"},
                {"label": "2025年8月 vs 10月", "value": "2025-08_vs_2025-10"},
                {"label": "2025年4月 vs 6月", "value": "2025-04_vs_2025-06"},
                {"label": "2025年6月 vs 8月", "value": "2025-06_vs_2025-08"},
                {"label": "2025年8月 vs 9月", "value": "2025-08_vs_2025-09"},
                {"label": "2025年9月 vs 10月", "value": "2025-09_vs_2025-10"},
            ]
        }

    # 分类任务：返回单月份
    return {
        "months": [
            {"label": "2025年4月", "value": "2025-04"},
            {"label": "2025年6月", "value": "2025-06"},
            {"label": "2025年8月", "value": "2025-08"},
            {"label": "2025年9月", "value": "2025-09"},
            {"label": "2025年10月", "value": "2025-10"},
        ]
    }
