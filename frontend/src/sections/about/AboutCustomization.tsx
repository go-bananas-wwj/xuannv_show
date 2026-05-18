import { motion } from 'framer-motion'
import { Upload, MousePointer, Cpu, Rocket } from 'lucide-react'

const steps = [
  {
    icon: Upload,
    title: '上传影像',
    desc: '导入你的遥感影像数据',
  },
  {
    icon: MousePointer,
    title: 'SAM3 辅助标注',
    desc: '交互式点击，AI 自动生成分割掩膜',
  },
  {
    icon: Cpu,
    title: '一键训练',
    desc: '基于标注数据训练专属 Task Head',
  },
  {
    icon: Rocket,
    title: '部署使用',
    desc: '新 Head 立即接入底座，开始推理',
  },
]

export default function AboutCustomization() {
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
            你的数据
            <br />
            <span className="text-sky-400">你的模型</span>
          </h2>
          <p className="text-lg md:text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto">
            SAM3 交互标注 + 一键训练，打造专属 Task Head
          </p>
        </motion.div>

        <p className="text-center text-slate-400 max-w-2xl mx-auto mb-16">
          对现有模型结果不满意？用 SAM3 快速标注自定义数据，一键训练新的 Task Head，
          让底座适配你的专属场景。
        </p>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {steps.map((step, i) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
                className="text-center p-6 rounded-2xl border border-white/10 bg-white/5"
              >
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-6 h-6 text-sky-400" />
                </div>
                <div className="text-sm font-medium text-sky-400 mb-1">步骤 {i + 1}</div>
                <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-slate-400">{step.desc}</p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
