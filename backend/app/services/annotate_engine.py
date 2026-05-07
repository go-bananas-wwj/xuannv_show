"""交互式标注引擎 — 类别管理、标注存储、SAM3 客户端、训练与推理."""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import requests
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from app.config import settings

# ── Paths ──
BASE_ANNOTATIONS_DIR = settings.user_data_dir


def _get_user_dir(user_id: str) -> Path:
    """获取某用户的 annotations 目录，不存在则自动创建."""
    d = BASE_ANNOTATIONS_DIR / user_id
    d.mkdir(parents=True, exist_ok=True)
    return d

EMBEDDING_DIR = settings.embeddings_dir
RAW_DIR = settings.raw_scenes_dir
PATCHES_META_PATH = settings.patches_meta_path

SAM3_SERVICE_URL = "http://localhost:8001"

# ── Base64 PNG helpers ──
import base64
from io import BytesIO


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


# ── Class Manager ──
class ClassManager:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._ensure_exists()

    def _ensure_exists(self) -> None:
        if not self.path.exists():
            self.path.write_text("[]", encoding="utf-8")

    def _load(self) -> list[dict]:
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _save(self, data: list[dict]) -> None:
        self.path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def list_classes(self) -> list[dict]:
        return self._load()

    def create_class(self, name: str, color: str) -> dict:
        classes = self._load()
        cls = {"id": f"cls_{uuid.uuid4().hex[:8]}", "name": name, "color": color}
        classes.append(cls)
        self._save(classes)
        return cls

    def delete_class(self, class_id: str) -> None:
        classes = self._load()
        classes = [c for c in classes if c["id"] != class_id]
        self._save(classes)

    def rename_class(self, class_id: str, new_name: str) -> bool:
        classes = self._load()
        for c in classes:
            if c["id"] == class_id:
                c["name"] = new_name
                self._save(classes)
                return True
        return False


# ── Annotation Store ──
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
        from PIL import ImageDraw
        img = Image.new("L", (size, size), 0)
        draw = ImageDraw.Draw(img)
        coords = [(x * size, y * size) for x, y in points]
        if len(coords) >= 3:
            draw.polygon(coords, fill=255)
        return np.array(img) > 0

    @staticmethod
    def _rasterize_polyline(points: list[list[float]], size: int = 256, width: int = 3) -> np.ndarray:
        """Rasterize normalized polyline points to binary mask."""
        from PIL import ImageDraw
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


# ── SAM3 Client ──
import threading

# SAM3 模型加载全局锁，防止并发请求重复加载导致 OOM
_SAM3_MODEL_LOCK = threading.Lock()


class SAM3Client:
    """Inline SAM3 client using local model (no HTTP microservice needed)."""

    def __init__(self, user_id: str = "default") -> None:
        self._user_id = user_id
        self._temp_dir = BASE_ANNOTATIONS_DIR / user_id / "temp_images"
        self._temp_dir.mkdir(parents=True, exist_ok=True)
        self._model = None
        self._processor = None
        self._cache: dict[str, dict] = {}
        self._device: str | None = None

    def _ensure_model(self):
        if self._model is not None:
            return
        # 双检锁：避免多个并发请求同时进入耗时加载
        with _SAM3_MODEL_LOCK:
            if self._model is not None:
                return
            import torch
            from sam3.model_builder import build_sam3_image_model
            from sam3.model.sam3_image_processor import Sam3Processor

            # 动态选择最空闲的 GPU（与 task_engine.py 保持一致）
            device = self._get_freest_device()
            self._device = device
            print(f"[SAM3Client] Loading SAM3 model on {device}...")
            checkpoint_path = str(settings.sam3_checkpoint)
            bpe_path = str(settings.sam3_bpe_path)
            self._model = build_sam3_image_model(
                bpe_path=bpe_path,
                checkpoint_path=checkpoint_path,
                device=device,
                enable_inst_interactivity=True,
            )
            self._model.to(device)
            # SAM3 checkpoint has mixed dtypes (some bfloat16, some float32).
            # The model uses @torch.autocast which expects uniform bfloat16 inputs/weights.
            # Convert all float32 params/buffers to bfloat16 to avoid dtype mismatch.
            for p in self._model.parameters():
                if p.dtype == torch.float32:
                    p.data = p.data.to(torch.bfloat16)
            for b in self._model.buffers():
                if b.dtype == torch.float32:
                    b.data = b.data.to(torch.bfloat16)
            self._processor = Sam3Processor(self._model, device=device)
            print("[SAM3Client] SAM3 model loaded.")

    @staticmethod
    def _get_freest_device() -> str:
        """选择显存最空闲的 CUDA 设备，无 GPU 时回退到 CPU."""
        import torch
        if not torch.cuda.is_available():
            return "cpu"
        # 优先使用 gpu6（业务约束），但检查是否可用
        if torch.cuda.device_count() > 6:
            mem_free, _ = torch.cuda.mem_get_info(6)
            if mem_free > 2 * 1024**3:  # 至少 2GB 空闲
                return "cuda:6"
        # fallback：选显存最空闲的
        best_device = 0
        best_free = 0
        for i in range(torch.cuda.device_count()):
            mem_free, _ = torch.cuda.mem_get_info(i)
            if mem_free > best_free:
                best_free = mem_free
                best_device = i
        return f"cuda:{best_device}"

    def warmup(self) -> None:
        """服务启动时预热 SAM3 模型，避免首次请求时用户等待."""
        print("[SAM3Client] Warming up...")
        self._ensure_model()
        print("[SAM3Client] Warmup done.")

    def _load_s2_image(self, patch_id: str, month: str) -> Path:
        """Load S2 image for a patch and save as temporary PNG for SAM3."""
        from demo_v2.utils.constants import TIME_WINDOWS, RAW_DIR as DEMO_RAW_DIR
        from demo_v2.engines.patch_image_loader import _find_best_tif
        import rasterio

        window = TIME_WINDOWS.get(month)
        if window is None:
            raise ValueError(f"Unknown month: {month}")

        source_dir = DEMO_RAW_DIR / "s2" / patch_id
        tif_path = _find_best_tif(source_dir, window[0], window[1])
        if tif_path is None:
            raise FileNotFoundError(f"No S2 image found for {patch_id} {month}")

        with rasterio.open(str(tif_path)) as ds:
            data = ds.read()

        if data.shape[0] >= 4:
            rgb = data[[2, 1, 0]].astype(np.float32)
        elif data.shape[0] >= 3:
            rgb = data[:3].astype(np.float32)
        else:
            raise ValueError(f"Not enough bands in {tif_path}")

        rgb = np.clip(rgb / 3500.0, 0, 1)
        rgb = rgb.transpose(1, 2, 0)

        # Resize to 256x256 for SAM3 (and to match our display)
        if rgb.shape[0] != 256 or rgb.shape[1] != 256:
            img = Image.fromarray((rgb * 255).astype(np.uint8))
            img = img.resize((256, 256), Image.Resampling.LANCZOS)
            rgb = np.array(img).astype(np.float32) / 255.0

        temp_path = self._temp_dir / f"{patch_id}_{month}.png"
        Image.fromarray((rgb * 255).astype(np.uint8)).save(temp_path)
        return temp_path

    def preload_image(self, patch_id: str, month: str, embedding_id: str) -> None:
        """Precompute SAM3 image embedding."""
        import torch
        self._ensure_model()
        image_path = self._load_s2_image(patch_id, month)
        image = Image.open(image_path).convert("RGB")
        with torch.autocast("cuda", dtype=torch.bfloat16):
            state = self._processor.set_image(image)
        self._cache[embedding_id] = {
            "state": state,
            "shape": (state["original_height"], state["original_width"]),
        }

    def predict(
        self,
        embedding_id: str,
        point_coords: list[list[float]],
        point_labels: list[int],
        multimask_output: bool = True,
    ) -> tuple[list[str], list[float]]:
        """Predict mask using cached embedding. Returns base64 PNG strings."""
        if embedding_id not in self._cache:
            raise ValueError("Embedding not found. Call preload_image first.")

        self._ensure_model()
        state = self._cache[embedding_id]["state"]
        img_h, img_w = self._cache[embedding_id]["shape"]

        # Convert normalized coords to pixel coords
        coords = np.array(point_coords) * np.array([[img_w, img_h]])
        labels = np.array(point_labels)

        import torch
        with torch.autocast("cuda", dtype=torch.bfloat16):
            masks, scores, logits = self._model.predict_inst(
                state,
                point_coords=coords,
                point_labels=labels,
                multimask_output=multimask_output,
            )

        # masks shape: (N, H, W), scores: (N,)
        masks_b64 = [_mask_to_base64_png(mask) for mask in masks]
        return masks_b64, scores.tolist()


# ── Training Engine ──
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


# ── Inference Engine ──
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
