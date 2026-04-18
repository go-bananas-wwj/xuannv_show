"""Agent API — 智能体任务接口（预留）."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentTaskRequest(BaseModel):
    prompt: str
    region: str = "harbin"
    time_range: list[str] | None = None


class AgentTaskResponse(BaseModel):
    report_html: str
    result_image_url: str | None = None
    statistics: dict


@router.post("/task")
async def submit_task(request: AgentTaskRequest) -> JSONResponse:
    """提交智能体任务（当前返回 mock 数据）."""
    # TODO: 接入实际智能体服务
    mock_report = f"""<h2>监测任务报告</h2>
<p><strong>任务描述</strong>: {request.prompt}</p>
<p><strong>区域</strong>: {request.region}</p>
<h3>执行结果</h3>
<ul>
<li>检测到变化区域: 12 处</li>
<li>主要变化类型: construction (8), demolition (3), land_conversion (1)</li>
<li>总面积变化: 约 45.6 公顷</li>
</ul>
<p>变化主要集中在松北区北部的新建开发区，与 SAR 监测数据高度吻合。</p>"""

    return JSONResponse(
        content={
            "report_html": mock_report,
            "result_image_url": None,
            "statistics": {
                "change_areas": 12,
                "total_area_ha": 45.6,
                "confidence": 0.92,
                "categories": {"construction": 8, "demolition": 3, "land_conversion": 1},
            },
        }
    )
