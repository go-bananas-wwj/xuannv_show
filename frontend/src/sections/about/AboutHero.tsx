import { motion } from 'framer-motion'
import { ChevronDown, Satellite } from 'lucide-react'

interface AboutHeroProps {
  onExplore: () => void
}

export default function AboutHero({ onExplore }: AboutHeroProps) {
  return (
    <section className="relative min-h-dvh flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0f]">
      {/* Satellite background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60"
        style={{ backgroundImage: 'url(/images/hero-satellite.jpg)' }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f]/80 via-[#0a0a0f]/60 to-[#0a0a0f]/90" />
      {/* Radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-sky-400/10 rounded-full blur-[140px]" />

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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-500/90 backdrop-blur-sm text-white text-sm mb-10 border border-sky-400/50 shadow-lg shadow-sky-500/20"
        >
          <Satellite className="w-4 h-4" />
          <span>面向遥感应用的 AI 数据底座</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="font-display text-6xl md:text-8xl lg:text-9xl font-bold tracking-tight mb-8"
        >
          <span className="text-white">玄女</span>
          <span className="text-sky-400">底座</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-xl md:text-2xl text-slate-300 max-w-2xl mx-auto mb-16 leading-relaxed"
        >
          让遥感分析，像用电一样便捷
        </motion.p>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          onClick={onExplore}
          className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-sky-500 text-white hover:bg-sky-600 transition-all duration-300 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30"
        >
          <span className="font-medium">了解平台</span>
          <ChevronDown className="w-4 h-4 group-hover:translate-y-1 transition-transform" />
        </motion.button>
      </motion.div>
    </section>
  )
}
