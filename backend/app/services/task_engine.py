"""下游任务推理服务 — 基于预生成 embedding + 轻量 head."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

sys.path.insert(0, "/workspace/xuannv")

from src.models.heads import ChangeDetectionHeadV3

# ── Paths ──
EMBEDDING_DIR = Path("/workspace/outputs/aef_qwen_v4_official/monthly_embeddings_2025")
HEAD_PATH = Path("/workspace/outputs/aef_qwen_v4_official/monthly_cd_head/monthly_cd_head_v3_ohem.pt")
PATCHES_META_PATH = Path("/workspace/xuannv_show/data/harbin/patches_meta.json")

# S2 RGB loader (lazy import to avoid heavy deps at module load)
_load_patch_source_rgb = None


def _get_rgb_loader():
    global _load_patch_source_rgb
    if _load_patch_source_rgb is None:
        from demo_v2.engines.patch_image_loader import load_patch_source_rgb
        _load_patch_source_rgb = load_patch_source_rgb
    return _load_patch_source_rgb


class ChangeDetectionEngine:
    """变化检测推理引擎 — 加载 embedding + CD Head 生成结果图."""

    def __init__(self, device: str | None = None) -> None:
        if device is None:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device)

        # 加载 CD Head
        ckpt = torch.load(HEAD_PATH, map_location=self.device, weights_only=False)
        cfg = ckpt["config"]
        self.head = ChangeDetectionHeadV3(
            embedding_dim=cfg["embedding_dim"],
            hidden_dim=cfg["hidden_dim"],
            dropout=cfg.get("dropout", 0.4),
        )
        self.head.load_state_dict(ckpt["cd_head"])
        self.head.to(self.device)
        self.head.eval()

        # 加载 patches 元数据
        with open(PATCHES_META_PATH) as f:
            self.patches_meta = {p["patch_id"]: p for p in json.load(f)}

        # 构建 ix/iy → patch_id 映射
        self._grid: dict[tuple[int, int], str] = {}
        for pid, p in self.patches_meta.items():
            self._grid[(p["ix"], p["iy"])] = pid

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

    def infer(self, patch_id: str, before_month: str, after_month: str) -> np.ndarray:
        """推理变化概率图 [H, W]."""
        emb_b = self._load_embedding(patch_id, before_month)
        emb_a = self._load_embedding(patch_id, after_month)

        with torch.no_grad():
            eb = torch.from_numpy(emb_b).unsqueeze(0).float().to(self.device)
            ea = torch.from_numpy(emb_a).unsqueeze(0).float().to(self.device)
            logits = self.head(eb, ea).squeeze(1)
            probs = torch.sigmoid(logits).squeeze().cpu().numpy()
        return probs

    def load_s2_rgb(self, patch_id: str, month: str, out_size: int = 256) -> np.ndarray | None:
        """加载 S2 RGB 影像 [H, W, 3] uint8."""
        from demo_v2.utils.constants import TIME_WINDOWS
        window = TIME_WINDOWS.get(month)
        if window is None:
            return None
        try:
            rgb = _get_rgb_loader()(patch_id, "s2", window)
            if rgb is None:
                return None
            # Resize to target size
            if rgb.shape[0] != out_size or rgb.shape[1] != out_size:
                pil = Image.fromarray((rgb * 255).astype(np.uint8))
                pil = pil.resize((out_size, out_size), Image.Resampling.BICUBIC)
                rgb = np.array(pil).astype(np.float32) / 255.0
            return rgb
        except Exception:
            return None

    def render_pred_heatmap(self, probs: np.ndarray, size: int = 128) -> Image.Image:
        """将概率图渲染为红色热力图."""
        # 使用 coolwarm colormap: 低值为蓝色，高值为红色
        from matplotlib import colormaps
        cmap = colormaps["coolwarm"]
        # Normalize to [0, 1]
        norm = np.clip(probs, 0, 1)
        rgba = cmap(norm)  # [H, W, 4]
        rgb = (rgba[:, :, :3] * 255).astype(np.uint8)
        img = Image.fromarray(rgb)
        if img.size != (size, size):
            img = img.resize((size, size), Image.Resampling.NEAREST)
        return img

    def render_mosaic_tile(self, patch_id: str, before_month: str, after_month: str, size: int = 128) -> Image.Image:
        """生成 mosaic 用的单 patch 缩略图."""
        probs = self.infer(patch_id, before_month, after_month)
        return self.render_pred_heatmap(probs, size=size)

    def render_detail_figure(
        self,
        patch_id: str,
        before_month: str,
        after_month: str,
        panel_size: int = 256,
    ) -> Image.Image:
        """生成弹窗用的详情图 (Before + After + Pred 三列)."""
        probs = self.infer(patch_id, before_month, after_month)

        # 加载影像
        s2_b = self.load_s2_rgb(patch_id, before_month, out_size=panel_size)
        s2_a = self.load_s2_rgb(patch_id, after_month, out_size=panel_size)

        # 如果影像缺失，用灰色填充
        if s2_b is None:
            s2_b = np.full((panel_size, panel_size, 3), 0.5, dtype=np.float32)
        if s2_a is None:
            s2_a = np.full((panel_size, panel_size, 3), 0.5, dtype=np.float32)

        # 渲染预测热力图
        pred_img = self.render_pred_heatmap(probs, size=panel_size)

        # 拼接三列
        before_img = Image.fromarray((np.clip(s2_b, 0, 1) * 255).astype(np.uint8))
        after_img = Image.fromarray((np.clip(s2_a, 0, 1) * 255).astype(np.uint8))

        total_w = panel_size * 3 + 2  # 2px gap
        total_h = panel_size + 40  # 40px for title
        canvas = Image.new("RGB", (total_w, total_h), (255, 255, 255))

        # 粘贴图像
        canvas.paste(before_img, (0, 40))
        canvas.paste(after_img, (panel_size + 1, 40))
        canvas.paste(pred_img, (panel_size * 2 + 2, 40))

        # 添加标题文字（简单处理，实际可用 PIL 字体）
        # 由于字体问题，这里用文字标签在上方留空，前端弹窗内用 HTML 文字代替
        return canvas

    def build_mosaic(
        self,
        before_month: str,
        after_month: str,
        tile_size: int = 128,
    ) -> Image.Image:
        """拼接所有 patch 为一张 mosaic 大图."""
        n_cols = self.ix_max - self.ix_min + 1  # 26
        n_rows = self.iy_max - self.iy_min + 1  # 24

        mosaic_w = n_cols * tile_size
        mosaic_h = n_rows * tile_size
        mosaic = Image.new("RGB", (mosaic_w, mosaic_h), (220, 220, 220))

        for (ix, iy), pid in self._grid.items():
            col = ix - self.ix_min
            row = iy - self.iy_min
            try:
                tile = self.render_mosaic_tile(pid, before_month, after_month, tile_size)
            except FileNotFoundError:
                # 缺失 embedding，用灰色块
                tile = Image.new("RGB", (tile_size, tile_size), (200, 200, 200))

            x = col * tile_size
            y = (n_rows - 1 - row) * tile_size  # iy=0 在顶部
            mosaic.paste(tile, (x, y))

        return mosaic


# ── 全局单例 ──
_cd_engine: ChangeDetectionEngine | None = None


def get_cd_engine() -> ChangeDetectionEngine:
    global _cd_engine
    if _cd_engine is None:
        _cd_engine = ChangeDetectionEngine()
    return _cd_engine
