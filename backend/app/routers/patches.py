"""Patches API — 栅格元数据查询."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from typing import Any

from app.services.data_loader import data_loader

router = APIRouter(prefix="/patches", tags=["patches"])


@router.get("")
async def list_patches(region: str = "harbin") -> list[dict[str, Any]]:
    """列出某地区所有 patch 元数据."""
    return data_loader.get_patches(region)


@router.get("/{patch_id}")
async def get_patch(patch_id: str, region: str = "harbin") -> dict[str, Any]:
    """获取单个 patch 详情."""
    patch = data_loader.get_patch_by_id(patch_id, region)
    if patch is None:
        raise HTTPException(status_code=404, detail=f"Patch {patch_id} not found")
    return patch
