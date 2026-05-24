"""全局配置 — Pydantic Settings，支持 .env 文件与环境变量覆盖."""
from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """玄女底座后端配置.

    所有路径字段均有默认值（与当前部署环境一致），可通过环境变量或 .env 文件覆盖。
    环境变量名自动转换规则：embeddings_dir → EMBEDDINGS_DIR
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── 项目根目录 ──
    project_root: Path = Field(
        default=Path(__file__).resolve().parent.parent.parent,
        description="项目根目录（xuannv_show/）",
    )

    # ── 外部依赖：Xuannv Foundations 核心代码仓库 ──
    xuannv_root: Path = Field(
        default=Path("/workspace/xuannv"),
        description="Xuannv 核心模型代码仓库路径",
    )

    # ── 数据路径 ──
    data_root: Path = Field(
        default=Path("/workspace/raw"),
        description="原始数据根目录",
    )
    raw_scenes_dir: Path = Field(
        default=Path("/workspace/raw/harbin_scenes"),
        description="遥感影像主目录",
    )
    raw_fallback_dir: Path = Field(
        default=Path("/workspace/raw/harbin"),
        description="遥感影像回退目录",
    )
    embeddings_dir: Path = Field(
        default=Path(
            "/workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025"
        ),
        description="Embedding 张量目录（分散格式 .npy）",
    )

    # ── 模型路径 ──
    outputs_root: Path = Field(
        default=Path("/workspace/outputs"),
        description="模型输出根目录",
    )
    cd_head_path: Path = Field(
        default=Path(
            "/workspace/outputs/aef_qwen_v5_mixed_scale/monthly_cd_head/monthly_cd_head_v5_final.pt"
        ),
        description="变化检测 CD Head 模型权重",
    )
    results_dir: Path = Field(
        default=Path("/workspace/outputs/aef_qwen_v5_mixed_scale/results"),
        description="下游任务预计算结果图目录",
    )
    sam3_checkpoint: Path = Field(
        default=Path("/workspace/models/facebook/sam3/sam3.pt"),
        description="SAM3 模型 checkpoint",
    )
    sam3_bpe_path: Path = Field(
        default=Path(
            "/workspace/xuannv_show/backend/sam3/sam3/assets/bpe_simple_vocab_16e6.txt.gz"
        ),
        description="SAM3 BPE tokenizer 路径",
    )

    # ── 地区配置 ──
    region: str = Field(default="harbin", description="当前展示地区标识")

    # ── 静态资源版本化 ──
    static_assets_version: str | None = Field(
        default=None,
        description="静态资源版本号，如 v5.2.1；设置后 static_assets/{version}/{region}/ 生效",
    )
    static_assets_region: str | None = Field(
        default=None,
        description="静态资源地区子目录；默认继承 region",
    )

    # ── 字体 ──
    font_path: Path = Field(
        default=Path("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"),
        description="中文字体路径（不存在时回退到 DejaVu Sans）",
    )

    # ── Web 配置 ──
    cors_origins: str = Field(
        default="http://localhost:5173,http://localhost:3000",
        description="CORS 允许的源，逗号分隔",
    )
    allow_all_origins: bool = Field(
        default=False,
        description="是否允许所有源（仅开发环境）",
    )
    api_key: str | None = Field(
        default=None,
        description="API Key（设置后启用 /api/* 校验）",
    )

    # ── 用户数据 ──
    user_data_dir: Path | None = Field(
        default=None,
        description="用户标注/模型数据目录（默认 project_root/data/user_annotations）",
    )

    @field_validator("user_data_dir", mode="before")
    @classmethod
    def _default_user_data_dir(cls, v, info):
        if v is None:
            return info.data.get("project_root", Path(".")) / "data" / "user_annotations"
        return v

    # ── 动态路径（由 region 推导） ──
    @property
    def patches_meta_path(self) -> Path:
        return self.project_root / "data" / self.region / "patches_meta.json"

    @property
    def static_assets_base(self) -> Path:
        """静态资源根目录（支持版本化子目录）."""
        base = self.project_root / "static_assets"
        version = self.static_assets_version
        region = self.static_assets_region or self.region
        if version:
            return base / version / region
        return base

    @property
    def available_fonts(self) -> list[Path]:
        """返回候选字体路径列表（按优先级排序）."""
        candidates = [
            self.font_path,
            Path("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        ]
        return [p for p in candidates if p.exists()]

    @property
    def effective_font_path(self) -> Path | None:
        """返回实际可用的字体路径，找不到则返回 None."""
        for p in self.available_fonts:
            if p.exists():
                return p
        return None


# 全局单例（首次导入时从 .env / 环境变量初始化）
settings = Settings()
