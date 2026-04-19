import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Info,
  ChevronLeft,
  ChevronRight,
  Layers,
  BarChart3,
  Map,
  Zap,
  Eye,
  Droplets,
  Building2,
  TreePine,
} from 'lucide-react'

const TABS = [
  { id: 0, label: '玄女底座是什么', icon: Info },
  { id: 1, label: '能做什么', icon: Zap },
  { id: 2, label: '效果如何', icon: BarChart3 },
  { id: 3, label: '数据集展示', icon: Map },
]

const CAPABILITIES = [
  {
    icon: Eye,
    title: '变化检测',
    desc: '对比两期影像，自动识别新建、拆除等变化区域',
    color: '#f59e0b',
  },
  {
    icon: TreePine,
    title: '土地覆盖分类',
    desc: '识别森林、农田、草地、建筑等地表覆盖类型',
    color: '#22c55e',
  },
  {
    icon: Layers,
    title: '土地利用分类',
    desc: '区分耕地、建设用地、水域等土地利用方式',
    color: '#3b82f6',
  },
  {
    icon: Droplets,
    title: '水体提取',
    desc: '精准提取河流、湖泊、水库等水体边界',
    color: '#06b6d4',
  },
  {
    icon: Building2,
    title: '建筑物提取',
    desc: '自动识别城市建筑分布与密度',
    color: '#ef4444',
  },
]

const METRICS = [
  { label: '变化检测 AUC', value: '0.886', unit: '', desc: '500-shot 哈尔滨新区' },
  { label: '土地覆盖 BA', value: '0.85', unit: '', desc: 'WorldCover 11类' },
  { label: '水体提取 BA', value: '0.85', unit: '', desc: 'JRC Global Surface Water' },
  { label: '训练栅格', value: '424', unit: '个', desc: '哈尔滨新区全覆盖' },
  { label: 'Embedding 维度', value: '128', unit: '维', desc: '像素级稠密表征' },
  { label: '支持传感器', value: '5', unit: '种', desc: 'S2/S1/Landsat/高分光学/高分雷达' },
]

export default function AboutSection() {
  const [activeTab, setActiveTab] = useState(0)
  const [direction, setDirection] = useState(1)

  const goNext = () => {
    setDirection(1)
    setActiveTab((p) => (p + 1) % TABS.length)
  }
  const goPrev = () => {
    setDirection(-1)
    setActiveTab((p) => (p - 1 + TABS.length) % TABS.length)
  }

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 180 : -180,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -180 : 180,
      opacity: 0,
    }),
  }

  const currentTab = TABS[activeTab]
  const CurrentIcon = currentTab.icon

  return (
    <section id="section-about" className="relative py-24 overflow-hidden">
      <div className="w-full px-4 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-10 px-2 md:px-4"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <Info className="w-5 h-5 text-sky-500" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-800">
              平台介绍
            </h2>
          </div>
        </motion.div>

        {/* Full-width carousel container */}
        <div className="relative min-h-[520px] md:min-h-[560px]">
          {/* Left arrow - absolute at screen edge */}
          <button
            onClick={goPrev}
            className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full glass border border-slate-200/80 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-white/90 transition-all duration-300 shadow-sm"
            aria-label="上一个"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {/* Right arrow - absolute at screen edge */}
          <button
            onClick={goNext}
            className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full glass border border-slate-200/80 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-white/90 transition-all duration-300 shadow-sm"
            aria-label="下一个"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Tab content with slide animation */}
          <div className="relative mx-14 md:mx-20 overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              {activeTab === 0 && (
                <motion.div
                  key="tab0"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', damping: 28, stiffness: 180 }}
                >
                  {/* Animated tab title — the ONLY title shown */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.4 }}
                    className="flex items-center justify-center gap-3 mb-10"
                  >
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                      <CurrentIcon className="w-5 h-5 text-sky-500" />
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold text-slate-800">
                      {currentTab.label}
                    </h3>
                  </motion.div>

                  <p className="text-lg text-slate-600 leading-relaxed mb-10 text-center max-w-3xl mx-auto">
                    玄女底座是一个面向遥感应用的<span className="text-sky-600 font-medium">预训练嵌入模型平台</span>。
                    它基于多源异构遥感数据（光学、雷达、高程等）进行预训练，学习像素级的通用表征，
                    并通过灵活的<span className="text-sky-600 font-medium">Task Head</span>架构支持多种下游监测任务。
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="rounded-xl border border-slate-200 bg-white/60 backdrop-blur-sm p-6 hover:shadow-md transition-shadow">
                      <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center mb-3">
                        <Layers className="w-5 h-5 text-sky-500" />
                      </div>
                      <h4 className="font-medium text-slate-700 mb-1">多源融合</h4>
                      <p className="text-sm text-slate-500">整合 Sentinel-2、Sentinel-1、Landsat、高分影像等多种传感器数据</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white/60 backdrop-blur-sm p-6 hover:shadow-md transition-shadow">
                      <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center mb-3">
                        <Zap className="w-5 h-5 text-sky-500" />
                      </div>
                      <h4 className="font-medium text-slate-700 mb-1">预训练表征</h4>
                      <p className="text-sm text-slate-500">128维像素级稠密嵌入向量，捕捉地表特征的丰富语义信息</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white/60 backdrop-blur-sm p-6 hover:shadow-md transition-shadow">
                      <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center mb-3">
                        <BarChart3 className="w-5 h-5 text-sky-500" />
                      </div>
                      <h4 className="font-medium text-slate-700 mb-1">灵活扩展</h4>
                      <p className="text-sm text-slate-500">一个底座 + 多个 Task Head，按需接入不同下游任务</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 1 && (
                <motion.div
                  key="tab1"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', damping: 28, stiffness: 180 }}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.4 }}
                    className="flex items-center justify-center gap-3 mb-10"
                  >
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                      <CurrentIcon className="w-5 h-5 text-sky-500" />
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold text-slate-800">
                      {currentTab.label}
                    </h3>
                  </motion.div>

                  <p className="text-slate-500 text-center mb-8 max-w-xl mx-auto">
                    基于"预训练底座 + 可插拔 Task Head"的架构，一次训练即可支持多种遥感监测任务
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {CAPABILITIES.map((cap) => {
                      const Icon = cap.icon
                      return (
                        <div
                          key={cap.title}
                          className="rounded-xl border border-slate-200 bg-white/60 backdrop-blur-sm p-5 hover:shadow-md transition-shadow"
                        >
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                            style={{ background: `${cap.color}12` }}
                          >
                            <Icon className="w-5 h-5" style={{ color: cap.color }} />
                          </div>
                          <h4 className="font-medium text-slate-700 mb-1">{cap.title}</h4>
                          <p className="text-sm text-slate-500">{cap.desc}</p>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-8 p-4 bg-sky-50 rounded-xl border border-sky-100 max-w-3xl mx-auto">
                    <p className="text-sm text-sky-700 text-center">
                      <span className="font-medium">架构优势：</span>
                      预训练底座学习通用地表表征，Task Head 专注特定任务，
                      新任务只需训练轻量级 Head，无需从头训练整个模型
                    </p>
                  </div>
                </motion.div>
              )}

              {activeTab === 2 && (
                <motion.div
                  key="tab2"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', damping: 28, stiffness: 180 }}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.4 }}
                    className="flex items-center justify-center gap-3 mb-10"
                  >
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                      <CurrentIcon className="w-5 h-5 text-sky-500" />
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold text-slate-800">
                      {currentTab.label}
                    </h3>
                  </motion.div>

                  <p className="text-slate-500 text-center mb-8 max-w-xl mx-auto">
                    在哈尔滨新区 424 个栅格上的训练与验证表现
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
                    {METRICS.map((m) => (
                      <div
                        key={m.label}
                        className="text-center p-5 rounded-xl bg-white/60 backdrop-blur-sm border border-slate-200"
                      >
                        <div className="text-3xl font-bold text-sky-600 mb-1">
                          {m.value}
                          <span className="text-lg text-slate-400 ml-0.5">{m.unit}</span>
                        </div>
                        <div className="text-sm font-medium text-slate-700 mb-1">
                          {m.label}
                        </div>
                        <div className="text-xs text-slate-400">{m.desc}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === 3 && (
                <motion.div
                  key="tab3"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', damping: 28, stiffness: 180 }}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.4 }}
                    className="flex items-center justify-center gap-3 mb-10"
                  >
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                      <CurrentIcon className="w-5 h-5 text-sky-500" />
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold text-slate-800">
                      {currentTab.label}
                    </h3>
                  </motion.div>

                  <p className="text-slate-500 text-center mb-6 max-w-xl mx-auto">
                    哈尔滨新区 424 个栅格的空间分布与覆盖范围
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="rounded-xl bg-white/60 backdrop-blur-sm border border-slate-200 p-6">
                      <h4 className="font-medium text-slate-700 mb-4">空间覆盖</h4>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500">区域</span>
                          <span className="text-slate-700">哈尔滨新区</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">坐标系</span>
                          <span className="text-slate-700 font-mono">EPSG:32652</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">栅格数量</span>
                          <span className="text-slate-700 font-mono">424</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">网格尺寸</span>
                          <span className="text-slate-700 font-mono">26 × 24</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">单栅格尺寸</span>
                          <span className="text-slate-700 font-mono">1280m × 1280m</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">空间分辨率</span>
                          <span className="text-slate-700 font-mono">10m</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/60 backdrop-blur-sm border border-slate-200 p-6">
                      <h4 className="font-medium text-slate-700 mb-4">数据构成</h4>
                      <div className="space-y-3 text-sm">
                        {[
                          { name: 'Sentinel-2 光学影像', count: '182 帧' },
                          { name: 'Sentinel-1 SAR影像', count: '100 帧' },
                          { name: 'Landsat 光学影像', count: '38-54 帧' },
                          { name: '高分光学影像', count: '5 帧' },
                          { name: '高分雷达影像', count: '4 帧' },
                          { name: 'DEM 高程数据', count: '1 帧' },
                        ].map((item) => (
                          <div key={item.name} className="flex justify-between">
                            <span className="text-slate-500">{item.name}</span>
                            <span className="text-slate-700 font-mono">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 p-4 bg-sky-50 rounded-xl border border-sky-100 text-center max-w-3xl mx-auto">
                    <p className="text-sm text-sky-700">
                      时间范围：2023-01 至 2025-10，覆盖多季节、多年份的时序遥感数据
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Dot indicators — fixed at bottom, won't move with content */}
          <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setDirection(tab.id > activeTab ? 1 : -1)
                  setActiveTab(tab.id)
                }}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'bg-sky-500 w-6'
                    : 'bg-slate-300 hover:bg-slate-400'
                }`}
                aria-label={tab.label}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
