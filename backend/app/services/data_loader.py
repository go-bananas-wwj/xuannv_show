"""数据加载服务 — 管理 patches 元数据、embedding 预览、head 结果."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"


class DataLoader:
    """加载并缓存展示所需的静态数据."""

    def __init__(self) -> None:
        self._patches_meta: dict[str, list[dict]] = {}
        self._embeddings_cache: dict[str, np.ndarray] = {}
        self._patch_ids_cache: dict[str, list[str]] = {}

    def _get_region_dir(self, region: str) -> Path:
        return DATA_DIR / region

    def get_patches(self, region: str = "harbin") -> list[dict[str, Any]]:
        """返回某地区的所有 patch 元数据."""
        if region not in self._patches_meta:
            meta_path = self._get_region_dir(region) / "patches_meta.json"
            if meta_path.exists():
                with open(meta_path) as f:
                    self._patches_meta[region] = json.load(f)
            else:
                self._patches_meta[region] = []
        return self._patches_meta[region]

    def get_patch_by_id(self, patch_id: str, region: str = "harbin") -> dict[str, Any] | None:
        """根据 patch_id 返回单个 patch 元数据."""
        patches = self.get_patches(region)
        for p in patches:
            if p.get("patch_id") == patch_id:
                return p
        return None

    def get_embedding_preview_path(
        self, patch_id: str, region: str = "harbin", version: str = "v2"
    ) -> Path | None:
        """返回 embedding 预览图路径（若已生成）."""
        preview_dir = self._get_region_dir(region) / "embeddings" / version
        preview_path = preview_dir / f"{patch_id}.png"
        if preview_path.exists():
            return preview_path
        return None

    def get_head_result_path(
        self, head_id: str, period: str, region: str = "harbin"
    ) -> Path | None:
        """返回 head 推理结果图路径."""
        results_dir = self._get_region_dir(region) / "results" / head_id
        # 尝试多种扩展名
        for ext in (".png", ".jpg", ".tif"):
            path = results_dir / f"{period}{ext}"
            if path.exists():
                return path
        return None

    def list_available_heads(self) -> list[dict[str, str]]:
        """返回预定义的可用 heads 列表."""
        return [
            {"id": "change_detection", "name": "变化检测", "description": "像素级二元变化检测"},
            {"id": "worldcover", "name": "WorldCover分类", "description": "ESA WorldCover 11类土地覆盖分类"},
            {"id": "dynamic_world", "name": "Dynamic World分类", "description": "Google Dynamic World 9类土地利用分类"},
            {"id": "jrc_water", "name": "JRC水体提取", "description": "JRC Global Surface Water 水体提取"},
            {"id": "building_extraction", "name": "建筑物提取", "description": "基于WorldCover Built-up的建筑物提取"},
        ]


# 全局单例
data_loader = DataLoader()
