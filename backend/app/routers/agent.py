"""Agent API — 智能体任务接口.

支持异步任务提交和轮询：
- POST /agent/task     → 提交任务，返回 task_id
- GET  /agent/task/{id} → 查询任务状态和结果
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.agent_engine import create_task, get_task

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentTaskRequest(BaseModel):
    prompt: str
    region: str = "harbin"
    time_range: list[str] | None = None


class AgentTaskSubmitResponse(BaseModel):
    task_id: str
    status: str


class AgentTaskResult(BaseModel):
    task_id: str
    status: str
    prompt: str
    created_at: float
    started_at: float | None = None
    completed_at: float | None = None
    elapsed_seconds: float | None = None
    result: dict | None = None
    error: str | None = None


@router.post("/task", response_model=AgentTaskSubmitResponse)
async def submit_task(request: AgentTaskRequest) -> dict:
    """提交智能体任务，返回 task_id 用于轮询."""
    task_id = await create_task(prompt=request.prompt, region=request.region)
    return {"task_id": task_id, "status": "pending"}


@router.get("/task/{task_id}", response_model=AgentTaskResult)
async def query_task(task_id: str) -> dict:
    """查询任务状态和结果."""
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    elapsed = None
    if task.started_at and task.completed_at:
        elapsed = round(task.completed_at - task.started_at, 2)
    elif task.started_at:
        import time
        elapsed = round(time.time() - task.started_at, 2)
    
    return {
        "task_id": task.task_id,
        "status": task.status,
        "prompt": task.prompt,
        "created_at": task.created_at,
        "started_at": task.started_at,
        "completed_at": task.completed_at,
        "elapsed_seconds": elapsed,
        "result": task.result,
        "error": task.error,
    }
