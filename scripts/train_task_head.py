#!/usr/bin/env python3
"""
Task Head 训练脚本 — Few-Shot 语义分割

基于 128 维 embedding 训练轻量级 CNN Head，输出 64×64 概率图。
适用于建筑工地、建筑变化、耕地非农非粮等任务。

训练策略:
  - 5-Fold 交叉验证
  - BCE + Dice Loss
  - 数据增强: 翻转、旋转
  - 负样本采样: 3× 正样本数
  - 早停 + 学习率衰减
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
LABELS_DIR = "/workspace/xuannv_show/data/harbin/labels"
OUTPUT_DIR = "/workspace/xuannv_show/data/harbin/models"

GRID_SIZE = 64
IN_CHANNELS = 128


# ============ 模型 ============
class TaskHead(nn.Module):
    """轻量级 CNN Head，参数量 ~300K。"""

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
        # x: [B, 128, H, W]
        feat = self.encoder(x)
        out = self.decoder(feat)
        return out  # [B, 1, H, W] logits


# ============ 数据集 ============
class PatchDataset(Dataset):
    """Patch-level 数据集: 加载 embedding + mask。"""

    def __init__(
        self,
        task_name: str,
        month: str = "2025-10",
        negative_ratio: int = 3,
        augment: bool = True,
    ):
        self.task_name = task_name
        self.month = month
        self.augment = augment

        # 加载标签元数据
        label_meta_path = os.path.join(LABELS_DIR, task_name, "meta.json")
        with open(label_meta_path) as f:
            self.label_meta = json.load(f)

        # 正样本 patch
        self.positive_patches = [p["patch_id"] for p in self.label_meta["patches"]]

        # 负样本采样
        all_patch_ids = {p["patch_id"] for p in self.label_meta["patches"]}
        # 从所有可用的 embedding 中采样负样本
        emb_files = list(Path(EMBEDDING_DIR).glob(f"*_{month}.npy"))
        available_ids = [f.stem.replace(f"_{month}", "") for f in emb_files]
        negative_candidates = [pid for pid in available_ids if pid not in all_patch_ids]

        n_neg = min(len(self.positive_patches) * negative_ratio, len(negative_candidates))
        self.negative_patches = random.sample(negative_candidates, n_neg)

        self.patch_ids = self.positive_patches + self.negative_patches
        self.labels = [1] * len(self.positive_patches) + [0] * len(self.negative_patches)

        print(f"[{task_name}] 正样本: {len(self.positive_patches)}, 负样本: {len(self.negative_patches)}, 总计: {len(self.patch_ids)}")

    def __len__(self):
        return len(self.patch_ids)

    def __getitem__(self, idx):
        patch_id = self.patch_ids[idx]
        label = self.labels[idx]

        # 加载 embedding
        emb_path = os.path.join(EMBEDDING_DIR, f"{patch_id}_{self.month}.npy")
        emb = np.load(emb_path)  # [128, 64, 64]
        emb = torch.from_numpy(emb).float()

        # 加载 mask
        if label == 1:
            mask_path = os.path.join(LABELS_DIR, self.task_name, f"{patch_id}.npy")
            mask = np.load(mask_path)  # [64, 64]
        else:
            mask = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.float32)
        mask = torch.from_numpy(mask).float().unsqueeze(0)  # [1, 64, 64]

        # 数据增强
        if self.augment:
            # 随机水平翻转
            if random.random() > 0.5:
                emb = torch.flip(emb, dims=[2])
                mask = torch.flip(mask, dims=[2])
            # 随机垂直翻转
            if random.random() > 0.5:
                emb = torch.flip(emb, dims=[1])
                mask = torch.flip(mask, dims=[1])
            # 随机旋转 90°
            if random.random() > 0.5:
                k = random.choice([1, 2, 3])
                emb = torch.rot90(emb, k=k, dims=[1, 2])
                mask = torch.rot90(mask, k=k, dims=[1, 2])

        return emb, mask, patch_id


# ============ 损失函数 ============
class BCEDiceLoss(nn.Module):
    def __init__(self, bce_weight=1.0, dice_weight=1.0, pos_weight=5.0):
        super().__init__()
        self.bce_weight = bce_weight
        self.dice_weight = dice_weight
        self.pos_weight = pos_weight
        self.bce = nn.BCEWithLogitsLoss(reduction='mean')

    def forward(self, pred, target):
        # pred: [B, 1, H, W] logits
        # target: [B, 1, H, W]
        # 正样本权重（动态放到正确设备）
        pw = torch.tensor([self.pos_weight], device=pred.device, dtype=pred.dtype)
        bce_loss = F.binary_cross_entropy_with_logits(pred, target, pos_weight=pw)

        pred_prob = torch.sigmoid(pred)
        smooth = 1e-6
        intersection = (pred_prob * target).sum(dim=(1, 2, 3))
        union = pred_prob.sum(dim=(1, 2, 3)) + target.sum(dim=(1, 2, 3))
        dice = (2.0 * intersection + smooth) / (union + smooth)
        dice_loss = 1.0 - dice.mean()

        return self.bce_weight * bce_loss + self.dice_weight * dice_loss


# ============ 评估指标 ============
@torch.no_grad()
def evaluate(model, dataloader, device):
    model.eval()
    total_dice = 0.0
    total_iou = 0.0
    total_precision = 0.0
    total_recall = 0.0
    n_batches = 0
    n_pos = 0

    for emb, mask, _ in dataloader:
        emb = emb.to(device)
        mask = mask.to(device)

        pred = torch.sigmoid(model(emb))
        pred_bin = (pred > 0.5).float()

        # 只计算有正样本的 batch
        if mask.sum() > 0:
            n_pos += 1
            smooth = 1e-6
            intersection = (pred_bin * mask).sum(dim=(1, 2, 3))
            union = pred_bin.sum(dim=(1, 2, 3)) + mask.sum(dim=(1, 2, 3))

            dice = (2.0 * intersection + smooth) / (union + smooth)
            iou = (intersection + smooth) / (pred_bin.sum(dim=(1, 2, 3)) + mask.sum(dim=(1, 2, 3)) - intersection + smooth)
            precision = (intersection + smooth) / (pred_bin.sum(dim=(1, 2, 3)) + smooth)
            recall = (intersection + smooth) / (mask.sum(dim=(1, 2, 3)) + smooth)

            total_dice += dice.mean().item()
            total_iou += iou.mean().item()
            total_precision += precision.mean().item()
            total_recall += recall.mean().item()

        n_batches += 1

    if n_pos == 0:
        return {"dice": 0.0, "iou": 0.0, "precision": 0.0, "recall": 0.0}

    return {
        "dice": total_dice / n_pos,
        "iou": total_iou / n_pos,
        "precision": total_precision / n_pos,
        "recall": total_recall / n_pos,
    }


# ============ 训练 ============
def train_fold(
    model,
    train_loader,
    val_loader,
    device,
    epochs=200,
    lr=1e-3,
    patience=30,
    fold_idx=0,
    output_dir=None,
):
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=10)
    criterion = BCEDiceLoss(bce_weight=1.0, dice_weight=1.0)

    best_dice = -1.0
    best_epoch = 0
    no_improve = 0

    history = []

    for epoch in range(epochs):
        model.train()
        epoch_loss = 0.0
        n_train = 0

        for emb, mask, _ in train_loader:
            emb = emb.to(device)
            mask = mask.to(device)

            optimizer.zero_grad()
            pred = model(emb)
            loss = criterion(pred, mask)
            loss.backward()
            optimizer.step()

            epoch_loss += loss.item()
            n_train += 1

        avg_loss = epoch_loss / max(n_train, 1)

        # 验证
        val_metrics = evaluate(model, val_loader, device)
        scheduler.step(val_metrics["dice"])

        history.append({
            "epoch": epoch,
            "loss": avg_loss,
            **val_metrics,
        })

        if val_metrics["dice"] > best_dice:
            best_dice = val_metrics["dice"]
            best_epoch = epoch
            no_improve = 0
            # 保存最佳模型
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
                save_path = os.path.join(output_dir, f"best_fold{fold_idx}.pt")
                torch.save({
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "dice": best_dice,
                }, save_path)
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
    parser.add_argument("--task", type=str, required=True, choices=["construction", "building_change", "farmland"])
    parser.add_argument("--month", type=str, default="2025-10", help="Embedding 月份")
    parser.add_argument("--folds", type=int, default=5, help="交叉验证折数")
    parser.add_argument("--epochs", type=int, default=200, help="每折最大 epoch 数")
    parser.add_argument("--batch_size", type=int, default=8, help="批次大小")
    parser.add_argument("--lr", type=float, default=1e-3, help="学习率")
    parser.add_argument("--patience", type=int, default=30, help="早停耐心值")
    parser.add_argument("--negative_ratio", type=int, default=3, help="负样本采样比例")
    parser.add_argument("--seed", type=int, default=42, help="随机种子")
    parser.add_argument("--device", type=str, default="cuda", help="训练设备")
    args = parser.parse_args()

    # 设置随机种子
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)

    device = torch.device(args.device if torch.cuda.is_available() else "cpu")
    print(f"🖥️  设备: {device}")

    # 创建数据集
    dataset = PatchDataset(
        task_name=args.task,
        month=args.month,
        negative_ratio=args.negative_ratio,
        augment=True,
    )

    if len(dataset) < args.folds:
        print(f"❌ 样本数 {len(dataset)} 小于折数 {args.folds}, 无法交叉验证")
        return

    # 交叉验证
    kfold = KFold(n_splits=args.folds, shuffle=True, random_state=args.seed)

    task_output_dir = os.path.join(OUTPUT_DIR, args.task)
    os.makedirs(task_output_dir, exist_ok=True)

    all_fold_results = []

    for fold_idx, (train_idx, val_idx) in enumerate(kfold.split(dataset)):
        print(f"\n{'='*60}")
        print(f"📂 Fold {fold_idx + 1}/{args.folds}")
        print(f"{'='*60}")

        train_subset = Subset(dataset, train_idx)
        val_subset = Subset(dataset, val_idx)

        # 验证集关闭增强
        val_dataset = PatchDataset(
            task_name=args.task,
            month=args.month,
            negative_ratio=args.negative_ratio,
            augment=False,
        )
        val_subset = Subset(val_dataset, val_idx)

        train_loader = DataLoader(train_subset, batch_size=args.batch_size, shuffle=True, num_workers=2, pin_memory=True)
        val_loader = DataLoader(val_subset, batch_size=args.batch_size, shuffle=False, num_workers=2, pin_memory=True)

        model = TaskHead(in_channels=IN_CHANNELS).to(device)
        print(f"  模型参数量: {sum(p.numel() for p in model.parameters()) / 1e3:.1f}K")

        best_dice, best_epoch, history = train_fold(
            model,
            train_loader,
            val_loader,
            device,
            epochs=args.epochs,
            lr=args.lr,
            patience=args.patience,
            fold_idx=fold_idx,
            output_dir=task_output_dir,
        )

        all_fold_results.append({
            "fold": fold_idx,
            "best_dice": best_dice,
            "best_epoch": best_epoch,
            "history": history,
        })

    # 保存总结果
    summary = {
        "task": args.task,
        "month": args.month,
        "total_samples": len(dataset),
        "folds": args.folds,
        "fold_results": [
            {"fold": r["fold"], "best_dice": r["best_dice"], "best_epoch": r["best_epoch"]}
            for r in all_fold_results
        ],
        "mean_dice": float(np.mean([r["best_dice"] for r in all_fold_results])),
        "std_dice": float(np.std([r["best_dice"] for r in all_fold_results])),
    }

    summary_path = os.path.join(task_output_dir, "training_summary.json")
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    # 保存完整历史
    history_path = os.path.join(task_output_dir, "training_history.json")
    with open(history_path, "w") as f:
        json.dump(all_fold_results, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print(f"🎉 {args.task} 训练完成!")
    print(f"{'='*60}")
    print(f"  Mean Dice: {summary['mean_dice']:.4f} ± {summary['std_dice']:.4f}")
    for r in summary["fold_results"]:
        print(f"  Fold {r['fold']}: Dice={r['best_dice']:.4f} @ epoch {r['best_epoch']}")
    print(f"  结果保存: {task_output_dir}")


if __name__ == "__main__":
    main()
