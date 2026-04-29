"""SAM3 推理微服务 — 运行在独立的 sam3 conda env 中.

启动方式:
    CUDA_VISIBLE_DEVICES=2 conda run -n sam3 python backend/scripts/sam3_server.py --port 8001

依赖:
    - sam3 (pip install -e . from facebookresearch/sam3)
    - fastapi, uvicorn, Pillow, numpy, pycocotools
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import uvicorn
from fastapi import FastAPI
from PIL import Image
from pydantic import BaseModel

# RLE utilities
try:
    from pycocotools import mask as mask_utils

    def encode_rle(mask: np.ndarray) -> str:
        rle = mask_utils.encode(np.asfortranarray(mask.astype(np.uint8)))
        return rle["counts"].decode("utf-8")

    def decode_rle(rle_str: str, height: int, width: int) -> np.ndarray:
        rle = {"counts": rle_str.encode("utf-8"), "size": [height, width]}
        return mask_utils.decode(rle).astype(bool)
except Exception:
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


app = FastAPI(title="SAM3 Inference Service")

# Global predictor (loaded lazily on first request)
_predictor = None

def get_predictor():
    global _predictor
    if _predictor is None:
        import torch
        from sam3 import SAM3InteractiveImagePredictor
        from sam3.model_builder import build_sam3_image_model

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading SAM3 model on {device}...")
        model = build_sam3_image_model()
        model.to(device)
        _predictor = SAM3InteractiveImagePredictor(model)
        print("SAM3 model loaded.")
    return _predictor


# In-memory cache for image embeddings
_embedding_cache: dict[str, dict] = {}


class EmbedRequest(BaseModel):
    image_path: str
    embedding_id: str


class PredictRequest(BaseModel):
    embedding_id: str
    point_coords: list[list[float]]  # [[x, y], ...] normalized 0~1
    point_labels: list[int]           # 1=positive, 0=negative
    multimask_output: bool = True


class PredictResponse(BaseModel):
    masks_rle: list[str]
    scores: list[float]


@app.post("/embed")
def embed(req: EmbedRequest) -> dict:
    """Precompute image embedding for later predict calls."""
    predictor = get_predictor()
    image = Image.open(req.image_path).convert("RGB")
    image_np = np.array(image)
    predictor.set_image(image_np)
    # Store reference that this embedding_id is ready
    _embedding_cache[req.embedding_id] = {
        "shape": image_np.shape[:2],
    }
    return {"status": "ok", "embedding_id": req.embedding_id}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> dict:
    """Predict mask using cached embedding."""
    if req.embedding_id not in _embedding_cache:
        raise HTTPException(status_code=400, detail="Embedding not found. Call /embed first.")

    predictor = get_predictor()
    img_h, img_w = _embedding_cache[req.embedding_id]["shape"]

    # Convert normalized coords to pixel coords
    point_coords = np.array(req.point_coords) * np.array([[img_w, img_h]])
    point_labels = np.array(req.point_labels)

    masks, scores, logits = predictor.predict(
        point_coords=point_coords,
        point_labels=point_labels,
        multimask_output=req.multimask_output,
    )

    # masks shape: (N, H, W), scores: (N,)
    masks_rle = [encode_rle(mask) for mask in masks]
    return {"masks_rle": masks_rle, "scores": scores.tolist()}


# Need to import HTTPException after defining routes to avoid circular import issues
from fastapi import HTTPException


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port)
