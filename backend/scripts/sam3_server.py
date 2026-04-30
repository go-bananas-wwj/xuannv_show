"""SAM3 推理微服务 — 运行在 aef-qwen conda env 中.

启动方式:
    CUDA_VISIBLE_DEVICES=2 python backend/scripts/sam3_server.py --port 8001

依赖:
    - sam3 (pip install -e . from facebookresearch/sam3)
    - fastapi, uvicorn, Pillow, numpy
"""
from __future__ import annotations

import argparse
import base64
from io import BytesIO
from pathlib import Path

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

app = FastAPI(title="SAM3 Inference Service")

# Globals (loaded lazily on first request)
_model = None
_processor = None

# In-memory cache for image embeddings
_embedding_cache: dict[str, dict] = {}


def get_model_and_processor():
    global _model, _processor
    if _model is None:
        import torch
        from sam3.model_builder import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading SAM3 model on {device}...")
        checkpoint_path = "/workspace/models/facebook/sam3/sam3.pt"
        _model = build_sam3_image_model(
            checkpoint_path=checkpoint_path,
            device=device,
            enable_inst_interactivity=True,
        )
        _model.to(device)
        _processor = Sam3Processor(_model, device=device)
        print("SAM3 model loaded.")
    return _model, _processor


def _mask_to_base64_png(mask: np.ndarray) -> str:
    """Convert binary mask to base64 PNG string."""
    img = Image.fromarray((mask.astype(np.uint8) * 255))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


class EmbedRequest(BaseModel):
    image_path: str
    embedding_id: str


class PredictRequest(BaseModel):
    embedding_id: str
    point_coords: list[list[float]]  # [[x, y], ...] normalized 0~1
    point_labels: list[int]           # 1=positive, 0=negative
    multimask_output: bool = True


class PredictResponse(BaseModel):
    masks_b64: list[str]   # base64 PNG strings
    scores: list[float]


@app.post("/embed")
def embed(req: EmbedRequest) -> dict:
    """Precompute image embedding for later predict calls."""
    model, processor = get_model_and_processor()
    image = Image.open(req.image_path).convert("RGB")
    state = processor.set_image(image)
    _embedding_cache[req.embedding_id] = {
        "state": state,
        "shape": (state["original_height"], state["original_width"]),
    }
    return {"status": "ok", "embedding_id": req.embedding_id}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> dict:
    """Predict mask using cached embedding."""
    if req.embedding_id not in _embedding_cache:
        raise HTTPException(status_code=400, detail="Embedding not found. Call /embed first.")

    model, processor = get_model_and_processor()
    img_h, img_w = _embedding_cache[req.embedding_id]["shape"]
    state = _embedding_cache[req.embedding_id]["state"]

    # Convert normalized coords to pixel coords
    point_coords = np.array(req.point_coords) * np.array([[img_w, img_h]])
    point_labels = np.array(req.point_labels)

    masks, scores, logits = model.predict_inst(
        state,
        point_coords=point_coords,
        point_labels=point_labels,
        multimask_output=req.multimask_output,
    )

    # masks shape: (N, H, W), scores: (N,)
    masks_b64 = [_mask_to_base64_png(mask) for mask in masks]
    return {"masks_b64": masks_b64, "scores": scores.tolist()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port)
