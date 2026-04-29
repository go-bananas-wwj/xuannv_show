"""FastAPI 入口 — 最小化后端服务."""
from __future__ import annotations

from pathlib import Path

import os
import time

import numpy as np
from PIL import Image
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.routers import patches, embeddings, heads, agent, annotate


class SecurityMiddleware(BaseHTTPMiddleware):
    """简单安全中间件：生产环境可启用 API Key 校验."""

    async def dispatch(self, request: Request, call_next):
        api_key = os.environ.get("API_KEY")
        # 仅对 /api/* 路由校验 API Key（若配置了）
        if api_key and request.url.path.startswith("/api/"):
            provided = request.headers.get("X-API-Key") or request.query_params.get("api_key")
            if provided != api_key:
                raise HTTPException(status_code=403, detail="Invalid or missing API key")
        return await call_next(request)


class TimingMiddleware(BaseHTTPMiddleware):
    """记录慢请求（>2s）用于排查攻击或性能问题."""

    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        elapsed = time.time() - start
        if elapsed > 2.0:
            print(f"[SLOW] {request.method} {request.url.path} took {elapsed:.2f}s")
        return response

# 路径
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent.parent
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

app = FastAPI(
    title="玄女底座 API",
    description="遥感模型展示平台后端",
    version="0.1.0",
    docs_url=None,      # 禁用 Swagger UI
    redoc_url=None,     # 禁用 ReDoc
    openapi_url=None,   # 禁用 OpenAPI schema
)

# CORS — 生产环境应收紧为具体域名
# 开发环境允许 localhost，生产环境通过环境变量配置
import os
_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
if os.environ.get("ALLOW_ALL_ORIGINS", "").lower() == "true":
    _cors_origins = ["*"]

# 若从容器外部访问，默认只允许 localhost，除非显式配置 CORS_ORIGINS
if not os.environ.get("CORS_ORIGINS"):
    _cors_origins = ["http://localhost:5173", "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# 安全中间件
app.add_middleware(SecurityMiddleware)
app.add_middleware(TimingMiddleware)

# API 路由
app.include_router(patches.router, prefix="/api")
app.include_router(embeddings.router, prefix="/api")
app.include_router(heads.router, prefix="/api")
app.include_router(agent.router, prefix="/api")
app.include_router(annotate.router, prefix="/api")


# ── Patch Image Endpoint (for annotate page) ──
@app.get("/api/patches/{patch_id}/image")
async def get_patch_image(patch_id: str, month: str) -> bytes:
    """Serve S2 RGB image for a patch and month."""
    import sys
    sys.path.insert(0, "/workspace/xuannv")
    from demo_v2.utils.constants import TIME_WINDOWS, RAW_DIR as DEMO_RAW_DIR
    from demo_v2.engines.patch_image_loader import _find_best_tif
    import rasterio
    from fastapi.responses import StreamingResponse
    from io import BytesIO

    window = TIME_WINDOWS.get(month)
    if window is None:
        raise HTTPException(status_code=400, detail=f"Unknown month: {month}")

    source_dir = DEMO_RAW_DIR / "s2" / patch_id
    tif_path = _find_best_tif(source_dir, window[0], window[1])
    if tif_path is None:
        raise HTTPException(status_code=404, detail=f"No S2 image found for {patch_id} {month}")

    with rasterio.open(str(tif_path)) as ds:
        data = ds.read()

    if data.shape[0] >= 4:
        rgb = data[[2, 1, 0]].astype(np.float32)
    elif data.shape[0] >= 3:
        rgb = data[:3].astype(np.float32)
    else:
        raise HTTPException(status_code=500, detail="Not enough bands")

    rgb = np.clip(rgb / 3500.0, 0, 1)
    rgb = rgb.transpose(1, 2, 0)

    # Resize to 256x256
    if rgb.shape[0] != 256 or rgb.shape[1] != 256:
        img = Image.fromarray((rgb * 255).astype(np.uint8))
        img = img.resize((256, 256), Image.Resampling.LANCZOS)
    else:
        img = Image.fromarray((rgb * 255).astype(np.uint8))

    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


# 静态文件托管（前端构建产物）
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")
