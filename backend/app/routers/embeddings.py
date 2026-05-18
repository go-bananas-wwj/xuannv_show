"""Embeddings API — Embedding 预览图与通道探索."""
from __future__ import annotations

import functools

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse, StreamingResponse

from app.services.data_loader import data_loader
from app.services.matrix_renderer import validate_patch_id
from app.services.preset_analyzer import get_preset_configs, get_preset_by_id
from app.services.channel_preview_engine import generate_preview_png, generate_preview_for_preset

router = APIRouter(prefix="/embeddings", tags=["embeddings"])


# ── 现有端点：PCA-RGB 预览图 ──

@router.get("/preview", response_model=None)
async def get_embedding_preview(
    patch_id: str = Query(..., description="Patch ID"),
    region: str = Query("harbin", description="Region name"),
    version: str = Query("v2", description="Model version"),
) -> Response:
    """返回某 patch 的 embedding PCA-RGB 预览图."""
    if not validate_patch_id(patch_id):
        raise HTTPException(status_code=400, detail="Invalid patch_id format")

    path = data_loader.get_embedding_preview_path(patch_id, region, version)
    if path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Embedding preview for {patch_id} (version={version}) not found",
        )
    return FileResponse(path, media_type="image/png")


# ── 新增端点 1：语义预设配置 ──

@router.get("/presets")
async def get_embedding_presets() -> list[dict]:
    """返回所有语义预设配置（含 top 维度分析结果）."""
    return get_preset_configs()


# ── 新增端点 2：自定义通道预览 ──

@functools.lru_cache(maxsize=256)
def _cached_channel_preview(
    patch_id: str,
    month: str,
    ch_r: int,
    ch_g: int,
    ch_b: int,
    norm: str,
) -> bytes | None:
    """LRU 缓存的通道预览生成（线程安全由 run_in_threadpool 保证）."""
    return generate_preview_png(
        patch_id=patch_id,
        month=month,
        ch_r=ch_r,
        ch_g=ch_g,
        ch_b=ch_b,
        norm=norm,
        target_size=256,
    )


@router.get("/channel-preview", response_model=None)
async def get_channel_preview(
    patch_id: str = Query(..., description="Patch ID"),
    month: str = Query(..., description="Month, e.g. 2025-04"),
    ch_r: int = Query(0, ge=0, le=127, description="Red channel index (0-127)"),
    ch_g: int = Query(1, ge=0, le=127, description="Green channel index (0-127)"),
    ch_b: int = Query(2, ge=0, le=127, description="Blue channel index (0-127)"),
    norm: str = Query("local", description="Normalization: local or global"),
) -> Response:
    """从 embedding 中提取指定3维生成 RGB 预览图.

    支持自定义任意维度组合，或配合 /presets 端点使用语义预设的 top3 维度。
    """
    if not validate_patch_id(patch_id):
        raise HTTPException(status_code=400, detail="Invalid patch_id format")

    # 验证 .npy 文件存在
    npy_path = data_loader.get_embedding_npy_path(patch_id, month)
    if npy_path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Embedding not found for {patch_id} @ {month}",
        )

    png_bytes = _cached_channel_preview(
        patch_id, month, ch_r, ch_g, ch_b, norm
    )
    if png_bytes is None:
        raise HTTPException(status_code=500, detail="Failed to generate preview")

    return Response(content=png_bytes, media_type="image/png")


# ── 新增端点 3：语义预设预览（快捷方式）──

@router.get("/semantic-preview", response_model=None)
async def get_semantic_preview(
    patch_id: str = Query(..., description="Patch ID"),
    month: str = Query(..., description="Month, e.g. 2025-04"),
    preset: str = Query(..., description="Preset ID, e.g. water, building, forest"),
    norm: str = Query("local", description="Normalization: local or global"),
) -> Response:
    """使用语义预设的 top3 维度生成 RGB 预览图.

    预设配置来自 /embeddings/presets 端点。
    """
    if not validate_patch_id(patch_id):
        raise HTTPException(status_code=400, detail="Invalid patch_id format")

    preset_cfg = get_preset_by_id(preset)
    if preset_cfg is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown preset: {preset}. Available: {[p['id'] for p in get_preset_configs()]}",
        )

    npy_path = data_loader.get_embedding_npy_path(patch_id, month)
    if npy_path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Embedding not found for {patch_id} @ {month}",
        )

    top3 = preset_cfg["top3"]
    png_bytes = _cached_channel_preview(
        patch_id, month, top3[0], top3[1], top3[2], norm
    )
    if png_bytes is None:
        raise HTTPException(status_code=500, detail="Failed to generate preview")

    return Response(content=png_bytes, media_type="image/png")


# ── 新增端点 4：维度统计信息 ──

@router.get("/dimension-stats")
async def get_dimension_stats() -> dict:
    """返回 embedding 维度统计信息（用于 AboutPage 可视化）."""
    from app.services.channel_preview_engine import compute_global_stats

    # 基础统计（固定值，基于已调研数据）
    stats = {
        "dimensions": 128,
        "global_mean": -0.0006,
        "global_std": 0.0798,
        "value_range": [-0.4478, 0.4821],
    }

    # 尝试计算更精确的 per-dim 统计（懒加载）
    try:
        global_percentiles = compute_global_stats(sample_n=500)
        stats["per_dim"] = [
            {
                "dim": d,
                "p1": global_percentiles.get(f"dim_{d}_p1", 0.0),
                "p99": global_percentiles.get(f"dim_{d}_p99", 0.0),
            }
            for d in range(128)
        ]
    except Exception as e:
        stats["per_dim_error"] = str(e)

    return stats
