#!/usr/bin/env python3
"""
Xuannv Embeddings & Downstream Tasks Visualization

Quick-start visualization script for the Xuannv Harbin Dataset.

Usage:
    python visualize.py --data-dir ./xuannv_demo/mini_test --model-dir ./xuannv_demo/models --output ./viz

Dependencies:
    pip install torch numpy scipy scikit-learn joblib matplotlib pillow
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

import joblib
import matplotlib
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from matplotlib.patches import Patch
from sklearn.decomposition import PCA

matplotlib.use("Agg")


# ---------------------------------------------------------------------------
# Model definitions (must match training architecture exactly)
# ---------------------------------------------------------------------------

class ECA(nn.Module):
    """Efficient Channel Attention (ECA) module."""

    def __init__(self, channels: int, gamma: float = 2.0, b: float = 1.0) -> None:
        super().__init__()
        kernel_size = int(abs((math.log(channels, 2) + b) / gamma))
        kernel_size = kernel_size if kernel_size % 2 else kernel_size + 1
        self.avg_pool = nn.AdaptiveAvgPool2d(1)
        self.conv = nn.Conv1d(1, 1, kernel_size, padding=kernel_size // 2, bias=False)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = self.avg_pool(x)
        y = self.conv(y.squeeze(-1).transpose(-1, -2))
        y = y.transpose(-1, -2).unsqueeze(-1)
        return x * self.sigmoid(y)


class ChangeDetectionHeadV3(nn.Module):
    """V2 + ECA channel-attention enhanced change-detection head."""

    def __init__(self, embedding_dim: int = 128, hidden_dim: int = 64, dropout: float = 0.3) -> None:
        super().__init__()
        in_dim = embedding_dim * 4
        self.encoder = nn.Sequential(
            nn.Conv2d(in_dim, hidden_dim, 3, padding=1),
            nn.BatchNorm2d(hidden_dim),
            nn.ReLU(),
        )
        self.res1 = nn.Sequential(
            nn.Conv2d(hidden_dim, hidden_dim, 3, padding=1),
            nn.BatchNorm2d(hidden_dim),
            nn.ReLU(),
            nn.Conv2d(hidden_dim, hidden_dim, 3, padding=1),
            nn.BatchNorm2d(hidden_dim),
        )
        self.eca = ECA(hidden_dim)
        self.res2 = nn.Sequential(
            nn.Conv2d(hidden_dim, hidden_dim, 3, padding=1),
            nn.BatchNorm2d(hidden_dim),
            nn.ReLU(),
            nn.Conv2d(hidden_dim, hidden_dim, 3, padding=1),
            nn.BatchNorm2d(hidden_dim),
        )
        self.out = nn.Sequential(
            nn.ReLU(),
            nn.Conv2d(hidden_dim, hidden_dim // 2, 3, padding=1),
            nn.BatchNorm2d(hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout2d(dropout),
            nn.Conv2d(hidden_dim // 2, 1, 1),
        )

    def forward(self, emb_before: torch.Tensor, emb_after: torch.Tensor) -> torch.Tensor:
        diff = emb_before - emb_after
        feat = torch.cat([torch.abs(diff), emb_before * emb_after, emb_before, emb_after], dim=1)
        x = self.encoder(feat)
        x = F.relu(self.res1(x) + x)
        x = self.eca(x)
        x = F.relu(self.res2(x) + x)
        return self.out(x)


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def pca_rgb(emb: np.ndarray, seed: int = 42) -> np.ndarray:
    """Project 128-dim embedding to 3-dim RGB via PCA."""
    h, w = emb.shape[1], emb.shape[2]
    flat = emb.transpose(1, 2, 0).reshape(-1, emb.shape[0])
    pca = PCA(n_components=3, random_state=seed)
    rgb = pca.fit_transform(flat).reshape(h, w, 3)
    rgb = (rgb - rgb.min()) / (rgb.max() - rgb.min() + 1e-8)
    return rgb.astype(np.float32)


def load_cd_head(checkpoint_path: str | Path, device: str = "cpu") -> ChangeDetectionHeadV3:
    """Load ChangeDetectionHeadV3 from a checkpoint file."""
    ckpt = torch.load(str(checkpoint_path), map_location=device, weights_only=False)
    cfg = ckpt["config"]
    model = ChangeDetectionHeadV3(
        embedding_dim=cfg["embedding_dim"],
        hidden_dim=cfg["hidden_dim"],
        dropout=cfg.get("dropout", 0.4),
    )
    model.load_state_dict(ckpt["cd_head"])
    model.to(device)
    model.eval()
    return model


def load_classifier(model_dir: Path, task: str):
    """Load a downstream classification model."""
    mapping = {
        "worldcover": "sklearn_models/worldcover_linear_probe.pkl",
        "dynamic_world": "sklearn_models/dynamic_world_sklearn_mlp.pkl",
        "jrc_water": "sklearn_models/jrc_water_sklearn_mlp.pkl",
        "building": "sklearn_models/building_sklearn_mlp.pkl",
    }
    if task not in mapping:
        raise ValueError(f"Unknown task: {task}. Supported: {list(mapping.keys())}")
    path = model_dir / mapping[task]
    return joblib.load(str(path))


def classify(emb: np.ndarray, model_data: dict) -> np.ndarray:
    """Run pixel-wise classification on an embedding."""
    scaler = model_data["scaler"]
    model = model_data["model"]
    d, h, w = emb.shape
    flat = emb.reshape(d, -1).T
    pred = model.predict(scaler.transform(flat)).reshape(h, w).astype(np.int32)
    return pred


def cd_infer(
    model: ChangeDetectionHeadV3,
    emb_before: np.ndarray,
    emb_after: np.ndarray,
    device: str = "cpu",
) -> np.ndarray:
    """Run change-detection inference. Returns probability map [0, 1]."""
    with torch.no_grad():
        eb = torch.from_numpy(emb_before).unsqueeze(0).float().to(device)
        ea = torch.from_numpy(emb_after).unsqueeze(0).float().to(device)
        logits = model(eb, ea)
        prob = torch.sigmoid(logits).squeeze().cpu().numpy()
    return prob


# ---------------------------------------------------------------------------
# Visualization routines
# ---------------------------------------------------------------------------

# Chinese -> English translation for class names (avoids missing font glyphs)
_CLASS_NAME_CN2EN = {
    "水体": "Water",
    "树木": "Tree",
    "草地": "Grassland",
    "flooded veg": "Flooded Veg",
    "农田": "Cropland",
    "灌丛": "Shrubland",
    "建筑": "Built-up",
    "裸地": "Bare",
    "冰雪": "Snow/Ice",
    "非水体": "Non-water",
    "非建筑": "Non-building",
}


def _tr_name(name: str) -> str:
    return _CLASS_NAME_CN2EN.get(name, name)


def _add_class_legend(ax, colors, names, ncol=3, fontsize=7):
    """Add a legend for discrete class colors below the axes."""
    patches = []
    for idx, (name, color) in enumerate(zip(names, colors)):
        if isinstance(color, (list, tuple, np.ndarray)):
            c = np.array(color) / 255.0 if max(color) > 1 else color
        else:
            c = color
        label = f"{idx}: {_tr_name(name)}"
        patches.append(Patch(facecolor=c, edgecolor="none", label=label))
    ax.legend(
        handles=patches,
        loc="upper center",
        bbox_to_anchor=(0.5, -0.02),
        ncol=ncol,
        fontsize=fontsize,
        frameon=False,
        borderpad=0.2,
        handletextpad=0.3,
    )


def plot_embeddings(
    emb_dict: dict[str, np.ndarray],
    out_path: Path,
    title: str = "Embedding PCA-RGB Visualization",
) -> None:
    """Visualize multiple embeddings side-by-side."""
    n = len(emb_dict)
    fig, axes = plt.subplots(1, n, figsize=(5 * n, 5))
    if n == 1:
        axes = [axes]
    for ax, (name, emb) in zip(axes, emb_dict.items()):
        ax.imshow(pca_rgb(emb))
        ax.set_title(name, fontsize=12)
        ax.axis("off")
    fig.suptitle(title, fontsize=14, fontweight="bold")
    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(str(out_path), dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"[Saved] {out_path}")


def plot_change_detection(
    emb_before: np.ndarray,
    emb_after: np.ndarray,
    prob: np.ndarray,
    out_path: Path,
    before_label: str = "Before",
    after_label: str = "After",
) -> None:
    """Visualize change-detection results with colorbar."""
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.5))

    axes[0].imshow(pca_rgb(emb_before))
    axes[0].set_title(before_label, fontsize=12)
    axes[0].axis("off")

    axes[1].imshow(pca_rgb(emb_after))
    axes[1].set_title(after_label, fontsize=12)
    axes[1].axis("off")

    im = axes[2].imshow(prob, cmap="hot", vmin=0, vmax=1)
    axes[2].set_title(
        f"Change Probability\n(mean={prob.mean():.3f}, >0.5={(prob > 0.5).mean():.1%})",
        fontsize=12,
    )
    axes[2].axis("off")
    cbar = plt.colorbar(im, ax=axes[2], fraction=0.046, pad=0.04, label="Probability")
    cbar.ax.tick_params(labelsize=9)

    fig.suptitle(f"Change Detection: {before_label} -> {after_label}", fontsize=14, fontweight="bold")
    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(str(out_path), dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"[Saved] {out_path}")


def plot_classification(
    emb: np.ndarray,
    results: dict[str, dict],
    out_path: Path,
    ref_title: str = "Reference: Embedding PCA-RGB",
) -> None:
    """Visualize classification results with class legends."""
    n_tasks = len(results)
    cols = 3
    rows = math.ceil((n_tasks + 1) / cols)
    fig, axes = plt.subplots(rows, cols, figsize=(5.5 * cols, 5.5 * rows))
    axes = axes.flatten() if rows > 1 else [axes] if cols == 1 else axes.flatten()

    # Reference
    axes[0].imshow(pca_rgb(emb))
    axes[0].set_title(ref_title, fontsize=12)
    axes[0].axis("off")

    for idx, (task, data) in enumerate(results.items(), start=1):
        pred = data["pred"]
        colors = np.array(data.get("colors", []), dtype=np.uint8)
        names = data.get("names", [])
        if len(colors) > 0:
            rgb = colors[pred]
        else:
            rgb = plt.cm.tab10(pred / (pred.max() + 1e-8))
        axes[idx].imshow(rgb)
        title = task.replace("_", " ").title()
        if len(names) > 0:
            title += f" ({len(names)} classes)"
        axes[idx].set_title(title, fontsize=12)
        axes[idx].axis("off")

        # Add class legend
        if len(colors) > 0 and len(names) > 0:
            ncol = min(len(names), 4)
            _add_class_legend(axes[idx], colors[: len(names)], names, ncol=ncol, fontsize=7)

    for idx in range(n_tasks + 1, len(axes)):
        axes[idx].axis("off")

    fig.suptitle("Downstream Classification Tasks", fontsize=14, fontweight="bold", y=1.01)
    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(str(out_path), dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"[Saved] {out_path}")


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run_pipeline(data_dir: Path, model_dir: Path, output_dir: Path, device: str = "cpu") -> None:
    """Run the full visualization pipeline."""
    emb_dir = data_dir / "mini_test" / "embeddings" / "v5_mixed_scale" / "monthly_embeddings_2025"
    if not emb_dir.exists():
        emb_dir = data_dir / "embeddings" / "v5_mixed_scale" / "monthly_embeddings_2025"
    if not emb_dir.exists():
        raise FileNotFoundError(f"Embedding directory not found: {emb_dir}")

    emb_files = sorted(emb_dir.glob("patch_*.npy"))
    if len(emb_files) < 2:
        raise ValueError(f"Need at least 2 embedding files, found {len(emb_files)}")

    embs = {}
    for f in emb_files:
        month = f.stem.split("_")[-1]
        embs[month] = np.load(str(f))
    print(f"Loaded {len(embs)} embeddings from {emb_dir}")

    # 1. Embedding visualization
    print("\n[1/3] Generating embedding visualization...")
    plot_embeddings(embs, output_dir / "01_embeddings.png", title="Embedding PCA-RGB")

    # 2. Change detection
    print("\n[2/3] Running change detection...")
    months = list(embs.keys())
    cd_ckpt = model_dir / "cd_head" / "monthly_cd_head_v5_final.pt"
    cd_model = load_cd_head(cd_ckpt, device=device)
    prob = cd_infer(cd_model, embs[months[0]], embs[months[-1]], device=device)
    plot_change_detection(
        embs[months[0]],
        embs[months[-1]],
        prob,
        output_dir / "02_change_detection.png",
        before_label=months[0],
        after_label=months[-1],
    )

    # 3. Classification tasks
    print("\n[3/3] Running classification tasks...")
    tasks = ["worldcover", "dynamic_world", "jrc_water", "building"]
    cls_results = {}
    for task in tasks:
        try:
            model_data = load_classifier(model_dir, task)
            pred = classify(embs[months[0]], model_data)
            cls_results[task] = {
                "pred": pred,
                "colors": model_data.get("colors", []),
                "names": model_data.get("class_names", []),
            }
            print(f"  {task:20s}: classes={len(model_data.get('class_names', []))}, unique={np.unique(pred)}")
        except Exception as e:
            print(f"  {task:20s}: FAILED - {e}")

    plot_classification(embs[months[0]], cls_results, output_dir / "03_classification.png")

    print(f"\nAll visualizations saved to: {output_dir.absolute()}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Xuannv Dataset Visualization")
    parser.add_argument("--data-dir", type=Path, default=Path("./xuannv_demo/mini_test"), help="Path to mini_test data directory")
    parser.add_argument("--model-dir", type=Path, default=Path("./xuannv_demo/models"), help="Path to downloaded models")
    parser.add_argument("--output", type=Path, default=Path("./viz"), help="Output directory for figures")
    parser.add_argument("--device", type=str, default="cpu", help="Device for PyTorch inference (cpu/cuda)")
    args = parser.parse_args()

    run_pipeline(args.data_dir, args.model_dir, args.output, device=args.device)


if __name__ == "__main__":
    main()
