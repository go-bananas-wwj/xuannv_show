"""交互式标注与自定义训练路由."""
from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, UploadFile, File
from pydantic import BaseModel
import json

from app.services.annotate_engine import (
    get_class_manager,
    get_annotation_store,
    get_sam3_client,
    get_training_engine,
    get_inference_engine,
    get_model_registry,
)
from app.services.user_service import get_current_user

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
def list_classes(user: dict = Depends(get_current_user)) -> list[dict]:
    mgr = get_class_manager(user["user_id"])
    return mgr.list_classes()

@router.post("/classes", response_model=ClassOut)
def create_class(req: ClassCreate, user: dict = Depends(get_current_user)) -> dict:
    mgr = get_class_manager(user["user_id"])
    return mgr.create_class(req.name, req.color)

class ClassRenameRequest(BaseModel):
    name: str


@router.delete("/classes/{class_id}")
def delete_class(class_id: str, user: dict = Depends(get_current_user)) -> dict:
    mgr = get_class_manager(user["user_id"])
    store = get_annotation_store(user["user_id"])
    # 级联删除：先删除该类别的所有标注
    for ann in store.list_annotations():
        if ann.get("class_id") == class_id:
            store.delete_annotation(ann["id"])
    mgr.delete_class(class_id)
    return {"status": "ok"}


@router.patch("/classes/{class_id}")
def rename_class(class_id: str, req: ClassRenameRequest, user: dict = Depends(get_current_user)) -> dict:
    mgr = get_class_manager(user["user_id"])
    if not mgr.rename_class(class_id, req.name):
        raise HTTPException(status_code=404, detail="Class not found")
    return {"status": "ok"}

# ── SAM Preloading & Segmentation ──

class EmbedRequest(BaseModel):
    patch_id: str
    month: str

class EmbedResponse(BaseModel):
    embedding_id: str
    status: str

@router.post("/sam/embed", response_model=EmbedResponse)
def sam_embed(req: EmbedRequest, user: dict = Depends(get_current_user)) -> dict:
    client = get_sam3_client(user["user_id"])
    embedding_id = f"{req.patch_id}_{req.month}"
    client.preload_image(req.patch_id, req.month, embedding_id)
    return {"embedding_id": embedding_id, "status": "ok"}

class SegmentRequest(BaseModel):
    embedding_id: str
    point_coords: list[list[float]]  # [[x, y], ...] normalized 0~1
    point_labels: list[int]          # 1=positive, 0=negative
    multimask_output: bool = True

class SegmentResponse(BaseModel):
    masks_b64: list[str]
    scores: list[float]

@router.post("/sam/segment", response_model=SegmentResponse)
def sam_segment(req: SegmentRequest, user: dict = Depends(get_current_user)) -> dict:
    client = get_sam3_client(user["user_id"])
    masks_b64, scores = client.predict(
        req.embedding_id,
        req.point_coords,
        req.point_labels,
        req.multimask_output,
    )
    return {"masks_b64": masks_b64, "scores": scores}

# ── Annotations ──

class GeometryMask(BaseModel):
    type: str
    mask_b64: str

class GeometryPolygon(BaseModel):
    type: str
    points: list[list[float]]

class GeometryPolyline(BaseModel):
    type: str
    points: list[list[float]]

class AnnotationCreate(BaseModel):
    patch_id: str
    month: str
    class_id: str
    score: float
    geometry: GeometryMask | GeometryPolygon | GeometryPolyline

class AnnotationOut(BaseModel):
    id: str
    patch_id: str
    month: str
    class_id: str
    score: float
    created_at: str
    geometry: GeometryMask | GeometryPolygon | GeometryPolyline

@router.get("/annotations", response_model=list[AnnotationOut])
def list_annotations(user: dict = Depends(get_current_user)) -> list[dict]:
    store = get_annotation_store(user["user_id"])
    return store.list_annotations()

@router.post("/annotations", response_model=AnnotationOut)
def create_annotation(req: AnnotationCreate, user: dict = Depends(get_current_user)) -> dict:
    mgr = get_class_manager(user["user_id"])
    classes = mgr.list_classes()
    if req.class_id not in {c["id"] for c in classes}:
        raise HTTPException(status_code=400, detail="Class not found. Please create a class first.")
    store = get_annotation_store(user["user_id"])
    return store.create_annotation(
        patch_id=req.patch_id,
        month=req.month,
        class_id=req.class_id,
        score=req.score,
        geometry=req.geometry.model_dump(),
    )

@router.delete("/annotations/{ann_id}")
def delete_annotation(ann_id: str, user: dict = Depends(get_current_user)) -> dict:
    store = get_annotation_store(user["user_id"])
    store.delete_annotation(ann_id)
    return {"status": "ok"}

# ── Models (Classification Heads) ──

class ModelCreateRequest(BaseModel):
    name: str

class ModelRenameRequest(BaseModel):
    name: str

class ModelOut(BaseModel):
    model_config = {"protected_namespaces": ()}
    id: str
    name: str
    status: str
    created_at: str
    completed_at: str | None
    classes: list[dict]
    accuracy: float | None
    n_samples: int | None
    model_path: str | None
    message: str | None

@router.get("/models", response_model=list[ModelOut])
def list_models(user: dict = Depends(get_current_user)) -> list[dict]:
    registry = get_model_registry(user["user_id"])
    return registry.list_models()

@router.post("/models")
def create_model(req: ModelCreateRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)) -> dict:
    registry = get_model_registry(user["user_id"])
    mgr = get_class_manager(user["user_id"])
    classes = mgr.list_classes()
    model_id = registry.create_model(req.name, classes)
    job_id = str(uuid.uuid4())[:8]
    _training_jobs[job_id] = {
        "job_id": job_id,
        "model_id": model_id,
        "status": "running",
        "user_id": user["user_id"],
        "started_at": datetime.now().isoformat(),
    }
    background_tasks.add_task(_do_training, job_id, model_id, user["user_id"])
    return {"model_id": model_id, "job_id": job_id}

@router.get("/models/{model_id}", response_model=ModelOut)
def get_model(model_id: str, user: dict = Depends(get_current_user)) -> dict:
    registry = get_model_registry(user["user_id"])
    model = registry.get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return model

@router.patch("/models/{model_id}")
def rename_model(model_id: str, req: ModelRenameRequest, user: dict = Depends(get_current_user)) -> dict:
    registry = get_model_registry(user["user_id"])
    if not registry.rename_model(model_id, req.name):
        raise HTTPException(status_code=404, detail="Model not found")
    return {"status": "ok"}

@router.delete("/models/{model_id}")
def delete_model(model_id: str, user: dict = Depends(get_current_user)) -> dict:
    registry = get_model_registry(user["user_id"])
    if not registry.delete_model(model_id):
        raise HTTPException(status_code=404, detail="Model not found")
    return {"status": "ok"}

# ── Training ──

_training_jobs: dict[str, dict] = {}

@router.post("/train")
def train_classifier(background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)) -> dict:
    """Deprecated: use POST /models instead."""
    registry = get_model_registry(user["user_id"])
    mgr = get_class_manager(user["user_id"])
    classes = mgr.list_classes()
    model_id = registry.create_model(f"分类头_{datetime.now().strftime('%m%d%H%M')}", classes)
    job_id = str(uuid.uuid4())[:8]
    _training_jobs[job_id] = {
        "job_id": job_id,
        "model_id": model_id,
        "status": "running",
        "user_id": user["user_id"],
        "started_at": datetime.now().isoformat(),
    }
    background_tasks.add_task(_do_training, job_id, model_id, user["user_id"])
    return {"job_id": job_id, "model_id": model_id}

class TrainStatusOut(BaseModel):
    model_config = {"protected_namespaces": ()}
    job_id: str
    status: str
    accuracy: float | None = None
    n_samples: int | None = None
    model_path: str | None = None
    message: str | None = None

@router.get("/train/{job_id}", response_model=TrainStatusOut)
def get_train_status(job_id: str, user: dict = Depends(get_current_user)) -> dict:
    job = _training_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # 普通用户只能看自己的训练任务
    if user.get("role") != "admin" and job.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "accuracy": job.get("accuracy"),
        "n_samples": job.get("n_samples"),
        "model_path": job.get("model_path"),
        "message": job.get("message"),
    }

def _do_training(job_id: str, model_id: str, user_id: str) -> None:
    try:
        engine = get_training_engine(user_id)
        result = engine.train(model_id)
        registry = get_model_registry(user_id)
        registry.update_model(
            model_id,
            status="completed",
            completed_at=datetime.now().isoformat(),
            accuracy=result["accuracy"],
            n_samples=result["n_samples"],
        )
        _training_jobs[job_id].update({
            "status": "completed",
            "accuracy": result["accuracy"],
            "n_samples": result["n_samples"],
            "model_path": result["model_path"],
        })
    except Exception as e:
        registry = get_model_registry(user_id)
        registry.update_model(model_id, status="failed", message=str(e))
        _training_jobs[job_id].update({
            "status": "failed",
            "message": str(e),
        })

# ── Inference ──

class InferRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    patch_id: str
    month: str
    model_id: str | None = None

class InferResponse(BaseModel):
    image_url: str

@router.post("/infer", response_model=InferResponse)
def infer(req: InferRequest, user: dict = Depends(get_current_user)) -> dict:
    engine = get_inference_engine(user["user_id"])
    if req.model_id:
        image_path = engine.infer(req.model_id, req.patch_id, req.month)
    else:
        # Fallback: use latest model for backward compatibility
        registry = get_model_registry(user["user_id"])
        models = registry.list_models()
        completed = [m for m in models if m["status"] == "completed"]
        if not completed:
            raise HTTPException(status_code=400, detail="No trained model found")
        image_path = engine.infer(completed[0]["id"], req.patch_id, req.month)
    return {"image_url": f"/api/annotate/infer_result/{Path(image_path).name}"}

class ModelInferRequest(BaseModel):
    patch_id: str
    month: str

class BatchInferRequest(BaseModel):
    patch_ids: list[str]
    month: str

class BatchInferResult(BaseModel):
    patch_id: str
    image_url: str

@router.post("/models/{model_id}/infer", response_model=InferResponse)
def infer_with_model(model_id: str, req: ModelInferRequest, user: dict = Depends(get_current_user)) -> dict:
    engine = get_inference_engine(user["user_id"])
    image_path = engine.infer(model_id, req.patch_id, req.month)
    return {"image_url": f"/api/annotate/infer_result/{Path(image_path).name}"}

@router.post("/models/{model_id}/infer_batch", response_model=list[BatchInferResult])
def infer_batch_with_model(model_id: str, req: BatchInferRequest, user: dict = Depends(get_current_user)) -> list[dict]:
    engine = get_inference_engine(user["user_id"])
    results = []
    for patch_id in req.patch_ids:
        try:
            image_path = engine.infer(model_id, patch_id, req.month)
            results.append({
                "patch_id": patch_id,
                "image_url": f"/api/annotate/infer_result/{Path(image_path).name}",
            })
        except Exception as e:
            results.append({
                "patch_id": patch_id,
                "image_url": "",
            })
    return results

@router.get("/infer_result/{filename}")
def get_infer_result(filename: str, user: dict = Depends(get_current_user)) -> bytes:
    engine = get_inference_engine(user["user_id"])
    image_path = engine.results_dir / filename
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Result not found")
    from fastapi.responses import FileResponse
    return FileResponse(str(image_path))


# ── Import external annotations (GeoJSON / SHP) ──

import zipfile
import tempfile


class GeoJSONImportRequest(BaseModel):
    patch_id: str
    month: str
    class_id: str
    geojson: dict


def _normalize_coords(coords: list, size: int = 256) -> list[list[float]]:
    """Convert coordinates to normalized [0,1] range."""
    # If coords look like pixel coords (> 1), normalize by size
    max_val = max(abs(c[0]) for c in coords) if coords else 0
    if max_val > 1.5:
        factor = size
    else:
        factor = 1.0
    return [[c[0] / factor, c[1] / factor] for c in coords]


def _import_features(features: list[dict], patch_id: str, month: str, class_id: str, user_id: str) -> dict:
    """Import GeoJSON features as annotations."""
    store = get_annotation_store(user_id)
    created = 0
    skipped = 0
    for feat in features:
        geom = feat.get("geometry", {})
        geom_type = geom.get("type", "")
        coords = geom.get("coordinates", [])
        if not coords:
            skipped += 1
            continue
        if geom_type == "Polygon":
            # coords[0] is the outer ring
            ring = coords[0] if isinstance(coords[0], list) and coords[0] else []
            pts = _normalize_coords(ring)
            if len(pts) >= 3:
                store.create_annotation(
                    patch_id=patch_id,
                    month=month,
                    class_id=class_id,
                    score=1.0,
                    geometry={"type": "polygon", "points": pts},
                )
                created += 1
            else:
                skipped += 1
        elif geom_type == "MultiPolygon":
            for poly in coords:
                ring = poly[0] if isinstance(poly, list) and poly else []
                pts = _normalize_coords(ring)
                if len(pts) >= 3:
                    store.create_annotation(
                        patch_id=patch_id,
                        month=month,
                        class_id=class_id,
                        score=1.0,
                        geometry={"type": "polygon", "points": pts},
                    )
                    created += 1
                else:
                    skipped += 1
        else:
            skipped += 1
    return {"status": "ok", "created": created, "skipped": skipped}


@router.post("/annotations/import_geojson")
def import_geojson(req: GeoJSONImportRequest, user: dict = Depends(get_current_user)) -> dict:
    """Import annotations from GeoJSON FeatureCollection."""
    features = req.geojson.get("features", [])
    if not features:
        raise HTTPException(status_code=400, detail="No features found in GeoJSON")
    return _import_features(features, req.patch_id, req.month, req.class_id, user["user_id"])


@router.post("/annotations/import_shp")
def import_shp(
    patch_id: str,
    month: str,
    class_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
) -> dict:
    """Import annotations from SHP file (uploaded as ZIP)."""
    import geopandas as gpd
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Please upload a ZIP file containing .shp, .shx, .dbf")

    with tempfile.TemporaryDirectory() as tmpdir:
        zip_path = Path(tmpdir) / "upload.zip"
        zip_path.write_bytes(file.file.read())
        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall(tmpdir)
        # Find .shp file
        shp_files = list(Path(tmpdir).glob("*.shp"))
        if not shp_files:
            raise HTTPException(status_code=400, detail="No .shp file found in ZIP")
        gdf = gpd.read_file(shp_files[0])
        features = json.loads(gdf.to_json())["features"]
        return _import_features(features, patch_id, month, class_id, user["user_id"])
