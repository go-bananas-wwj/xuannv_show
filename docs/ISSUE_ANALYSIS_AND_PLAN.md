# 下游展示问题分析报告与修改计划

> 调研时间：2026-05-08 | 涉及范围：前端加载性能、GT 显示、分割噪音

---

## 一、问题 1：前端 patches 加载速度慢

### 1.1 现象描述
- Mosaic 视图切换任务时，tile 加载明显卡顿
- 浏览器标签页偶尔无响应
- 首次加载分类任务（worldcover/dynamic_world/jrc_water/building）比变化检测慢得多

### 1.2 根因分析

#### 🔴 P0 — 后端 tile 渲染阻塞 ASGI 事件循环（最严重）

**代码位置**：`backend/app/routers/heads.py` 第 147-187 行

```python
@functools.lru_cache(maxsize=256)
def _render_seg_tile_cached(head_id, patch_id, month) -> bytes:
    img = get_seg_engine().render_mosaic_tile(...)   # ← 同步函数
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

@router.get("/{head_id}/patch/{patch_id}/tile")
async def get_patch_tile(...):
    png_bytes = _render_seg_tile_cached(...)   # ← async 路由中直接调用同步函数
    return Response(content=png_bytes, ...)
```

**问题**：FastAPI 的 `async` 路由直接调用同步函数时，会在 **ASGI 事件循环线程执行**，不会释放给其他请求。单次 tile 渲染流程：
1. 加载 2MB `.npy` embedding 文件
2. sklearn MLP 推理（~10ms，在 GIL 下阻塞）
3. PIL 颜色编码 + resize + PNG 压缩

LRU 缓存仅 256 条，424 个 patches 首次访问时无法全部命中。结果是 **大量 tile 请求串行阻塞事件循环**，其他 API（包括前端 health check）同时不可用。

**对比**：变化检测（change_detection）读取预计算 PNG 文件（`FileResponse`），走 OS 异步 IO，不阻塞事件循环。

#### 🟠 P1 — MosaicViewer 424 个并发 `<img>` 请求

**代码位置**：`frontend/src/components/MosaicViewer.tsx` 第 171-205 行

- 瞬间创建 **424 个 `<img>` DOM 节点**
- 每个 img 触发独立 HTTP 请求到 `/api/heads/{head}/patch/{id}/tile`
- `loading="lazy"` 只控制下载时机，但请求仍会发出
- HTTP/1.1 浏览器并发限制 **6-8 连接**，424 个请求需要 **50-70 轮排队**

#### 🟡 P2 — DataSection 424 个 Leaflet Rectangle

**代码位置**：`frontend/src/sections/DataSection.tsx` 第 226-264 行

- react-leaflet 的 `Rectangle` 创建 **真实 SVG DOM 元素**
- 424 个 Rectangle = 424 个 SVG path + 事件监听器
- 地图缩放/平移时 Leaflet 需重绘所有元素

#### 🟡 P2 — patches_meta.json 重复加载

**代码位置**：
- `frontend/src/sections/DataSection.tsx:57` — `fetch('/data/patches_meta.json')`
- `frontend/src/sections/MonitoringSection.tsx:32` — 同样请求

两个 Section 同时 mount，重复请求 256KB JSON。

### 1.3 修改方案

| 优先级 | 修改项 | 改动范围 | 预估效果 |
|--------|--------|----------|----------|
| **P0** | tile/detail 渲染包 `run_in_threadpool` | `heads.py` +2 处 | 消除后端阻塞，请求可并行 |
| **P1** | MosaicViewer 加 `imageRendering: 'pixelated'` | `MosaicViewer.tsx` +1 行 | 避免浏览器插值伪影 |
| **P2** | patches 数据提升到 App 级共享 | `App.tsx` + 各 Section | 消除重复请求 |
| **P2** | DataSection Rectangle 改为 Canvas 或聚合 | `DataSection.tsx` | 减少 DOM 节点，提升地图交互帧率 |

---

## 二、问题 2：building_extraction GT "好多都没有显示"

### 2.1 现象描述
- 点击 patch 查看详情图时，GT 面板大面积是深灰色，看起来"没有内容"
- 对比 jrc_water，其 GT 面板看起来更"正常"

### 2.2 根因分析

#### ✅ 结论：GT 数据完整，加载逻辑正确，不是 Bug

**数据验证**：
- `osm_buildings/` 目录下 424/424 个 patch 子目录均有 `static.tif`
- 165/424 (38.9%) 的 patch 含有建筑像素，259/424 (61.1%) 确实没有建筑
- 这是哈尔滨新区的地理分布特征（大量农田/林地/水体），**不是加载错误**

**代码验证**：
- `_load_ground_truth()` 中 building_extraction 映射逻辑正确：
  ```python
  mapped[raw_int == 1] = 1   # 建筑
  mapped[raw_int == 0] = 0   # 非建筑
  ```
- 与 jrc_water 加载流程完全一致

#### ⚠️ 视觉问题：非建筑颜色太深

| 任务 | 非建筑/背景色 | 建筑/前景色 |
|------|-------------|-----------|
| **building_extraction** | `(100, 100, 100)` **深灰** | `(250, 0, 0)` 红 |
| **jrc_water** | `(180, 180, 180)` **浅灰** | `(0, 100, 200)` 蓝 |

building_extraction 的非建筑色 `(100,100,100)` 偏深，在详情图白色背景衬托下对比度低，用户容易误以为"GT 没加载"。

#### ⚠️ 隐患：`osm_buildings_test` 目录全 0

`/workspace/raw/harbin_scenes/osm_buildings_test/` 下 424 个 patch 的 `static.tif` 全是 0。这是 `extract_osm_buildings.py` 某次执行时 Overpass API 提取失败的结果。当前代码读取的是 `osm_buildings`（旧数据，有效），但如果未来切换目录会出问题。

### 2.3 修改方案

| 优先级 | 修改项 | 改动范围 | 说明 |
|--------|--------|----------|------|
| **P1** | 调亮非建筑颜色 | `train_system_models_sklearn_mlp.py` 颜色配置 | `(100,100,100)` → `(200,200,200)`，与 jrc_water 保持一致 |
| **P2** | 删除 osm_buildings_test | 文件系统 | 清理失败的测试数据，避免未来误用 |

---

## 三、问题 3：分割结果零散噪音点

### 3.1 现象描述
- 水体和建筑物的 mosaic tile 上都有许多零散的小点/小斑块
- Detail 弹窗中对比 GT 和预测结果，两者都有零散区域

### 3.2 根因分析

#### 🔴 根因 1：逐像素独立预测，无空间上下文

```python
def infer(self, head_id, patch_id, month):
    emb = self._load_embedding(patch_id, month)   # [D, H, W]
    flat = emb.reshape(D, -1).T                   # [H*W, D]
    flat_s = scaler.transform(flat)
    pred = lr.predict(flat_s).reshape(H, W)       # [H, W] — 逐像素独立
```

MLP 对每个像素独立做分类，不感知邻域信息。决策边界附近，相邻像素 embedding 相似但可能被分到不同类别，产生 **salt-and-pepper 噪音**。

#### 🔴 根因 2：完全无后处理

`infer()` 输出直接颜色编码，没有任何：
- 形态学操作（开运算/闭运算）
- 连通域分析/小面积过滤
- 空间一致性约束

#### 🟡 根因 3：浏览器二次插值（仅 Mosaic 视图）

`MosaicViewer.tsx` 中 tile CSS 为 `imageRendering: 'auto'`。用户缩放时，浏览器对 128×128 tile 做双线性插值，在类别边界产生混合色像素，视觉上像"散落的色点"。

#### 🟡 根因 4：GT 本身含小斑块

- JRC GSW 水边细碎、OSM 小建筑被模型忠实地学习复现
- 训练脚本中未对 GT 做 `remove_small_objects` 清洗

### 3.3 修改方案

#### 方案 A：后端 `infer()` 增加后处理（推荐 ⭐⭐⭐⭐⭐）

对二分类任务（jrc_water、building_extraction）增加：
1. **形态学 opening**（3×3）去除单/双像素孤立噪点
2. **连通域小面积过滤**（阈值 5 像素）移除零散区域

```python
from scipy import ndimage

# 1. opening 去孤立点
foreground = ndimage.binary_opening(mask, structure=np.ones((3,3)))

# 2. 连通域过滤小面积
labeled, num = ndimage.label(foreground)
sizes = ndimage.sum(foreground, labeled, range(1, num+1))
remove = np.where(sizes < 5)[0] + 1
foreground[np.isin(labeled, remove)] = 0
```

| 维度 | 评估 |
|------|------|
| 计算成本 | ~1-2ms / patch（scipy 已安装） |
| building_extraction | opening + 5px 过滤，去除零散误检，保留真实建筑 |
| jrc_water | 可只做 closing（填小洞）+ 10px 过滤 |
| 多分类 (worldcover/dynamic_world) | 不适合形态学，可用 3×3 多数投票替代 |

#### 方案 B：前端 `imageRendering: 'pixelated'`（推荐 ⭐⭐⭐⭐）

将 MosaicViewer tile 的 CSS 从 `imageRendering: 'auto'` 改为 `'pixelated'`，避免浏览器插值产生伪影。

#### 方案 C：训练端 GT 预清洗（中期）

训练脚本中增加 `remove_small_objects(area_threshold=10)`，防止模型学习 GT 中的微小噪声斑块。

---

## 四、修改计划总览

### Phase 1 — 核心修复（必做，影响最大）

| # | 修改项 | 文件 | 预计工时 |
|---|--------|------|----------|
| 1 | tile/detail 渲染包 `run_in_threadpool` | `backend/app/routers/heads.py` | 10 min |
| 2 | `infer()` 增加后处理（opening + 连通域过滤） | `backend/app/services/segmentation_engine.py` | 20 min |
| 3 | MosaicViewer `imageRendering: 'pixelated'` | `frontend/src/components/MosaicViewer.tsx` | 2 min |
| 4 | building_extraction 非建筑颜色调亮 | `scripts/train_system_models_sklearn_mlp.py` + 重训 | 30 min |

### Phase 2 — 体验优化（建议做）

| # | 修改项 | 文件 | 预计工时 |
|---|--------|------|----------|
| 5 | patches 数据提升到 App 级共享 | `App.tsx`, `DataSection.tsx`, `MonitoringSection.tsx` | 20 min |
| 6 | DataSection Rectangle 性能优化（聚合/Canvas） | `DataSection.tsx` | 30 min |
| 7 | 删除 osm_buildings_test 全 0 数据 | 文件系统 | 2 min |

### Phase 3 — 中长期（可选）

| # | 修改项 | 说明 |
|---|--------|------|
| 8 | 训练端 GT 预清洗 | `remove_small_objects` 过滤小斑块 |
| 9 | 评估轻量 FCN 替代 MLP | 从根本上引入空间感知能力 |

---

## 五、验证方法

1. **加载速度**：Chrome DevTools Network 面板观察 tile 请求并发数和总耗时
2. **GT 显示**：对比修改前后 Detail 弹窗中 GT 面板的视觉清晰度
3. **噪音点**：对比修改前后 mosaic tile 和 detail 图中的零散像素数量
