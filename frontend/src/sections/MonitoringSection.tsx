import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity } from 'lucide-react'
import TaskHeadSelector from '@/components/TaskHeadSelector'
import HeadTransition from '@/components/HeadTransition'
import ResultMapViewer from '@/components/ResultMapViewer'
import GlassPanel from '@/components/GlassPanel'
import config from '@/config.json'

const heads = config.available_heads

export default function MonitoringSection() {
  const [activeHead, setActiveHead] = useState<string | null>(null)

  const selectedHead = heads.find((h) => h.id === activeHead)

  return (
    <section id="section-monitoring" className="relative py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-orange-400" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-100">
              下游监测能力展示
            </h2>
          </div>
          <p className="text-slate-400 max-w-2xl">
            选择 Task Head 查看不同下游任务的推理结果，支持全图缩放查看
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
              className="mb-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-3 h-3 rounded-full animate-pulse"
                  style={{ background: selectedHead.color }}
                />
                <span className="text-slate-300 font-medium">
                  {selectedHead.name}
                </span>
                <span className="text-slate-500 text-sm">
                  {selectedHead.description}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <GlassPanel className="h-[500px] relative overflow-hidden">
          {activeHead ? (
            <div className="relative w-full h-full">
              <HeadTransition isActive={true} color={selectedHead?.color || '#22d3ee'} />
              <ResultMapViewer />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Activity className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                <p className="text-slate-500">选择上方 Task Head 查看推理结果</p>
              </div>
            </div>
          )}
        </GlassPanel>
      </div>
    </section>
  )
}
