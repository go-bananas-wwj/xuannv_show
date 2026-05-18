"""Embedding 语义预设分析器 — 从 Linear Probe 模型提取维度-地类关联."""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np

from app.config import settings

# ── 预设配置定义 ──
# 每个预设对应一个 Linear Probe 模型中的特定类别
PRESET_DEFS = [
    {
        "id": "water",
        "name": "水体",
        "model_file": "jrc_water_linear_probe.pkl",
        "class_idx": 0,  # 二分类 coef_ 只有一行，代表正类（水体）
        "class_name": "水体",
        "color": "#0064c8",
        "description": "突出河流、湖泊、水库等水体区域",
    },
    {
        "id": "building",
        "name": "建筑",
        "model_file": "building_linear_probe.pkl",
        "class_idx": 0,  # 二分类 coef_ 只有一行，代表正类（Building）
        "class_name": "建筑",
        "color": "#ef4444",
        "description": "突出城市建筑分布与密度",
    },
    {
        "id": "forest",
        "name": "森林",
        "model_file": "dynamic_world_linear_probe.pkl",
        "class_idx": 1,  # 树木
        "class_name": "树木",
        "color": "#22c55e",
        "description": "突出森林、树木覆盖区域",
    },
    {
        "id": "cropland",
        "name": "农田",
        "model_file": "dynamic_world_linear_probe.pkl",
        "class_idx": 4,  # 农田
        "class_name": "农田",
        "color": "#f59e0b",
        "description": "突出耕地、农田区域",
    },
    {
        "id": "bare",
        "name": "裸地",
        "model_file": "dynamic_world_linear_probe.pkl",
        "class_idx": 7,  # 裸地
        "class_name": "裸地",
        "color": "#b4b4b4",
        "description": "突出裸地、未覆盖地表区域",
    },
]


def analyze_linear_probe(model_path: Path, class_idx: int) -> dict:
    """分析单个 Linear Probe 模型，提取指定类别的 Top 维度.

    Returns:
        {
            "top_dims": [dim1, dim2, dim3, ...],  # Top 10 维度索引
            "weights": [w1, w2, w3, ...],          # 对应权重绝对值
            "top3": [dim1, dim2, dim3],            # Top 3（用于RGB）
            "top3_weights": [w1, w2, w3],          # Top 3 权重
        }
    """
    data = joblib.load(model_path)
    lr = data["model"]

    # coef_ shape: (n_classes, 128) for multi-class, (1, 128) for binary
    weights = np.abs(lr.coef_[class_idx])

    # Top 10 dimensions
    top10 = np.argsort(weights)[::-1][:10]
    top10_weights = weights[top10]

    # 所有维度权重（用于热图可视化）
    all_weights = weights.round(4).tolist()

    return {
        "top_dims": top10.tolist(),
        "weights": top10_weights.round(4).tolist(),
        "top3": top10[:3].tolist(),
        "top3_weights": top10_weights[:3].round(4).tolist(),
        "all_weights": all_weights,
    }


def build_all_presets() -> list[dict]:
    """构建所有语义预设配置."""
    models_dir = settings.project_root / "backend" / "models"
    presets = []

    for defs in PRESET_DEFS:
        model_path = models_dir / defs["model_file"]
        if not model_path.exists():
            print(f"[PresetAnalyzer] Warning: model not found: {model_path}")
            continue

        analysis = analyze_linear_probe(model_path, defs["class_idx"])

        preset = {
            "id": defs["id"],
            "name": defs["name"],
            "model": defs["model_file"].replace("_linear_probe.pkl", ""),
            "class_idx": defs["class_idx"],
            "class_name": defs["class_name"],
            "color": defs["color"],
            "description": defs["description"],
            **analysis,
        }
        presets.append(preset)

    return presets


# 全局缓存（服务启动时计算一次）
_preset_cache: list[dict] | None = None


def get_preset_configs() -> list[dict]:
    """获取预设配置（带缓存）."""
    global _preset_cache
    if _preset_cache is None:
        _preset_cache = build_all_presets()
    return _preset_cache


def get_preset_by_id(preset_id: str) -> dict | None:
    """根据ID获取单个预设配置."""
    for p in get_preset_configs():
        if p["id"] == preset_id:
            return p
    return None


def export_presets_to_json(output_path: Path | None = None) -> str:
    """导出预设配置到 JSON（用于调试或前端静态数据）."""
    presets = build_all_presets()
    json_str = json.dumps(presets, ensure_ascii=False, indent=2)
    if output_path:
        output_path.write_text(json_str, encoding="utf-8")
    return json_str


if __name__ == "__main__":
    # 调试：直接运行查看预设分析结果
    presets = build_all_presets()
    for p in presets:
        print(f"\n=== {p['name']} ===")
        print(f"  Top3 dims: {p['top3']}")
        print(f"  Top3 weights: {p['top3_weights']}")
        print(f"  Description: {p['description']}")
