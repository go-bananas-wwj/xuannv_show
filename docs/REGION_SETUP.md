# 新地区快速接入指南

## 概述

`scripts/setup_new_region.sh` 提供一键初始化新地区展示数据的能力。

## 前置要求

1. 栅格 Grid GeoJSON 文件（含 patch_id, bounds, crs）
2. 原始影像数据目录（按传感器分子目录，每个 patch 一个子目录）
3. （可选）预计算 embedding 目录

## 使用方法

```bash
./scripts/setup_new_region.sh \
  --region yajiang \
  --grid /path/to/yajiang_grid.geojson \
  --raw-dir /workspace/raw/yajiang_scenes \
  --embeddings-dir /workspace/outputs/yajiang_v1/embeddings \
  --bounds "100.2,29.5,101.8,30.8" \
  --output-dir ./data/yajiang/
```

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `--region` | 是 | 地区标识符 |
| `--output-dir` | 是 | 输出目录 |
| `--grid` | 否 | Grid GeoJSON 路径 |
| `--raw-dir` | 否 | 原始影像目录 |
| `--embeddings-dir` | 否 | Embedding 目录 |
| `--bounds` | 否 | WGS84 边界框 |

## 输出结构

```
data/{region}/
├── patches_meta.json      # 栅格元数据
├── embeddings/v2/         # PCA-RGB 预览图
└── config.json            # 前端配置
```

## 前端配置更新

生成后，在 `frontend/src/config.json` 中引用新地区配置即可切换展示区域。
