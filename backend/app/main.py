"""FastAPI 入口 — 最小化后端服务."""
from __future__ import annotations

import contextlib
import functools
from pathlib import Path

import os
import time

import numpy as np
from PIL import Image
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

# 统一注入 AlphaEarth 核心模块路径（必须在导入依赖 src 的模块之前）
import sys
sys.path.insert(0, str(settings.xuannv_root))

from app.routers import patches, embeddings, heads, agent, annotate, auth
from app.services.agent_engine import start_cleanup_loop


# ── Patch Image LRU Cache ──
# 缓存 512 张 patch 图片（256×256 JPEG），命中时 ~5ms，未命中时 ~500ms
_PATCH_IMAGE_CACHE: dict[tuple[str, str, str], bytes] = {}
_PATCH_IMAGE_CACHE_MAX = 512
_PATCH_IMAGE_CACHE_HITS = 0
_PATCH_IMAGE_CACHE_MISSES = 0


def _get_cached_patch_image(patch_id: str, month: str, source: str) -> bytes | None:
    global _PATCH_IMAGE_CACHE_HITS
    key = (patch_id, month, source)
    if key in _PATCH_IMAGE_CACHE:
        _PATCH_IMAGE_CACHE_HITS += 1
        # Move to end (LRU)
        val = _PATCH_IMAGE_CACHE.pop(key)
        _PATCH_IMAGE_CACHE[key] = val
        return val
    return None


def _set_cached_patch_image(patch_id: str, month: str, source: str, data: bytes) -> None:
    global _PATCH_IMAGE_CACHE_MISSES
    key = (patch_id, month, source)
    if len(_PATCH_IMAGE_CACHE) >= _PATCH_IMAGE_CACHE_MAX:
        # Evict oldest
        oldest = next(iter(_PATCH_IMAGE_CACHE))
        del _PATCH_IMAGE_CACHE[oldest]
    _PATCH_IMAGE_CACHE[key] = data
    _PATCH_IMAGE_CACHE_MISSES += 1


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

# 路径（从配置读取，支持环境变量覆盖）
FRONTEND_DIST = settings.project_root / "frontend" / "dist"

import asyncio


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    """服务启动时预热 SAM3 模型，避免首次请求用户等待 10~30s.
    
    注意：SAM3 加载是同步/CPU-GPU 密集型操作，必须使用 asyncio.to_thread
    避免阻塞 ASGI 事件循环。
    """
    print("[startup] Preloading SAM3 model...")
    try:
        from app.services.annotate import get_sam3_client
        client = get_sam3_client()
        await asyncio.to_thread(client.warmup)
    except Exception as e:
        print(f"[startup] SAM3 warmup failed (will lazy-load on first request): {e}")
    
    # 启动 Agent 任务清理循环
    start_cleanup_loop()
    
    yield
    print("[shutdown] Cleaning up...")


app = FastAPI(
    title="玄女底座 API",
    description="遥感模型展示平台后端",
    version="0.1.0",
    docs_url=None,      # 禁用 Swagger UI
    redoc_url=None,     # 禁用 ReDoc
    openapi_url=None,   # 禁用 OpenAPI schema
    lifespan=lifespan,
)

# CORS — 从配置读取（支持环境变量 + .env 文件）
_cors_origins = settings.cors_origins.split(",")
if settings.allow_all_origins:
    _cors_origins = ["*"]

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
app.include_router(auth.router, prefix="/api")


# ── Patch Image Endpoint (for annotate page) ──
@app.get("/api/patches/{patch_id}/image")
async def get_patch_image(patch_id: str, month: str, source: str = "s2") -> bytes:
    """Serve RGB image for a patch, month and data source.
    
    优化点：
    - LRU 内存缓存（512 张），命中时 ~5ms
    - JPEG 输出替代 PNG，体积减少 60~70%
    """
    from fastapi.responses import StreamingResponse, Response
    from io import BytesIO

    if source not in ("s2", "s1", "landsat"):
        raise HTTPException(status_code=400, detail=f"Invalid source: {source}. Allowed: s2, s1, landsat")

    # 1. 查缓存
    cached = _get_cached_patch_image(patch_id, month, source)
    if cached is not None:
        return Response(content=cached, media_type="image/jpeg")

    # 2. 未命中：实时生成
    from demo_v2.utils.constants import TIME_WINDOWS
    from demo_v2.engines.patch_image_loader import load_patch_source_rgb

    window = TIME_WINDOWS.get(month)
    if window is None:
        raise HTTPException(status_code=400, detail=f"Unknown month: {month}")

    rgb = load_patch_source_rgb(patch_id, source, window)
    if rgb is None:
        raise HTTPException(status_code=404, detail=f"No {source} image found for {patch_id} {month}")

    # Resize to 256x256
    if rgb.shape[0] != 256 or rgb.shape[1] != 256:
        img = Image.fromarray(rgb)
        img = img.resize((256, 256), Image.Resampling.LANCZOS)
    else:
        img = Image.fromarray(rgb)

    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    data = buf.getvalue()

    # 3. 写入缓存
    _set_cached_patch_image(patch_id, month, source, data)

    # 4. 可选：打一条慢请求日志（首次生成 >500ms 时提醒）
    return Response(content=data, media_type="image/jpeg")


@app.get("/api/cache/stats")
async def cache_stats() -> dict:
    """返回图片缓存统计（调试用）."""
    total = _PATCH_IMAGE_CACHE_HITS + _PATCH_IMAGE_CACHE_MISSES
    hit_rate = (_PATCH_IMAGE_CACHE_HITS / total * 100) if total > 0 else 0
    return {
        "cache_size": len(_PATCH_IMAGE_CACHE),
        "max_size": _PATCH_IMAGE_CACHE_MAX,
        "hits": _PATCH_IMAGE_CACHE_HITS,
        "misses": _PATCH_IMAGE_CACHE_MISSES,
        "hit_rate_percent": round(hit_rate, 1),
    }


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


# 静态文件托管（前端构建产物）
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")
