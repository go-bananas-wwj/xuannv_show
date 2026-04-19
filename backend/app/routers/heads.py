"""Heads API — 下游任务头结果."""
from __future__ import annotations

import re
from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse

from app.services.data_loader import data_loader

router = APIRouter(prefix="/heads", tags=["heads"])

# 合法 head_id 白名单
_VALID_HEAD_IDS = {"change_detection", "worldcover", "dynamic_world", "jrc_water", "building_extraction"}
_VALID_PERIOD_RE = re.compile(r"^[\w\-_.]+$")
_VALID_REGION_RE = re.compile(r"^[a-zA-Z0-9_]+$")
_VALID_VERSION_RE = re.compile(r"^v\d+$")


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
    """返回某 head 在指定时间段的结果图."""
    # 路径安全校验
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
