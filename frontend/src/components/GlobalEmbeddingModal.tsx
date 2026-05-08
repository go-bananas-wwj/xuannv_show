import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ZoomIn, ZoomOut, Info, Globe } from 'lucide-react'

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
  const containerRef = useRef<HTMLDivElement>(null)

  const currentMonth = MONTHS[monthIndex]
  const imageUrl = `/data/embeddings/global/${currentMonth}.png`

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
                      传统的遥感分析需要人工设计特征、标注大量样本。而地球嵌入通过自监督学习
                      从海量卫星影像中提取通用表征：植被、建筑、水体、道路、农田……所有地物
                      类型都被编码为向量空间中的坐标。相似的地表环境产生相似的嵌入向量，
                      不同的环境则分布在向量空间的不同区域。
                    </p>
                    <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                      <p className="text-xs font-medium text-slate-600">这种"地表语义向量"具有惊人的通用性：</p>
                      <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
                        <li>无需重新训练即可适配变化检测、地物分类、相似性检索等下游任务</li>
                        <li>跨时间、跨区域保持一致性，支持长时序监测与全球尺度分析</li>
                        <li>向量运算揭示地理规律——嵌入差分可量化城市化进程、植被退化、灾害影响</li>
                      </ul>
                    </div>
                    <p>
                      上图通过 <strong className="text-slate-700">PCA</strong> 将高维嵌入投影到 RGB 颜色空间进行可视化。
                      不同颜色代表不同的地表特征簇，让你一眼"看见"机器眼中的地球。
                      鼠标滚轮缩放，拖拽平移查看细节。
                    </p>
                  </div>
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
