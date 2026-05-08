# 下游任务 GT 预处理 Bug 总结

> 本文档汇总了在系统预训练分类头（Linear Probe）及其 Ground Truth 数据预处理过程中发现的全部 bug。
> 这些 bug 存在于 `backend/app/services/segmentation_engine.py` 的 GT 加载逻辑，
> 以及重新训练脚本 `scripts/train_system_models.py` 的数据处理链路中。

---

## 1. building_extraction：GT 数据源张冠李戴

### 现象
`building_extraction` 名义上是"建筑物提取"，但代码逻辑实际使用的是 **ESA WorldCover** 的 `Built-up` 类别（像素值 `50`），而非 **OpenStreetMap** 建筑数据。

### 代码位置
`backend/app/services/segmentation_engine.py` 第 247-250 行（修复前）：

```python
elif head_id == "building_extraction":
    mapped = np.full_like(raw_int, fill_value=-1)
    mapped[raw_int == 50] = 1   # Built-up → 建筑
    mapped[raw_int > 0] = 0     # 其他 → 非建筑
```

### 根因
项目早期没有独立的 OSM 建筑数据，临时用 WorldCover Built-up 作为替代。
2026-04-20 通过 `scripts/extract_osm_buildings.py` 完成了 OSM 建筑提取，
但 `segmentation_engine.py` 的 GT 映射逻辑未同步更新。

### 差异影响
| 指标 | WorldCover Built-up | OSM 建筑 |
|------|---------------------|----------|
| 定义 | 建成区（道路、广场、建筑混合） | 实际建筑多边形 |
| 空间范围 | 宽泛、块状 | 精确轮廓 |
| 覆盖率 | 高（几乎所有 patch 都有） | 低（~38% patch 有建筑） |
| 标签值 | 50（WorldCover 编码） | 1（OSM 栅格化） |

### 修复
改为适配 OSM 栅格化后的 `[0, 1]` 二值映射：

```python
mapped[raw_int == 1] = 1   # 建筑
mapped[raw_int == 0] = 0   # 非建筑
```

---

## 2. jrc_water：no-data 被错误当作负样本

### 现象
JRC Global Surface Water 数据中，`-128` 是 no-data（无效像素），
但代码把 `raw_int <= 0` 全部映射为"非水体"（class 0），导致 no-data 被当作训练负样本。

### 代码位置
`backend/app/services/segmentation_engine.py` 第 242-246 行（修复前）：

```python
if head_id == "jrc_water":
    mapped = np.full_like(raw_int, fill_value=-1)
    mapped[raw_int == -128] = -1
    mapped[raw_int <= 0] = 0        # ❌ 把 -128 也覆盖了
    mapped[raw_int > 0] = 1
```

### 根因
`-128` 先被设为 `-1`（no-data），但随后 `raw_int <= 0` 又把 `-128` 覆盖为 `0`（非水体）。
逻辑顺序错误。

### 数据影响
以 patch_000000 为例：
- 总像素：1,849
- no-data(-128)：432（23%）
- 这些 no-data 像素全部被错误标记为"非水体"

### 修复
使用精确相等判断：

```python
mapped[raw_int == -128] = -1   # no-data
mapped[raw_int == 0] = 0        # 非水体
mapped[raw_int > 0] = 1         # 水体
```

---

## 3. dynamic_world：季度文件匹配缺失

### 现象
每个 patch 的 `dynamic_world` 目录下有多个季度文件（如 `2023Q1.tif`, `2024Q2.tif`, `2025Q3.tif`），
但代码总是取 `sorted(tifs)[0]`（即最早的季度），与当前展示/推理的月份无关。

### 代码位置
`backend/app/services/segmentation_engine.py` 第 205-226 行（修复前）：

```python
tifs = sorted(source_dir.glob("*.tif"))
...
with rasterio.open(str(tifs[0])) as src:  # ❌ 总是第一个文件
    raw = src.read(1)
```

### 根因
没有实现月份→季度的映射逻辑。

### 影响
- 展示 GT 时：用户选择 `2025-08`，但看到的是 `2023Q1` 的土地利用数据
- 重新训练时：所有月份使用同一季度的 GT，时间不一致

### 修复
按月份解析季度并匹配：

```python
year, mon = month.split("-")
quarter = ((int(mon) - 1) // 3) + 1
quarter_pattern = f"{year}Q{quarter}"
matched = [t for t in tifs if quarter_pattern in t.name]
```

---

## 4. 训练脚本：PIL resize 导致 int8 溢出

### 现象
重新训练脚本中，GT 从 256×256 resize 到 64×64 时，使用 `gt.astype(np.int8)`，
导致 no-data（用 `-1` 表示）在 PIL 中被解释为 `255`，成为新的"幽灵类别"。

### 代码位置
`scripts/train_system_models.py`（修复前）：

```python
gt_pil = Image.fromarray(gt.astype(np.int8))  # ❌ -1 → 255
gt_64 = np.array(gt_pil.resize((64, 64), Image.Resampling.NEAREST))
```

### 根因
PIL 的 `Image.fromarray` 对 int8 数组使用有符号解释，但 resize 后的数组在 dtype 转换时 `-1` 溢出为 `255`（uint8 视角）。

### 影响
训练集中出现 class 255，被当作有效类别训练，严重污染模型。

### 修复
使用 uint8 中间格式，显式映射 no-data：

```python
gt_u8 = np.where(gt < 0, 255, gt).astype(np.uint8)
gt_pil = Image.fromarray(gt_u8)
gt_64 = np.array(gt_pil.resize((W, H), Image.Resampling.NEAREST), dtype=np.int32)
gt_64[gt_64 == 255] = -1
```

---

## 5. 综合影响评估

| 模型 | 旧指标 | 新指标 | 变化说明 |
|------|--------|--------|----------|
| building_extraction | bacc=0.88 / f1=0.75 | bacc=0.57 / f1=0.30 | GT 从宽泛建成区改为精确建筑，数据稀疏导致指标下降，但标签更准确 |
| jrc_water | bacc=0.81 / f1=0.71 | bacc=0.71 / f1=0.79 | 剔除 no-data 污染后，F1 反而提升 |
| dynamic_world | bacc=0.47 / f1=0.12 | bacc=0.41 / f1=0.41 | 按季度匹配后，macro F1 从 0.12 大幅提升到 0.41 |
| worldcover | bacc=0.52 / f1=0.47 | — | 映射逻辑未变，无需重训 |

> 注：旧指标高不代表旧模型更好，因为旧指标是在**错误 GT** 上计算的（自举偏差）。

---

## 6. 后续建议

1. **Linear Probe 能力上限明显** — 11 类 worldcover 准确率仅 0.52，建议升级为 MLP 或轻量 CNN
2. **embedding 空间分辨率** — 64×64 对 256×256 GT 下采样丢失细节，可考虑高分辨率 embedding
3. **OSM 建筑覆盖率** — 仅 38% patch 有建筑，可增加建筑密集区的采样权重
