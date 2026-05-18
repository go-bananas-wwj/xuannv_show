import { motion } from 'framer-motion'
import { Database, Grid3X3, HardDrive } from 'lucide-react'

const stats = [
  {
    icon: Database,
    value: '5+',
    label: '传感器类型',
    desc: 'S2(10m光学) / S1(10m SAR) / Landsat(30m上采样) / 高分光学 / 高分雷达',
  },
  {
    icon: Grid3X3,
    value: '128×128',
    label: '统一像素网格',
    desc: '所有数据源对齐到 128×128 像素网格，1280m × 1280m 地理覆盖',
  },
  {
    icon: HardDrive,
    value: 'TB 级',
    label: '原始数据量',
    desc: '2023-2025 多季节、多年份时序遥感数据',
  },
]

export default function AboutProblem() {
  return (
    <section className="relative min-h-dvh flex items-center bg-[#0a0a0f] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#0a1628]/50 to-[#0a0a0f]" />
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-12 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-6">
              数据在爆炸
              <br />
              <span className="text-slate-400">分析在掉队</span>
            </h2>
            <p className="text-lg md:text-xl text-slate-300 leading-relaxed mb-6">
              遥感影像以 PB 级增长，但每一次分析都要从零开始
            </p>
            <p className="text-base text-slate-400 leading-relaxed max-w-lg">
              5 种传感器、数百帧影像、TB 级数据 —— 传统方案需要为每个任务单独训练模型，
              标注成本高、复用率低、门槛令人却步。
            </p>
          </motion.div>

          {/* Right: Abstract visualization */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }}
            className="relative h-[400px] md:h-[500px] rounded-2xl overflow-hidden border border-white/10 bg-white/5"
          >
            {/* Abstract data flow visualization */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-full h-full">
                {Array.from({ length: 20 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent"
                    style={{
                      top: `${5 + i * 4.8}%`,
                      left: 0,
                      right: 0,
                    }}
                    animate={{ opacity: [0.2, 0.6, 0.2], x: [-20, 20, -20] }}
                    transition={{
                      duration: 3 + Math.random() * 2,
                      repeat: Infinity,
                      delay: Math.random() * 2,
                    }}
                  />
                ))}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-6xl font-bold text-white/10 font-mono">DATA</div>
                    <div className="text-4xl font-bold text-sky-400/20 font-mono mt-2">OVERLOAD</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
          {stats.map((stat, i) => {
            const Icon = stat.icon
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-sky-400" />
                  </div>
                  <div className="text-3xl font-bold text-white">{stat.value}</div>
                </div>
                <div className="text-sm font-medium text-slate-300 mb-1">{stat.label}</div>
                <div className="text-xs text-slate-500">{stat.desc}</div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
