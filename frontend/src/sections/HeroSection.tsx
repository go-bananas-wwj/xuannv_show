import { motion } from 'framer-motion'
import { ChevronDown, Satellite } from 'lucide-react'

interface HeroSectionProps {
  onExplore: () => void
}

export default function HeroSection({ onExplore }: HeroSectionProps) {
  return (
    <section className="relative min-h-dvh flex flex-col items-center justify-center overflow-hidden">
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(34,211,238,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: 'easeOut' }}
        className="relative z-10 text-center px-4"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-cyan-400 text-sm mb-8 border-glow">
          <Satellite className="w-4 h-4" />
          <span>AlphaEarth Foundations 改进版</span>
        </div>

        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6">
          <span className="text-slate-100">玄女</span>
          <span className="text-cyan-400 text-glow">底座</span>
        </h1>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-4 leading-relaxed">
          多传感器融合遥感嵌入模型可视化平台
        </p>
        <p className="text-sm text-slate-500 max-w-xl mx-auto mb-12">
          128-dim embedding · Sentinel-2 / Sentinel-1 / Landsat / 高分影像 ·
          哈尔滨新区全覆盖
        </p>

        <button
          onClick={onExplore}
          className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-all duration-300"
        >
          <span className="font-medium">探索数据</span>
          <ChevronDown className="w-4 h-4 group-hover:translate-y-1 transition-transform" />
        </button>
      </motion.div>

      {/* Floating particles */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-space-950" />
    </section>
  )
}
