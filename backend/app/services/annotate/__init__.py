"""交互式标注引擎 — 类别管理、标注存储、SAM3 客户端、训练与推理."""
from __future__ import annotations

from .annotation_store import AnnotationStore
from .class_manager import ClassManager
from .inference_engine import InferenceEngine
from .sam3_client import SAM3Client
from .training_engine import ModelRegistry, TrainingEngine
from .cd_training_engine import (
    ChangeDetectionModelRegistry,
    ChangeDetectionTrainingEngine,
    get_cd_model_registry,
    get_cd_training_engine,
)
from .utils import _get_user_dir

# ── Per-User Singletons ──
_user_class_managers: dict[str, ClassManager] = {}
_user_annotation_stores: dict[str, AnnotationStore] = {}
_user_sam3_clients: dict[str, SAM3Client] = {}
_user_training_engines: dict[str, TrainingEngine] = {}
_user_inference_engines: dict[str, InferenceEngine] = {}
_user_model_registries: dict[str, ModelRegistry] = {}


def get_class_manager(user_id: str = "default") -> ClassManager:
    if user_id not in _user_class_managers:
        user_dir = _get_user_dir(user_id)
        _user_class_managers[user_id] = ClassManager(user_dir / "classes.json")
    return _user_class_managers[user_id]


def get_annotation_store(user_id: str = "default") -> AnnotationStore:
    if user_id not in _user_annotation_stores:
        user_dir = _get_user_dir(user_id)
        _user_annotation_stores[user_id] = AnnotationStore(user_dir / "annotations.json", user_dir / "masks")
    return _user_annotation_stores[user_id]


def get_sam3_client(user_id: str = "default") -> SAM3Client:
    if user_id not in _user_sam3_clients:
        _user_sam3_clients[user_id] = SAM3Client(user_id)
    return _user_sam3_clients[user_id]


def get_training_engine(user_id: str = "default") -> TrainingEngine:
    if user_id not in _user_training_engines:
        _user_training_engines[user_id] = TrainingEngine(user_id)
    return _user_training_engines[user_id]


def get_inference_engine(user_id: str = "default") -> InferenceEngine:
    if user_id not in _user_inference_engines:
        _user_inference_engines[user_id] = InferenceEngine(user_id)
    return _user_inference_engines[user_id]


def get_model_registry(user_id: str = "default") -> ModelRegistry:
    if user_id not in _user_model_registries:
        user_dir = _get_user_dir(user_id)
        _user_model_registries[user_id] = ModelRegistry(user_dir / "models_index.json", user_dir)
    return _user_model_registries[user_id]
