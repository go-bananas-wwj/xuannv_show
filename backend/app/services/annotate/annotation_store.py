"""标注存储."""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from .utils import _base64_to_mask


class AnnotationStore:
    def __init__(self, index_path: Path, masks_dir: Path) -> None:
        self.index_path = index_path
        self.masks_dir = masks_dir
        self._ensure_exists()

    def _ensure_exists(self) -> None:
        if not self.index_path.exists():
            self.index_path.write_text("[]", encoding="utf-8")
        self.masks_dir.mkdir(parents=True, exist_ok=True)

    def _load(self) -> list[dict]:
        return json.loads(self.index_path.read_text(encoding="utf-8"))

    def _save(self, data: list[dict]) -> None:
        self.index_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def list_annotations(self) -> list[dict]:
        data = self._load()
        for ann in data:
            if "geometry" not in ann:
                # Backward compatibility: wrap old-format mask_b64 into geometry
                ann["geometry"] = {"type": "mask", "mask_b64": ann.pop("mask_b64", "")}
        return data

    def create_annotation(self, patch_id: str, month: str, class_id: str, score: float, geometry: dict) -> dict:
        ann_id = f"ann_{uuid.uuid4().hex[:8]}"
        mask_path = self.masks_dir / f"{ann_id}.npz"

        geom_type = geometry.get("type", "mask")
        if geom_type == "mask":
            mask = _base64_to_mask(geometry["mask_b64"])
        elif geom_type == "polygon":
            mask = self._rasterize_polygon(geometry["points"])
        elif geom_type == "polyline":
            mask = self._rasterize_polyline(geometry["points"])
        else:
            raise ValueError(f"Unknown geometry type: {geom_type}")

        np.savez_compressed(mask_path, mask=mask)

        ann = {
            "id": ann_id,
            "patch_id": patch_id,
            "month": month,
            "class_id": class_id,
            "score": score,
            "geometry": geometry,
            "created_at": datetime.now().isoformat(),
        }
        data = self._load()
        data.append(ann)
        self._save(data)
        return ann

    @staticmethod
    def _rasterize_polygon(points: list[list[float]], size: int = 256) -> np.ndarray:
        """Rasterize normalized polygon points to binary mask."""
        img = Image.new("L", (size, size), 0)
        draw = ImageDraw.Draw(img)
        coords = [(x * size, y * size) for x, y in points]
        if len(coords) >= 3:
            draw.polygon(coords, fill=255)
        return np.array(img) > 0

    @staticmethod
    def _rasterize_polyline(points: list[list[float]], size: int = 256, width: int = 3) -> np.ndarray:
        """Rasterize normalized polyline points to binary mask."""
        img = Image.new("L", (size, size), 0)
        draw = ImageDraw.Draw(img)
        coords = [(x * size, y * size) for x, y in points]
        if len(coords) >= 2:
            draw.line(coords, fill=255, width=width)
        return np.array(img) > 0

    def delete_annotation(self, ann_id: str) -> None:
        data = self._load()
        data = [a for a in data if a["id"] != ann_id]
        self._save(data)
        mask_path = self.masks_dir / f"{ann_id}.npz"
        if mask_path.exists():
            mask_path.unlink()
