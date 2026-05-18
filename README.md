# 玄女底座 — 遥感模型展示平台

> **XuanNv Show** — 前后端分离的遥感嵌入模型可视化平台，用于展示卫星遥感数据的训练样本分布、下游任务推理能力与智能体分析报告。

## ✨ 功能特性

- **🌍 训练数据地球可视化** — Three.js 三维地球 + 栅格覆盖层，直观展示训练样本的地理分布与时间序列
- **🛰️ 下游监测能力展示** — 支持变化检测、土地覆盖分类、土地利用分类、水体提取、建筑物提取等任务，动态切换 Task Head，Mosaic 浏览，Patch 级详情弹窗
- **🤖 智能体任务报告** — 自然语言输入任务描述，自动生成结构化分析报告与统计图表
- **🎨 自定义训练** — 交互式标注 → SAM3 自动分割 → 训练 Linear Probe 分类头 → 实时推理展示
- **📊 多传感器融合** — 支持 Sentinel-2、Sentinel-1、Landsat、高分光学/雷达、MODIS 等多种数据源

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18 + TypeScript + Vite + Tailwind CSS v4 + Three.js + MapLibre GL + Framer Motion |
| **后端** | FastAPI (Python) + Uvicorn |
| **数据** | 预计算 Embedding / Patches 元数据 / 推理结果图 |
| **部署** | Docker + Docker Compose + nginx |

## 🌐 在线体验

**公开访问地址**：http://60.31.21.42:22060/

无需安装，打开浏览器即可直接体验平台全部功能。

## 🚀 快速开始

### 环境要求

- Python 3.11+
- Node.js 20+
- Conda（推荐）或系统级 Python

### 方式一：Conda（推荐开发）

```bash
# 1. 创建环境
conda env create -f environment.yml
conda activate xuannv-show

# 2. 安装前端依赖
cd frontend && npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，根据实际数据位置调整路径

# 4. 准备数据
make setup

# 5. 同时启动前后端
cd .. && make dev
```

访问 http://localhost:5173 查看前端，http://localhost:8000 查看后端 API。

### 方式二：Docker（一键部署）

```bash
make deploy
```

访问 http://localhost 查看前端。

## 📁 项目结构

```
xuannv_show/
├── frontend/          # React + Vite + Tailwind
│   ├── src/
│   │   ├── config.json      # 地区配置（bounds、heads、sensors、legends）
│   │   ├── components/      # 可复用组件
│   │   ├── sections/        # 页面六大板块
│   │   └── pages/           # 路由页面（自定义训练页等）
│   └── public/data/         # 预计算静态数据
├── backend/           # FastAPI
│   ├── app/
│   │   ├── main.py          # FastAPI 入口
│   │   ├── routers/         # API 路由
│   │   └── services/        # 业务逻辑与 ML 推理
│   ├── models/              # 序列化模型（*.pkl）
│   └── requirements.txt
├── scripts/           # 数据准备脚本
│   ├── generate_patch_meta.py        # 扫描栅格目录 → patches_meta.json
│   ├── generate_embedding_tiles.py   # Embedding PCA-RGB → 预览图
│   ├── setup_new_region.sh           # 一键初始化新地区数据
│   └── sync_static_data.sh           # 同步静态数据到前端
├── data/              # 地区静态数据
│   └── harbin/
│       ├── patches_meta.json
│       └── embeddings/
├── tests/             # E2E 测试
├── docs/
│   └── REGION_SETUP.md     # 新地区接入指南
├── docker-compose.yml
├── Makefile
└── README.md
```

## 🔌 API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/patches` | 栅格列表（`?region=`） |
| GET | `/api/patches/{id}` | 栅格详情 |
| GET | `/api/patches/{id}/matrix` | Time×Source 矩阵可视化图 |
| GET | `/api/embeddings/preview` | Embedding PCA-RGB 预览图 |
| GET | `/api/heads` | 可用 Task Heads |
| GET | `/api/heads/{id}/result` | Head 推理结果图 |
| GET | `/api/heads/{id}/mosaic` | Mosaic 拼接大图 |
| GET | `/api/heads/{id}/patch/{patch_id}/detail` | 单 Patch 详情图 |
| GET | `/api/heads/{id}/patch/{patch_id}/tile` | Mosaic Tile 图 |
| POST | `/api/agent/task` | 智能体任务 |

## 🗺️ 新地区接入

```bash
./scripts/setup_new_region.sh \
  --region yajiang \
  --grid /path/to/yajiang_grid.geojson \
  --raw-dir /path/to/yajiang_scenes \
  --embeddings-dir /path/to/yajiang_v1/embeddings \
  --bounds "100.2,29.5,101.8,30.8" \
  --output-dir ./data/yajiang/
```

详见 [docs/REGION_SETUP.md](docs/REGION_SETUP.md)

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详细流程。

## 📄 License

本项目采用 [MIT License](LICENSE) 开源。

Copyright (c) 2026 AlphaEarth Foundations
