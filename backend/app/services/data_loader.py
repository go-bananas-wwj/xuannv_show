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
        self._patch_index: dict[str, dict[str, dict]] = {}  # region -> {patch_id: patch}
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
                    # 同时构建 O(1) 索引
                    self._patch_index[region] = {
                        p.get("patch_id"): p for p in self._patches_meta[region] if p.get("patch_id")
                    }
            else:
                self._patches_meta[region] = []
                self._patch_index[region] = {}
        return self._patches_meta[region]

    def get_patch_by_id(self, patch_id: str, region: str = "harbin") -> dict[str, Any] | None:
        """根据 patch_id 返回单个 patch 元数据（O(1) 索引查找）."""
        # 优先从索引查找，若索引未初始化则先加载
        if region in self._patch_index:
            return self._patch_index[region].get(patch_id)
        # fallback：触发加载
        self.get_patches(region)
        return self._patch_index[region].get(patch_id)

    def get_embedding_preview_path(
        self, patch_id: str, region: str = "harbin", version: str = "v2"
    ) -> Path | None:
        """返回 embedding 预览图路径（若已生成）."""
        preview_dir = self._get_region_dir(region) / "embeddings" / version
        preview_path = preview_dir / f"{patch_id}.png"
        if preview_path.exists():
            return preview_path
        return None

    def get_embedding_npy_path(self, patch_id: str, month: str) -> Path | None:
        """返回 embedding .npy 文件路径（分散格式）.

        路径规则: {embeddings_dir}/{patch_id}_{month}.npy
        """
        from app.config import settings
        path = settings.embeddings_dir / f"{patch_id}_{month}.npy"
        if path.exists():
            return path
        return None

    def get_head_result_path(
        self, head_id: str, period: str, region: str = "harbin", version: str = "v2"
    ) -> Path | None:
        """返回 head 推理结果图路径."""
        if version == "v4":
            # v4 官方预计算结果在当前机器上不可用，回退到 v5 结果目录
            from app.config import settings
            v4_dir = settings.results_dir
            if head_id == "change_detection":
                for ext in (".png", ".jpg", ".tif"):
                    path = v4_dir / head_id / f"{period}{ext}"
                    if path.exists():
                        return path
            for ext in (".png", ".jpg", ".tif"):
                path = v4_dir / head_id / f"{period}{ext}"
                if path.exists():
                    return path
            return None

        results_dir = self._get_region_dir(region) / "results" / head_id
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
            {"id": "construction", "name": "建设类变化检测", "description": "基于两期embedding差分训练的建筑工地/房屋/道路建设检测（Few-Shot基线）"},
            {"id": "land_conversion", "name": "土地转换检测", "description": "基于两期embedding差分训练的裸地/水塘/农田转换检测（Few-Shot基线）"},
        ]


# 全局单例
data_loader = DataLoader()
