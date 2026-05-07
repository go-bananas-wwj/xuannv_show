"""训练引擎."""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from .utils import EMBEDDING_DIR, _get_user_dir


class ModelRegistry:
    """Persistent registry for trained classification heads."""

    def __init__(self, index_path: Path, user_dir: Path) -> None:
        self._path = index_path
        self._user_dir = user_dir
        self._data: list[dict] = []
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            try:
                with open(self._path) as f:
                    self._data = json.load(f)
                if not isinstance(self._data, list):
                    self._data = []
            except Exception:
                self._data = []

    def _save(self) -> None:
        tmp = self._path.with_suffix(".tmp")
        with open(tmp, "w") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)
        tmp.rename(self._path)

    def list_models(self) -> list[dict]:
        return sorted(self._data, key=lambda m: m.get("created_at", ""), reverse=True)

    def get_model(self, model_id: str) -> dict | None:
        for m in self._data:
            if m.get("id") == model_id:
                return m
        return None

    def create_model(self, name: str, classes: list[dict]) -> str:
        model_id = f"model_{uuid.uuid4().hex[:8]}"
        record = {
            "id": model_id,
            "name": name,
            "status": "training",
            "created_at": datetime.now().isoformat(),
            "completed_at": None,
            "classes": classes,
            "accuracy": None,
            "n_samples": None,
            "model_path": str(self._user_dir / "models" / f"{model_id}.pkl"),
            "message": None,
        }
        self._data.append(record)
        self._save()
        return model_id

    def update_model(self, model_id: str, **kwargs) -> bool:
        for m in self._data:
            if m.get("id") == model_id:
                m.update(kwargs)
                self._save()
                return True
        return False

    def rename_model(self, model_id: str, name: str) -> bool:
        return self.update_model(model_id, name=name)

    def delete_model(self, model_id: str) -> bool:
        record = self.get_model(model_id)
        if record is None:
            return False
        # Delete pkl file
        pkl_path = Path(record.get("model_path", ""))
        if pkl_path.exists():
            pkl_path.unlink()
        self._data = [m for m in self._data if m.get("id") != model_id]
        self._save()
        return True


class TrainingEngine:
    """Train Linear Probe using user annotations."""

    def __init__(self, user_id: str = "default") -> None:
        self._user_id = user_id
        self._user_dir = _get_user_dir(user_id)

    def train(self, model_id: str) -> dict:
        from app.services.annotate import get_annotation_store, get_class_manager, get_model_registry

        store = get_annotation_store(self._user_id)
        mgr = get_class_manager(self._user_id)
        annotations = store.list_annotations()
        classes = {c["id"]: c for c in mgr.list_classes()}

        if not annotations:
            raise ValueError("No annotations available for training")

        # Build training set
        X_train, y_train = [], []
        for ann in annotations:
            emb_path = EMBEDDING_DIR / f"{ann['patch_id']}_{ann['month']}.npy"
            if not emb_path.exists():
                continue

            emb = np.load(emb_path)  # [D, 64, 64]
            mask_path = self._user_dir / "masks" / f"{ann['id']}.npz"
            if not mask_path.exists():
                continue

            mask = np.load(mask_path)["mask"]  # [256, 256]

            # Resize mask to 64x64 to match embedding
            mask_pil = Image.fromarray(mask.astype(np.uint8))
            mask_64 = np.array(mask_pil.resize((64, 64), Image.Resampling.NEAREST))

            D, H, W = emb.shape
            emb_flat = emb.reshape(D, -1).T  # [H*W, D]
            mask_flat = mask_64.flatten()

            pos_indices = np.where(mask_flat > 0)[0]
            neg_indices = np.where(mask_flat == 0)[0]

            if len(pos_indices) == 0:
                continue

            # Positive samples
            class_idx = list(classes.keys()).index(ann["class_id"])
            X_train.append(emb_flat[pos_indices])
            y_train.append(np.full(len(pos_indices), class_idx))

            # Negative samples (background)
            n_neg = min(len(neg_indices), len(pos_indices) * 2)
            if n_neg > 0:
                neg_sample = np.random.choice(neg_indices, n_neg, replace=False)
                X_train.append(emb_flat[neg_sample])
                y_train.append(np.full(n_neg, -1))

        if not X_train:
            raise ValueError("No valid training samples after filtering")

        X_train = np.vstack(X_train)
        y_train = np.concatenate(y_train)

        # Train scaler + LogisticRegression
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X_train)

        # Determine multi_class strategy based on number of unique labels
        unique_labels = np.unique(y_train)
        n_classes = len(unique_labels)
        multi_class = "multinomial" if n_classes > 2 else "auto"

        clf = LogisticRegression(
            max_iter=1000,
            solver="lbfgs",
        )
        clf.fit(X_scaled, y_train)

        # Save model
        model_data = {
            "scaler": scaler,
            "model": clf,
            "classes": list(classes.values()),
            "class_ids": list(classes.keys()),
            "trained_at": datetime.now().isoformat(),
        }
        registry = get_model_registry(self._user_id)
        record = registry.get_model(model_id)
        if record is None:
            raise ValueError(f"Model {model_id} not found in registry")
        model_path = Path(record["model_path"])
        model_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(model_data, model_path)

        accuracy = float(clf.score(X_scaled, y_train))
        return {
            "model_id": model_id,
            "model_path": str(model_path),
            "accuracy": accuracy,
            "n_samples": len(y_train),
        }
