"""变化检测训练引擎 — 差值特征 + LogisticRegression.

基于用户标注的双期变化 mask，训练轻量级变化检测模型：
1. 加载 Before / After 两期 embedding
2. 计算差值特征: diff = emb_after - emb_before
3. 在标注 mask 区域内提取正负样本
4. 训练 StandardScaler + LogisticRegression
5. 保存为 .pkl，支持单 patch 推理
"""
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


class ChangeDetectionModelRegistry:
    """Persistent registry for trained change-detection heads."""

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
        model_id = f"cd_model_{uuid.uuid4().hex[:8]}"
        record = {
            "id": model_id,
            "name": name,
            "status": "training",
            "created_at": datetime.now().isoformat(),
            "completed_at": None,
            "classes": classes,
            "accuracy": None,
            "n_samples": None,
            "model_path": str(self._user_dir / "cd_models" / f"{model_id}.pkl"),
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

    def delete_model(self, model_id: str) -> bool:
        record = self.get_model(model_id)
        if record is None:
            return False
        pkl_path = Path(record.get("model_path", ""))
        if pkl_path.exists():
            pkl_path.unlink()
        self._data = [m for m in self._data if m.get("id") != model_id]
        self._save()
        return True


class ChangeDetectionTrainingEngine:
    """Train change-detection head using diff embeddings + user masks."""

    def __init__(self, user_id: str = "default") -> None:
        self._user_id = user_id
        self._user_dir = _get_user_dir(user_id)

    def train(self, model_id: str) -> dict:
        from app.services.annotate import get_annotation_store

        store = get_annotation_store(self._user_id)
        annotations = store.list_annotations()

        # 只使用有 before_month / after_month 的变化检测标注
        cd_annotations = [
            ann for ann in annotations
            if ann.get("before_month") and ann.get("after_month")
        ]

        if not cd_annotations:
            raise ValueError("No change-detection annotations available. Please annotate with before/after months first.")

        X_train, y_train = [], []

        for ann in cd_annotations:
            before_month = ann["before_month"]
            after_month = ann["after_month"]
            patch_id = ann["patch_id"]

            emb_before_path = EMBEDDING_DIR / f"{patch_id}_{before_month}.npy"
            emb_after_path = EMBEDDING_DIR / f"{patch_id}_{after_month}.npy"
            if not emb_before_path.exists() or not emb_after_path.exists():
                continue

            emb_before = np.load(emb_before_path)  # [D, 64, 64]
            emb_after = np.load(emb_after_path)    # [D, 64, 64]

            # Diff feature
            diff = emb_after - emb_before  # [D, 64, 64]

            mask_path = self._user_dir / "masks" / f"{ann['id']}.npz"
            if not mask_path.exists():
                continue

            mask = np.load(mask_path)["mask"]  # [256, 256]

            # Resize mask to 64x64
            mask_pil = Image.fromarray(mask.astype(np.uint8))
            mask_64 = np.array(mask_pil.resize((64, 64), Image.Resampling.NEAREST))

            D, H, W = diff.shape
            diff_flat = diff.reshape(D, -1).T  # [H*W, D]
            mask_flat = mask_64.flatten()

            pos_indices = np.where(mask_flat > 0)[0]
            neg_indices = np.where(mask_flat == 0)[0]

            if len(pos_indices) == 0:
                continue

            # Positive: change
            X_train.append(diff_flat[pos_indices])
            y_train.append(np.ones(len(pos_indices), dtype=np.int32))

            # Negative: no-change (subsample)
            n_neg = min(len(neg_indices), len(pos_indices) * 3)
            if n_neg > 0:
                neg_sample = np.random.choice(neg_indices, n_neg, replace=False)
                X_train.append(diff_flat[neg_sample])
                y_train.append(np.zeros(n_neg, dtype=np.int32))

        if not X_train:
            raise ValueError("No valid training samples after filtering missing embeddings/masks")

        X_train = np.vstack(X_train)
        y_train = np.concatenate(y_train)

        # Train
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X_train)

        clf = LogisticRegression(max_iter=1000, solver="lbfgs")
        clf.fit(X_scaled, y_train)

        # Save
        model_data = {
            "scaler": scaler,
            "model": clf,
            "feature_type": "diff",
            "trained_at": datetime.now().isoformat(),
        }

        registry = get_cd_model_registry(self._user_id)
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


# ── Per-User Singletons ──
_cd_model_registries: dict[str, ChangeDetectionModelRegistry] = {}
_cd_training_engines: dict[str, ChangeDetectionTrainingEngine] = {}


def get_cd_model_registry(user_id: str = "default") -> ChangeDetectionModelRegistry:
    if user_id not in _cd_model_registries:
        user_dir = _get_user_dir(user_id)
        _cd_model_registries[user_id] = ChangeDetectionModelRegistry(
            user_dir / "cd_models_index.json", user_dir
        )
    return _cd_model_registries[user_id]


def get_cd_training_engine(user_id: str = "default") -> ChangeDetectionTrainingEngine:
    if user_id not in _cd_training_engines:
        _cd_training_engines[user_id] = ChangeDetectionTrainingEngine(user_id)
    return _cd_training_engines[user_id]
