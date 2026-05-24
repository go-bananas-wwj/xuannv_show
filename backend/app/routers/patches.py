"""Patches API — 栅格元数据查询."""
from __future__ import annotations

import sys
from io import BytesIO

import numpy as np
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool
from typing import Any

from app.config import settings
from app.services.data_loader import data_loader
from app.services.matrix_renderer import render_time_source_matrix, validate_patch_id

router = APIRouter(prefix="/patches", tags=["patches"])

# ── Mosaic Image LRU Cache ──
# 缓存 mosaic 大图（每种 month/source/tile_size 组合一张），避免重复生成
_MOSAIC_CACHE: dict[tuple[str, str, str, int], bytes] = {}
_MOSAIC_CACHE_MAX = 8


def _get_cached_mosaic(region: str, month: str, source: str, tile_size: int) -> bytes | None:
    key = (region, month, source, tile_size)
    if key in _MOSAIC_CACHE:
        val = _MOSAIC_CACHE.pop(key)
        _MOSAIC_CACHE[key] = val
        return val
    return None


def _set_cached_mosaic(region: str, month: str, source: str, tile_size: int, data: bytes) -> None:
    key = (region, month, source, tile_size)
    if len(_MOSAIC_CACHE) >= _MOSAIC_CACHE_MAX:
        oldest = next(iter(_MOSAIC_CACHE))
        del _MOSAIC_CACHE[oldest]
    _MOSAIC_CACHE[key] = data


def _load_patch_rgb_for_mosaic(patch_id: str, source: str, month: str, out_size: int = 128) -> np.ndarray | None:
    """加载指定 patch、数据源和月份的 RGB 影像，返回 uint8 [H, W, 3]."""
    from PIL import Image
    import rasterio

    raw_dir = settings.raw_scenes_dir / source / patch_id
    if not raw_dir.exists():
        return None

    year, mon = month.split("-")
    prefix = f"{year}{mon}"
    tifs = sorted(raw_dir.glob(f"{prefix}*.tif"))
    if not tifs:
        return None

    tif_path = tifs[len(tifs) // 2]
    try:
        with rasterio.open(str(tif_path)) as ds:
            data = ds.read()

        if source in ("s2", "landsat", "s2_hr", "highres") and data.shape[0] >= 3:
            if source in ("s2", "s2_hr") and data.shape[0] >= 4:
                rgb = data[[2, 1, 0]].astype(np.float32)
            else:
                rgb = data[:3].astype(np.float32)
            valid = rgb[rgb > 0]
            if len(valid) > 0:
                p2, p98 = np.percentile(valid, [2, 98])
                if p98 > p2:
                    rgb = (rgb - p2) / (p98 - p2)
            rgb = np.clip(rgb, 0, 1)
            rgb = (rgb * 255).astype(np.uint8)
            rgb = np.transpose(rgb, (1, 2, 0))
        elif source in ("s1", "s1_hr"):
            if data.shape[0] >= 2 and data[1].max() > 0:
                vv = data[0].astype(np.float32)
                vh = data[1].astype(np.float32)
                vv_n = np.clip((vv + 25) / 35, 0, 1)
                vh_n = np.clip((vh + 30) / 35, 0, 1)
                rgb = np.stack([vv_n, vh_n, vv_n / (vh_n + 1e-6) * 0.3], axis=-1)
                rgb = np.clip(rgb, 0, 1)
            else:
                vv = data[0].astype(np.float32)
                vv_n = np.clip((vv + 25) / 35, 0, 1)
                rgb = np.stack([vv_n] * 3, axis=-1)
            rgb = (rgb * 255).astype(np.uint8)
        else:
            return None

        if rgb.shape[0] != out_size:
            pil = Image.fromarray(rgb)
            pil = pil.resize((out_size, out_size), Image.Resampling.LANCZOS)
            rgb = np.array(pil)
        return rgb
    except Exception:
        return None


def _build_mosaic_image(region: str, month: str, source: str, tile_size: int) -> bytes:
    """同步函数：将所有 patch 拼接为一张 mosaic 大图."""
    from PIL import Image

    patches = data_loader.get_patches(region)
    if not patches:
        raise ValueError(f"No patches found for region: {region}")

    ix_values = [p["ix"] for p in patches]
    iy_values = [p["iy"] for p in patches]
    ix_min = min(ix_values)
    ix_max = max(ix_values)
    iy_min = min(iy_values)
    iy_max = max(iy_values)
    n_cols = ix_max - ix_min + 1
    n_rows = iy_max - iy_min + 1

    mosaic_w = n_cols * tile_size
    mosaic_h = n_rows * tile_size
    mosaic = Image.new("RGB", (mosaic_w, mosaic_h), color=(240, 240, 240))

    patch_map = {}
    for p in patches:
        patch_map[(p["ix"], p["iy"])] = p

    missing_count = 0
    for (ix, iy), patch in patch_map.items():
        patch_id = patch["patch_id"]
        try:
            rgb = _load_patch_rgb_for_mosaic(patch_id, source, month, tile_size)
            if rgb is None:
                missing_count += 1
                continue
            img = Image.fromarray(rgb)
            col = ix - ix_min
            row = iy_max - iy
            mosaic.paste(img, (col * tile_size, row * tile_size))
        except Exception:
            missing_count += 1
            continue

    if missing_count > 0:
        print(f"[mosaic] {missing_count}/{len(patches)} patches missing for {region}/{month}/{source}")

    buf = BytesIO()
    mosaic.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


@router.get("")
async def list_patches(region: str = "harbin") -> list[dict[str, Any]]:
    """列出某地区所有 patch 元数据."""
    return data_loader.get_patches(region)


# Mosaic 大图静态文件目录
_MOSAIC_STATIC_DIR = settings.static_assets_base / "data" / "mosaic"

@router.get("/mosaic_image")
async def get_mosaic_image(
    month: str,
    source: str = "s2",
    tile_size: int = 128,
    region: str = "harbin",
) -> Response:
    """返回所有 patch 拼接成的一张 mosaic 大图.

    - tile_size: 每个 patch 在大图中的尺寸（默认 128，可选 64/128/256）
    - 优先使用预生成的静态文件；不存在时查内存缓存，最后动态生成
    """
    if source not in ("s2", "s1", "landsat"):
        raise HTTPException(status_code=400, detail=f"Invalid source: {source}. Allowed: s2, s1, landsat")
    if tile_size not in (64, 128, 256):
        tile_size = 128

    # 1. 优先返回预生成的静态文件
    static_path = _MOSAIC_STATIC_DIR / source / f"{month}_{tile_size}.jpg"
    if static_path.exists():
        return FileResponse(static_path, media_type="image/jpeg")

    # 2. 查内存缓存
    cached = _get_cached_mosaic(region, month, source, tile_size)
    if cached is not None:
        return Response(content=cached, media_type="image/jpeg")

    # 3. 在线程池中生成
    try:
        jpeg_bytes = await run_in_threadpool(_build_mosaic_image, region, month, source, tile_size)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mosaic generation failed: {e}")

    # 4. 写入缓存
    _set_cached_mosaic(region, month, source, tile_size, jpeg_bytes)
    return Response(content=jpeg_bytes, media_type="image/jpeg")


@router.get("/{patch_id}")
async def get_patch(patch_id: str, region: str = "harbin") -> dict[str, Any]:
    """获取单个 patch 详情."""
    if not validate_patch_id(patch_id):
        raise HTTPException(status_code=400, detail="Invalid patch_id format")
    patch = data_loader.get_patch_by_id(patch_id, region)
    if patch is None:
        raise HTTPException(status_code=404, detail=f"Patch {patch_id} not found")
    return patch


# 静态矩阵图目录（优先返回预生成的静态文件）
_MATRIX_STATIC_DIR = settings.static_assets_base / "data" / "matrix"

@router.get("/{patch_id}/matrix")
async def get_patch_matrix(patch_id: str) -> Response:
    """返回 Patch 的 Time×Source Matrix 可视化图.
    
    优先使用预生成的静态文件；不存在时在线程池中动态渲染。
    结果通过 LRU 缓存（64条），重复请求直接返回缓存。
    """
    if not validate_patch_id(patch_id):
        raise HTTPException(status_code=400, detail="Invalid patch_id format")
    
    # 优先返回预生成的静态文件
    for ext in (".jpg", ".jpeg", ".png"):
        static_path = _MATRIX_STATIC_DIR / f"{patch_id}{ext}"
        if static_path.exists():
            media = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
            return FileResponse(static_path, media_type=media)
    
    # 在线程池中执行 CPU 密集型渲染，避免阻塞事件循环
    png_bytes = await run_in_threadpool(render_time_source_matrix, patch_id)
    
    if png_bytes is None:
        raise HTTPException(status_code=404, detail="No data sources available for this patch")
    return Response(content=png_bytes, media_type="image/png")
