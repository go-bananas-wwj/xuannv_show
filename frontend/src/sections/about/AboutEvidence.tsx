import { useRef, useEffect, useState } from 'react'
import { motion, useInView, useSpring, useTransform } from 'framer-motion'

const coreMetrics = [
  { label: '变化检测 AUC', value: 0.886, unit: '', desc: '500-shot 哈尔滨新区' },
  { label: '建筑提取 F1', value: 0.96, unit: '', desc: 'MLP 分类器，BA 0.96' },
  { label: '水体提取 F1', value: 0.86, unit: '', desc: 'MLP 分类器，BA 0.82' },
  { label: '土地覆盖 BA', value: 0.85, unit: '', desc: 'WorldCover 11 类' },
]

const subMetrics = [
  { label: 'Embedding 维度', value: '128', desc: '维像素级稠密表征' },
  { label: '支持传感器', value: '5', desc: '种' },
  { label: '训练栅格', value: '424', desc: '个' },
  { label: '时间跨度', value: '2023-2025', desc: '多季节覆盖' },
]

function AnimatedNumber({ value, unit = '' }: { value: number; unit?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 })
  const spring = useSpring(0, { duration: 1500, bounce: 0 })
  const display = useTransform(spring, (v) => v.toFixed(3))
  const [displayValue, setDisplayValue] = useState('0.000')

  useEffect(() => {
    if (isInView) {
      spring.set(value)
    }
  }, [isInView, spring, value])

  useEffect(() => {
    const unsub = display.on('change', (v) => setDisplayValue(v))
    return unsub
  }, [display])

  return (
    <span ref={ref} className="tabular-nums">
      {displayValue}
      {unit}
    </span>
  )
}

export default function AboutEvidence() {
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
            数字说话
          </h2>
          <p className="text-lg md:text-xl text-[#86868b] leading-relaxed max-w-2xl mx-auto">
            哈尔滨新区 424 个栅格上的验证表现
          </p>
        </motion.div>

        {/* Core metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {coreMetrics.map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
              className="text-center p-8 rounded-2xl bg-white border border-slate-200"
            >
              <div className="text-4xl md:text-5xl font-bold text-sky-600 mb-2">
                <AnimatedNumber value={m.value} unit={m.unit} />
              </div>
              <div className="text-sm font-medium text-[#1d1d1f] mb-1">{m.label}</div>
              <div className="text-xs text-[#86868b]">{m.desc}</div>
            </motion.div>
          ))}
        </div>

        {/* MLP vs Linear Probe comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          className="mb-16"
        >
          <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 text-center">
            MLP vs Linear Probe 效果对比
          </h3>
          <div className="max-w-2xl mx-auto space-y-3">
            {[
              { task: '建筑提取', linear: 0.295, mlp: 0.956, unit: 'F1' },
              { task: '水体提取', linear: 0.790, mlp: 0.862, unit: 'F1' },
              { task: 'Dynamic World', linear: 0.406, mlp: 0.496, unit: 'F1' },
            ].map((row) => {
              const improvement = ((row.mlp - row.linear) / row.linear * 100).toFixed(0)
              return (
                <div key={row.task} className="flex items-center gap-4 p-3 rounded-xl bg-white border border-slate-200">
                  <div className="w-24 text-sm font-medium text-[#1d1d1f]">{row.task}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                      <span className="w-16">Linear</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-400 rounded-full"
                          style={{ width: `${(row.linear / 1.0) * 100}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-mono">{row.linear.toFixed(3)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="w-16 font-medium text-sky-600">MLP</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-500 rounded-full"
                          style={{ width: `${(row.mlp / 1.0) * 100}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-mono text-sky-600">{row.mlp.toFixed(3)}</span>
                    </div>
                  </div>
                  <div className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                    +{improvement}%
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-[#86868b] text-center mt-3">
            128 维嵌入提供丰富的非线性特征子空间，MLP 能挖掘 Linear Probe 无法捕捉的模式
          </p>
        </motion.div>

        {/* Sub metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          {subMetrics.map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, delay: 0.4 + i * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
              className="text-center p-5 rounded-xl bg-white/60 border border-slate-200"
            >
              <div className="text-2xl font-bold text-[#1d1d1f] mb-1">{m.value}</div>
              <div className="text-xs text-[#86868b]">
                {m.label} {m.desc}
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-sky-600 text-white hover:bg-sky-700 transition-all duration-300 shadow-lg shadow-sky-500/20"
          >
            查看全区域 Mosaic
          </a>
        </motion.div>
      </div>
    </section>
  )
}
