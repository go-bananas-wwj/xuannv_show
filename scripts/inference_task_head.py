#!/usr/bin/env python3
"""
Task Head 推理脚本 — 在全部 patch 上生成概率图

用法:
  python scripts/inference_task_head.py --task construction --month 2025-10 --device cuda

输出:
  data/harbin/predictions/<task>/<patch_id>_2025-10.npy  (64×64 概率图, float32)
"""

import argparse
import json
import os
from pathlib import Path

import numpy as np
import torch
from tqdm import tqdm

from train_task_head import TaskHead

EMBEDDING_DIR = "/workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025"
MODEL_DIR = "/workspace/xuannv_show/data/harbin/models"
OUTPUT_DIR = "/workspace/xuannv_show/data/harbin/predictions"


def load_best_model(task_name: str, device: str):
    """加载最佳 fold 的模型（取平均 Dice 最高的 fold）。"""
    task_model_dir = os.path.join(MODEL_DIR, task_name)
    summary_path = os.path.join(task_model_dir, "training_summary.json")

    if not os.path.exists(summary_path):
        raise FileNotFoundError(f"找不到训练摘要: {summary_path}")

    with open(summary_path) as f:
        summary = json.load(f)

    # 找到最佳 fold
    best_fold = max(summary["fold_results"], key=lambda x: x["best_dice"])
    fold_idx = best_fold["fold"]
    print(f"[{task_name}] 加载最佳模型: Fold {fold_idx}, Dice={best_fold['best_dice']:.4f}")

    model_path = os.path.join(task_model_dir, f"best_fold{fold_idx}.pt")
    checkpoint = torch.load(model_path, map_location=device)

    model = TaskHead(in_channels=128).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model


def run_inference(task_name: str, month: str, device: str, batch_size: int = 32):
    """在全部 patch 上运行推理。"""
    device = torch.device(device if torch.cuda.is_available() else "cpu")
    print(f"🖥️  设备: {device}")

    # 加载模型
    model = load_best_model(task_name, device)

    # 收集所有 embedding 文件
    emb_files = sorted(Path(EMBEDDING_DIR).glob(f"*_{month}.npy"))
    print(f"📊 共 {len(emb_files)} 个 patch 待推理")

    # 创建输出目录
    task_out_dir = os.path.join(OUTPUT_DIR, task_name)
    os.makedirs(task_out_dir, exist_ok=True)

    # 批量推理
    batch_embs = []
    batch_pids = []

    for emb_file in tqdm(emb_files, desc=f"推理 {task_name}"):
        patch_id = emb_file.stem.replace(f"_{month}", "")
        emb = np.load(emb_file)  # [128, 64, 64]
        emb = torch.from_numpy(emb).float()
        batch_embs.append(emb)
        batch_pids.append(patch_id)

        if len(batch_embs) >= batch_size:
            _save_batch(model, batch_embs, batch_pids, task_out_dir, month, device)
            batch_embs = []
            batch_pids = []

    # 处理剩余
    if batch_embs:
        _save_batch(model, batch_embs, batch_pids, task_out_dir, month, device)

    print(f"✅ 推理完成，结果保存至: {task_out_dir}")


@torch.no_grad()
def _save_batch(model, batch_embs, batch_pids, out_dir, month, device):
    batch = torch.stack(batch_embs).to(device)  # [B, 128, 64, 64]
    preds = torch.sigmoid(model(batch))  # [B, 1, 64, 64]
    preds = preds.squeeze(1).cpu().numpy()  # [B, 64, 64]

    for pid, pred in zip(batch_pids, preds):
        out_path = os.path.join(out_dir, f"{pid}_{month}.npy")
        np.save(out_path, pred.astype(np.float32))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", type=str, required=True, choices=["construction", "building_change", "farmland"])
    parser.add_argument("--month", type=str, default="2025-10")
    parser.add_argument("--device", type=str, default="cuda")
    parser.add_argument("--batch_size", type=int, default=32)
    args = parser.parse_args()

    run_inference(args.task, args.month, args.device, args.batch_size)


if __name__ == "__main__":
    main()
