import { useState } from 'react'
import { motion } from 'framer-motion'
import { Flame, Play } from 'lucide-react'
import GlassPanel from '@/components/GlassPanel'

const TIME_KEYS = [
  '2023 全年',
  '2024 全年',
  '2025 全年',
  '2023 Q1-Q2',
  '2023 Q3-Q4',
  '2024 Q1-Q2',
  '2024 Q3-Q4',
  '2025 Q1-Q2',
  '2025 Q3-Q4',
  '2023-06',
  '2023-10',
  '2024-04',
  '2024-08',
  '2024-10',
  '2025-04',
  '2025-08',
  '2025-10',
]

const COMMON_PAIRS = [
  '2024-10 vs 2025-10',
  '2024-08 vs 2025-08',
  '2024-04 vs 2025-04',
  '2023-10 vs 2024-10',
  '2023-06 vs 2024-06',
  '2023 全年 vs 2024 全年',
  '2024 全年 vs 2025 全年',
]

export default function ChangeDetectionSection() {
  const [subTab, setSubTab] = useState<'patch' | 'global'>('patch')
  const [patchId, setPatchId] = useState('')
  const [before, setBefore] = useState('2024-10')
  const [after, setAfter] = useState('2025-10')
  const [threshold, setThreshold] = useState(0)
  const [version, setVersion] = useState('v2')
  const [pair, setPair] = useState(COMMON_PAIRS[0])

  return (
    <section id="section-cd" className="relative py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Flame className="w-5 h-5 text-amber-500" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-800">
              变化检测
            </h2>
          </div>
          <p className="text-slate-500 max-w-2xl">
            选择 Patch 与变化前后时间窗口，实时生成变化热力图与二值化结果。支持 Patch 级实时检测与全局预计算地图。
          </p>
        </motion.div>

        {/* Sub tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setSubTab('patch')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              subTab === 'patch'
                ? 'bg-sky-50 text-sky-600 border border-sky-200'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            🔎 Patch 级实时检测
          </button>
          <button
            onClick={() => setSubTab('global')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              subTab === 'global'
                ? 'bg-sky-50 text-sky-600 border border-sky-200'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            🗺️ 全局预计算地图
          </button>
        </div>

        {subTab === 'patch' && (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="lg:w-80 shrink-0 space-y-4">
              <GlassPanel className="p-5 space-y-4">
                <h3 className="font-medium text-slate-700">检测参数</h3>

                <div>
                  <label className="block text-sm text-slate-500 mb-1.5">Patch ID</label>
                  <input
                    type="text"
                    value={patchId}
                    onChange={(e) => setPatchId(e.target.value)}
                    placeholder="例如 patch_000123"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-500 mb-1.5">模型版本</label>
                  <select
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
                  >
                    <option value="v1">V1 Baseline</option>
                    <option value="v2">V2 Temporal</option>
                    <option value="v3">V3 Dual-Window</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-500 mb-1.5">Before</label>
                  <select
                    value={before}
                    onChange={(e) => setBefore(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
                  >
                    {TIME_KEYS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-500 mb-1.5">After</label>
                  <select
                    value={after}
                    onChange={(e) => setAfter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
                  >
                    {TIME_KEYS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-500 mb-1.5">
                    阈值 (相对最大值比例): {threshold.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 transition-colors">
                  <Play className="w-4 h-4" />
                  生成变化检测
                </button>
              </GlassPanel>
            </div>

            <div className="lg:flex-1 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {['Before 影像', 'After 影像', 'NDVI 差异', '变化热力图', '二值化变化区域', '变化叠加视图'].map(
                  (label) => (
                    <GlassPanel key={label} className="p-3">
                      <h4 className="text-sm font-medium text-slate-600 mb-3 text-center">
                        {label}
                      </h4>
                      <div className="aspect-square rounded-lg bg-slate-100 flex items-center justify-center">
                        <span className="text-xs text-slate-400">等待检测</span>
                      </div>
                    </GlassPanel>
                  )
                )}
              </div>

              <GlassPanel className="p-5">
                <h4 className="text-sm font-medium text-slate-600 mb-3">检测统计</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {['平均变化强度', '最大变化强度', '变化像素数', '当前阈值'].map(
                    (label) => (
                      <div key={label} className="bg-slate-50 rounded-lg p-3">
                        <div className="text-slate-400 text-xs mb-1">{label}</div>
                        <div className="text-slate-700 font-mono">—</div>
                      </div>
                    )
                  )}
                </div>
              </GlassPanel>
            </div>
          </div>
        )}

        {subTab === 'global' && (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="lg:w-80 shrink-0 space-y-4">
              <GlassPanel className="p-5 space-y-4">
                <h3 className="font-medium text-slate-700">全局参数</h3>

                <div>
                  <label className="block text-sm text-slate-500 mb-1.5">模型版本</label>
                  <select
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
                  >
                    <option value="v1">V1 Baseline</option>
                    <option value="v2">V2 Temporal</option>
                    <option value="v3">V3 Dual-Window</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-500 mb-1.5">时间组合</label>
                  <select
                    value={pair}
                    onChange={(e) => setPair(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
                  >
                    {COMMON_PAIRS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-500 mb-1.5">
                    阈值: {threshold.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 transition-colors">
                  <Play className="w-4 h-4" />
                  加载预计算地图
                </button>
              </GlassPanel>
            </div>

            <div className="lg:flex-1">
              <GlassPanel className="h-[600px] flex items-center justify-center">
                <span className="text-slate-400">选择参数后加载全局变化强度图</span>
              </GlassPanel>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
