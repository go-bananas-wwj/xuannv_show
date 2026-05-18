import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, BarChart3, Layers, Grid3X3, Eye } from 'lucide-react'

const months = [
  { label: '4月', value: '04', path: '/data/embeddings/global/2025-04.png' },
  { label: '6月', value: '06', path: '/data/embeddings/global/2025-06.png' },
  { label: '8月', value: '08', path: '/data/embeddings/global/2025-08.png' },
  { label: '10月', value: '10', path: '/data/embeddings/global/2025-10.png' },
]

interface PresetData {
  id: string
  name: string
  color: string
  top_dims: number[]
  weights: number[]
  top3: number[]
  top3_weights: number[]
  all_weights: number[]
}

export default function AboutEmbedding() {
  const [monthIdx, setMonthIdx] = useState(0)
  const [presets, setPresets] = useState<PresetData[]>([])
  const [selectedPreset, setSelectedPreset] = useState<string>('water')
  const [viewMode, setViewMode] = useState<'pca' | 'semantic'>('pca')
  const [semanticPreset, setSemanticPreset] = useState('water')

  useEffect(() => {
    fetch('/api/embeddings/presets')
      .then((r) => r.json())
      .then((data) => {
        setPresets(data)
        if (data.length > 0) setSelectedPreset(data[0].id)
      })
      .catch(() => {})
  }, [])

  const currentPreset = presets.find((p) => p.id === selectedPreset)

  return (
    <section className="relative min-h-dvh flex items-center bg-[#0a0a0f] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#0a1628]/30 to-[#0a0a0f]" />
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-12 py-24">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-6">
            看见数据的
            <span className="text-sky-400">指纹</span>
          </h2>
          <p className="text-lg md:text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto">
            128 维嵌入向量，降维成一张 RGB 图，地表的语义信息一目了然
          </p>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-center text-slate-400 max-w-2xl mx-auto mb-12"
        >
          我们将 128 维像素级嵌入通过 PCA 降维到 3 维，映射为 RGB 色彩。
          相似的地表类型呈现相似的颜色，让数据本身的结构可视化。
        </motion.p>

        {/* View mode + image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }}
          className="max-w-4xl mx-auto mb-6"
        >
          {/* View mode tabs */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('pca')}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                  viewMode === 'pca'
                    ? 'bg-sky-600 text-white border-sky-600 shadow-lg shadow-sky-500/20'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/20'
                }`}
              >
                <Eye className="w-4 h-4" />
                PCA-RGB
              </button>
              <button
                onClick={() => setViewMode('semantic')}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                  viewMode === 'semantic'
                    ? 'bg-sky-600 text-white border-sky-600 shadow-lg shadow-sky-500/20'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/20'
                }`}
              >
                <Grid3X3 className="w-4 h-4" />
                语义预设
              </button>
            </div>
            {viewMode === 'semantic' && (
              <div className="flex gap-2">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSemanticPreset(p.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                      semanticPreset === p.id
                        ? 'text-white shadow-sm'
                        : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/20'
                    }`}
                    style={
                      semanticPreset === p.id
                        ? { backgroundColor: p.color, borderColor: p.color }
                        : {}
                    }
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative aspect-[16/10] rounded-2xl overflow-hidden border border-white/10 bg-[#1a1a2e]">
            <AnimatePresence mode="wait">
              {viewMode === 'pca' ? (
                <motion.img
                  key={`pca-${monthIdx}`}
                  src={months[monthIdx].path}
                  alt={`全域嵌入 ${months[monthIdx].label}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <motion.img
                  key={`semantic-${semanticPreset}`}
                  src={`/data/embeddings/semantic/${semanticPreset}/2025-04.png`}
                  alt={`语义预设 ${semanticPreset}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              )}
            </AnimatePresence>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <Globe className="w-16 h-16 mx-auto mb-4 text-sky-400/30" />
                <div className="text-lg font-medium text-sky-400/50">
                  {viewMode === 'pca' ? '全域 PCA-RGB 嵌入可视化' : `语义预设：${presets.find(p => p.id === semanticPreset)?.name || ''}`}
                </div>
                <div className="text-sm text-slate-500 mt-2">
                  6656 × 6144 · {viewMode === 'pca' ? months[monthIdx].label : '2025年4月'}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Month slider (PCA mode only) */}
        {viewMode === 'pca' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex justify-center gap-3 mb-16"
          >
            {months.map((m, i) => (
              <button
                key={m.value}
                onClick={() => setMonthIdx(i)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  i === monthIdx
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-500/20'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10'
                }`}
              >
                2025年{m.label}
              </button>
            ))}
          </motion.div>
        )}
        {/* ── 语义预设图例说明 ── */}
        {viewMode === 'semantic' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto mb-16"
          >
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
              <h3 className="text-lg font-bold text-white mb-4">🔍 语义预设图例说明</h3>

              <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
                <p>
                  <strong className="text-white">什么是语义预设？</strong>
                  我们把 AI 模型内部 128 个特征维度中、<strong className="text-sky-400">跟某种地类最相关的 3 个维度</strong>提取出来，合成一张 RGB 图。
                  就像用「AI 的视角」给特定地类开了透视——<strong className="text-white">哪里亮，哪里就是模型认为属于这类的地方</strong>。
                </p>

                <div className="rounded-xl bg-white/5 border border-white/5 p-4">
                  <p className="text-xs text-slate-400 mb-3">👀 看图口诀</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="text-center">
                      <div className="text-lg mb-1">✨</div>
                      <div className="text-white font-medium">颜色越亮越纯</div>
                      <div className="text-xs text-slate-500">模型越确定</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg mb-1">🌑</div>
                      <div className="text-white font-medium">发暗发黑</div>
                      <div className="text-xs text-slate-500">模型觉得不是这类</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg mb-1">🎯</div>
                      <div className="text-white font-medium">对照卫星图</div>
                      <div className="text-xs text-slate-500">验证高亮区域准不准</div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-400 mb-2">五种地类预设对照</p>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border"
                        style={{
                          backgroundColor: `${p.color}15`,
                          borderColor: `${p.color}40`,
                          color: p.color,
                        }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        {p.name}
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  技术细节：基于 Linear Probe 权重分析提取 Top-3 维度，全局归一化后映射 RGB。
                  这不是人工标注，是模型<strong className="text-slate-400">自己学会的「地类直觉」</strong>。
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── 128维说明卡片 ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="max-w-3xl mx-auto mb-16"
        >
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-sky-400" />
              </div>
              <h3 className="text-xl font-bold text-white">为什么是 128 维？</h3>
            </div>
            <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
              <p>
                <strong className="text-white">AEF 原始 64 维</strong> 是为全球 PB 级存储优化的工程妥协——
                每年全球数据控制在 96 TB，是 DINOv3 (1024维) 的 1/64。
              </p>
              <p>
                <strong className="text-white">我们选 128 维</strong> 是为区域精度优化。
                单区域存储不是瓶颈，更高维度提供更丰富的特征子空间，
                供 MLP 挖掘 Linear Probe 无法捕捉的非线性模式。
              </p>
              <div className="rounded-xl bg-white/5 border border-white/5 p-4">
                <p className="text-xs text-slate-400 mb-2">外部证据：维度压缩对效果影响极小</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-lg font-bold text-white">int8 ≈ float32</div>
                    <div className="text-xs text-slate-500">统计不可区分</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">PCA(64)+int8</div>
                    <div className="text-xs text-slate-500">仅损失 1.4%</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">ID ≈ 13-17</div>
                    <div className="text-xs text-slate-500">本征维度很低</div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2 text-center">
                  数据来源：Compressing Earth Embeddings / TerraBit (geospatialml.com)
                </p>
              </div>
              <p className="text-slate-400 italic">
                ⚠️ 诚实说明：目前尚未进行系统的消融实验。
                后续将测试 64/32/16 维的效果，验证 128 维是否为本场景的最优选择。
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── 分辨率说明 ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="max-w-3xl mx-auto mb-16"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: '输入像素网格', value: '128 × 128', sub: '所有数据源统一 resize' },
              { label: '等效分辨率', value: '~10m/像素', sub: 'S2/S1 原生10m，Landsat 30m上采样' },
              { label: 'Embedding 空间', value: '64 × 64 @ 20m', sub: '模型下采样2倍' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-5 text-center">
                <div className="text-xs text-slate-400 mb-1">{item.label}</div>
                <div className="text-xl font-bold text-white">{item.value}</div>
                <div className="text-xs text-slate-500 mt-1">{item.sub}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── 维度-地类关联分析 ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="max-w-4xl mx-auto mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-sky-400" />
            </div>
            <h3 className="text-xl font-bold text-white">维度-地类关联分析</h3>
          </div>
          <p className="text-sm text-slate-400 mb-6">
            通过 Linear Probe 权重分析，每个维度对不同地类的敏感程度。
            颜色越深表示该维度对该地类的判别力越强。
          </p>

          {/* Preset selector */}
          <div className="flex flex-wrap gap-2 mb-6">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPreset(p.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                  selectedPreset === p.id
                    ? 'text-white shadow-sm'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/20'
                }`}
                style={
                  selectedPreset === p.id
                    ? { backgroundColor: p.color, borderColor: p.color }
                    : {}
                }
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Top dimensions bar chart */}
          {currentPreset && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h4 className="text-sm font-medium text-white mb-4">
                {currentPreset.name} — 权重最高的 Top 10 维度
              </h4>
              <div className="space-y-2">
                {currentPreset.top_dims.slice(0, 10).map((dim, i) => {
                  const weight = currentPreset.weights[i]
                  const maxWeight = currentPreset.weights[0]
                  const pct = (weight / maxWeight) * 100
                  return (
                    <div key={dim} className="flex items-center gap-3">
                      <span className="w-12 text-xs text-slate-400 tabular-nums">
                        dim {dim}
                      </span>
                      <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${pct}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.8, delay: i * 0.05 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: currentPreset.color }}
                        />
                      </div>
                      <span className="w-16 text-xs text-slate-300 tabular-nums text-right">
                        {weight.toFixed(3)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 128维热图 */}
          {presets.length > 0 && (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
              <h4 className="text-sm font-medium text-white mb-4">
                128 维权重热图（5 种地类 × 128 维）
              </h4>
              <p className="text-xs text-slate-400 mb-4">
                每行代表一个地类的 Linear Probe 权重分布。颜色越亮表示该维度对该地类的判别力越强。
                金色边框标记每类的 Top-3 维度。
              </p>
              <div className="overflow-x-auto pb-2">
                <div className="min-w-[640px]">
                  {/* Column headers (every 20 dims) */}
                  <div className="flex mb-1" style={{ paddingLeft: '80px' }}>
                    {Array.from({ length: 7 }, (_, i) => (
                      <div
                        key={i}
                        className="text-[10px] text-slate-500 tabular-nums"
                        style={{ width: `${(20 / 128) * 100}%`, minWidth: '80px' }}
                      >
                        dim {i * 20}
                      </div>
                    ))}
                  </div>
                  {/* Heatmap rows */}
                  <div className="space-y-1">
                    {presets.map((preset) => {
                      const maxW = Math.max(...preset.all_weights.map(Math.abs))
                      return (
                        <div key={preset.id} className="flex items-center gap-2">
                          <span
                            className="w-16 text-xs font-medium text-right truncate"
                            style={{ color: preset.color }}
                          >
                            {preset.name}
                          </span>
                          <div className="flex-1 flex h-5">
                            {preset.all_weights.map((w, dimIdx) => {
                              const intensity = Math.abs(w) / (maxW || 1)
                              const isTop3 = preset.top3.includes(dimIdx)
                              return (
                                <div
                                  key={dimIdx}
                                  className="flex-1 h-full relative"
                                  title={`dim ${dimIdx}: ${w.toFixed(4)}`}
                                >
                                  <div
                                    className="w-full h-full rounded-[1px]"
                                    style={{
                                      backgroundColor: `rgba(255,255,255,${intensity * 0.9})`,
                                      outline: isTop3 ? `1.5px solid ${preset.color}` : 'none',
                                      outlineOffset: isTop3 ? '-1px' : '0',
                                      zIndex: isTop3 ? 1 : 0,
                                    }}
                                  />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 mt-4">
            基于 Linear Probe 的 coef_ 权重矩阵提取。单维度通常没有直接语义标签，
            但维度组合编码了可解释的物理/地理属性。
            参考 AlphaEarth "维度功能字典"研究 (Benavides et al., 2025)。
          </p>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center"
        >
          <p className="text-sm text-slate-500 mb-4">
            这是 <span className="text-sky-400">EarthExplorer</span> 项目的核心可视化技术
          </p>
        </motion.div>
      </div>
    </section>
  )
}
