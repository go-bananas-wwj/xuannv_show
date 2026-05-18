import { motion } from 'framer-motion'
import { MessageSquare, Brain, FileText } from 'lucide-react'

const steps = [
  {
    icon: MessageSquare,
    title: '说',
    desc: '输入自然语言描述',
    example: '"分析哈尔滨新区 2024 年的建筑变化"',
  },
  {
    icon: Brain,
    title: '算',
    desc: '智能体自动调用下游任务模型',
    example: '变化检测 + 建筑提取',
  },
  {
    icon: FileText,
    title: '得',
    desc: '生成包含地图、图表、文字结论的完整报告',
    example: '专业分析报告',
  },
]

export default function AboutIntelligence() {
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
            不只是看
            <br />
            <span className="text-sky-400">还能问</span>
          </h2>
          <p className="text-lg md:text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto">
            自然语言输入，自动生成遥感分析报告
          </p>
        </motion.div>

        <p className="text-center text-slate-400 max-w-2xl mx-auto mb-16">
          输入一句自然语言描述，智能体自动调用下游任务模型，分析结果并生成包含统计图表的专业报告。
          无需编写代码，无需理解模型细节。
        </p>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {steps.map((step, i) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, delay: i * 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                className="text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto mb-5">
                  <Icon className="w-8 h-8 text-sky-400" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-slate-300 mb-2">{step.desc}</p>
                <p className="text-xs text-slate-500 italic">{step.example}</p>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2">
                    <div className="w-8 h-px bg-sky-500/30" />
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
