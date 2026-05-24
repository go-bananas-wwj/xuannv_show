"""统一路径管理 — 供 scripts/ 下所有脚本使用.

通过从本文件位置向上推导，自动定位项目根目录，避免硬编码绝对路径。
外部依赖（原始数据、模型权重、embedding）从环境变量读取，fallback 到当前部署环境的默认值。
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


# ── 项目根目录推导 ──
# scripts/_paths.py → scripts/ → 项目根目录
PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
BACKEND_DIR: Path = PROJECT_ROOT / "backend"


def add_backend_to_path() -> None:
    """将 backend/ 和外部 xuannv/ 加入 sys.path，供导入 app.* 使用."""
    backend_str = str(BACKEND_DIR)
    if backend_str not in sys.path:
        sys.path.insert(0, backend_str)
    # xuannv 核心库路径优先从环境变量读取
    xuannv_root = Path(os.environ.get("XUANNV_ROOT", "/workspace/xuannv"))
    xuannv_str = str(xuannv_root)
    if xuannv_str not in sys.path:
        sys.path.insert(0, xuannv_str)


def get_raw_scenes_dir() -> Path:
    """原始影像目录，支持环境变量覆盖."""
    return Path(os.environ.get("RAW_SCENES_DIR", "/workspace/raw/harbin_scenes"))


def get_embeddings_dir() -> Path:
    """Embedding 张量目录，支持环境变量覆盖."""
    return Path(os.environ.get(
        "EMBEDDINGS_DIR",
        "/workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025",
    ))


def static_assets_dir(version: str | None = None, region: str | None = None) -> Path:
    """静态资源输出根目录.

    Args:
        version: 如 "v5.2.1"，提供时返回 versioned 子目录
        region:  如 "harbin"，提供时进一步进入地区子目录
    """
    # 支持通过环境变量覆盖输出目录（供 generate_static_assets.py 统一调度）
    override = os.environ.get("STATIC_ASSETS_OVERRIDE")
    if override:
        return Path(override)
    d = PROJECT_ROOT / "static_assets"
    if version:
        d = d / version
    if region:
        d = d / region
    return d


def ensure_env_raw_scenes() -> None:
    """设置 RAW_SCENES_DIR 环境变量默认值（供 backend app 读取）."""
    os.environ.setdefault("RAW_SCENES_DIR", str(get_raw_scenes_dir()))
