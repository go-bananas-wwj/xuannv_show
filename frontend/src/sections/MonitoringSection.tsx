import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Waves, Play } from 'lucide-react'
import TaskHeadSelector from '@/components/TaskHeadSelector'
import GlassPanel from '@/components/GlassPanel'
import MosaicViewer from '@/components/MosaicViewer'
import PatchDetailModal from '@/components/PatchDetailModal'
import config from '@/config.json'

const heads = config.available_heads

// 从 public/data/patches_meta.json 加载 patches 信息
interface PatchInfo {
  patch_id: string
  ix: number
  iy: number
}

export default function MonitoringSection() {
  const [activeHead, setActiveHead] = useState<string | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState('2025-04_vs_2025-10')
  const [availablePeriods, setAvailablePeriods] = useState<{ label: string; value: string }[]>([])
  const [patches, setPatches] = useState<PatchInfo[]>([])
  const [detailPatch, setDetailPatch] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const selectedHead = heads.find((h) => h.id === activeHead)
  const isChangeDetection = selectedHead?.is_change_detection ?? false

  // 加载 patches 元数据
  useEffect(() => {
    fetch('/data/patches_meta.json')
      .then((res) => res.json())
      .then((data) => {
        setPatches(data.map((p: any) => ({ patch_id: p.patch_id, ix: p.ix, iy: p.iy })))
      })
      .catch((err) => console.error('Failed to load patches meta:', err))
  }, [])

  // 加载可用 period 列表
  useEffect(() => {
    if (!activeHead) return
    fetch(`/api/heads/${activeHead}/available-months`)
      .then((res) => res.json())
      .then((data) => {
        const periods = data.periods || data.months || []
        setAvailablePeriods(periods)
        if (periods.length > 0 && !periods.find((p: any) => p.value === selectedPeriod)) {
          setSelectedPeriod(periods[0].value)
        }
      })
      .catch((err) => console.error('Failed to load periods:', err))
  }, [activeHead])

  // 点击 patch
  const handlePatchClick = useCallback((patchId: string) => {
    setDetailPatch(patchId)
    setIsModalOpen(true)
  }, [])

  const tileSize = 128

  return (
    <section id="section-downstream" className="relative py-24 px-4 snap-start">
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
            基于预训练 embedding 的像素级变化检测。选择任务和时间范围，查看全区域 mosaic 大图，点击任意栅格查看详情。
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
                        <label className="block text-sm text-slate-500 mb-1.5">
                          {isChangeDetection ? '时间范围' : '目标月份'}
                        </label>
                        <select
                          value={selectedPeriod}
                          onChange={(e) => setSelectedPeriod(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
                        >
                          {availablePeriods.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-100 text-slate-500 text-sm">
                        <Play className="w-4 h-4" />
                        选择时间范围后自动加载
                      </div>
                    </div>
                  </GlassPanel>

                  <GlassPanel className="p-5">
                    <h4 className="text-sm font-medium text-slate-600 mb-3">操作说明</h4>
                    <div className="space-y-2 text-xs text-slate-500">
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center shrink-0 text-slate-400 font-mono">1</span>
                        <span>鼠标滚轮缩放 mosaic 大图</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center shrink-0 text-slate-400 font-mono">2</span>
                        <span>拖拽平移查看不同区域</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center shrink-0 text-slate-400 font-mono">3</span>
                        <span>点击任意栅格查看详情弹窗</span>
                      </div>
                    </div>
                  </GlassPanel>
                </div>

                {/* Right result area */}
                <div className="lg:flex-1">
                  <GlassPanel className="h-[600px] flex flex-col p-0 overflow-hidden">
                    <MosaicViewer
                      patches={patches}
                      tileSize={tileSize}
                      headId={activeHead}
                      period={selectedPeriod}
                      onPatchClick={handlePatchClick}
                    />
                  </GlassPanel>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Patch Detail Modal */}
      <PatchDetailModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setDetailPatch(null)
        }}
        patchId={detailPatch}
        headId={activeHead || ''}
        period={selectedPeriod}
      />
    </section>
  )
}
