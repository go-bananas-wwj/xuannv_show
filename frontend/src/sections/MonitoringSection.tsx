import { useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, Flame, Layers, Brain } from 'lucide-react'
import GlassPanel from '@/components/GlassPanel'
import config from '@/config.json'

const heads = (config as any).available_heads as Array<{
  id: string
  name: string
  icon: string
  description: string
  color: string
}>

const iconMap: Record<string, React.ElementType> = {
  flame: Flame,
  layers: Layers,
  brain: Brain,
}

export default function MonitoringSection() {
  const [activeHead, setActiveHead] = useState<string | null>(null)

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
            动态接帽效果展示不同 Task Head 的推理结果，支持全图缩放查看
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-4 gap-6 mb-8">
          {heads.map((head) => {
            const Icon = iconMap[head.icon] || Flame
            const isActive = activeHead === head.id
            return (
              <motion.button
                key={head.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveHead(isActive ? null : head.id)}
                className={`relative p-6 rounded-xl border text-left transition-all duration-300 ${
                  isActive
                    ? 'border-glow'
                    : 'border-white/5 hover:border-white/10'
                }`}
                style={{
                  background: isActive
                    ? `${head.color}10`
                    : 'rgba(17,24,39,0.6)',
                  borderColor: isActive ? `${head.color}40` : undefined,
                }}
              >
                <Icon
                  className="w-8 h-8 mb-4"
                  style={{ color: head.color }}
                />
                <h3 className="font-medium text-slate-100 mb-2">{head.name}</h3>
                <p className="text-sm text-slate-400">{head.description}</p>
                {isActive && (
                  <motion.div
                    layoutId="head-glow"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      boxShadow: `0 0 30px ${head.color}30, inset 0 0 30px ${head.color}10`,
                    }}
                  />
                )}
              </motion.button>
            )
          })}
        </div>

        <GlassPanel className="min-h-[400px] flex items-center justify-center">
          {activeHead ? (
            <div className="text-center">
              <p className="text-slate-300 mb-2">
                已选择: {heads.find((h) => h.id === activeHead)?.name}
              </p>
              <p className="text-slate-500">MapLibre 结果地图加载中...</p>
            </div>
          ) : (
            <div className="text-center">
              <Activity className="w-16 h-16 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500">选择上方 Task Head 查看推理结果</p>
            </div>
          )}
        </GlassPanel>
      </div>
    </section>
  )
}
