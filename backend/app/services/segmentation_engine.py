"""语义分割/分类任务推理引擎 — 基于预训练 Linear Probe 模型."""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import rasterio
from PIL import Image, ImageDraw, ImageFont

from app.config import settings

# ── Paths ──
MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "models"
EMBEDDING_DIR = settings.embeddings_dir
RAW_DIR = settings.raw_scenes_dir
PATCHES_META_PATH = settings.patches_meta_path

# GT 数据源映射
_GT_SOURCE_MAP = {
    "worldcover": "worldcover",
    "dynamic_world": "dynamic_world",
    "jrc_water": "jrc_water",
    "building_extraction": "osm_buildings",
}

# 中文标签映射
_LABELS_CN = {
    "worldcover": ["森林", "草地", "农田", "建筑", "裸地", "水体", "湿地"],
    "dynamic_world": ["水体", "农田", "建筑", "裸地", "冰雪"],
    "jrc_water": ["非水体", "水体"],
    "building_extraction": ["非建筑", "建筑"],
}


class SegmentationEngine:
    """分类任务推理引擎 — 加载 Linear Probe 模型，生成分类结果图."""

    def __init__(self) -> None:
        # 加载4个模型
        self.models: dict[str, dict] = {}
        _MODEL_FILENAME_MAP = {
            "worldcover": "worldcover_linear_probe.pkl",
            "dynamic_world": "dynamic_world_linear_probe.pkl",
            "jrc_water": "jrc_water_linear_probe.pkl",
            "building_extraction": "building_linear_probe.pkl",
        }
        for head_id in ["worldcover", "dynamic_world", "jrc_water", "building_extraction"]:
            path = MODEL_DIR / _MODEL_FILENAME_MAP[head_id]
            self.models[head_id] = joblib.load(path)

        # 加载 patches 元数据
        with open(PATCHES_META_PATH) as f:
            self.patches_meta = {p["patch_id"]: p for p in json.load(f)}

        # 网格边界
        all_ix = [p["ix"] for p in self.patches_meta.values()]
        all_iy = [p["iy"] for p in self.patches_meta.values()]
        self.ix_min, self.ix_max = min(all_ix), max(all_ix)
        self.iy_min, self.iy_max = min(all_iy), max(all_iy)

    def _load_embedding(self, patch_id: str, month: str) -> np.ndarray:
        """加载指定 patch 和月份的 embedding [D, H, W]."""
        path = EMBEDDING_DIR / f"{patch_id}_{month}.npy"
        if not path.exists():
            raise FileNotFoundError(f"Embedding not found: {path}")
        return np.load(path)

    def infer(self, head_id: str, patch_id: str, month: str) -> np.ndarray:
        """推理分类图 [H, W]，值为类别索引 0~C-1."""
        emb = self._load_embedding(patch_id, month)  # [D, H, W]
        model_dict = self.models[head_id]
        scaler = model_dict["scaler"]
        lr = model_dict["model"]

        D, H, W = emb.shape
        flat = emb.reshape(D, -1).T  # [H*W, D]
        flat_s = scaler.transform(flat)
        pred = lr.predict(flat_s).reshape(H, W)  # [H, W]
        return pred.astype(np.int32)

    def render_mosaic_tile(self, head_id: str, patch_id: str, month: str, size: int = 128) -> Image.Image:
        """生成 mosaic tile：分类图 → 颜色编码 → 128x128."""
        pred = self.infer(head_id, patch_id, month)
        colors = self.models[head_id]["colors"]

        h, w = pred.shape
        rgb = np.zeros((h, w, 3), dtype=np.uint8)
        for idx, color in enumerate(colors):
            rgb[pred == idx] = color

        img = Image.fromarray(rgb)
        img = img.resize((size, size), Image.Resampling.NEAREST)

        # 添加 1px 边框
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 0, size - 1, size - 1], outline="#e2e8f0", width=1)
        return img

    def render_detail_figure(
        self,
        head_id: str,
        patch_id: str,
        month: str,
        panel_size: int = 256,
    ) -> Image.Image:
        """生成弹窗用的详情图 (S2 / 分类结果 / Ground Truth 三列)."""
        pred = self.infer(head_id, patch_id, month)
        colors = self.models[head_id]["colors"]

        # 1. S2 原始影像
        s2 = self._load_s2_rgb_natural(patch_id, month, out_size=panel_size)
        placeholder = np.full((panel_size, panel_size, 3), 0.85, dtype=np.float32)
        s2 = s2 if s2 is not None else placeholder
        s2_img = Image.fromarray((np.clip(s2, 0, 1) * 255).astype(np.uint8))

        # 2. 分类结果图
        pred_rgb = np.zeros((*pred.shape, 3), dtype=np.uint8)
        for idx, color in enumerate(colors):
            pred_rgb[pred == idx] = color
        pred_img = Image.fromarray(pred_rgb).resize((panel_size, panel_size), Image.Resampling.NEAREST)

        # 3. Ground Truth
        gt_img = self._load_ground_truth(head_id, patch_id, panel_size)

        gap = 24
        total_w = panel_size * 3 + gap * 2
        total_h = panel_size + 60
        canvas = Image.new("RGB", (total_w, total_h), (248, 250, 252))

        imgs = [s2_img, pred_img, gt_img]
        labels = ["Sentinel-2 影像", "模型分类结果", "Ground Truth"]

        for i, img in enumerate(imgs):
            x = i * (panel_size + gap)
            canvas.paste(img, (x, 60))

        # 绘制标签
        draw = ImageDraw.Draw(canvas)
        font_path = settings.effective_font_path
        if font_path:
            font = ImageFont.truetype(str(font_path), 14)
        else:
            font = ImageFont.load_default()

        for i, label in enumerate(labels):
            x = i * (panel_size + gap) + panel_size // 2
            bbox = draw.textbbox((0, 0), label, font=font)
            text_w = bbox[2] - bbox[0]
            text_x = x - text_w // 2
            draw.text((text_x, 20), label, fill="#64748b", font=font)

        return canvas

    def _load_s2_rgb_natural(self, patch_id: str, month: str, out_size: int = 256) -> np.ndarray | None:
        """加载 S2 RGB 原始影像，固定反射率范围归一化."""
        from demo_v2.utils.constants import TIME_WINDOWS, RAW_DIR as DEMO_RAW_DIR
        from demo_v2.engines.patch_image_loader import _find_best_tif

        window = TIME_WINDOWS.get(month)
        if window is None:
            return None

        source_dir = DEMO_RAW_DIR / "s2" / patch_id
        tif_path = _find_best_tif(source_dir, window[0], window[1])
        if tif_path is None:
            return None

        try:
            with rasterio.open(str(tif_path)) as ds:
                data = ds.read()

            if data.shape[0] >= 4:
                rgb = data[[2, 1, 0]].astype(np.float32)
            elif data.shape[0] >= 3:
                rgb = data[:3].astype(np.float32)
            else:
                return None

            rgb = np.clip(rgb / 3500.0, 0, 1)
            rgb = rgb.transpose(1, 2, 0)

            if rgb.shape[0] != out_size or rgb.shape[1] != out_size:
                pil = Image.fromarray((rgb * 255).astype(np.uint8))
                pil = pil.resize((out_size, out_size), Image.Resampling.LANCZOS)
                rgb = np.array(pil).astype(np.float32) / 255.0

            return rgb
        except Exception:
            return None

    def _load_ground_truth(
        self,
        head_id: str,
        patch_id: str,
        out_size: int = 256,
    ) -> Image.Image:
        """加载 Ground Truth 标签图并颜色编码."""
        source = _GT_SOURCE_MAP.get(head_id)
        if source is None:
            return self._make_placeholder(out_size, "无标签数据")

        source_dir = RAW_DIR / source / patch_id
        if not source_dir.exists():
            return self._make_placeholder(out_size, "无标签数据")

        tifs = sorted(source_dir.glob("*.tif"))
        if not tifs:
            return self._make_placeholder(out_size, "无标签数据")

        try:
            with rasterio.open(str(tifs[0])) as src:
                raw = src.read(1)
        except Exception:
            return self._make_placeholder(out_size, "标签读取失败")

        raw_int = raw.astype(np.int32)
        if np.issubdtype(raw.dtype, np.floating):
            nan_mask = np.isnan(raw)
            raw_int[nan_mask] = -1

        colors = self.models[head_id]["colors"]

        # 标签值 → 类别索引映射
        if head_id == "jrc_water":
            mapped = np.full_like(raw_int, fill_value=-1)
            mapped[raw_int == -128] = -1
            mapped[raw_int <= 0] = 0
            mapped[raw_int > 0] = 1
        elif head_id == "building_extraction":
            mapped = np.full_like(raw_int, fill_value=-1)
            mapped[raw_int == 50] = 1   # Built-up → 建筑
            mapped[raw_int > 0] = 0     # 其他 → 非建筑
        else:
            # worldcover / dynamic_world: 标签值直接映射
            classes = self.models[head_id]["classes"]
            mapped = np.full_like(raw_int, fill_value=-1)
            for idx, cls_val in enumerate(classes):
                mapped[raw_int == cls_val] = idx

        # Resize 到目标尺寸
        if mapped.shape[0] != out_size or mapped.shape[1] != out_size:
            pil = Image.fromarray(mapped.astype(np.int32))
            pil = pil.resize((out_size, out_size), Image.Resampling.NEAREST)
            mapped = np.array(pil, dtype=np.int32)

        # 颜色编码
        rgb = np.full((*mapped.shape, 3), 220, dtype=np.uint8)  # 默认浅灰
        for idx, color in enumerate(colors):
            rgb[mapped == idx] = color
        # 无效区域用深灰
        rgb[mapped < 0] = (200, 200, 200)

        return Image.fromarray(rgb)

    def _make_placeholder(self, size: int, text: str) -> Image.Image:
        """生成灰色占位图."""
        img = Image.new("RGB", (size, size), (220, 220, 220))
        draw = ImageDraw.Draw(img)
        font_path = settings.effective_font_path
        if font_path:
            font = ImageFont.truetype(str(font_path), 16)
        else:
            font = ImageFont.load_default()
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        draw.text(((size - text_w) // 2, (size - text_h) // 2), text, fill="#999999", font=font)
        return img


# ── 全局单例 ──
_seg_engine: SegmentationEngine | None = None


def get_seg_engine() -> SegmentationEngine:
    global _seg_engine
    if _seg_engine is None:
        _seg_engine = SegmentationEngine()
    return _seg_engine
