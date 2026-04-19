"""Heads API — 下游任务头结果."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse

from app.services.data_loader import data_loader

router = APIRouter(prefix="/heads", tags=["heads"])


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
    path = data_loader.get_head_result_path(head_id, period, region, version)
    if path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Result for head={head_id} period={period} not found",
        )
    media_type = "image/png" if path.suffix == ".png" else "image/tiff" if path.suffix in (".tif", ".tiff") else "image/jpeg"
    return FileResponse(path, media_type=media_type)
