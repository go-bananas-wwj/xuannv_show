<!-- AGENTS.md — 玄女底座展示平台 -->

## 项目概述

前后端分离的遥感模型展示平台，用于替代 Gradio Demo，可视化 AlphaEarth Foundations 改进版遥感嵌入模型的训练数据、下游任务能力和智能体报告。

平台核心模块：
1. **训练数据 globe 可视化**（Three.js / Cesium 地球展示训练样本分布）
2. **下游任务监测能力**（变化检测 + 4 大语义分割/分类任务，支持动态切换 Task Head、Mosaic 浏览、Patch 级详情弹窗）
3. **智能体报告**（自然语言输入 → 后端生成任务报告并渲染，当前为 mock 数据）
4. **自定义训练**（用户交互式标注 → SAM3 自动分割 → 训练 Linear Probe 分类头 → 推理展示）

## 技术栈

### 前端
| 技术 | 版本 | 说明 |
|------|------|------|
| React | ^19.2.4 | 严格模式 (StrictMode)，函数组件 + Hooks |
| TypeScript | ~6.0.2 | 启用 `strict`、`noUnusedLocals`、`verbatimModuleSyntax` |
| Vite | ^8.0.4 | 开发服务器端口 5173，代理 `/api` 到后端 8000 |
| Tailwind CSS | ^4.2.2 | **CSS-first 配置**，无 `tailwind.config.js`，主题定义在 `src/styles/index.css` |
| Zustand | ^5.0.12 | 全局状态管理 |
| Framer Motion | ^12.38.0 | 滚动触发动画、页面转场 |
| Three.js / R3F | ^0.184.0 / ^9.6.0 | `@react-three/fiber`、`@react-three/drei` |
| Cesium | ^1.140.0 | 通过 `vite-plugin-cesium` 集成 |
| MapLibre GL | ^5.23.0 | 结果地图渲染 |
| Leaflet / react-leaflet | ^1.9.4 / ^5.0.0 | 数据浏览区地图 |
| Recharts | ^3.8.1 | 统计图表 |
| react-markdown | ^10.1.0 | 智能体报告 Markdown 渲染 |
| react-router-dom | ^7.0.0 | 路由（首页 + 自定义训练页） |
| lucide-react | ^1.8.0 | 图标库（唯一图标来源） |
| Axios | ^1.15.0 | API 客户端 |
| clsx / tailwind-merge | ^2.1.1 / ^3.5.0 | 条件类名工具 |

### 后端
| 技术 | 版本 | 说明 |
|------|------|------|
| Python | 3.11 | — |
| FastAPI | 0.115.0 | 主框架 |
| Uvicorn | 0.32.0 | ASGI 服务器 |
| NumPy | 1.26.4 | — |
| Pillow | 12.2.0 | 图像处理 |
| rasterio | 1.4.2 | 栅格数据读写 |
| pydantic | 2.9.2 | 数据校验 |
| matplotlib | 3.9.0 | 矩阵缩略图渲染 |
| PyTorch | 2.5.1+cu124 | ChangeDetectionHeadV3 / SAM3 推理（运行时依赖，未写入 requirements.txt） |
| scikit-learn | — | Linear Probe 推理 + Embedding PCA（运行时依赖） |
| joblib | — | 加载 `.pkl` 模型（运行时依赖） |
| pyproj | — | 坐标转换（运行时依赖，environment.yml 已包含） |

> **注意**：后端没有 `pyproject.toml` 或 `setup.py`，仅用 `requirements.txt` 管理基础 Web 依赖。PyTorch、scikit-learn、joblib、pyproj 等 ML/地理库在运行环境预装或通过 conda 安装，未全部写入 requirements.txt。

### 部署与数据
| 技术 | 说明 |
|------|------|
| Docker + Docker Compose | 前后端各自 Dockerfile，`docker-compose.yml` 一键编排 |
| nginx:alpine | 前端生产环境容器，代理 `/api` 到后端 |
| Conda | 通过 `environment.yml` 统一安装 Node.js 20 + Python 3.11 |
| Playwright | E2E 测试框架 |

## 目录结构

```
xuannv_show/
├── frontend/               # React + Vite + Tailwind CSS v4
│   ├── src/
│   │   ├── main.tsx        # 入口
│   │   ├── App.tsx         # 根组件：6 个全屏滚动 section
│   │   ├── types/index.ts  # TypeScript 类型定义（PatchMeta、TaskHead、RegionConfig 等）
│   │   ├── config.json     # 地区配置（bounds、heads、sources、legends）
│   │   ├── stores/
│   │   │   ├── appStore.ts      # Zustand 全局状态（region、activeHead、selectedPatch 等）
│   │   │   └── annotateStore.ts # 标注页面状态（classes、annotations、maskCandidates 等）
│   │   ├── utils/
│   │   │   ├── api.ts      # Axios 封装 + API 方法
│   │   │   └── cn.ts       # clsx + tailwind-merge 工具
│   │   ├── styles/
│   │   │   └── index.css   # Tailwind v4 主题、@utility、keyframes、全局覆盖
│   │   ├── components/     # 可复用组件
│   │   │   ├── AgentPromptInput.tsx
│   │   │   ├── DataSourceSwitcher.tsx
│   │   │   ├── ExportButtons.tsx
│   │   │   ├── GlassPanel.tsx
│   │   │   ├── HeadTransition.tsx
│   │   │   ├── MosaicViewer.tsx
│   │   │   ├── Navigation.tsx
│   │   │   ├── PatchDetailModal.tsx
│   │   │   ├── PatchDetailPanel.tsx
│   │   │   ├── ResultMapViewer.tsx
│   │   │   ├── StatisticsChart.tsx
│   │   │   └── TaskHeadSelector.tsx
│   │   ├── pages/          # 路由页面
│   │   │   └── AnnotatePage.tsx    # 自定义训练 — 交互式标注页面
│   │   ├── sections/       # 页面六大板块
│   │   │   ├── HeroSection.tsx
│   │   │   ├── AboutSection.tsx
│   │   │   ├── DataSection.tsx
│   │   │   ├── MonitoringSection.tsx
│   │   │   ├── AgentSection.tsx
│   │   │   └── ContactSection.tsx
│   │   └── assets/         # 静态图片
│   ├── public/data/        # 预计算静态数据（patches_meta.json、embeddings）
│   ├── index.html
│   ├── vite.config.ts      # Vite 配置（alias、proxy、cesium 插件）
│   ├── tsconfig.json       # project references（app + node）
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── eslint.config.js    # Flat config（tseslint + react-hooks + react-refresh）
│   ├── nginx.conf          # 生产 nginx 配置（SPA fallback + /api 代理）
│   └── Dockerfile          # 多阶段构建（node:20-alpine → nginx:alpine）
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI 入口、CORS、路由挂载、静态文件托管
│   │   ├── routers/        # API 路由
│   │   │   ├── patches.py      # GET /api/patches、/api/patches/{id}、/api/patches/{id}/matrix
│   │   │   ├── embeddings.py   # GET /api/embeddings/preview
│   │   │   ├── heads.py        # GET /api/heads、/api/heads/{id}/result、mosaic、tile、detail、available-months
│   │   │   └── agent.py        # POST /api/agent/task（mock）
│   │   └── services/       # 业务逻辑与 ML 推理
│   │       ├── data_loader.py      # 加载 patches_meta.json、embedding 路径、head 结果路径
│   │       ├── matrix_renderer.py  # matplotlib 渲染 Time×Source 矩阵图（LRU 缓存 64）
│   │       ├── task_engine.py      # ChangeDetectionEngine（PyTorch CD Head 推理、详情图、mosaic）
│   │       └── segmentation_engine.py  # SegmentationEngine（sklearn Linear Probe 推理、4 分类任务）
│   ├── models/             # 序列化模型（*.pkl）与 metrics.json
│   ├── scripts/
│   │   └── precompute_downstream.py  # 批量预计算变化检测 tile & mosaic & detail
│   ├── requirements.txt    # 基础 Web 依赖（无 PyTorch/sklearn）
│   └── Dockerfile          # python:3.11-slim，仅复制 app/，不复制 models/ scripts/
├── scripts/                # 数据准备脚本（运行在宿主机或开发环境）
│   ├── generate_patch_meta.py        # 扫描栅格目录 → patches_meta.json
│   ├── generate_embedding_tiles.py   # embedding PCA-RGB → embeddings/v2/*.png（注意：期望聚合格式 embedding_maps.npy + patch_ids.json）
│   ├── setup_new_region.sh           # 一键生成 patches_meta + embeddings + config.json
│   └── sync_static_data.sh           # 拷贝到 frontend/public/data/ 供静态加载
├── data/                   # 地区静态数据
│   └── harbin/
│       ├── patches_meta.json
│       ├── embeddings/v2/
│       └── config.json（可选，前端 src/config.json 为主要配置源）
├── tests/
│   ├── e2e_test.py         # Playwright E2E 验收测试
│   └── TEST_REPORT.md      # 2026-04-18，8/10 通过
├── docs/
│   └── REGION_SETUP.md     # 新地区接入指南
├── .github/workflows/
│   └── deploy.yml          # CI/CD：构建 + 健康检查 + 部署 stub
├── environment.yml         # Conda 环境（Node 20 + Python 3.11 + pip 依赖）
├── docker-compose.yml      # frontend:80 + backend:8000
├── Makefile                # dev / build / deploy / setup / clean
└── README.md
```

## 构建与开发命令

### 环境初始化

```bash
# 1. Conda 环境（同时安装 Python 3.11 和 Node.js 20）
conda env create -f environment.yml
conda activate xuannv-show

# 2. 前端 Node 依赖
cd frontend && npm install
```

### 日常开发

```bash
# 一键启动前后端（Makefile）
make dev
# 等价于：后台启动 uvicorn:8000，然后前台启动 vite dev:5173

# 手动启动前端
cd frontend && npm run dev        # http://localhost:5173

# 手动启动后端
cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# http://localhost:8000/health  健康检查
```

### 服务保活（看门狗）

```bash
# 一键启动前后端 + 看门狗（推荐）
./scripts/start_services.sh

# 单独启动看门狗（看门狗会自动拉起前后端）
conda run -n xuannv nohup python scripts/watchdog.py > /tmp/xuannv_watchdog.log 2>&1 &
```

看门狗功能：
- 每 **10 秒** 检查一次前后端进程与端口健康状态
- 进程崩溃或端口不可用时**自动重启**对应服务
- 日志：`/tmp/xuannv_watchdog.log`
- 前端日志：`/tmp/xuannv_watchdog_frontend.log`
- 后端日志：`/tmp/xuannv_watchdog_backend.log`

### 构建与部署

```bash
# 前端生产构建
cd frontend && npm run build      # 输出到 frontend/dist
# 或
make build

# Docker Compose 部署（前后端一起构建并启动）
make deploy
# 等价于：docker-compose up --build -d

# 数据准备（默认哈尔滨区域）
make setup

# 清理构建产物与容器
make clean
```

### `package.json` 脚本

| 命令 | 作用 |
|------|------|
| `npm run dev` | Vite 开发服务器 |
| `npm run build` | `tsc -b && vite build` |
| `npm run lint` | ESLint（flat config） |
| `npm run preview` | 预览生产构建 |

## 代码组织与模块划分

### 前端架构

- **单页滚动体验**：无 React Router。`App.tsx` 包含 6 个 `snap-start` 全屏 section，通过 `scroll-snap-type: y mandatory` 实现整屏滚动。`Navigation` 组件提供锚点跳转。
- **配置驱动**：所有地区相关数据（bounds、task heads、传感器源、图例颜色）必须写入 `frontend/src/config.json`，禁止硬编码进组件。
- **状态管理**：Zustand 维护极简全局状态（`region`、`activeHead`、`selectedPatch`、`dataSource`、`isLoading`、`error`）。
- **数据获取策略**：
  - 静态数据（Patch 元数据、Embedding 预览图）：通过 `fetch('/data/...')` 从 `public/data/` 加载。
  - 动态数据（Task 结果、Agent 报告）：通过 Axios 调用 `/api/*`，开发环境由 Vite proxy 转发到后端。
- **路径别名**：`@/` 映射到 `./src`，在 Vite (`vite.config.ts`) 和 TypeScript (`tsconfig.app.json`) 中均已配置。
- **视觉规范**：统一使用玻璃拟态（Glassmorphism）风格。自定义 CSS `@utility` 定义在 `src/styles/index.css`，包括 `.glass`、`.glass-strong`、`.text-glow`、`.border-glow` 等。

### 后端架构

- **分层结构**：`routers/` 负责 HTTP 接口，`services/` 负责业务逻辑与 ML 推理，严格分离。
- **单例与懒加载**：`DataLoader`、`ChangeDetectionEngine`、`SegmentationEngine` 均以模块级单例或工厂函数形式延迟初始化，避免重复加载模型。
- **性能优化**：
  - CPU 密集型渲染（matplotlib 矩阵图、详情图）通过 `run_in_threadpool` 移交线程池，防止阻塞事件循环。
  - 大量使用 `functools.lru_cache` 缓存渲染结果（详情图 128 项、Tile 256 项、矩阵图 64 项）。
- **输入校验**：`heads.py` 与 `patches.py` 中使用正则表达式强制校验 `patch_id`（`^patch_\d{6}$`）、`period`（`^[\w\-_.]+$`）、`region`（`^[a-zA-Z0-9_]+$`）、`version`（`^v\d+$`）、`head_id` 等参数，防止路径遍历。
- **GPU 动态选择**：`task_engine.py` 的 `ChangeDetectionEngine` 初始化时会调用 `_get_freest_device()`，遍历所有可见 CUDA 设备并选择 `torch.cuda.mem_get_info()` 空闲显存最大者。若无可用的 GPU 则自动回退到 CPU。Segmentation 任务（sklearn Linear Probe）全程 CPU 推理，不占用 GPU。
  - Embedding: `/workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025/`
  - CD Head: `/workspace/outputs/aef_qwen_v5_mixed_scale/monthly_cd_head/monthly_cd_head_v5_final.pt`
  - Linear Probes: `backend/models/*.pkl`
  - 预计算结果: `/workspace/outputs/aef_qwen_v5_mixed_scale/results/`
  - 原始数据: `/workspace/raw/harbin_scenes/`（主）、`/workspace/raw/harbin/`（fallback）
- **中文字体依赖**：矩阵图与详情图渲染依赖宿主机字体 `/usr/share/fonts/truetype/wqy/wqy-microhei.ttc`（文泉驿微米黑）。

### 下游任务实现

| Task Head | 技术方案 | 模型位置 |
|-----------|----------|----------|
| 变化检测 (change_detection) | PyTorch `ChangeDetectionHeadV3` | 从 `/workspace/xuannv/` 动态 import + `/workspace/outputs/aef_qwen_v5_mixed_scale/monthly_cd_head/monthly_cd_head_v5_final.pt`；启动时自动选择显存最空闲的 GPU |
| WorldCover 分类 | sklearn `LogisticRegression` Linear Probe | `backend/models/worldcover_linear_probe.pkl` |
| Dynamic World 分类 | sklearn `LogisticRegression` Linear Probe | `backend/models/dynamic_world_linear_probe.pkl` |
| JRC Water 提取 | sklearn `LogisticRegression` Linear Probe | `backend/models/jrc_water_linear_probe.pkl` |
| Building Extraction | sklearn `LogisticRegression` Linear Probe | `backend/models/building_linear_probe.pkl` |

所有分割/分类任务均基于 128-dim embedding 做 CPU 推理，无需 GPU，单 patch 约 10ms。

## 数据工作流与地区接入

### 预计算数据流

```
原始影像 / Embedding 张量
    ↓
scripts/generate_patch_meta.py        →  patches_meta.json
scripts/generate_embedding_tiles.py   →  embeddings/v2/*.png  (PCA-RGB 预览)
scripts/setup_new_region.sh           →  一键生成以上 + config.json
scripts/sync_static_data.sh           →  拷贝到 frontend/public/data/ 供静态加载
```

- `generate_embedding_tiles.py` 的 PCA 计算**仅在 CPU 上运行**，不涉及 GPU。
- `generate_embedding_tiles.py` 期望输入为**聚合格式**：`embedding_maps.npy`（形状 `[N, D, H, W]`）+ `patch_ids.json`（字符串列表）。
- **运行时后端读取的是分散格式**：`patch_xxxxxx_YYYY-MM.npy`（按月存储的 embedding 张量）。当前机器上实际 embedding 路径为 `/workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025/`。
- `setup_new_region.sh` 参数：`--region`（必填）、`--output-dir`（必填）、`--grid`、`--raw-dir`、`--embeddings-dir`、`--bounds`（可选）。

### 地区数据规范

每个地区目录结构必须保持统一：

```
data/{region}/
├── patches_meta.json       # Patch 元数据（bounds、sources、time_range）
├── embeddings/v2/          # PCA-RGB 预览 PNG（patch_xxxxxx.png）
└── config.json             # 前端配置（bounds、heads、legends、sensors）
```

新增地区后，需将 `config.json` 引入前端（如通过 `frontend/src/config.json` 引用）。

## API 接口清单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/patches` | 列出某地区所有 patch 元数据（`?region=harbin`） |
| GET | `/api/patches/{patch_id}` | 单个 patch 详情 |
| GET | `/api/patches/{patch_id}/matrix` | Time×Source 矩阵可视化图（PNG） |
| GET | `/api/embeddings/preview` | Embedding PCA-RGB 预览图（`?patch_id=&region=&version=`） |
| GET | `/api/heads` | 可用 Task Heads 列表 |
| GET | `/api/heads/{head_id}/result` | Head 结果图（`?period=&region=&version=`） |
| GET | `/api/heads/{head_id}/mosaic` | Mosaic 拼接大图（`?period=`，目前仅 change_detection） |
| GET | `/api/heads/{head_id}/patch/{patch_id}/detail` | 单 patch 详情弹窗图（`?period=`） |
| GET | `/api/heads/{head_id}/patch/{patch_id}/tile` | 单 patch mosaic tile 图（`?period=`） |
| GET | `/api/heads/{head_id}/available-months` | 某任务可用的月份/月份对列表 |
| POST | `/api/agent/task` | 智能体任务（当前返回 mock 数据） |

## 测试策略

目前以 **E2E 验收测试** 为主，尚无可见的单元测试层。

- **测试文件**：`tests/e2e_test.py`（Playwright）
- **覆盖项**：
  1. 3D Globe 渲染（Three.js）
  2. 数据源切换（Monthly / Embedding）
  3. Patch 详情面板点击交互
  4. Task Head 选择动画与状态
  5. 地图缩放/平移
  6. Agent Prompt 输入与后端 API 连通性
  7. Git `dev` 分支已推送
  8. `setup_new_region.sh` 可执行
  9. README 完整性检查
  10. 桌面端性能（加载时间 < 8s）
- **最新报告**：`tests/TEST_REPORT.md`（2026-04-18），**8/10 通过**。未通过的 2 项为 Chromium Headless 模式下 WebGL/3D 投影限制导致，真实浏览器中正常。

### 运行 E2E 测试

```bash
# 需先安装 playwright 浏览器
cd tests && python e2e_test.py
```

## CI/CD 与部署

### GitHub Actions（`.github/workflows/deploy.yml`）

| 阶段 | 行为 |
|------|------|
| 触发条件 | push 到 `main`/`dev`；PR 到 `main` |
| Build Job | 1. Checkout<br>2. 安装 Node.js 20，`npm ci && npm run build`<br>3. 安装 Python 3.11，`pip install -r backend/requirements.txt`<br>4. 启动 uvicorn，`curl -f http://localhost:8000/health` |
| Deploy Job | 仅在 `main` 分支触发。当前为 **stub**：执行 `docker-compose build` 后打印 `TODO: configure registry push`，尚未配置镜像仓库推送。 |

### 容器架构

```yaml
frontend (nginx:alpine) :80
    └── 代理 /api → backend:8000
    └── try_files SPA fallback /index.html

backend (python:3.11-slim) :8000
    └── 挂载 ./data:/app/data:ro
```

> 后端 Dockerfile **不复制** `models/` 和 `scripts/`，运行时需要外部挂载或确保宿主机路径可用。

## Git 工作流

- **`main`**：稳定版本，CI 部署 Job 仅由此分支触发。
- **`dev`**：默认开发分支，日常开发从此分支切出 feature/fix 分支。

```bash
git checkout dev
# 开发…
git add -A
git commit -m "feat: xxx"
git push origin dev
```

提交信息建议使用 `feat:`、`fix:`、`docs:`、`refactor:` 等前缀。

## 代码风格与开发约定

### 前端
- **Tailwind CSS v4**：不使用传统 `tailwind.config.js`，所有主题扩展、自定义 `@utility`、keyframes 均写在 `src/styles/index.css`。
- **TypeScript 严格模式**：必须区分 `import type`，禁止未使用的变量/参数。
- **组件风格**：函数组件 + Hooks。视觉容器优先使用 `<GlassPanel>` 或 `.glass` / `.glass-strong` 工具类。
- **图标**：统一使用 `lucide-react`，避免引入其他图标库。
- **API 封装**：所有后端请求集中在 `utils/api.ts`，通过 Axios instance 统一处理错误。

### 后端
- **路由注册**：新模块在 `backend/app/main.py` 中以 `app.include_router(..., prefix="/api/xxx")` 形式挂载。
- **缓存敏感函数**：生成 PNG 字节的函数请使用 `@lru_cache(maxsize=...)` 并确保参数可哈希。
- **线程安全**：CPU 密集型图像/绘图操作必须包在 `run_in_threadpool(...)` 中返回。
- **模型路径**：当前 Linear Probe 模型统一使用项目本地路径 `backend/models/*.pkl`。若需引用 `/workspace/outputs/...` 或 `/workspace/xuannv/...` 路径，请在代码注释中标注，方便后续迁移。
- **正则校验**：所有来自 URL 参数或 Query 的 `patch_id`、`head_id`、`period`、`region`、`version` 必须经过白名单正则校验，防止路径遍历。

### 通用
- **禁止硬编码地区数据**：所有地区相关常数必须来自 `config.json` 或 `patches_meta.json`。
- **禁止前端推理**：模型推理只能发生在后端或通过预计算脚本完成，前端仅负责展示。

## 安全与运维注意事项

### 生产环境安全清单

1. **路径遍历防护**：后端已对所有用户输入的 `patch_id`、`period`、`head_id` 等参数做正则白名单校验。新增接口请保持同等校验力度。
2. **CORS**：后端 CORS 通过环境变量 `CORS_ORIGINS` / `ALLOW_ALL_ORIGINS` 控制。**生产环境严禁使用 `ALLOW_ALL_ORIGINS=true`**，应显式配置允许的域名列表。
3. **API 文档隐藏**：FastAPI 的 Swagger UI (`/docs`)、ReDoc (`/redoc`) 和 OpenAPI schema (`/openapi.json`) 已在生产配置中**默认禁用**。如需临时开启，请修改 `backend/app/main.py` 的 `FastAPI(...)` 参数。
4. **API Key 校验**：生产环境可通过环境变量 `API_KEY` 启用简单的 API Key 校验。设置后，所有 `/api/*` 请求必须携带 `X-API-Key` 请求头（或 `?api_key=` 查询参数）。未设置时不启用校验（便于本地开发）。
5. **禁止公网隧道/内网穿透暴露**：本项目包含遥感模型和数据资产，**严禁通过 Cloudflare Tunnel、ngrok 等工具公开暴露到互联网**。如需远程访问，请使用 SSH 端口转发或 VPN。
6. **GPU 资源**：当前机器配备 8×NVIDIA GeForce RTX 4090。CD Head（变化检测）推理支持**动态选择空闲 GPU**——启动时自动挑选显存剩余最多的 CUDA 设备，无需手动指定。Segmentation/Classification 任务基于 sklearn Linear Probe，纯 CPU 推理，不占用 GPU。
7. **外部目录只读**：`/workspace/xuannv/` 及其子目录为只读参考，**严禁修改**。
8. **容器安全**：后端 Dockerfile 当前以 root 运行，且未多阶段分离构建产物。若后续上生产，建议添加非 root 用户。
9. **模型文件**：`backend/models/*.pkl` 为 sklearn 序列化文件，加载时请确保 Python 与 scikit-learn 版本一致，避免反序列化不兼容。
10. **字体缺失**：若矩阵图或详情图中文显示为方框，请检查宿主机是否安装了 `wqy-microhei` 字体（路径 `/usr/share/fonts/truetype/wqy/wqy-microhei.ttc`）。
11. **embedding 格式差异**：`scripts/generate_embedding_tiles.py` 使用聚合格式（`embedding_maps.npy` + `patch_ids.json`），而推理引擎使用分散格式（`patch_xxxxxx_YYYY-MM.npy`）。生成缺失预览图时可能需要编写适配脚本。

## 常见问题速查

| 现象 | 排查方向 |
|------|----------|
| 前端无法访问后端 API | 检查 Vite proxy / nginx.conf 中 `/api` 代理地址；确认后端 `8000` 端口已监听 |
| Embedding 预览图空白 | 检查 `frontend/public/data/embeddings/v2/` 是否存在 PNG；或检查 `sync_static_data.sh` 是否已执行 |
| 后端启动报 `ModuleNotFoundError: torch` | PyTorch 为运行时依赖，未写入 requirements.txt，需在环境中手动安装 |
| 地区数据未加载 | 确认 `frontend/src/config.json` 中的路径与 `data/{region}/config.json` 一致 |
| 矩阵图/详情图中文乱码 | 安装 `fonts-wqy-microhei` 或确认 `/usr/share/fonts/truetype/wqy/wqy-microhei.ttc` 存在 |
| CD 任务结果无法显示 | 检查 `/workspace/outputs/aef_qwen_v5_mixed_scale/results/` 是否存在预计算结果；若缺失可运行 `backend/scripts/precompute_downstream.py` |
| 后端报 `FileNotFoundError: Embedding not found` | 检查 `/workspace/raw/xuannv_modelscope_upload/embeddings/v5_mixed_scale/monthly_embeddings_2025/` 是否存在分散的 `.npy` 文件 |
| Segmentation 模型加载失败 | 检查 `backend/models/*.pkl` 是否存在且文件名匹配（worldcover_linear_probe.pkl 等）|
