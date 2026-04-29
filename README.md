# 玄女底座 — 遥感模型展示平台

> 前后端分离的遥感嵌入模型可视化平台，替代 Gradio Demo，提供卫星遥感科幻高级感的交互体验。

## 技术栈

- **前端**: React 18 + TypeScript + Vite + Tailwind CSS v4 + Three.js + MapLibre GL + Framer Motion
- **后端**: FastAPI (Python) — 最小化静态托管 + 数据 API
- **数据**: 预计算 embedding / patches 元数据 / 结果图

## 快速启动

### 方式一: Conda (推荐开发)

```bash
# 1. 创建环境
conda env create -f environment.yml
conda activate xuannv-show

# 2. 安装前端依赖
cd frontend && npm install

# 3. 准备数据
make setup

# 4. 同时启动前后端
cd .. && make dev
```

### 方式二: Docker (一键部署)

```bash
make deploy
```

访问 http://localhost 查看前端，http://localhost:8000 查看后端 API。

## 项目结构

```
xuannv_show/
├── frontend/          # React + Vite + Tailwind
├── backend/           # FastAPI
├── scripts/           # 数据准备脚本
│   ├── generate_patch_meta.py
│   ├── generate_embedding_tiles.py
│   └── setup_new_region.sh
├── data/              # 静态数据
│   └── harbin/
│       ├── patches_meta.json
│       └── embeddings/
├── docs/
│   └── REGION_SETUP.md
├── docker-compose.yml
├── Makefile
└── README.md
```

## 三大展示模块

1. **训练数据地球可视化** — Three.js 三维地球 + 栅格覆盖层 + 详情面板
2. **下游监测能力展示** — Task Head 动态接帽 + MapLibre 结果地图
3. **智能体任务报告** — 自然语言输入 + 报告生成 + 统计图表

## 新地区接入

```bash
./scripts/setup_new_region.sh \
  --region yajiang \
  --grid /path/to/yajiang_grid.geojson \
  --raw-dir /workspace/raw/yajiang_scenes \
  --embeddings-dir /workspace/outputs/yajiang_v1/embeddings \
  --bounds "100.2,29.5,101.8,30.8" \
  --output-dir ./data/yajiang/
```

详见 [docs/REGION_SETUP.md](docs/REGION_SETUP.md)

## Git 工作流

- `main`: 稳定版本
- `dev`: 开发分支（默认）

```bash
git checkout dev
git add -A
git commit -m "feat: xxx"
git push origin dev
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/patches` | 栅格列表 |
| GET | `/api/patches/{id}` | 栅格详情 |
| GET | `/api/embeddings/preview` | Embedding 预览图 |
| GET | `/api/heads` | 可用 Heads |
| GET | `/api/heads/{id}/result` | Head 结果图 |
| POST | `/api/agent/task` | 智能体任务 |

## License

AlphaEarth Foundations
