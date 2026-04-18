import { useState } from 'react'
import { motion } from 'framer-motion'
import { ScanSearch, Play } from 'lucide-react'
import GlassPanel from '@/components/GlassPanel'

const TIME_PRESETS = [
  '2025 全年',
  '2024 全年',
  '2023 全年',
  '2024 Q3-Q4',
  '2025 Q1-Q2',
  '2024-10',
  '2025-10',
]

export default function AnomalySection() {
  const [patchId, setPatchId] = useState('')
  const [version, setVersion] = useState('v2')
  const [timeWindow, setTimeWindow] = useState('2025 全年')

  return (
    <section id="section-anomaly" className="relative py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <ScanSearch className="w-5 h-5 text-sky-500" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-800">
              空间异常检测
            </h2>
          </div>
          <p className="text-slate-500 max-w-2xl">
            检测单个 Patch 在某一时间窗口内的空间异常像素。只需选择单个时间窗口，无需 before/after 对比。
          </p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Control panel */}
          <div className="lg:w-80 shrink-0 space-y-4">
            <GlassPanel className="p-5 space-y-4">
              <h3 className="font-medium text-slate-700">参数配置</h3>

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
                <label className="block text-sm text-slate-500 mb-1.5">时间窗口</label>
                <select
                  value={timeWindow}
                  onChange={(e) => setTimeWindow(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
                >
                  {TIME_PRESETS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 transition-colors">
                <Play className="w-4 h-4" />
                运行检测
              </button>
            </GlassPanel>

            <GlassPanel className="p-5">
              <h3 className="font-medium text-slate-700 mb-3">说明</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                空间异常检测计算每个像素与 Patch 平均 embedding 的 cosine distance。
                亮色区域表示与周围环境差异大的空间异常像素。
              </p>
            </GlassPanel>
          </div>

          {/* Result area */}
          <div className="lg:flex-1 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <GlassPanel className="p-3">
                <h4 className="text-sm font-medium text-slate-600 mb-3 text-center">
                  Sentinel-2 RGB
                </h4>
                <div className="aspect-square rounded-lg bg-slate-100 flex items-center justify-center">
                  <span className="text-xs text-slate-400">选择 Patch 后显示</span>
                </div>
              </GlassPanel>
              <GlassPanel className="p-3">
                <h4 className="text-sm font-medium text-slate-600 mb-3 text-center">
                  Spatial Anomaly Heatmap
                </h4>
                <div className="aspect-square rounded-lg bg-slate-100 flex items-center justify-center">
                  <span className="text-xs text-slate-400">运行检测后显示</span>
                </div>
              </GlassPanel>
              <GlassPanel className="p-3">
                <h4 className="text-sm font-medium text-slate-600 mb-3 text-center">
                  WorldCover GT
                </h4>
                <div className="aspect-square rounded-lg bg-slate-100 flex items-center justify-center">
                  <span className="text-xs text-slate-400">选择 Patch 后显示</span>
                </div>
              </GlassPanel>
            </div>

            <GlassPanel className="p-5">
              <h4 className="text-sm font-medium text-slate-600 mb-3">统计信息</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 text-xs mb-1">Mean Anomaly</div>
                  <div className="text-slate-700 font-mono">—</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 text-xs mb-1">Max Anomaly</div>
                  <div className="text-slate-700 font-mono">—</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 text-xs mb-1">Anomalous Pixels (&gt;0.3)</div>
                  <div className="text-slate-700 font-mono">—</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 text-xs mb-1">Model</div>
                  <div className="text-slate-700 font-mono">{version}</div>
                </div>
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>
    </section>
  )
}
