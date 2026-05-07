"""推理引擎."""
from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
from PIL import Image

from .utils import EMBEDDING_DIR, _get_user_dir


class InferenceEngine:
    """Run inference with user-trained model."""

    def __init__(self, user_id: str = "default") -> None:
        self._user_id = user_id
        self.results_dir = _get_user_dir(user_id) / "results"
        self.results_dir.mkdir(parents=True, exist_ok=True)
        self._cache: dict[str, dict] = {}

    def _load_model(self, model_id: str) -> dict:
        if model_id in self._cache:
            return self._cache[model_id]

        from app.services.annotate import get_model_registry

        registry = get_model_registry(self._user_id)
        record = registry.get_model(model_id)
        if record is None:
            raise ValueError(f"Model {model_id} not found")

        model_path = Path(record["model_path"])
        if not model_path.exists():
            raise FileNotFoundError(f"Model file not found: {model_path}")

        model_data = joblib.load(model_path)
        self._cache[model_id] = model_data
        return model_data

    def infer(self, model_id: str, patch_id: str, month: str) -> str:
        model_data = self._load_model(model_id)
        scaler = model_data["scaler"]
        clf = model_data["model"]
        classes = model_data["classes"]

        emb_path = EMBEDDING_DIR / f"{patch_id}_{month}.npy"
        if not emb_path.exists():
            raise FileNotFoundError(f"Embedding not found: {emb_path}")

        emb = np.load(emb_path)  # [D, 64, 64]
        D, H, W = emb.shape
        flat = emb.reshape(D, -1).T  # [H*W, D]
        flat_s = scaler.transform(flat)
        pred = clf.predict(flat_s).reshape(H, W)  # [64, 64]

        # Color encode
        colors = [tuple(int(c.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4)) for c in [c["color"] for c in classes]]
        rgb = np.full((H, W, 3), 200, dtype=np.uint8)  # Default gray for background
        for idx, color in enumerate(colors):
            rgb[pred == idx] = color
        rgb[pred == -1] = (200, 200, 200)  # Background

        # Resize to 256x256 for display
        img = Image.fromarray(rgb).resize((256, 256), Image.Resampling.NEAREST)

        result_path = self.results_dir / f"infer_{model_id}_{patch_id}_{month}.png"
        img.save(result_path)
        return str(result_path)
