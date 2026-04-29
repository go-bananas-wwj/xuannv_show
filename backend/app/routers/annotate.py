"""交互式标注与自定义训练路由."""
from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.services.annotate_engine import (
    get_class_manager,
    get_annotation_store,
    get_sam3_client,
    get_training_engine,
    get_inference_engine,
)

router = APIRouter(prefix="/annotate", tags=["annotate"])

# ── Classes ──

class ClassCreate(BaseModel):
    name: str
    color: str

class ClassOut(BaseModel):
    id: str
    name: str
    color: str

@router.get("/classes", response_model=list[ClassOut])
def list_classes() -> list[dict]:
    mgr = get_class_manager()
    return mgr.list_classes()

@router.post("/classes", response_model=ClassOut)
def create_class(req: ClassCreate) -> dict:
    mgr = get_class_manager()
    return mgr.create_class(req.name, req.color)

@router.delete("/classes/{class_id}")
def delete_class(class_id: str) -> dict:
    mgr = get_class_manager()
    mgr.delete_class(class_id)
    return {"status": "ok"}

# ── SAM Preloading & Segmentation ──

class EmbedRequest(BaseModel):
    patch_id: str
    month: str

class EmbedResponse(BaseModel):
    embedding_id: str
    status: str

@router.post("/sam/embed", response_model=EmbedResponse)
def sam_embed(req: EmbedRequest) -> dict:
    client = get_sam3_client()
    embedding_id = f"{req.patch_id}_{req.month}"
    client.preload_image(req.patch_id, req.month, embedding_id)
    return {"embedding_id": embedding_id, "status": "ok"}

class SegmentRequest(BaseModel):
    embedding_id: str
    point_coords: list[list[float]]  # [[x, y], ...] normalized 0~1
    point_labels: list[int]          # 1=positive, 0=negative
    multimask_output: bool = True

class SegmentResponse(BaseModel):
    masks_rle: list[str]
    scores: list[float]

@router.post("/sam/segment", response_model=SegmentResponse)
def sam_segment(req: SegmentRequest) -> dict:
    client = get_sam3_client()
    masks_rle, scores = client.predict(
        req.embedding_id,
        req.point_coords,
        req.point_labels,
        req.multimask_output,
    )
    return {"masks_rle": masks_rle, "scores": scores}

# ── Annotations ──

class AnnotationCreate(BaseModel):
    patch_id: str
    month: str
    class_id: str
    mask_rle: str
    score: float

class AnnotationOut(BaseModel):
    id: str
    patch_id: str
    month: str
    class_id: str
    mask_rle: str
    score: float
    created_at: str

@router.get("/annotations", response_model=list[AnnotationOut])
def list_annotations() -> list[dict]:
    store = get_annotation_store()
    return store.list_annotations()

@router.post("/annotations", response_model=AnnotationOut)
def create_annotation(req: AnnotationCreate) -> dict:
    store = get_annotation_store()
    return store.create_annotation(
        patch_id=req.patch_id,
        month=req.month,
        class_id=req.class_id,
        mask_rle=req.mask_rle,
        score=req.score,
    )

@router.delete("/annotations/{ann_id}")
def delete_annotation(ann_id: str) -> dict:
    store = get_annotation_store()
    store.delete_annotation(ann_id)
    return {"status": "ok"}

# ── Training ──

_training_jobs: dict[str, dict] = {}

@router.post("/train")
def train_classifier(background_tasks: BackgroundTasks) -> dict:
    job_id = str(uuid.uuid4())[:8]
    _training_jobs[job_id] = {
        "job_id": job_id,
        "status": "running",
        "started_at": datetime.now().isoformat(),
    }
    background_tasks.add_task(_do_training, job_id)
    return {"job_id": job_id}

class TrainStatusOut(BaseModel):
    model_config = {"protected_namespaces": ()}
    job_id: str
    status: str
    accuracy: float | None = None
    n_samples: int | None = None
    model_path: str | None = None
    message: str | None = None

@router.get("/train/{job_id}", response_model=TrainStatusOut)
def get_train_status(job_id: str) -> dict:
    job = _training_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "accuracy": job.get("accuracy"),
        "n_samples": job.get("n_samples"),
        "model_path": job.get("model_path"),
        "message": job.get("message"),
    }

def _do_training(job_id: str) -> None:
    try:
        engine = get_training_engine()
        result = engine.train()
        _training_jobs[job_id].update({
            "status": "completed",
            "accuracy": result["accuracy"],
            "n_samples": result["n_samples"],
            "model_path": result["model_path"],
        })
    except Exception as e:
        _training_jobs[job_id].update({
            "status": "failed",
            "message": str(e),
        })

# ── Inference ──

class InferRequest(BaseModel):
    patch_id: str
    month: str

class InferResponse(BaseModel):
    image_url: str

@router.post("/infer", response_model=InferResponse)
def infer(req: InferRequest) -> dict:
    engine = get_inference_engine()
    image_path = engine.infer(req.patch_id, req.month)
    return {"image_url": f"/api/annotate/infer_result/{Path(image_path).name}"}

@router.get("/infer_result/{filename}")
def get_infer_result(filename: str) -> bytes:
    engine = get_inference_engine()
    image_path = engine.results_dir / filename
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Result not found")
    from fastapi.responses import FileResponse
    return FileResponse(str(image_path))
