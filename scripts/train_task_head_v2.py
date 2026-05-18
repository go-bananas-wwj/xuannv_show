#!/usr/bin/env python3
"""
Task Head 训练脚本 v2 — 两期 Embedding 差分输入

修复：
  1. 修复验证集泄露：对同一个 dataset 实例做 KFold
  2. 负样本比例 5:1，解决类别不平衡
  3. 动态 pos_weight 根据正样本像素占比
  4. 增加 epochs 和 patience
  5. 保存完整训练日志
"""

import argparse
import json
import os
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader, Subset
from sklearn.model_selection import KFold
from tqdm import tqdm

# ============ 配置 ============
EMBEDDING_DIR = "/workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025"
LABELS_DIR = "/workspace/xuannv_show/data/harbin/labels_v2"
OUTPUT_DIR = "/workspace/xuannv_show/data/harbin/models_v2"
GRID_SIZE = 64
IN_CHANNELS = 128

ALL_PERIODS = [
    ("2025-04", "2025-06"),
    ("2025-08", "2025-09"),
    ("2025-09", "2025-10"),
]


# ============ 模型 ============
class TaskHead(nn.Module):
    def __init__(self, in_channels=128, hidden_dim=256):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Conv2d(in_channels, hidden_dim, 3, padding=1),
            nn.BatchNorm2d(hidden_dim),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden_dim, hidden_dim, 3, padding=1),
            nn.BatchNorm2d(hidden_dim),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden_dim, hidden_dim // 2, 3, padding=1),
            nn.BatchNorm2d(hidden_dim // 2),
            nn.ReLU(inplace=True),
        )
        self.decoder = nn.Sequential(
            nn.Conv2d(hidden_dim // 2, 128, 3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.Conv2d(128, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 1, 1),
        )

    def forward(self, x):
        feat = self.encoder(x)
        out = self.decoder(feat)
        return out


# ============ 数据集 ============
class ChangeDetectionDataset(Dataset):
    def __init__(
        self,
        task_name: str,
        periods=None,
        negative_ratio: int = 5,
        augment: bool = True,
        seed: int = 42,
    ):
        self.task_name = task_name
        self.periods = periods or ALL_PERIODS
        self.augment = augment
        rng = random.Random(seed)

        # 收集所有正样本
        self.positive_samples = []
        for before, after in self.periods:
            period_str = f"{before}_vs_{after}"
            meta_path = os.path.join(LABELS_DIR, task_name, period_str, "meta.json")
            if not os.path.exists(meta_path):
                continue
            with open(meta_path) as f:
                meta = json.load(f)
            for p in meta["patches"]:
                self.positive_samples.append({
                    "patch_id": p["patch_id"],
                    "before": before,
                    "after": after,
                    "period": period_str,
                })

        # 负样本采样
        all_emb_files = list(Path(EMBEDDING_DIR).glob("*.npy"))
        all_patch_ids = set()
        for f in all_emb_files:
            pid = f.stem.rsplit("_", 1)[0]
            all_patch_ids.add(pid)

        positive_ids = {s["patch_id"] for s in self.positive_samples}
        negative_candidates = sorted(list(all_patch_ids - positive_ids))

        n_neg = min(len(self.positive_samples) * negative_ratio, len(negative_candidates))
        rng.shuffle(negative_candidates)
        self.negative_patch_ids = negative_candidates[:n_neg]

        self.negative_samples = []
        for pid in self.negative_patch_ids:
            before, after = rng.choice(self.periods)
            self.negative_samples.append({
                "patch_id": pid,
                "before": before,
                "after": after,
                "period": f"{before}_vs_{after}",
            })

        self.samples = self.positive_samples + self.negative_samples
        self.labels = [1] * len(self.positive_samples) + [0] * len(self.negative_samples)

        # 计算正样本像素占比，用于动态 pos_weight
        total_pos_pixels = 0
        total_pixels = 0
        for before, after in self.periods:
            period_str = f"{before}_vs_{after}"
            meta_path = os.path.join(LABELS_DIR, task_name, period_str, "meta.json")
            if not os.path.exists(meta_path):
                continue
            with open(meta_path) as f:
                meta = json.load(f)
            for p in meta["patches"]:
                total_pos_pixels += p["positive_pixels"]
                total_pixels += GRID_SIZE * GRID_SIZE
        self.pos_ratio = total_pos_pixels / max(total_pixels, 1)
        print(f"[{task_name}] 正样本: {len(self.positive_samples)}, 负样本: {len(self.negative_samples)}, 正像素比: {self.pos_ratio:.4f}")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        sample = self.samples[idx]
        label = self.labels[idx]
        patch_id = sample["patch_id"]
        before = sample["before"]
        after = sample["after"]

        emb_before = np.load(os.path.join(EMBEDDING_DIR, f"{patch_id}_{before}.npy"))
        emb_after = np.load(os.path.join(EMBEDDING_DIR, f"{patch_id}_{after}.npy"))
        diff = torch.from_numpy(emb_after - emb_before).float()

        if label == 1:
            mask = np.load(os.path.join(LABELS_DIR, self.task_name, sample["period"], f"{patch_id}.npy"))
        else:
            mask = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.float32)
        mask = torch.from_numpy(mask).float().unsqueeze(0)

        if self.augment:
            if random.random() > 0.5:
                diff = torch.flip(diff, dims=[2])
                mask = torch.flip(mask, dims=[2])
            if random.random() > 0.5:
                diff = torch.flip(diff, dims=[1])
                mask = torch.flip(mask, dims=[1])
            if random.random() > 0.5:
                k = random.choice([1, 2, 3])
                diff = torch.rot90(diff, k=k, dims=[1, 2])
                mask = torch.rot90(mask, k=k, dims=[1, 2])

        return diff, mask, patch_id


# ============ 损失函数 ============
class BCEDiceLoss(nn.Module):
    def __init__(self, bce_weight=1.0, dice_weight=1.0, pos_ratio=0.01):
        super().__init__()
        self.bce_weight = bce_weight
        self.dice_weight = dice_weight
        # 动态 pos_weight: 让正负样本在损失中贡献平衡
        # pos_weight ≈ (1 - pos_ratio) / pos_ratio
        self.pos_weight = max(1.0, (1.0 - pos_ratio) / max(pos_ratio, 1e-6))
        print(f"  BCEDiceLoss pos_weight={self.pos_weight:.2f} (pos_ratio={pos_ratio:.4f})")

    def forward(self, pred, target):
        pw = torch.tensor([self.pos_weight], device=pred.device, dtype=pred.dtype)
        bce_loss = F.binary_cross_entropy_with_logits(pred, target, pos_weight=pw)

        pred_prob = torch.sigmoid(pred)
        smooth = 1e-6
        intersection = (pred_prob * target).sum(dim=(1, 2, 3))
        union = pred_prob.sum(dim=(1, 2, 3)) + target.sum(dim=(1, 2, 3))
        dice = (2.0 * intersection + smooth) / (union + smooth)
        dice_loss = 1.0 - dice.mean()

        return self.bce_weight * bce_loss + self.dice_weight * dice_loss


# ============ 评估 ============
@torch.no_grad()
def evaluate(model, dataloader, device):
    model.eval()
    total_dice = 0.0
    total_iou = 0.0
    total_precision = 0.0
    total_recall = 0.0
    n_pos = 0

    for diff, mask, _ in dataloader:
        diff = diff.to(device)
        mask = mask.to(device)
        pred = torch.sigmoid(model(diff))
        pred_bin = (pred > 0.5).float()

        # 只统计包含正像素的样本（负样本不参与 dice 平均，否则全 0 预测会得到 dice=1.0）
        pos_mask = mask.sum(dim=(1, 2, 3)) > 0
        if pos_mask.sum() == 0:
            continue

        smooth = 1e-6
        intersection = (pred_bin * mask).sum(dim=(1, 2, 3))
        dice = (2.0 * intersection + smooth) / (pred_bin.sum(dim=(1, 2, 3)) + mask.sum(dim=(1, 2, 3)) + smooth)
        iou = (intersection + smooth) / (pred_bin.sum(dim=(1, 2, 3)) + mask.sum(dim=(1, 2, 3)) - intersection + smooth)
        precision = (intersection + smooth) / (pred_bin.sum(dim=(1, 2, 3)) + smooth)
        recall = (intersection + smooth) / (mask.sum(dim=(1, 2, 3)) + smooth)

        total_dice += dice[pos_mask].sum().item()
        total_iou += iou[pos_mask].sum().item()
        total_precision += precision[pos_mask].sum().item()
        total_recall += recall[pos_mask].sum().item()
        n_pos += pos_mask.sum().item()

    if n_pos == 0:
        return {"dice": 0.0, "iou": 0.0, "precision": 0.0, "recall": 0.0}

    return {
        "dice": total_dice / n_pos,
        "iou": total_iou / n_pos,
        "precision": total_precision / n_pos,
        "recall": total_recall / n_pos,
    }


# ============ 训练 ============
def train_fold(model, train_loader, val_loader, device, epochs=300, lr=1e-3, patience=50,
               fold_idx=0, output_dir=None, pos_ratio=0.01):
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=15)
    criterion = BCEDiceLoss(bce_weight=1.0, dice_weight=1.0, pos_ratio=pos_ratio)

    best_dice = -1.0
    best_epoch = 0
    no_improve = 0
    history = []

    for epoch in range(epochs):
        model.train()
        epoch_loss = 0.0
        n_train = 0

        for diff, mask, _ in train_loader:
            diff = diff.to(device)
            mask = mask.to(device)
            optimizer.zero_grad()
            pred = model(diff)
            loss = criterion(pred, mask)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
            n_train += 1

        avg_loss = epoch_loss / max(n_train, 1)
        val_metrics = evaluate(model, val_loader, device)
        scheduler.step(val_metrics["dice"])
        history.append({"epoch": epoch, "loss": avg_loss, **val_metrics})

        if val_metrics["dice"] > best_dice:
            best_dice = val_metrics["dice"]
            best_epoch = epoch
            no_improve = 0
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
                torch.save({
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "dice": best_dice,
                }, os.path.join(output_dir, f"best_fold{fold_idx}.pt"))
        else:
            no_improve += 1

        if epoch % 10 == 0 or no_improve == 0:
            print(f"  Fold {fold_idx} Epoch {epoch}: loss={avg_loss:.4f}, val_dice={val_metrics['dice']:.4f}, "
                  f"val_iou={val_metrics['iou']:.4f}, val_prec={val_metrics['precision']:.4f}, val_recall={val_metrics['recall']:.4f}")

        if no_improve >= patience:
            print(f"  Fold {fold_idx} 早停于 epoch {epoch}, best_dice={best_dice:.4f} @ epoch {best_epoch}")
            break

    return best_dice, best_epoch, history


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", type=str, required=True, choices=["construction", "demolition", "land_conversion"])
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--epochs", type=int, default=300)
    parser.add_argument("--batch_size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--patience", type=int, default=50)
    parser.add_argument("--negative_ratio", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", type=str, default="cuda")
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)

    device = torch.device(args.device if torch.cuda.is_available() else "cpu")
    print(f"🖥️  设备: {device}")

    # 只创建一个 dataset 实例，避免验证集泄露
    dataset = ChangeDetectionDataset(
        task_name=args.task,
        negative_ratio=args.negative_ratio,
        augment=True,
        seed=args.seed,
    )

    if len(dataset) < args.folds:
        print(f"❌ 样本数 {len(dataset)} 小于折数 {args.folds}")
        return

    kfold = KFold(n_splits=args.folds, shuffle=True, random_state=args.seed)
    task_output_dir = os.path.join(OUTPUT_DIR, args.task)
    os.makedirs(task_output_dir, exist_ok=True)

    all_fold_results = []

    for fold_idx, (train_idx, val_idx) in enumerate(kfold.split(dataset)):
        print(f"\n{'='*60}")
        print(f"📂 Fold {fold_idx + 1}/{args.folds}")
        print(f"{'='*60}")

        train_subset = Subset(dataset, train_idx)
        # 关键修复：验证集直接从同一个 dataset 取，不再重新创建
        val_subset = Subset(dataset, val_idx)

        train_loader = DataLoader(train_subset, batch_size=args.batch_size, shuffle=True, num_workers=2, pin_memory=True)
        val_loader = DataLoader(val_subset, batch_size=args.batch_size, shuffle=False, num_workers=2, pin_memory=True)

        model = TaskHead(in_channels=IN_CHANNELS).to(device)
        print(f"  模型参数量: {sum(p.numel() for p in model.parameters()) / 1e3:.1f}K")

        best_dice, best_epoch, history = train_fold(
            model, train_loader, val_loader, device,
            epochs=args.epochs, lr=args.lr, patience=args.patience,
            fold_idx=fold_idx, output_dir=task_output_dir,
            pos_ratio=dataset.pos_ratio,
        )

        all_fold_results.append({"fold": fold_idx, "best_dice": best_dice, "best_epoch": best_epoch, "history": history})

    summary = {
        "task": args.task,
        "total_samples": len(dataset),
        "pos_ratio": dataset.pos_ratio,
        "folds": args.folds,
        "fold_results": [{"fold": r["fold"], "best_dice": r["best_dice"], "best_epoch": r["best_epoch"]} for r in all_fold_results],
        "mean_dice": float(np.mean([r["best_dice"] for r in all_fold_results])),
        "std_dice": float(np.std([r["best_dice"] for r in all_fold_results])),
    }

    with open(os.path.join(task_output_dir, "training_summary.json"), "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print(f"🎉 {args.task} 训练完成!")
    print(f"{'='*60}")
    print(f"  Mean Dice: {summary['mean_dice']:.4f} ± {summary['std_dice']:.4f}")
    for r in summary["fold_results"]:
        print(f"  Fold {r['fold']}: Dice={r['best_dice']:.4f} @ epoch {r['best_epoch']}")


if __name__ == "__main__":
    main()
