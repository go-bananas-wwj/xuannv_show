import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ZoomIn, ZoomOut, Info, Globe, Image, Sparkles } from 'lucide-react'

interface EmbeddingPreset {
  id: string
  name: string
  color: string
}

interface GlobalEmbeddingModalProps {
  isOpen: boolean
  onClose: () => void
}

const MONTHS = ['2025-04', '2025-06', '2025-08', '2025-09', '2025-10']
const MONTH_LABELS: Record<string, string> = {
  '2025-04': '2025年4月',
  '2025-06': '2025年6月',
  '2025-08': '2025年8月',
  '2025-09': '2025年9月',
  '2025-10': '2025年10月',
}

const IMG_W = 6656
const IMG_H = 6144

export default function GlobalEmbeddingModal({ isOpen, onClose }: GlobalEmbeddingModalProps) {
  const [monthIndex, setMonthIndex] = useState(0)
  const [scale, setScale] = useState(0.15)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [viewMode, setViewMode] = useState<'pca' | 'semantic'>('pca')
  const [activePreset, setActivePreset] = useState<string>('water')
  const [presets, setPresets] = useState<EmbeddingPreset[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const currentMonth = MONTHS[monthIndex]
  const imageUrl = viewMode === 'pca'
    ? `/data/embeddings/global/${currentMonth}.png`
    : `/data/embeddings/semantic/${activePreset}/${currentMonth}.png`

  // Load presets on mount
  useEffect(() => {
    if (!isOpen) return
    fetch('/api/embeddings/presets')
      .then((r) => r.json())
      .then((data: EmbeddingPreset[]) => {
        setPresets(data)
        if (data.length > 0) setActivePreset(data[0].id)
      })
      .catch(() => {})
  }, [isOpen])

  const MIN_SCALE = 0.08
  const MAX_SCALE = 4.0

  // Fit-to-view on open
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const scaleX = rect.width / IMG_W
      const scaleY = rect.height / IMG_H
      const fitScale = Math.min(scaleX, scaleY) * 0.95
      setScale(Math.max(MIN_SCALE, fitScale))
      setOffset({ x: 0, y: 0 })
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKey)
      return () => window.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onClose])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * delta)))
    },
    []
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true)
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    },
    [offset]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    },
    [isDragging, dragStart]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleZoomIn = () => setScale((s) => Math.min(MAX_SCALE, s * 1.3))
  const handleZoomOut = () => setScale((s) => Math.max(MIN_SCALE, s / 1.3))
  const handleReset = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const scaleX = rect.width / IMG_W
      const scaleY = rect.height / IMG_H
      const fitScale = Math.min(scaleX, scaleY) * 0.95
      setScale(Math.max(MIN_SCALE, fitScale))
    } else {
      setScale(0.15)
    }
    setOffset({ x: 0, y: 0 })
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-[95vw] h-[92vh] rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200/60 shrink-0">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-sky-500" />
                <h2 className="text-lg font-bold text-slate-800">全域数据嵌入可视化</h2>
                <span className="text-xs text-slate-400 font-mono">{MONTH_LABELS[currentMonth]}</span>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Main: left image + right sidebar */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left: Image viewport */}
              <div
                ref={containerRef}
                className="flex-1 relative overflow-hidden bg-slate-900 cursor-grab active:cursor-grabbing"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    transformOrigin: 'center center',
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                  }}
                >
                  <img
                    src={imageUrl}
                    alt={`全域嵌入 ${currentMonth}`}
                    className="max-w-none"
                    style={{ imageRendering: 'pixelated' }}
                    draggable={false}
                  />
                </div>

                {/* Zoom controls */}
                <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
                  <button
                    onClick={handleZoomIn}
                    className="w-9 h-9 rounded-lg bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors"
                  >
                    <ZoomIn className="w-4 h-4 text-slate-600" />
                  </button>
                  <button
                    onClick={handleZoomOut}
                    className="w-9 h-9 rounded-lg bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors"
                  >
                    <ZoomOut className="w-4 h-4 text-slate-600" />
                  </button>
                  <button
                    onClick={handleReset}
                    className="w-9 h-9 rounded-lg bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors text-xs font-medium text-slate-600"
                  >
                    适应
                  </button>
                </div>

                {/* Scale indicator */}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/50 text-white text-xs font-mono">
                  {Math.round(scale * 100)}%
                </div>
              </div>

              {/* Right: Sidebar */}
              <div className="w-80 shrink-0 border-l border-slate-200/60 bg-white flex flex-col overflow-y-auto">
                {/* View mode toggle */}
                <div className="p-5 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-500" />
                    视图模式
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setViewMode('pca')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        viewMode === 'pca'
                          ? 'bg-sky-500 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      <Image className="w-3.5 h-3.5" />
                      PCA-RGB
                    </button>
                    <button
                      onClick={() => setViewMode('semantic')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        viewMode === 'semantic'
                          ? 'bg-sky-500 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      语义预设
                    </button>
                  </div>
                </div>

                {/* Semantic preset selector */}
                {viewMode === 'semantic' && (
                  <div className="px-5 py-3 border-b border-slate-100">
                    <div className="flex flex-wrap gap-2">
                      {presets.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setActivePreset(p.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                            activePreset === p.id
                              ? 'text-white shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                          style={
                            activePreset === p.id
                              ? { backgroundColor: p.color, borderColor: p.color }
                              : {}
                          }
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      基于线性探针权重，突出与该地类最相关的嵌入维度
                    </p>
                  </div>
                )}

                {/* Month selector */}
                <div className="p-5 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-sky-500" />
                    月份选择
                  </h3>
                  <input
                    type="range"
                    min={0}
                    max={MONTHS.length - 1}
                    step={1}
                    value={monthIndex}
                    onChange={(e) => setMonthIndex(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-sky-500 mb-3"
                  />
                  <div className="flex flex-wrap gap-2">
                    {MONTHS.map((m, i) => (
                      <button
                        key={m}
                        onClick={() => setMonthIndex(i)}
                        className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                          i === monthIndex
                            ? 'bg-sky-500 text-white font-medium'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {MONTH_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info panel */}
                <div className="p-5 flex-1">
                  {viewMode === 'pca' ? (
                    <>
                      <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <Info className="w-4 h-4 text-sky-500" />
                        什么是地球嵌入？
                      </h3>
                      <div className="text-xs text-slate-500 leading-relaxed space-y-3">
                        <p>
                          地球嵌入（Earth Embedding）是遥感与 AI 交叉领域最近迅速兴起的概念。
                          它借鉴了大语言模型中"词嵌入"的思想——将复杂的卫星影像数据压缩成紧凑的
                          <strong className="text-slate-700">高维向量</strong>，
                          让计算机能够"读懂"地球表面的每一寸土地。
                        </p>
                        <p>
                          上图通过 <strong className="text-slate-700">PCA</strong> 将高维嵌入投影到 RGB 颜色空间进行可视化。
                          不同颜色代表不同的地表特征簇，让你一眼"看见"机器眼中的地球。
                          鼠标滚轮缩放，拖拽平移查看细节。
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <Info className="w-4 h-4 text-sky-500" />
                        🔍 语义预设图例
                      </h3>
                      <div className="text-xs text-slate-500 leading-relaxed space-y-3">
                        <p>
                          <strong className="text-slate-700">语义预设 = AI 的「地类透视」</strong>
                        </p>
                        <p>
                          模型把每个像素编码成 128 个数字的内部特征。我们把
                          <strong className="text-sky-600">跟「{presets.find(p => p.id === activePreset)?.name || ''}」最相关的 3 个特征维度</strong>
                          提取出来，合成一张 RGB 图。
                        </p>

                        <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-medium text-slate-600">👀 看图口诀</p>
                          <div className="grid grid-cols-1 gap-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-base">✨</span>
                              <span><strong className="text-slate-700">颜色越亮越纯</strong> → 模型越确定</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-base">🌑</span>
                              <span><strong className="text-slate-700">发暗发黑</strong> → 模型觉得不是这类</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-base">🎯</span>
                              <span><strong className="text-slate-700">对照卫星图</strong> → 验证准不准</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-medium text-slate-600 mb-1.5">五种地类预设</p>
                          <div className="flex flex-wrap gap-1.5">
                            {presets.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] border"
                                style={{
                                  backgroundColor: `${p.color}10`,
                                  borderColor: `${p.color}30`,
                                  color: p.color,
                                }}
                              >
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                                {p.name}
                              </div>
                            ))}
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-400">
                          技术细节：基于 Linear Probe 权重提取 Top-3 维度，全局归一化后映射 RGB。
                          亮区是模型自己学会的「{presets.find(p => p.id === activePreset)?.name || ''}直觉」。
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Small inline icon for calendar
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
