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

export default function GlobalEmbeddingModal({ isOpen, onClose }: GlobalEmbeddingModalProps) {
  const [monthIndex, setMonthIndex] = useState(0)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [showInfo, setShowInfo] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentMonth = MONTHS[monthIndex]
  const imageUrl = `/data/embeddings/global/${currentMonth}.png`

  const MIN_SCALE = 0.15
  const MAX_SCALE = 4.0

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
    setScale(1)
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
            className="w-[95vw] h-[90vh] rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200/60 shrink-0">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-sky-500" />
                <h2 className="text-lg font-bold text-slate-800">全域数据嵌入可视化</h2>
                <span className="text-xs text-slate-400 font-mono">{MONTH_LABELS[currentMonth]}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowInfo((v) => !v)}
                  className={`p-2 rounded-lg transition-colors ${showInfo ? 'bg-sky-50 text-sky-600' : 'hover:bg-slate-100 text-slate-400'}`}
                  title="切换介绍文字"
                >
                  <Info className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Image viewport */}
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
                  1:1
                </button>
              </div>

              {/* Scale indicator */}
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/50 text-white text-xs font-mono">
                {Math.round(scale * 100)}%
              </div>
            </div>

            {/* Month slider */}
            <div className="px-6 py-3 border-t border-slate-200/60 shrink-0 bg-white">
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-400 font-medium w-20 text-right">
                  {MONTH_LABELS[MONTHS[0]]}
                </span>
                <input
                  type="range"
                  min={0}
                  max={MONTHS.length - 1}
                  step={1}
                  value={monthIndex}
                  onChange={(e) => {
                    setMonthIndex(Number(e.target.value))
                    handleReset()
                  }}
                  className="flex-1 h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-sky-500"
                />
                <span className="text-xs text-slate-400 font-medium w-20">
                  {MONTH_LABELS[MONTHS[MONTHS.length - 1]]}
                </span>
              </div>
              <div className="flex justify-between px-1 mt-1.5">
                {MONTHS.map((m, i) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMonthIndex(i)
                      handleReset()
                    }}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${
                      i === monthIndex
                        ? 'bg-sky-50 text-sky-600 font-medium'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {MONTH_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            {/* Info panel */}
            <AnimatePresence>
              {showInfo && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden border-t border-slate-200/60 shrink-0"
                >
                  <div className="px-6 py-4 bg-slate-50/80">
                    <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                      <Info className="w-4 h-4 text-sky-500" />
                      什么是地球嵌入？
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      地球嵌入（Earth Embedding）是将卫星影像的每个像素映射到一个高维特征向量的技术，
                      使计算机能够"理解"地表信息。本系统使用 <strong className="text-slate-600">128 维嵌入向量</strong>，
                      由 AlphaEarth Foundations（AEF）预训练模型提取。每个向量编码了该像素位置的地表覆盖类型、
                      纹理特征和语义信息，包括植被、建筑、水体、裸地等地物类别。
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1.5">
                      上图通过 <strong className="text-slate-600">主成分分析（PCA）</strong> 将 128 维特征投影到 RGB 三通道进行可视化。
                      不同颜色区域对应不同的地表特征簇——这种可视化方法与 AEF 论文及 CARTO、AEF Mosaic 等主流实践保持一致。
                      鼠标滚轮缩放，拖拽平移查看细节。
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
