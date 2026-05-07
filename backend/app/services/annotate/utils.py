"""工具函数和路径常量."""
from __future__ import annotations

import base64
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

from app.config import settings

# ── Paths ──
BASE_ANNOTATIONS_DIR = settings.user_data_dir
EMBEDDING_DIR = settings.embeddings_dir
RAW_DIR = settings.raw_scenes_dir
PATCHES_META_PATH = settings.patches_meta_path

SAM3_SERVICE_URL = "http://localhost:8001"


# ── Helpers ──
def _get_user_dir(user_id: str) -> Path:
    """获取某用户的 annotations 目录，不存在则自动创建."""
    d = BASE_ANNOTATIONS_DIR / user_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _base64_to_mask(b64_str: str) -> np.ndarray:
    """Decode base64 PNG to binary mask."""
    img = Image.open(BytesIO(base64.b64decode(b64_str)))
    img = img.convert("L")
    return np.array(img) > 128


def _mask_to_base64_png(mask: np.ndarray) -> str:
    """Encode binary mask to base64 RGBA PNG string with transparent background."""
    h, w = mask.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[mask > 0] = [255, 255, 255, 255]  # White, fully opaque
    img = Image.fromarray(rgba, mode="RGBA")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")
