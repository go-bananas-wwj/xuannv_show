#!/usr/bin/env python3
"""
Task Head 推理脚本 v2 — 两期 Embedding 差分输入

支持单模型推理或 5-Fold Ensemble 集成推理（demolition 默认 ensemble）

输出: data/harbin/predictions_v2/<task>/<period>/<patch_id>.npy
"""

import argparse
import json
import os
from pathlib import Path

import numpy as np
import torch
from tqdm import tqdm

from train_task_head_v2 import TaskHead, ALL_PERIODS

EMBEDDING_DIR = "/workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025"
MODEL_DIR = "/workspace/xuannv_show/data/harbin/models_v2"
OUTPUT_DIR = "/workspace/xuannv_show/data/harbin/predictions_v2"

# 样本极少的任务使用 ensemble 更稳定
ENSEMBLE_TASKS = {"demolition"}


def load_single_model(task_name: str, fold_idx: int, device: str):
    model_path = os.path.join(MODEL_DIR, task_name, f"best_fold{fold_idx}.pt")
    checkpoint = torch.load(model_path, map_location=device, weights_only=True)
    model = TaskHead(in_channels=128).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model


def load_ensemble_models(task_name: str, device: str):
    """加载所有 fold 的模型用于集成推理."""
    task_model_dir = os.path.join(MODEL_DIR, task_name)
    summary_path = os.path.join(task_model_dir, "training_summary.json")

    with open(summary_path) as f:
        summary = json.load(f)

    models = []
    for fold_info in summary["fold_results"]:
        fold_idx = fold_info["fold"]
        model = load_single_model(task_name, fold_idx, device)
        models.append(model)
        print(f"  Loaded fold {fold_idx}: dice={fold_info['best_dice']:.4f} @ epoch {fold_info['best_epoch']}")

    print(f"[{task_name}] Ensemble: {len(models)} folds")
    return models


def run_inference(task_name: str, device: str, batch_size: int = 32, ensemble: bool = False):
    device = torch.device(device if torch.cuda.is_available() else "cpu")
    print(f"🖥️  设备: {device}")

    use_ensemble = ensemble or (task_name in ENSEMBLE_TASKS)

    if use_ensemble:
        models = load_ensemble_models(task_name, device)
    else:
        task_model_dir = os.path.join(MODEL_DIR, task_name)
        summary_path = os.path.join(task_model_dir, "training_summary.json")
        with open(summary_path) as f:
            summary = json.load(f)
        # 排除 epoch=0 的随机初始化模型
        valid_folds = [r for r in summary["fold_results"] if r["best_epoch"] > 0]
        if not valid_folds:
            valid_folds = summary["fold_results"]
        best_fold = max(valid_folds, key=lambda x: x["best_dice"])
        fold_idx = best_fold["fold"]
        print(f"[{task_name}] 加载最佳模型: Fold {fold_idx}, Dice={best_fold['best_dice']:.4f}")
        models = [load_single_model(task_name, fold_idx, device)]

    # 收集所有 patch_id
    emb_files = sorted(Path(EMBEDDING_DIR).glob("*_2025-04.npy"))
    all_patch_ids = [f.stem.replace("_2025-04", "") for f in emb_files]
    print(f"📊 共 {len(all_patch_ids)} 个 patch")

    for before, after in ALL_PERIODS:
        period_str = f"{before}_vs_{after}"
        print(f"\n📅 推理时间对: {period_str}")

        task_out_dir = os.path.join(OUTPUT_DIR, task_name, period_str)
        os.makedirs(task_out_dir, exist_ok=True)

        batch_diffs = []
        batch_pids = []

        for patch_id in tqdm(all_patch_ids, desc=f"  {period_str}"):
            emb_before_path = os.path.join(EMBEDDING_DIR, f"{patch_id}_{before}.npy")
            emb_after_path = os.path.join(EMBEDDING_DIR, f"{patch_id}_{after}.npy")

            if not os.path.exists(emb_before_path) or not os.path.exists(emb_after_path):
                continue

            emb_before = np.load(emb_before_path)
            emb_after = np.load(emb_after_path)
            diff = emb_after - emb_before
            diff = torch.from_numpy(diff).float()

            batch_diffs.append(diff)
            batch_pids.append(patch_id)

            if len(batch_diffs) >= batch_size:
                _save_batch(models, batch_diffs, batch_pids, task_out_dir, device, use_ensemble)
                batch_diffs = []
                batch_pids = []

        if batch_diffs:
            _save_batch(models, batch_diffs, batch_pids, task_out_dir, device, use_ensemble)

        print(f"  ✅ 完成，结果保存至: {task_out_dir}")


@torch.no_grad()
def _save_batch(models, batch_diffs, batch_pids, out_dir, device, use_ensemble: bool):
    batch = torch.stack(batch_diffs).to(device)

    if use_ensemble:
        # 所有模型预测后取平均
        preds = []
        for model in models:
            preds.append(torch.sigmoid(model(batch)))
        pred = torch.stack(preds).mean(dim=0)
    else:
        pred = torch.sigmoid(models[0](batch))

    pred = pred.squeeze(1).cpu().numpy()

    for pid, p in zip(batch_pids, pred):
        out_path = os.path.join(out_dir, f"{pid}.npy")
        np.save(out_path, p.astype(np.float32))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", type=str, required=True, choices=["construction", "demolition", "land_conversion"])
    parser.add_argument("--device", type=str, default="cuda")
    parser.add_argument("--batch_size", type=int, default=32)
    parser.add_argument("--ensemble", action="store_true", help="使用 5-Fold 集成推理")
    args = parser.parse_args()

    run_inference(args.task, args.device, args.batch_size, args.ensemble)


if __name__ == "__main__":
    main()
