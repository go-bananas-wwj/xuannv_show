import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Waves, Play, ImageOff } from 'lucide-react'
import TaskHeadSelector from '@/components/TaskHeadSelector'
import GlassPanel from '@/components/GlassPanel'
import config from '@/config.json'

const heads = config.available_heads

const VERSIONS = ['v1', 'v2', 'v3']
const PERIODS = [
  '2023-10_vs_2024-10',
  '2024-04_vs_2025-04',
  '2024-08_vs_2025-08',
  '2024-10_vs_2025-10',
  '2023_vs_2024',
  '2024_vs_2025',
]

const HEAD_METRICS: Record<string, { label: string; value: string }[]> = {
  change_detection: [
    { label: 'Task', value: '像素级二元变化检测' },
    { label: 'Metric', value: 'AUC-ROC / F1' },
  ],
  worldcover: [
    { label: 'Task', value: 'ESA WorldCover 11类分类' },
    { label: 'Classes', value: 'Tree, Shrubland, Grassland, Cropland, Built-up, Bare, Snow, Water, Wetland, Mangroves, Moss' },
    { label: 'Metric', value: 'Balanced Accuracy / F1 (macro)' },
  ],
  dynamic_world: [
    { label: 'Task', value: 'Google Dynamic World 9类分类' },
    { label: 'Classes', value: 'Water, Trees, Grass, Flooded Veg, Crops, Shrub/Scrub, Built, Bare, Snow/Ice' },
    { label: 'Metric', value: 'Balanced Accuracy / F1 (macro)' },
  ],
  jrc_water: [
    { label: 'Task', value: 'JRC Global Surface Water 水体提取' },
    { label: 'Classes', value: 'Non-water, Water' },
    { label: 'Metric', value: 'Balanced Accuracy / F1 (binary)' },
  ],
  building_extraction: [
    { label: 'Task', value: '基于 WorldCover Built-up 的建筑物提取' },
    { label: 'Classes', value: 'Non-building, Building' },
    { label: 'Metric', value: 'Balanced Accuracy / F1 / IoU (binary)' },
  ],
}

export default function MonitoringSection() {
  const [activeHead, setActiveHead] = useState<string | null>(null)
  const [version, setVersion] = useState('v2')
  const [period, setPeriod] = useState(PERIODS[0])
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedHead = heads.find((h) => h.id === activeHead)

  const handleLoadResult = async () => {
    if (!activeHead) return
    setLoading(true)
    setError(null)
    setResultUrl(null)

    const url = `/api/heads/${activeHead}/result?period=${encodeURIComponent(period)}&region=harbin`
    try {
      const res = await fetch(url)
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      setResultUrl(URL.createObjectURL(blob))
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="section-downstream" className="relative py-24 px-4">
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
              <Waves className="w-5 h-5 text-sky-500" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-800">
              下游监测能力展示
            </h2>
          </div>
          <p className="text-slate-500 max-w-2xl">
            基于预训练 embedding 的像素级分类下游任务评估。选择 Task Head 查看不同下游任务的推理结果。
          </p>
        </motion.div>

        <div className="mb-8">
          <TaskHeadSelector
            heads={heads}
            activeHead={activeHead}
            onSelect={setActiveHead}
          />
        </div>

        <AnimatePresence mode="wait">
          {activeHead && selectedHead && (
            <motion.div
              key={activeHead}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Left config panel */}
                <div className="lg:w-80 shrink-0 space-y-4">
                  <GlassPanel className="p-5 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ background: selectedHead.color }}
                      />
                      <h3 className="font-medium text-slate-700">{selectedHead.name}</h3>
                    </div>
                    <p className="text-sm text-slate-500">{selectedHead.description}</p>

                    <div className="pt-2 border-t border-slate-100 space-y-3">
                      <div>
                        <label className="block text-sm text-slate-500 mb-1.5">模型版本</label>
                        <select
                          value={version}
                          onChange={(e) => setVersion(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
                        >
                          {VERSIONS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm text-slate-500 mb-1.5">时间周期</label>
                        <select
                          value={period}
                          onChange={(e) => setPeriod(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
                        >
                          {PERIODS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={handleLoadResult}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50"
                      >
                        <Play className="w-4 h-4" />
                        {loading ? '加载中...' : '查看结果'}
                      </button>
                    </div>
                  </GlassPanel>

                  <GlassPanel className="p-5">
                    <h4 className="text-sm font-medium text-slate-600 mb-3">任务信息</h4>
                    <div className="space-y-2">
                      {(HEAD_METRICS[activeHead] || []).map((m) => (
                        <div key={m.label}>
                          <div className="text-xs text-slate-400">{m.label}</div>
                          <div className="text-sm text-slate-700">{m.value}</div>
                        </div>
                      ))}
                    </div>
                  </GlassPanel>
                </div>

                {/* Right result area */}
                <div className="lg:flex-1">
                  <GlassPanel className="h-[600px] flex flex-col">
                    {resultUrl ? (
                      <div className="flex-1 overflow-auto p-4">
                        <img
                          src={resultUrl}
                          alt={`${selectedHead.name} result`}
                          className="max-w-full h-auto mx-auto rounded-lg"
                        />
                      </div>
                    ) : error ? (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                          <ImageOff className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-sm text-slate-500">{error}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            该任务可能尚未预计算结果图
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                          <Waves className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                          <p className="text-slate-400">
                            选择参数后点击"查看结果"加载推理图
                          </p>
                        </div>
                      </div>
                    )}
                  </GlassPanel>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
