import { motion } from 'framer-motion'
import { Layers, Zap, BarChart3 } from 'lucide-react'

const features = [
  {
    icon: Layers,
    title: '多源融合',
    desc: '整合 Sentinel-2、Sentinel-1、Landsat、高分影像等多种传感器数据',
  },
  {
    icon: Zap,
    title: '预训练表征',
    desc: '128 维像素级稠密嵌入向量，捕捉地表特征的丰富语义信息',
  },
  {
    icon: BarChart3,
    title: '灵活扩展',
    desc: '一个底座 + 多个 Task Head，按需接入不同下游任务',
  },
]

const heads = [
  { name: '变化检测', color: '#f59e0b' },
  { name: 'WorldCover', color: '#22c55e' },
  { name: 'Dynamic World', color: '#3b82f6' },
  { name: 'JRC Water', color: '#06b6d4' },
  { name: 'Building', color: '#ef4444' },
]

export default function AboutSolution() {
  return (
    <section className="relative min-h-dvh flex items-center bg-gradient-to-b from-[#0a0a0f] via-[#f5f5f7] to-[#f5f5f7] overflow-hidden">
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-12 py-24">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-[#1d1d1f] tracking-tight mb-6">
            一个底座
            <br />
            <span className="text-sky-600">万物可测</span>
          </h2>
          <p className="text-lg md:text-xl text-[#86868b] leading-relaxed max-w-2xl mx-auto">
            预训练嵌入模型 + 可插拔 Task Head，新任务只需训练轻量级头部
          </p>
        </motion.div>

        {/* Architecture diagram */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }}
          className="relative max-w-3xl mx-auto mb-20"
        >
          <div className="flex flex-col items-center gap-8">
            {/* Center hub */}
            <motion.div
              className="w-48 h-48 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center shadow-xl shadow-sky-500/20"
              whileInView={{ scale: [0.9, 1] }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <div className="text-center">
                <div className="text-white text-lg font-bold">玄女底座</div>
                <div className="text-sky-100 text-xs mt-1">预训练嵌入模型</div>
              </div>
            </motion.div>

            {/* Connecting lines and heads */}
            <div className="w-px h-8 bg-gradient-to-b from-sky-400 to-transparent" />

            <div className="flex flex-wrap justify-center gap-4">
              {heads.map((head, i) => (
                <motion.div
                  key={head.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                  className="px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-sm"
                  style={{ borderColor: `${head.color}30` }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: head.color }} />
                    <span className="text-sm font-medium text-[#1d1d1f]">{head.name}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f, i) => {
            const Icon = f.icon
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
                className="rounded-2xl border border-slate-200 bg-white p-8"
              >
                <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center mb-5">
                  <Icon className="w-6 h-6 text-sky-600" />
                </div>
                <h3 className="text-lg font-semibold text-[#1d1d1f] mb-2">{f.title}</h3>
                <p className="text-sm text-[#86868b] leading-relaxed">{f.desc}</p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
