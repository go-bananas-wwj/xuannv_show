"""系统预训练分类头注册表.

提供 worldcover / dynamic_world / jrc_water / building_extraction
四个预训练 Linear Probe 模型的元数据和推理能力。
"""
from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
from PIL import Image

from app.config import settings

# 系统模型目录 (backend/models/)
SYSTEM_MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"

# 系统模型元数据
SYSTEM_MODELS = {
    "worldcover": {
        "id": "worldcover",
        "name": "WorldCover 土地覆盖",
        "description": "ESA WorldCover 11 类土地覆盖分类",
        "model_file": "worldcover_linear_probe.pkl",
    },
    "dynamic_world": {
        "id": "dynamic_world",
        "name": "Dynamic World 土地利用",
        "description": "Google Dynamic World 9 类土地利用分类",
        "model_file": "dynamic_world_linear_probe.pkl",
    },
    "jrc_water": {
        "id": "jrc_water",
        "name": "JRC 水体提取",
        "description": "JRC Global Surface Water 水体提取",
        "model_file": "jrc_water_linear_probe.pkl",
    },
    "building_extraction": {
        "id": "building_extraction",
        "name": "建筑物提取",
        "description": "OpenStreetMap 建筑物提取",
        "model_file": "building_linear_probe.pkl",
    },
}


def list_system_models() -> list[dict]:
    """列出所有可用的系统预训练分类头."""
    result = []
    for model_id, meta in SYSTEM_MODELS.items():
        model_path = SYSTEM_MODELS_DIR / meta["model_file"]
        available = model_path.exists()
        result.append({
            "id": model_id,
            "name": meta["name"],
            "description": meta["description"],
            "available": available,
        })
    return result


def get_system_model_classes(model_id: str) -> list[dict]:
    """获取系统模型的类别定义（名称 + 颜色）.
    
    Returns list of {"name": str, "color": str(hex)}.
    """
    if model_id not in SYSTEM_MODELS:
        raise ValueError(f"Unknown system model: {model_id}")
    
    meta = SYSTEM_MODELS[model_id]
    model_path = SYSTEM_MODELS_DIR / meta["model_file"]
    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")
    
    model_data = joblib.load(model_path)
    class_names = model_data.get("class_names", [])
    colors = model_data.get("colors", [])
    
    classes = []
    for idx, (name, color) in enumerate(zip(class_names, colors)):
        if isinstance(color, tuple):
            hex_color = f"#{color[0]:02x}{color[1]:02x}{color[2]:02x}"
        else:
            hex_color = str(color)
        classes.append({
            "id": f"sys_{model_id}_{idx}",
            "name": name,
            "color": hex_color,
        })
    return classes


def infer_system_model(model_id: str, patch_id: str, month: str) -> Path:
    """使用系统预训练模型对指定 patch 推理.
    
    Returns path to result PNG.
    """
    if model_id not in SYSTEM_MODELS:
        raise ValueError(f"Unknown system model: {model_id}")
    
    meta = SYSTEM_MODELS[model_id]
    model_path = SYSTEM_MODELS_DIR / meta["model_file"]
    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")
    
    model_data = joblib.load(model_path)
    scaler = model_data["scaler"]
    clf = model_data["model"]
    classes = model_data.get("class_names", [])
    colors = model_data.get("colors", [])
    
    emb_path = settings.embeddings_dir / f"{patch_id}_{month}.npy"
    if not emb_path.exists():
        raise FileNotFoundError(f"Embedding not found: {emb_path}")
    
    emb = np.load(emb_path)  # [D, 64, 64]
    D, H, W = emb.shape
    flat = emb.reshape(D, -1).T  # [H*W, D]
    flat_s = scaler.transform(flat)
    pred = clf.predict(flat_s).reshape(H, W)  # [64, 64]
    
    # Color encode
    rgb = np.full((H, W, 3), 200, dtype=np.uint8)
    for idx, color in enumerate(colors):
        if isinstance(color, tuple):
            rgb[pred == idx] = color
        else:
            rgb[pred == idx] = color
    rgb[pred == -1] = (200, 200, 200)
    
    # Resize to 256x256
    img = Image.fromarray(rgb).resize((256, 256), Image.Resampling.NEAREST)
    
    # Save to temp results dir
    results_dir = settings.project_root / "data" / "system_model_results"
    results_dir.mkdir(parents=True, exist_ok=True)
    result_path = results_dir / f"{model_id}_{patch_id}_{month}.png"
    img.save(result_path)
    return result_path
