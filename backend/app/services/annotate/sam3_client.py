"""SAM3 客户端."""
from __future__ import annotations

import threading
from pathlib import Path

import numpy as np
from PIL import Image

from app.config import settings

from .utils import BASE_ANNOTATIONS_DIR, _mask_to_base64_png

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
            try:
                mem_free, _ = torch.cuda.mem_get_info(6)
                if mem_free > 2 * 1024**3:  # 至少 2GB 空闲
                    return "cuda:6"
            except RuntimeError:
                pass  # cuda:6 异常，继续 fallback
        # fallback：选显存最空闲的
        best_device = 0
        best_free = 0
        for i in range(torch.cuda.device_count()):
            try:
                mem_free, _ = torch.cuda.mem_get_info(i)
                if mem_free > best_free:
                    best_free = mem_free
                    best_device = i
            except RuntimeError:
                continue  # 跳过异常设备
        return f"cuda:{best_device}"

    def warmup(self) -> None:
        """服务启动时预热 SAM3 模型，避免首次请求时用户等待."""
        print("[SAM3Client] Warming up...")
        self._ensure_model()
        print("[SAM3Client] Warmup done.")

    def _load_s2_image(self, patch_id: str, month: str) -> Path:
        """Load S2 image for a patch and save as temporary PNG for SAM3."""
        from app.services.patch_image_loader import load_s2_rgb_natural

        rgb = load_s2_rgb_natural(patch_id, month, out_size=256)
        if rgb is None:
            raise FileNotFoundError(f"No S2 image found for {patch_id} {month}")

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
