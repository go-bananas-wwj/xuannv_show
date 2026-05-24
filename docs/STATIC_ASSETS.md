# 静态资源版本化管理

本文档说明玄女底座展示平台静态资源（图片、视频、embedding 可视化等）的版本化生成、组织和分发流程。

## 目录结构

```
static_assets/
├── v5.2.1/
│   └── harbin/
│       ├── manifest.json          # 资源清单（文件列表、大小、校验和）
│       ├── data/
│       │   ├── embeddings/
│       │   │   ├── global/        # 全域 PCA-RGB mosaic（PNG）
│       │   │   ├── semantic/      # 语义预设 mosaic（PNG）
│       │   │   ├── thumbnails/    # 缩略图（JPEG，1280px）
│       │   │   └── v2/            # Embedding v2 tiles（PNG）
│       │   ├── matrix/            # Patch Time×Source matrix（JPEG）
│       │   ├── mosaic/            # 数据源 mosaic（JPEG）
│       │   │   └── thumbnails/    # Mosaic 缩略图
│       │   └── seg_tiles/         # 分类任务 tile（PNG）
│       └── videos/                # 演示视频
└── data/                          # legacy 路径（当前运行中的数据）
    └── ...
```

## 版本号规则

组合版本号 `v{embedding_model}.{downstream_model}.{platform}`：

- **v5.2.1** = embedding_model_version(5) + downstream_model_version(2) + platform_version(1)

## 生成流程

### 一键生成

```bash
conda activate xuannv
python scripts/generate_static_assets.py \
    --version v5.2.1 \
    --region harbin \
    --embeddings-dir /workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025 \
    --patches-meta data/harbin/patches_meta.json
```

该脚本会按顺序执行：
1. 全域 PCA-RGB mosaic
2. 语义预设 mosaic
3. 语义概率 mosaic
4. Embedding v2 tiles
5. 数据源 mosaic（s2/s1/landsat）
6. Patch matrix
7. 分类 seg tiles
8. 缩略图生成
9. `manifest.json`

### 仅生成 manifest（已有数据时）

```bash
python scripts/generate_static_assets.py \
    --version v5.2.1 \
    --region harbin \
    --only-manifest
```

## 上传到 ModelScope

```bash
export MODELSCOPE_TOKEN=your_token_here
python scripts/upload_static_assets.py \
    --version v5.2.1 \
    --region harbin \
    --dataset WeijieWu/xuannv_embdding
```

上传前会自动验证 `manifest.json` 的完整性。

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `STATIC_ASSETS_VERSION` | 静态资源版本号 | `None`（不启用版本化子目录）|
| `STATIC_ASSETS_REGION` | 静态资源地区子目录 | 继承 `REGION` |
| `MODELSCOPE_TOKEN` | ModelScope API Token | — |
| `EMBEDDINGS_DIR` | Embedding 张量目录 | `/workspace/raw/...` |
| `RAW_SCENES_DIR` | 原始影像目录 | `/workspace/raw/harbin_scenes` |

## 向后兼容

Backend 在 `static_assets_version` 未设置时，自动使用 `static_assets/data/`（legacy 路径）。
如果设置了版本化目录但不存在，会 fallback 到 legacy 路径，确保服务不中断。
