import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Eye, TreePine, Layers, Droplets, Building2 } from 'lucide-react'

const capabilities = [
  {
    id: 'change',
    icon: Eye,
    title: '变化检测',
    headline: '一眼看穿地表变迁',
    desc: '对比两期影像，自动识别新建、拆除等变化区域',
    color: '#f59e0b',
    image: '/images/cap-change.png',
  },
  {
    id: 'worldcover',
    icon: TreePine,
    title: 'WorldCover',
    headline: '11 类地表，逐像素识别',
    desc: 'ESA WorldCover 标准，森林、农田、建筑、水体一目了然',
    color: '#22c55e',
    image: '/images/cap-worldcover.png',
  },
  {
    id: 'dynamic',
    icon: Layers,
    title: 'Dynamic World',
    headline: '动态世界，实时掌握',
    desc: 'Google Dynamic World 9 类分类，捕捉土地利用的细微差异',
    color: '#3b82f6',
    image: '/images/cap-dynamic.png',
  },
  {
    id: 'water',
    icon: Droplets,
    title: 'JRC 水体提取',
    headline: '水域边界，精准勾勒',
    desc: '基于 JRC Global Surface Water，精准提取河流、湖泊、水库',
    color: '#06b6d4',
    image: '/images/cap-water.png',
  },
  {
    id: 'building',
    icon: Building2,
    title: '建筑提取',
    headline: '城市肌理，清晰呈现',
    desc: '自动识别城市建筑分布与密度，红色高亮建筑区域',
    color: '#ef4444',
    image: '/images/cap-building.png',
  },
]

export default function AboutCapabilities() {
  const [activeIdx, setActiveIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observers: IntersectionObserver[] = []
    itemRefs.current.forEach((el, idx) => {
      if (!el) return
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveIdx(idx)
          }
        },
        { threshold: 0.5 }
      )
      observer.observe(el)
      observers.push(observer)
    })
    return () => observers.forEach((o) => o.disconnect())
  }, [])

  const activeCap = capabilities[activeIdx]

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
            五种任务
            <br />
            <span className="text-sky-600">一次满足</span>
          </h2>
          <p className="text-lg md:text-xl text-[#86868b] leading-relaxed max-w-2xl mx-auto">
            从变化检测到建筑提取，覆盖遥感监测的核心场景
          </p>
        </motion.div>
      </div>

      {/* Sticky layout */}
      <div ref={containerRef} className="max-w-7xl mx-auto px-6 md:px-12 pb-24">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Left: Sticky text */}
          <div className="lg:w-1/3">
            <div className="lg:sticky lg:top-[30vh]">
              <motion.div
                key={activeCap.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: `${activeCap.color}15` }}
                >
                  <activeCap.icon className="w-6 h-6" style={{ color: activeCap.color }} />
                </div>
                <div className="text-sm font-medium text-[#86868b] mb-2 uppercase tracking-wider">
                  {activeCap.title}
                </div>
                <h3 className="text-3xl md:text-4xl font-bold text-[#1d1d1f] tracking-tight mb-4">
                  {activeCap.headline}
                </h3>
                <p className="text-base text-[#86868b] leading-relaxed max-w-sm">
                  {activeCap.desc}
                </p>
              </motion.div>

              {/* Progress dots */}
              <div className="flex gap-2 mt-8">
                {capabilities.map((c, i) => (
                  <div
                    key={c.id}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      i === activeIdx ? 'w-8 bg-sky-600' : 'w-4 bg-slate-300'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right: Scrolling images */}
          <div className="lg:w-2/3 space-y-16">
            {capabilities.map((cap, i) => (
              <div
                key={cap.id}
                ref={(el) => { itemRefs.current[i] = el }}
                className="min-h-[50vh] flex items-center"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
                  className="w-full aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shadow-lg"
                >
                  {/* Capability result image */}
                  <img
                    src={cap.image}
                    alt={cap.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      // Fallback to placeholder if image fails
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      const parent = target.parentElement
                      if (parent) {
                        parent.innerHTML = `
                          <div class="w-full h-full flex items-center justify-center" style="background: linear-gradient(135deg, ${cap.color}10 0%, ${cap.color}05 100%)">
                            <div class="text-center">
                              <div class="text-lg font-medium" style="color: ${cap.color}60">${cap.title}</div>
                              <div class="text-sm mt-1" style="color: ${cap.color}40">可视化结果加载中</div>
                            </div>
                          </div>
                        `
                      }
                    }}
                  />
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
