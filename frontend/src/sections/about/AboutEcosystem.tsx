import { motion } from 'framer-motion'
import { Globe, ExternalLink, Play } from 'lucide-react'

const projects = [
  {
    name: 'EarthExplorer',
    desc: '地球嵌入探索器，交互式可视化全球地理嵌入',
    icon: Globe,
    cta: '观看 Demo 视频',
    action: 'video',
    color: '#0ea5e9',
  },
  {
    name: 'Xuannv Foundations',
    desc: '底层预训练模型，为玄女底座提供强大的嵌入能力',
    icon: ExternalLink,
    cta: '了解模型',
    action: 'link',
    color: '#22c55e',
  },
]

export default function AboutEcosystem() {
  return (
    <section className="relative bg-[#f5f5f7] overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-24">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-[#1d1d1f] tracking-tight mb-6">
            不止于此
          </h2>
          <p className="text-lg md:text-xl text-[#86868b] leading-relaxed max-w-2xl mx-auto">
            玄女底座是 EarthExplorer 生态的一部分
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {projects.map((p, i) => {
            const Icon = p.icon
            return (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
                className="rounded-2xl border border-slate-200 bg-white p-8 hover:shadow-lg transition-shadow duration-300"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: `${p.color}12` }}
                >
                  <Icon className="w-6 h-6" style={{ color: p.color }} />
                </div>
                <h3 className="text-xl font-semibold text-[#1d1d1f] mb-2">{p.name}</h3>
                <p className="text-sm text-[#86868b] leading-relaxed mb-6">{p.desc}</p>
                <button
                  className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
                  style={{ color: p.color }}
                >
                  {p.action === 'video' && <Play className="w-4 h-4" />}
                  {p.cta}
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
