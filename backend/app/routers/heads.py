"""Heads API — 下游任务头结果."""
from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse

from app.services.data_loader import data_loader

router = APIRouter(prefix="/heads", tags=["heads"])

# 合法 head_id 白名单
_VALID_HEAD_IDS = {"change_detection", "worldcover", "dynamic_world", "jrc_water", "building_extraction"}
_VALID_PERIOD_RE = re.compile(r"^[\w\-_.]+$")
_VALID_REGION_RE = re.compile(r"^[a-zA-Z0-9_]+$")
_VALID_VERSION_RE = re.compile(r"^v\d+$")
_VALID_PATCH_ID_RE = re.compile(r"^patch_\d{6}$")

# 预计算结果目录
RESULTS_DIR = Path("/workspace/outputs/aef_qwen_v4_official/results")


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


@router.get("/{head_id}/patch/{patch_id}/detail", response_model=None)
async def get_patch_detail(
    head_id: str,
    patch_id: str,
    period: str = Query(..., description="Time period"),
) -> Response:
    """返回单 patch 的详情图 (弹窗用)."""
    if head_id not in _VALID_HEAD_IDS:
        raise HTTPException(status_code=400, detail="Invalid head_id")
    if not _VALID_PATCH_ID_RE.match(patch_id):
        raise HTTPException(status_code=400, detail="Invalid patch_id format")
    if not _VALID_PERIOD_RE.match(period):
        raise HTTPException(status_code=400, detail="Invalid period format")

    if head_id != "change_detection":
        raise HTTPException(status_code=404, detail=f"Detail not available for head={head_id}")

    path = RESULTS_DIR / head_id / "detail" / f"{patch_id}_{period}.png"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Detail for {patch_id} period={period} not found",
        )
    return FileResponse(path, media_type="image/png")


@router.get("/{head_id}/patch/{patch_id}/tile", response_model=None)
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

    if head_id != "change_detection":
        raise HTTPException(status_code=404, detail=f"Tile not available for head={head_id}")

    path = RESULTS_DIR / head_id / "tiles" / f"{patch_id}_{period}.png"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Tile for {patch_id} period={period} not found",
        )
    return FileResponse(path, media_type="image/png")


@router.get("/{head_id}/available-months")
async def get_available_months(head_id: str) -> dict:
    """返回某任务可用的月份/月份对列表."""
    if head_id not in _VALID_HEAD_IDS:
        raise HTTPException(status_code=400, detail="Invalid head_id")

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
