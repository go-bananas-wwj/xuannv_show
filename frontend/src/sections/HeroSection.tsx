import { motion } from 'framer-motion'
import { ChevronDown, Satellite } from 'lucide-react'

interface HeroSectionProps {
  onExplore: () => void
}

export default function HeroSection({ onExplore }: HeroSectionProps) {
  return (
    <section
      id="section-intro"
      className="relative min-h-dvh flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(14,165,233,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-sky-400/5 rounded-full blur-[140px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: 'easeOut' }}
        className="relative z-10 text-center px-4 max-w-4xl mx-auto"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sky-600 text-sm mb-10 border-glow"
        >
          <Satellite className="w-4 h-4" />
          <span>面向遥感应用的AI数据底座</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="font-display text-6xl md:text-8xl lg:text-9xl font-bold tracking-tight mb-8"
        >
          <span className="text-slate-800">玄女</span>
          <span className="text-sky-500 text-glow">底座</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-xl md:text-2xl text-slate-500 max-w-2xl mx-auto mb-6 leading-relaxed"
        >
          多源异构数据嵌入模型可视化平台
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="text-2xl md:text-3xl font-bold text-slate-800 max-w-3xl mx-auto mb-16 leading-snug"
        >
          让遥感模型分析像用电一样便捷
          <span className="text-sky-500">——多种任务，一次满足</span>
        </motion.p>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9 }}
          onClick={onExplore}
          className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-sky-500 text-white hover:bg-sky-600 transition-all duration-300 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30"
        >
          <span className="font-medium">探索数据</span>
          <ChevronDown className="w-4 h-4 group-hover:translate-y-1 transition-transform" />
        </motion.button>
      </motion.div>
    </section>
  )
}
