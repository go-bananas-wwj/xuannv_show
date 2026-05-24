"""Agent 智能体引擎 — DeepSeek Function Calling + 异步任务.

支持三类分析任务：
1. 区域概览 — patch 数量、时间范围、数据源等元数据
2. 分类面积统计 — 使用 SegmentationEngine 推理所有 patches，统计各类别面积
3. 变化检测统计 — 使用 ChangeDetectionEngine 推理，统计变化区域

报告生成使用 deepseek-v4-pro 润色为 Markdown。
"""
from __future__ import annotations

import asyncio
import json
import os
import textwrap
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from openai import AsyncOpenAI

from app.config import settings

# ── DeepSeek API 配置 ──
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"

# 快速解析模型（意图识别、参数提取）
MODEL_FLASH = "deepseek-v4-flash"
# 报告润色模型
MODEL_PRO = "deepseek-v4-pro"

# ── 异步任务存储 ──
_task_store: dict[str, "AgentTask"] = {}
_task_store_lock = asyncio.Lock()


@dataclass
class AgentTask:
    task_id: str
    status: str = "pending"  # pending | running | completed | failed
    prompt: str = ""
    region: str = ""
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    completed_at: float | None = None
    result: dict | None = None
    error: str | None = None


# ── 工具定义 (OpenAI Function Calling 格式) ──
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_region_info",
            "description": "获取指定区域的基本信息，包括 patch 数量、时间范围、数据源等",
            "parameters": {
                "type": "object",
                "properties": {
                    "region": {
                        "type": "string",
                        "description": "区域标识，如 harbin",
                    },
                },
                "required": ["region"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_classification",
            "description": "对指定区域的所有 patches 运行分类模型，统计各类别面积和占比。",
            "parameters": {
                "type": "object",
                "properties": {
                    "model_id": {
                        "type": "string",
                        "description": "分类模型 ID，可选: worldcover, dynamic_world, jrc_water, building_extraction",
                        "enum": ["worldcover", "dynamic_world", "jrc_water", "building_extraction"],
                    },
                    "month": {
                        "type": "string",
                        "description": "分析月份，格式 YYYY-MM，如 2025-06",
                    },
                    "patch_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "指定分析的 patch ID 列表（可选，默认全部）",
                    },
                },
                "required": ["model_id", "month"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_change_detection",
            "description": "对指定区域运行变化检测，统计变化区域面积和变化率。",
            "parameters": {
                "type": "object",
                "properties": {
                    "before_month": {
                        "type": "string",
                        "description": "前期月份，格式 YYYY-MM",
                    },
                    "after_month": {
                        "type": "string",
                        "description": "后期月份，格式 YYYY-MM",
                    },
                    "patch_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "指定分析的 patch ID 列表（可选，默认全部）",
                    },
                    "threshold": {
                        "type": "number",
                        "description": "变化概率阈值，0~1，默认 0.5",
                        "default": 0.5,
                    },
                },
                "required": ["before_month", "after_month"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_sample_patches",
            "description": "获取区域的示例 patch ID 列表，用于展示或抽样分析",
            "parameters": {
                "type": "object",
                "properties": {
                    "count": {
                        "type": "integer",
                        "description": "获取数量，默认 5",
                        "default": 5,
                    },
                    "random": {
                        "type": "boolean",
                        "description": "是否随机抽取，默认 false（按网格顺序）",
                        "default": False,
                    },
                },
                "required": [],
            },
        },
    },
]


# ── 工具实现 ──
def _get_patches_meta() -> dict[str, dict]:
    """加载 patches 元数据."""
    path = settings.patches_meta_path
    with open(path) as f:
        return {p["patch_id"]: p for p in json.load(f)}


def _get_available_months() -> list[str]:
    """从 embedding 文件推断可用月份."""
    months = set()
    if not settings.embeddings_dir.exists():
        return []
    for f in settings.embeddings_dir.glob("*.npy"):
        # 文件名格式: patch_id_YYYY-MM.npy
        parts = f.stem.rsplit("_", 1)
        if len(parts) == 2 and len(parts[1]) == 7 and parts[1][4] == "-":
            months.add(parts[1])
    return sorted(months)


def _get_seg_engine():
    """懒加载 SegmentationEngine."""
    from app.services.segmentation_engine import get_seg_engine
    return get_seg_engine()


def _get_cd_engine():
    """懒加载 ChangeDetectionEngine."""
    from app.services.task_engine import get_cd_engine
    return get_cd_engine()


def tool_get_region_info(region: str) -> dict:
    """获取区域基本信息."""
    patches = _get_patches_meta()
    months = _get_available_months()
    
    # 获取数据源信息
    sources = set()
    for p in patches.values():
        sources.update(p.get("sources", {}).keys())
    
    # 计算 bbox
    bounds_list = [p["bounds"] for p in patches.values()]
    if bounds_list:
        min_x = min(b[0] for b in bounds_list)
        min_y = min(b[1] for b in bounds_list)
        max_x = max(b[2] for b in bounds_list)
        max_y = max(b[3] for b in bounds_list)
        bbox = [min_x, min_y, max_x, max_y]
    else:
        bbox = []
    
    return {
        "region": region,
        "patch_count": len(patches),
        "available_months": months,
        "time_range": [months[0], months[-1]] if months else [],
        "data_sources": sorted(sources),
        "bbox": bbox,
        "grid_size": _compute_grid_size(patches),
    }


def _compute_grid_size(patches: dict) -> dict:
    """计算网格尺寸."""
    if not patches:
        return {"cols": 0, "rows": 0}
    ixs = [p["ix"] for p in patches.values()]
    iys = [p["iy"] for p in patches.values()]
    return {
        "cols": max(ixs) - min(ixs) + 1,
        "rows": max(iys) - min(iys) + 1,
    }


def tool_analyze_classification(model_id: str, month: str, patch_ids: list[str] | None = None) -> dict:
    """分类面积统计."""
    engine = _get_seg_engine()
    patches = _get_patches_meta()
    
    if patch_ids is None:
        patch_ids = list(patches.keys())
    
    # 获取模型类别定义
    model_data = engine.models[model_id]
    class_names = model_data.get("class_names", [])
    colors = model_data.get("colors", [])
    
    # 统计各类别像素数
    class_counts = {name: 0 for name in class_names}
    class_counts["无效/NoData"] = 0
    total_pixels = 0
    processed = 0
    failed = 0
    
    for pid in patch_ids:
        try:
            pred = engine.infer(model_id, pid, month)  # [H, W]
            unique, counts = np.unique(pred, return_counts=True)
            for val, cnt in zip(unique, counts):
                if val < 0 or val >= len(class_names):
                    class_counts["无效/NoData"] += int(cnt)
                else:
                    class_counts[class_names[val]] += int(cnt)
                total_pixels += int(cnt)
            processed += 1
        except FileNotFoundError:
            failed += 1
        except Exception as e:
            failed += 1
    
    # 计算百分比
    percentages = {}
    for name, count in class_counts.items():
        percentages[name] = round(count / total_pixels * 100, 2) if total_pixels > 0 else 0.0
    
    # 估算面积 (假设每个像素 10m × 10m = 100 m²)
    pixel_area_m2 = 100  # 10m resolution
    total_area_ha = total_pixels * pixel_area_m2 / 10000
    
    return {
        "model_id": model_id,
        "model_name": _get_model_display_name(model_id),
        "month": month,
        "total_patches": len(patch_ids),
        "processed_patches": processed,
        "failed_patches": failed,
        "total_pixels": total_pixels,
        "total_area_ha": round(total_area_ha, 2),
        "class_counts": class_counts,
        "class_percentages": percentages,
        "class_colors": [
            {"name": name, "color": f"#{c[0]:02x}{c[1]:02x}{c[2]:02x}" if isinstance(c, tuple) else str(c)}
            for name, c in zip(class_names, colors)
        ] if colors else [],
    }


def _get_model_display_name(model_id: str) -> str:
    names = {
        "worldcover": "WorldCover 土地覆盖",
        "dynamic_world": "Dynamic World 土地利用",
        "jrc_water": "JRC 水体提取",
        "building_extraction": "建筑物提取",
    }
    return names.get(model_id, model_id)


def tool_analyze_change_detection(before_month: str, after_month: str, patch_ids: list[str] | None = None, threshold: float = 0.5) -> dict:
    """变化检测统计."""
    engine = _get_cd_engine()
    patches = _get_patches_meta()
    
    if patch_ids is None:
        patch_ids = list(patches.keys())
    
    all_probs = []
    changed_pixels = 0
    total_pixels = 0
    processed = 0
    failed = 0
    high_confidence_patches = 0  # 平均变化概率 > 0.5 的 patch 数
    
    for pid in patch_ids:
        try:
            probs = engine.infer(pid, before_month, after_month)  # [H, W]
            all_probs.append(probs)
            
            changed = np.sum(probs >= threshold)
            changed_pixels += int(changed)
            total_pixels += probs.size
            
            mean_prob = float(np.mean(probs))
            if mean_prob > 0.5:
                high_confidence_patches += 1
            
            processed += 1
        except FileNotFoundError:
            failed += 1
        except Exception:
            failed += 1
    
    if all_probs:
        all_probs_arr = np.concatenate([p.flatten() for p in all_probs])
        overall_mean = float(np.mean(all_probs_arr))
        overall_max = float(np.max(all_probs_arr))
        overall_std = float(np.std(all_probs_arr))
    else:
        overall_mean = overall_max = overall_std = 0.0
    
    # 面积估算
    pixel_area_m2 = 100
    changed_area_ha = changed_pixels * pixel_area_m2 / 10000
    total_area_ha = total_pixels * pixel_area_m2 / 10000
    change_rate = changed_pixels / total_pixels * 100 if total_pixels > 0 else 0.0
    
    return {
        "before_month": before_month,
        "after_month": after_month,
        "threshold": threshold,
        "total_patches": len(patch_ids),
        "processed_patches": processed,
        "failed_patches": failed,
        "changed_pixels": changed_pixels,
        "total_pixels": total_pixels,
        "changed_area_ha": round(changed_area_ha, 2),
        "total_area_ha": round(total_area_ha, 2),
        "change_rate_percent": round(change_rate, 2),
        "mean_change_probability": round(overall_mean, 4),
        "max_change_probability": round(overall_max, 4),
        "std_change_probability": round(overall_std, 4),
        "high_confidence_patches": high_confidence_patches,
    }


def tool_get_sample_patches(count: int = 5, random: bool = False) -> dict:
    """获取示例 patch ID 列表."""
    patches = _get_patches_meta()
    patch_ids = list(patches.keys())
    
    if random:
        import random as rnd
        rnd.seed(42)
        sample = rnd.sample(patch_ids, min(count, len(patch_ids)))
    else:
        sample = patch_ids[:count]
    
    return {
        "sample_patches": sample,
        "total_available": len(patch_ids),
    }


# ── Function Calling 调度 ──
async def _call_with_tools(client: AsyncOpenAI, messages: list[dict], model: str, tools: list[dict] | None = None) -> dict:
    """调用 LLM，支持 Function Calling."""
    kwargs = {"model": model, "messages": messages}
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"
    
    response = await client.chat.completions.create(**kwargs)
    return response


def _build_assistant_message(message) -> dict:
    """构建 assistant message，保留 reasoning_content（DeepSeek V4 需要）."""
    msg: dict = {
        "role": "assistant",
        "content": message.content or "",
    }
    # DeepSeek V4 的 thinking mode 需要传回 reasoning_content
    reasoning = getattr(message, "reasoning_content", None)
    if reasoning:
        msg["reasoning_content"] = reasoning
    if message.tool_calls:
        msg["tool_calls"] = [tc.model_dump() for tc in message.tool_calls]
    return msg


async def _execute_tool_call(tool_call: dict) -> dict:
    """执行单个工具调用."""
    function_name = tool_call["function"]["name"]
    arguments = json.loads(tool_call["function"]["arguments"])
    
    if function_name == "get_region_info":
        return tool_get_region_info(**arguments)
    elif function_name == "analyze_classification":
        return tool_analyze_classification(**arguments)
    elif function_name == "analyze_change_detection":
        return tool_analyze_change_detection(**arguments)
    elif function_name == "get_sample_patches":
        return tool_get_sample_patches(**arguments)
    else:
        return {"error": f"Unknown function: {function_name}"}


# ── 核心 Agent 流程 ──
async def run_agent_task(task: AgentTask) -> None:
    """执行 Agent 任务主流程."""
    client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)
    
    task.status = "running"
    task.started_at = time.time()
    
    try:
        # Step 1: 意图识别 + 参数提取 (使用 flash 模型)
        system_prompt = textwrap.dedent("""\
            你是一个遥感数据分析助手。用户会用自然语言描述监测需求。
            你的任务是：
            1. 理解用户的意图（区域概览、分类统计、变化检测）
            2. 调用合适的工具获取数据
            3. 基于数据生成结构化的分析报告
            
            可用工具说明：
            - get_region_info: 获取区域基本信息
            - analyze_classification: 分类面积统计（worldcover/dynamic_world/jrc_water/building_extraction）
            - analyze_change_detection: 变化检测统计（需要指定 before_month 和 after_month）
            - get_sample_patches: 获取示例 patches
            
            当前区域是哈尔滨新区，可用月份范围请通过 get_region_info 查询。
            如果用户没有指定月份，请使用最近可用的月份。
            如果用户提到"变化"、"对比"、"差异"等词，请使用 analyze_change_detection。
            如果用户提到"面积"、"占比"、"覆盖"、"分布"等词，请使用 analyze_classification。
        """)
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": task.prompt},
        ]
        
        # 第一轮：获取工具调用
        response = await _call_with_tools(client, messages, MODEL_FLASH, TOOLS)
        message = response.choices[0].message
        
        tool_results = []
        
        # 处理工具调用
        while message.tool_calls:
            messages.append(_build_assistant_message(message))
            
            for tc in message.tool_calls:
                tc_dict = tc.model_dump()
                result = await _execute_tool_call(tc_dict)
                tool_results.append({
                    "tool": tc_dict["function"]["name"],
                    "result": result,
                })
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc_dict["id"],
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                })
            
            # 再次调用，看是否还需要更多工具
            response = await _call_with_tools(client, messages, MODEL_FLASH, TOOLS)
            message = response.choices[0].message
        
        # Step 2: 生成报告 (使用 pro 模型润色)
        report_prompt = textwrap.dedent(f"""\
            基于以下遥感数据分析结果，生成一份专业的中文监测报告。
            
            用户需求: {task.prompt}
            
            分析数据:
            {json.dumps(tool_results, ensure_ascii=False, indent=2, default=str)}
            
            要求：
            1. 使用 Markdown 格式输出
            2. 包含数据摘要、关键发现、建议三个部分
            3. 使用表格展示统计数据
            4. 语言专业、简洁，适合科研人员阅读
            5. 报告标题使用 # 级别
            6. 如果涉及变化检测，说明变化趋势和重点区域
            7. 如果涉及分类统计，说明各类别占比和分布特征
        """)
        
        report_response = await client.chat.completions.create(
            model=MODEL_PRO,
            messages=[{"role": "user", "content": report_prompt}],
            temperature=0.7,
        )
        
        report_md = report_response.choices[0].message.content or ""
        
        # 构建统计结果
        statistics = _build_statistics(tool_results)
        
        task.result = {
            "report_markdown": report_md,
            "report_html": _markdown_to_html(report_md),
            "statistics": statistics,
            "tools_used": [tr["tool"] for tr in tool_results],
            "raw_data": tool_results,
        }
        task.status = "completed"
        
    except Exception as e:
        task.status = "failed"
        task.error = str(e)
        import traceback
        task.error += "\n" + traceback.format_exc()
    finally:
        task.completed_at = time.time()


def _build_statistics(tool_results: list[dict]) -> dict:
    """从工具结果构建统计摘要."""
    stats = {
        "change_areas": 0,
        "total_area_ha": 0,
        "confidence": 0.92,
        "categories": {},
    }
    
    for tr in tool_results:
        result = tr.get("result", {})
        tool = tr.get("tool", "")
        
        if tool == "analyze_change_detection":
            stats["change_areas"] = result.get("high_confidence_patches", 0)
            stats["total_area_ha"] = result.get("changed_area_ha", 0)
            stats["confidence"] = round(1 - result.get("std_change_probability", 0), 2)
        elif tool == "analyze_classification":
            stats["categories"] = result.get("class_percentages", {})
            stats["total_area_ha"] = result.get("total_area_ha", 0)
    
    return stats


def _markdown_to_html(md: str) -> str:
    """简单 Markdown 转 HTML（后端兜底，前端优先用 react-markdown）."""
    import re
    
    html = md
    # 代码块
    html = re.sub(r"```(\w+)?\n(.*?)```", r"<pre><code>\2</code></pre>", html, flags=re.DOTALL)
    # 标题
    html = re.sub(r"^### (.+)$", r"<h3>\1</h3>", html, flags=re.MULTILINE)
    html = re.sub(r"^## (.+)$", r"<h2>\1</h2>", html, flags=re.MULTILINE)
    html = re.sub(r"^# (.+)$", r"<h1>\1</h1>", html, flags=re.MULTILINE)
    # 粗体
    html = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)
    # 斜体
    html = re.sub(r"\*(.+?)\*", r"<em>\1</em>", html)
    # 表格 (简单处理)
    lines = html.split("\n")
    in_table = False
    new_lines = []
    table_rows = []
    
    for line in lines:
        if line.strip().startswith("|"):
            if not in_table:
                in_table = True
                table_rows = []
            cells = [c.strip() for c in line.split("|")[1:-1]]
            # 跳过分隔行 |---|---|
            if all("-" in c for c in cells):
                continue
            table_rows.append(cells)
        else:
            if in_table:
                in_table = False
                if table_rows:
                    new_lines.append("<table class='agent-table'>")
                    for i, row in enumerate(table_rows):
                        tag = "th" if i == 0 else "td"
                        new_lines.append("<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in row) + "</tr>")
                    new_lines.append("</table>")
                table_rows = []
            new_lines.append(line)
    
    if in_table and table_rows:
        new_lines.append("<table class='agent-table'>")
        for i, row in enumerate(table_rows):
            tag = "th" if i == 0 else "td"
            new_lines.append("<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in row) + "</tr>")
        new_lines.append("</table>")
    
    html = "\n".join(new_lines)
    # 列表
    html = re.sub(r"^\* (.+)$", r"<li>\1</li>", html, flags=re.MULTILINE)
    html = re.sub(r"(<li>.*?</li>\n)+", r"<ul>\g<0></ul>\n", html, flags=re.DOTALL)
    # 段落
    paragraphs = html.split("\n\n")
    new_paragraphs = []
    for p in paragraphs:
        p = p.strip()
        if p and not p.startswith("<"):
            p = f"<p>{p}</p>"
        new_paragraphs.append(p)
    html = "\n\n".join(new_paragraphs)
    
    return html


# ── 公开 API ──
async def create_task(prompt: str, region: str = "harbin") -> str:
    """创建新任务并启动."""
    task_id = str(uuid.uuid4())[:8]
    task = AgentTask(task_id=task_id, prompt=prompt, region=region)
    
    async with _task_store_lock:
        _task_store[task_id] = task
    
    # 启动后台任务
    asyncio.create_task(run_agent_task(task))
    
    return task_id


async def get_task(task_id: str) -> AgentTask | None:
    """获取任务状态."""
    async with _task_store_lock:
        return _task_store.get(task_id)


async def cleanup_old_tasks(max_age_seconds: float = 3600) -> int:
    """清理超过指定时间的已完成任务."""
    now = time.time()
    removed = 0
    async with _task_store_lock:
        to_remove = [
            tid for tid, t in _task_store.items()
            if t.status in ("completed", "failed") and t.completed_at and (now - t.completed_at) > max_age_seconds
        ]
        for tid in to_remove:
            del _task_store[tid]
            removed += 1
    return removed


# 定期清理任务
async def _cleanup_loop():
    while True:
        await asyncio.sleep(300)  # 5 分钟
        await cleanup_old_tasks()


# 启动清理循环（在 lifespan 中调用）
def start_cleanup_loop():
    asyncio.create_task(_cleanup_loop())
