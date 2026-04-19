"""Patches API — 栅格元数据查询."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response
from starlette.concurrency import run_in_threadpool
from typing import Any

from app.services.data_loader import data_loader
from app.services.matrix_renderer import render_time_source_matrix, validate_patch_id

router = APIRouter(prefix="/patches", tags=["patches"])


@router.get("")
async def list_patches(region: str = "harbin") -> list[dict[str, Any]]:
    """列出某地区所有 patch 元数据."""
    return data_loader.get_patches(region)


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
