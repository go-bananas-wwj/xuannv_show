import { motion } from 'framer-motion'
import { ArrowRight, BookOpen } from 'lucide-react'

export default function AboutClosing() {
  return (
    <section className="relative min-h-[80vh] flex flex-col items-center justify-center bg-[#0a0a0f] overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40"
        style={{ backgroundImage: 'url(/images/hero-satellite.jpg)' }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f]/90 via-[#0a0a0f]/70 to-[#0a0a0f]/95" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sky-400/10 rounded-full blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative z-10 text-center px-4 max-w-3xl mx-auto"
      >
        <h2 className="font-display text-4xl md:text-5xl lg:text-7xl font-bold text-white tracking-tight mb-6">
          开始你的
          <br />
          <span className="text-sky-400">遥感分析之旅</span>
        </h2>
        <p className="text-lg md:text-xl text-slate-300 leading-relaxed mb-12 max-w-xl mx-auto">
          玄女底座，让每一次分析都站在巨人的肩膀上
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="/"
            className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-sky-500 text-white hover:bg-sky-600 transition-all duration-300 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30"
          >
            <span className="font-medium">进入平台</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/20 text-white hover:bg-white/5 transition-all duration-300"
          >
            <BookOpen className="w-4 h-4" />
            <span className="font-medium">查看文档</span>
          </a>
        </div>
      </motion.div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 py-8 text-center">
        <p className="text-sm text-slate-500">
          玄女底座 Visualization Platform · Xuannv Foundations
        </p>
      </div>
    </section>
  )
}
