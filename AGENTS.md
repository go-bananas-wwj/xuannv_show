# AGENTS.md — 玄女底座展示平台

## 项目概述

前后端分离的遥感模型展示平台，替代 Gradio Demo，用于可视化 AlphaEarth Foundations 改进版遥感嵌入模型的训练数据、下游任务能力和智能体报告。

## 技术栈

- **前端**: React 18 + TypeScript + Vite + Tailwind CSS v4 + Three.js + MapLibre GL + Framer Motion
- **后端**: FastAPI (Python)
- **数据**: 预计算 embedding / patches 元数据 / 结果图

## 开发服务器

```bash
# 前端 (Vite Dev Server)
cd frontend && npm run dev
# 默认端口: 5173

# 后端 (FastAPI)
cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# API 端口: 8000
```

## GPU 资源限制

**⚠️ 重要: 如需使用 GPU 资源，只能使用 `gpu6`。**

- 运行模型推理、embedding 生成等 GPU 任务时，必须指定 `gpu6`
- 其他 GPU 节点不可用或已被占用
- 数据准备脚本（`generate_embedding_tiles.py`）中的 PCA 计算在 CPU 上运行，不涉及 GPU

## Git 工作流

- `main`: 稳定版本
- `dev`: 开发分支（默认工作分支）

```bash
git checkout dev
git add -A
git commit -m "feat: xxx"
git push origin dev
```

## 目录结构

```
xuannv_show/
├── frontend/          # React + Vite + Tailwind
├── backend/           # FastAPI
├── scripts/           # 数据准备脚本
│   ├── generate_patch_meta.py
│   ├── generate_embedding_tiles.py
│   └── setup_new_region.sh
├── data/              # 静态数据 (harbin/ ...)
├── tests/             # E2E 测试
├── docs/
│   └── REGION_SETUP.md
└── README.md
```

## 环境配置

### Conda 环境

```bash
conda env create -f environment.yml
conda activate xuannv-show
```

### Node.js 依赖

```bash
cd frontend && npm install
```

## 禁止事项

- ❌ 修改 `/workspace/xuannv/` 下的任何文件（只读参考）
- ❌ 使用 Gradio / Streamlit / Dash 等非专业前端方案
- ❌ 将模型推理逻辑放在前端（前端只展示，推理在后端或预计算）
- ❌ 硬编码地区相关数据到组件中（必须通过配置加载）
