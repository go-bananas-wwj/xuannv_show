"""Embeddings API — Embedding 预览图."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse

from app.services.data_loader import data_loader
from app.services.matrix_renderer import validate_patch_id

router = APIRouter(prefix="/embeddings", tags=["embeddings"])


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
