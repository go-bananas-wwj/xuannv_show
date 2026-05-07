"""Patches API — 栅格元数据查询."""
from __future__ import annotations

import sys
from io import BytesIO

from fastapi import APIRouter, HTTPException, Response
from starlette.concurrency import run_in_threadpool
from typing import Any

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


def _build_mosaic_image(region: str, month: str, source: str, tile_size: int) -> bytes:
    """同步函数：将所有 patch 拼接为一张 mosaic 大图.
    
    在单独线程池中调用，避免阻塞 ASGI 事件循环。
    """
    from PIL import Image
    import numpy as np

    # 动态导入外部模块（路径在 main.py 统一注入）
    from demo_v2.utils.constants import TIME_WINDOWS
    from demo_v2.engines.patch_image_loader import load_patch_source_rgb

    window = TIME_WINDOWS.get(month)
    if window is None:
        raise ValueError(f"Unknown month: {month}")

    patches = data_loader.get_patches(region)
    if not patches:
        raise ValueError(f"No patches found for region: {region}")

    # 计算网格大小
    ix_values = [p["ix"] for p in patches]
    iy_values = [p["iy"] for p in patches]
    ix_min = min(ix_values)
    ix_max = max(ix_values)
    iy_min = min(iy_values)
    iy_max = max(iy_values)
    n_cols = ix_max - ix_min + 1
    n_rows = iy_max - iy_min + 1

    # 创建大图（无 gap，紧密拼接）
    mosaic_w = n_cols * tile_size
    mosaic_h = n_rows * tile_size
    mosaic = Image.new("RGB", (mosaic_w, mosaic_h), color=(240, 240, 240))

    # 构建 ix/iy -> patch 映射，方便查找
    patch_map = {}
    for p in patches:
        patch_map[(p["ix"], p["iy"])] = p

    missing_count = 0
    for (ix, iy), patch in patch_map.items():
        patch_id = patch["patch_id"]
        try:
            rgb = load_patch_source_rgb(patch_id, source, window)
            if rgb is None:
                missing_count += 1
                continue
            # 确保是 uint8
            if rgb.dtype != np.uint8:
                rgb = (rgb * 255).astype(np.uint8) if rgb.max() <= 1.0 else rgb.astype(np.uint8)
            img = Image.fromarray(rgb)
            # resize 到 tile_size
            if img.width != tile_size or img.height != tile_size:
                img = img.resize((tile_size, tile_size), Image.Resampling.LANCZOS)
            # paste 到对应位置
            col = ix - ix_min
            row = iy_max - iy  # iy 越大越靠上，所以翻转
            mosaic.paste(img, (col * tile_size, row * tile_size))
        except Exception as e:
            missing_count += 1
            # 静默跳过缺失的 patch，不打日志避免刷屏
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


@router.get("/mosaic_image")
async def get_mosaic_image(
    month: str,
    source: str = "s2",
    tile_size: int = 128,
    region: str = "harbin",
) -> Response:
    """返回所有 patch 拼接成的一张 mosaic 大图.

    - tile_size: 每个 patch 在大图中的尺寸（默认 128，可选 64/128/256）
    - 结果缓存在内存中，避免重复生成
    - 在线程池中执行 CPU 密集型拼接
    """
    if source not in ("s2", "s1", "landsat"):
        raise HTTPException(status_code=400, detail=f"Invalid source: {source}. Allowed: s2, s1, landsat")
    if tile_size not in (64, 128, 256):
        tile_size = 128

    # 1. 查缓存
    cached = _get_cached_mosaic(region, month, source, tile_size)
    if cached is not None:
        return Response(content=cached, media_type="image/jpeg")

    # 2. 在线程池中生成
    try:
        jpeg_bytes = await run_in_threadpool(_build_mosaic_image, region, month, source, tile_size)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mosaic generation failed: {e}")

    # 3. 写入缓存
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


@router.get("/{patch_id}/matrix")
async def get_patch_matrix(patch_id: str) -> Response:
    """返回 Patch 的 Time×Source Matrix 可视化图.
    
    渲染在后台线程池中执行，避免阻塞事件循环。
    结果通过 LRU 缓存（64条），重复请求直接返回缓存。
    """
    if not validate_patch_id(patch_id):
        raise HTTPException(status_code=400, detail="Invalid patch_id format")
    
    # 在线程池中执行 CPU 密集型渲染，避免阻塞事件循环
    png_bytes = await run_in_threadpool(render_time_source_matrix, patch_id)
    
    if png_bytes is None:
        raise HTTPException(status_code=404, detail="No data sources available for this patch")
    return Response(content=png_bytes, media_type="image/png")
