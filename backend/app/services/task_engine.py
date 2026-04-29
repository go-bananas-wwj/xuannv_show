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
EMBEDDING_DIR = Path("/workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025")
HEAD_PATH = Path("/workspace/outputs/aef_qwen_v5_mixed_scale/monthly_cd_head/monthly_cd_head_v5_final.pt")
PATCHES_META_PATH = Path("/workspace/xuannv_show/data/harbin/patches_meta.json")

# S2 RGB loader (lazy import to avoid heavy deps at module load)
_load_patch_source_rgb = None


def _get_rgb_loader():
    global _load_patch_source_rgb
    if _load_patch_source_rgb is None:
        from demo_v2.engines.patch_image_loader import load_patch_source_rgb
        _load_patch_source_rgb = load_patch_source_rgb
    return _load_patch_source_rgb


def _get_freest_device() -> torch.device:
    """选择显存剩余最多的 GPU；若无可用的则回退到 CPU."""
    if not torch.cuda.is_available():
        return torch.device("cpu")

    # 优先通过 nvidia-smi 查询显存（不依赖 PyTorch CUDA context，更稳定）
    import shutil
    import subprocess

    nvidia_smi = shutil.which("nvidia-smi")
    if nvidia_smi:
        try:
            output = subprocess.check_output(
                [
                    nvidia_smi,
                    "--query-gpu=index,memory.free",
                    "--format=csv,noheader,nounits",
                ],
                text=True,
                timeout=5,
            )
            max_free = -1
            best_idx = 0
            for line in output.strip().splitlines():
                parts = line.split(",")
                if len(parts) >= 2:
                    idx = int(parts[0].strip())
                    free = int(parts[1].strip())
                    if free > max_free:
                        max_free = free
                        best_idx = idx
            return torch.device(f"cuda:{best_idx}")
        except Exception:
            pass

    # fallback: 使用 PyTorch API（可能因 CUDA context OOM 失败）
    max_free = -1
    best_idx = 0
    for i in range(torch.cuda.device_count()):
        try:
            free, _ = torch.cuda.mem_get_info(i)
            if free > max_free:
                max_free = free
                best_idx = i
        except Exception:
            continue
    return torch.device(f"cuda:{best_idx}")


class ChangeDetectionEngine:
    """变化检测推理引擎 — 加载 embedding + CD Head 生成结果图."""

    def __init__(self, device: str | None = None) -> None:
        if device is None:
            self.device = _get_freest_device()
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

    def load_embedding_pca_rgb(self, patch_id: str, month: str, out_size: int = 256) -> np.ndarray | None:
        """加载 embedding 并做 PCA -> RGB 可视化."""
        from sklearn.decomposition import PCA

        path = EMBEDDING_DIR / f"{patch_id}_{month}.npy"
        if not path.exists():
            return None
        try:
            emb = np.load(path)  # [D, H, W]
            D, H, W = emb.shape
            pca = PCA(n_components=3)
            flat = emb.reshape(D, -1).T
            rgb = pca.fit_transform(flat).T.reshape(3, H, W)
            rgb = np.transpose(rgb, (1, 2, 0))

            for c in range(3):
                ch = rgb[:, :, c]
                p1, p99 = np.percentile(ch, [1, 99])
                ch = (ch - p1) / (p99 - p1 + 1e-8)
                ch = np.clip(ch, 0, 1)
                ch = np.power(ch, 0.6)
                rgb[:, :, c] = ch

            rgb = (rgb * 255).astype(np.uint8)
            pil_img = Image.fromarray(rgb).resize((out_size, out_size), Image.Resampling.BICUBIC)
            return np.array(pil_img).astype(np.float32) / 255.0
        except Exception:
            return None

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

    def load_s2_rgb_natural(self, patch_id: str, month: str, out_size: int = 256) -> np.ndarray | None:
        """加载 S2 RGB 原始影像，使用固定反射率范围归一化，不做动态 percentile stretch.

        Sentinel-2 地表反射率值通常已除以 10000，典型范围 0~0.3。
        使用固定范围 [0, 3500]（反射率 0~0.35）线性映射到 [0, 255]，
        避免动态 stretch 放大噪声。
        """
        import rasterio
        from demo_v2.utils.constants import TIME_WINDOWS, RAW_DIR
        from demo_v2.engines.patch_image_loader import _find_best_tif

        window = TIME_WINDOWS.get(month)
        if window is None:
            return None

        source_dir = RAW_DIR / "s2" / patch_id
        tif_path = _find_best_tif(source_dir, window[0], window[1])
        if tif_path is None:
            return None

        try:
            with rasterio.open(str(tif_path)) as ds:
                data = ds.read()  # [C, H, W], reflectance * 10000

            if data.shape[0] >= 4:
                rgb = data[[2, 1, 0]].astype(np.float32)  # B4(R), B3(G), B2(B)
            elif data.shape[0] >= 3:
                rgb = data[:3].astype(np.float32)
            else:
                return None

            # 固定范围线性映射: [0, 3500] -> [0, 1]
            # 3500 = 反射率 0.35，覆盖绝大多数地表场景
            rgb = np.clip(rgb / 3500.0, 0, 1)
            rgb = rgb.transpose(1, 2, 0)

            # Resize if needed (LANCZOS for best quality)
            if rgb.shape[0] != out_size or rgb.shape[1] != out_size:
                pil = Image.fromarray((rgb * 255).astype(np.uint8))
                pil = pil.resize((out_size, out_size), Image.Resampling.LANCZOS)
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
        img = self.render_pred_heatmap(probs, size=size)
        # 添加1px浅灰边框，让每个patch看起来像独立的item
        from PIL import ImageDraw
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 0, size - 1, size - 1], outline="#e2e8f0", width=1)
        return img

    def render_detail_figure(
        self,
        patch_id: str,
        before_month: str,
        after_month: str,
        panel_size: int = 256,
    ) -> Image.Image:
        """生成弹窗用的详情图 (Before S2 / After S2 / Before Emb / After Emb / Pred 五列)."""
        probs = self.infer(patch_id, before_month, after_month)

        # 加载5张图
        s2_b = self.load_s2_rgb_natural(patch_id, before_month, out_size=panel_size)
        s2_a = self.load_s2_rgb_natural(patch_id, after_month, out_size=panel_size)
        emb_b = self.load_embedding_pca_rgb(patch_id, before_month, out_size=panel_size)
        emb_a = self.load_embedding_pca_rgb(patch_id, after_month, out_size=panel_size)
        pred_img = self.render_pred_heatmap(probs, size=panel_size)

        # 缺失时用灰色填充
        placeholder = np.full((panel_size, panel_size, 3), 0.85, dtype=np.float32)
        s2_b = s2_b if s2_b is not None else placeholder
        s2_a = s2_a if s2_a is not None else placeholder
        emb_b = emb_b if emb_b is not None else placeholder
        emb_a = emb_a if emb_a is not None else placeholder

        imgs = [
            Image.fromarray((np.clip(s2_b, 0, 1) * 255).astype(np.uint8)),
            Image.fromarray((np.clip(s2_a, 0, 1) * 255).astype(np.uint8)),
            Image.fromarray((np.clip(emb_b, 0, 1) * 255).astype(np.uint8)),
            Image.fromarray((np.clip(emb_a, 0, 1) * 255).astype(np.uint8)),
            pred_img,
        ]

        gap = 24
        total_w = panel_size * 5 + gap * 4
        total_h = panel_size + 60  # 60px for labels
        canvas = Image.new("RGB", (total_w, total_h), (248, 250, 252))

        # 粘贴每张图（y偏移60px给标签留空间）
        for i, img in enumerate(imgs):
            x = i * (panel_size + gap)
            canvas.paste(img, (x, 60))

        # 在顶部绘制5个中文标签
        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(canvas)
        labels = ["前期影像", "后期影像", "变化前嵌入", "变化后嵌入", "变化概率"]
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 14)
        except Exception:
            font = ImageFont.load_default()

        for i, label in enumerate(labels):
            x = i * (panel_size + gap) + panel_size // 2
            bbox = draw.textbbox((0, 0), label, font=font)
            text_w = bbox[2] - bbox[0]
            text_x = x - text_w // 2
            draw.text((text_x, 20), label, fill="#64748b", font=font)

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
        mosaic = Image.new("RGB", (mosaic_w, mosaic_h), (248, 250, 252))

        for (ix, iy), pid in self._grid.items():
            col = ix - self.ix_min
            row = iy - self.iy_min
            try:
                tile = self.render_mosaic_tile(pid, before_month, after_month, tile_size)
            except FileNotFoundError:
                # 缺失 embedding，用灰色块
                tile = Image.new("RGB", (tile_size, tile_size), (248, 250, 252))

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
