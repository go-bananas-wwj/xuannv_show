import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

interface PatchInfo {
  patch_id: string
  ix: number
  iy: number
}

interface MosaicViewerProps {
  patches: PatchInfo[]
  tileSize: number
  headId: string
  period: string
  onPatchClick: (patchId: string) => void
  loading?: boolean
}

export default function MosaicViewer({
  patches,
  tileSize,
  headId,
  period,
  onPatchClick,
  loading: parentLoading = false,
}: MosaicViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredPatch, setHoveredPatch] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [loadedCount, setLoadedCount] = useState(0)

  // 计算网格边界
  const grid = useMemo(() => {
    if (patches.length === 0) {
      return { ixMin: 0, ixMax: 0, iyMin: 0, iyMax: 0, nCols: 1, nRows: 1, mosaicW: tileSize, mosaicH: tileSize }
    }
    const ixSet = new Set(patches.map((p) => p.ix))
    const iySet = new Set(patches.map((p) => p.iy))
    const ixMin = Math.min(...ixSet)
    const ixMax = Math.max(...ixSet)
    const iyMin = Math.min(...iySet)
    const iyMax = Math.max(...iySet)
    const nCols = ixMax - ixMin + 1
    const nRows = iyMax - iyMin + 1
    const mosaicW = nCols * tileSize
    const mosaicH = nRows * tileSize
    return { ixMin, ixMax, iyMin, iyMax, nCols, nRows, mosaicW, mosaicH }
  }, [patches, tileSize])

  // 自动居中（patches 加载完成后）
  useEffect(() => {
    if (patches.length > 0 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const imgW = grid.mosaicW
      const imgH = grid.mosaicH
      const fitScale = Math.min(rect.width / imgW, rect.height / imgH) * 0.95
      const initialScale = Math.min(fitScale, 1)
      const offsetX = (rect.width - imgW * initialScale) / 2
      const offsetY = (rect.height - imgH * initialScale) / 2
      setScale(initialScale)
      setOffset({ x: offsetX, y: offsetY })
    }
  }, [patches.length, grid.mosaicW, grid.mosaicH])

  // 滚轮缩放
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
      const newScale = Math.min(Math.max(scale * zoomFactor, 0.3), 8)

      const scaleRatio = newScale / scale
      const newOffsetX = mouseX - (mouseX - offset.x) * scaleRatio
      const newOffsetY = mouseY - (mouseY - offset.y) * scaleRatio

      setScale(newScale)
      setOffset({ x: newOffsetX, y: newOffsetY })
    },
    [scale, offset]
  )

  // 拖拽开始
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      setIsDragging(true)
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    },
    [offset]
  )

  // 拖拽移动
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      if (isDragging) {
        setOffset({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        })
      }
    },
    [isDragging, dragStart]
  )

  // 拖拽结束
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // 鼠标离开
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
    setHoveredPatch(null)
  }, [])

  // 重置视图
  const resetView = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const allLoaded = loadedCount >= patches.length && patches.length > 0
  const isLoading = parentLoading || (!allLoaded && patches.length > 0)

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-50 rounded-xl overflow-hidden cursor-crosshair select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">
              加载 patches 中... ({loadedCount}/{patches.length})
            </p>
          </div>
        </div>
      ) : null}

      {/* Patch Tiles — 每个 patch 是独立的 <img> 元素 */}
      {patches.map((patch) => {
        const col = patch.ix - grid.ixMin
        const row = grid.iyMax - patch.iy
        const tileUrl = `/api/heads/${headId}/patch/${patch.patch_id}/tile?period=${encodeURIComponent(period)}`
        const isHovered = hoveredPatch === patch.patch_id

        return (
          <img
            key={patch.patch_id}
            src={tileUrl}
            alt={patch.patch_id}
            loading="lazy"
            className="absolute cursor-pointer transition-opacity duration-150"
            style={{
              left: offset.x + col * tileSize * scale,
              top: offset.y + row * tileSize * scale,
              width: tileSize * scale,
              height: tileSize * scale,
              opacity: isLoading && !allLoaded ? 0.3 : 1,
              imageRendering: 'auto',
              borderRadius: 2,
              boxShadow: isHovered
                ? '0 0 8px 2px rgba(14,165,233,0.6), inset 0 0 0 2px rgba(14,165,233,0.8)'
                : 'none',
              zIndex: isHovered ? 10 : 1,
            }}
            onLoad={() => setLoadedCount((c) => c + 1)}
            onMouseEnter={() => setHoveredPatch(patch.patch_id)}
            onMouseLeave={() => setHoveredPatch(null)}
            onClick={() => onPatchClick(patch.patch_id)}
            draggable={false}
          />
        )
      })}

      {/* Tooltip */}
      <AnimatePresence>
        {hoveredPatch && !isDragging && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute pointer-events-none z-20"
            style={{
              left: mousePos.x + 12,
              top: mousePos.y - 30,
            }}
          >
            <div className="bg-slate-800/90 backdrop-blur-sm text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 shadow-lg whitespace-nowrap">
              {hoveredPatch}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 缩放控制按钮 */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-20">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setScale((s) => Math.min(s * 1.3, 8))
          }}
          className="w-9 h-9 rounded-lg bg-white/80 backdrop-blur-sm border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-white flex items-center justify-center transition-colors shadow-sm"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setScale((s) => Math.max(s / 1.3, 0.3))
          }}
          className="w-9 h-9 rounded-lg bg-white/80 backdrop-blur-sm border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-white flex items-center justify-center transition-colors shadow-sm"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            resetView()
          }}
          className="w-9 h-9 rounded-lg bg-white/80 backdrop-blur-sm border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-white flex items-center justify-center transition-colors shadow-sm"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* 缩放比例显示 */}
      <div className="absolute top-4 right-4 z-20">
        <div className="bg-white/80 backdrop-blur-sm text-slate-600 text-xs px-2.5 py-1 rounded-lg border border-slate-300 shadow-sm">
          {Math.round(scale * 100)}%
        </div>
      </div>
    </div>
  )
}
