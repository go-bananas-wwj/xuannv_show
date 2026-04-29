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

# ── Paths ──
ANNOTATIONS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "user_annotations"
CLASSES_PATH = ANNOTATIONS_DIR / "classes.json"
ANNOTATIONS_INDEX_PATH = ANNOTATIONS_DIR / "annotations.json"
MASKS_DIR = ANNOTATIONS_DIR / "masks"
MODELS_DIR = ANNOTATIONS_DIR / "models"
RESULTS_DIR = ANNOTATIONS_DIR / "results"

for d in [ANNOTATIONS_DIR, MASKS_DIR, MODELS_DIR, RESULTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

EMBEDDING_DIR = Path("/workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025")
RAW_DIR = Path("/workspace/raw/xuannv_modelscope_upload/raw_data")
PATCHES_META_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "harbin" / "patches_meta.json"

SAM3_SERVICE_URL = "http://localhost:8001"

# ── RLE encode/decode (pycocotools) ──
try:
    from pycocotools import mask as mask_utils

    def encode_rle(mask: np.ndarray) -> str:
        """Encode binary mask to RLE string."""
        rle = mask_utils.encode(np.asfortranarray(mask.astype(np.uint8)))
        return rle["counts"].decode("utf-8")

    def decode_rle(rle_str: str, height: int, width: int) -> np.ndarray:
        """Decode RLE string to binary mask."""
        rle = {"counts": rle_str.encode("utf-8"), "size": [height, width]}
        return mask_utils.decode(rle).astype(bool)
except Exception:
    # Fallback: simple numpy RLE
    def encode_rle(mask: np.ndarray) -> str:
        flat = mask.astype(np.uint8).flatten()
        runs = []
        count = 1
        for i in range(1, len(flat)):
            if flat[i] == flat[i - 1]:
                count += 1
            else:
                runs.append(count)
                count = 1
        runs.append(count)
        return f"{mask.shape[0]}x{mask.shape[1]}:" + ",".join(map(str, runs))

    def decode_rle(rle_str: str, height: int, width: int) -> np.ndarray:
        prefix, data = rle_str.split(":", 1)
        runs = list(map(int, data.split(",")))
        flat = []
        val = 0
        for r in runs:
            flat.extend([val] * r)
            val = 1 - val
        return np.array(flat[: height * width], dtype=bool).reshape(height, width)


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


# ── Annotation Store ──
class AnnotationStore:
    def __init__(self, index_path: Path, masks_dir: Path) -> None:
        self.index_path = index_path
        self.masks_dir = masks_dir
        self._ensure_exists()

    def _ensure_exists(self) -> None:
        if not self.index_path.exists():
            self.index_path.write_text("[]", encoding="utf-8")

    def _load(self) -> list[dict]:
        return json.loads(self.index_path.read_text(encoding="utf-8"))

    def _save(self, data: list[dict]) -> None:
        self.index_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def list_annotations(self) -> list[dict]:
        return self._load()

    def create_annotation(self, patch_id: str, month: str, class_id: str, mask_rle: str, score: float) -> dict:
        ann_id = f"ann_{uuid.uuid4().hex[:8]}"
        mask_path = self.masks_dir / f"{ann_id}.npz"

        # Decode RLE and save mask
        # SAM mask is typically 256x256 (input image size)
        mask = decode_rle(mask_rle, 256, 256)
        np.savez_compressed(mask_path, mask=mask)

        ann = {
            "id": ann_id,
            "patch_id": patch_id,
            "month": month,
            "class_id": class_id,
            "mask_rle": mask_rle,
            "score": score,
            "created_at": datetime.now().isoformat(),
        }
        data = self._load()
        data.append(ann)
        self._save(data)
        return ann

    def delete_annotation(self, ann_id: str) -> None:
        data = self._load()
        data = [a for a in data if a["id"] != ann_id]
        self._save(data)
        mask_path = self.masks_dir / f"{ann_id}.npz"
        if mask_path.exists():
            mask_path.unlink()


# ── SAM3 Client ──
class SAM3Client:
    """HTTP client for SAM3 microservice running on localhost:8001."""

    def __init__(self, base_url: str = SAM3_SERVICE_URL) -> None:
        self.base_url = base_url
        self._temp_dir = ANNOTATIONS_DIR / "temp_images"
        self._temp_dir.mkdir(exist_ok=True)

    def _load_s2_image(self, patch_id: str, month: str) -> Path:
        """Load S2 image for a patch and save as temporary PNG for SAM3."""
        import sys
        sys.path.insert(0, "/workspace/xuannv")
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
        image_path = self._load_s2_image(patch_id, month)
        resp = requests.post(
            f"{self.base_url}/embed",
            json={"image_path": str(image_path), "embedding_id": embedding_id},
            timeout=60,
        )
        resp.raise_for_status()

    def predict(
        self,
        embedding_id: str,
        point_coords: list[list[float]],
        point_labels: list[int],
        multimask_output: bool = True,
    ) -> tuple[list[str], list[float]]:
        """Predict mask using cached embedding."""
        resp = requests.post(
            f"{self.base_url}/predict",
            json={
                "embedding_id": embedding_id,
                "point_coords": point_coords,
                "point_labels": point_labels,
                "multimask_output": multimask_output,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["masks_rle"], data["scores"]


# ── Training Engine ──
class TrainingEngine:
    """Train Linear Probe using user annotations."""

    def train(self) -> dict:
        store = get_annotation_store()
        mgr = get_class_manager()
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
            mask_path = MASKS_DIR / f"{ann['id']}.npz"
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

        clf = LogisticRegression(
            max_iter=1000,
            multi_class="multinomial",
            solver="lbfgs",
            n_jobs=-1,
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
        model_path = MODELS_DIR / f"user_classifier_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pkl"
        joblib.dump(model_data, model_path)

        accuracy = float(clf.score(X_scaled, y_train))
        return {
            "model_path": str(model_path),
            "accuracy": accuracy,
            "n_samples": len(y_train),
        }


# ── Inference Engine ──
class InferenceEngine:
    """Run inference with user-trained model."""

    def __init__(self) -> None:
        self.results_dir = RESULTS_DIR
        self.results_dir.mkdir(parents=True, exist_ok=True)
        self._model_data: dict | None = None

    def _load_latest_model(self) -> dict:
        if self._model_data is not None:
            return self._model_data

        models = sorted(MODELS_DIR.glob("user_classifier_*.pkl"))
        if not models:
            raise ValueError("No trained model found")

        self._model_data = joblib.load(models[-1])
        return self._model_data

    def infer(self, patch_id: str, month: str) -> str:
        model_data = self._load_latest_model()
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

        result_path = self.results_dir / f"infer_{patch_id}_{month}.png"
        img.save(result_path)
        return str(result_path)


# ── Singletons ──
_class_manager: ClassManager | None = None
_annotation_store: AnnotationStore | None = None
_sam3_client: SAM3Client | None = None
_training_engine: TrainingEngine | None = None
_inference_engine: InferenceEngine | None = None


def get_class_manager() -> ClassManager:
    global _class_manager
    if _class_manager is None:
        _class_manager = ClassManager(CLASSES_PATH)
    return _class_manager


def get_annotation_store() -> AnnotationStore:
    global _annotation_store
    if _annotation_store is None:
        _annotation_store = AnnotationStore(ANNOTATIONS_INDEX_PATH, MASKS_DIR)
    return _annotation_store


def get_sam3_client() -> SAM3Client:
    global _sam3_client
    if _sam3_client is None:
        _sam3_client = SAM3Client()
    return _sam3_client


def get_training_engine() -> TrainingEngine:
    global _training_engine
    if _training_engine is None:
        _training_engine = TrainingEngine()
    return _training_engine


def get_inference_engine() -> InferenceEngine:
    global _inference_engine
    if _inference_engine is None:
        _inference_engine = InferenceEngine()
    return _inference_engine
