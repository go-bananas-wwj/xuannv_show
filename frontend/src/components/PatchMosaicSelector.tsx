import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ZoomIn, ZoomOut, Maximize2, Grid3X3, Loader2 } from 'lucide-react'
import type { PatchMeta } from '@/types'

interface PatchMosaicSelectorProps {
  patches: PatchMeta[]
  selectedPatchId: string | null
  onSelectPatch: (patch: PatchMeta) => void
  mosaicUrl: string
}

const TILE_SIZE = 128
const MIN_SCALE = 0.2
const MAX_SCALE = 4.0

export default function PatchMosaicSelector({
  patches,
  selectedPatchId,
  onSelectPatch,
  mosaicUrl,
}: PatchMosaicSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredPatch, setHoveredPatch] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isImageLoading, setIsImageLoading] = useState(true)

  // Compute grid bounds
  const grid = useMemo(() => {
    if (patches.length === 0) {
      return { ixMin: 0, ixMax: 0, iyMin: 0, iyMax: 0, nCols: 1, nRows: 1, mosaicW: TILE_SIZE, mosaicH: TILE_SIZE }
    }
    const ixSet = new Set(patches.map((p) => p.ix))
    const iySet = new Set(patches.map((p) => p.iy))
    const ixMin = Math.min(...ixSet)
    const ixMax = Math.max(...ixSet)
    const iyMin = Math.min(...iySet)
    const iyMax = Math.max(...iySet)
    const nCols = ixMax - ixMin + 1
    const nRows = iyMax - iyMin + 1
    const mosaicW = nCols * TILE_SIZE
    const mosaicH = nRows * TILE_SIZE
    return { ixMin, ixMax, iyMin, iyMax, nCols, nRows, mosaicW, mosaicH }
  }, [patches])

  // Auto-center on mount / patches change / mosaicUrl change
  useEffect(() => {
    setIsImageLoading(true)
    if (patches.length > 0 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const fitScale = Math.min(rect.width / grid.mosaicW, rect.height / grid.mosaicH) * 0.95
      const initialScale = Math.max(Math.min(fitScale, 1.5), MIN_SCALE)
      setScale(initialScale)
      setOffset({
        x: (rect.width - grid.mosaicW * initialScale) / 2,
        y: (rect.height - grid.mosaicH * initialScale) / 2,
      })
    }
  }, [patches.length, grid.mosaicW, grid.mosaicH, mosaicUrl])

  // Wheel zoom (zoom at mouse pointer)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const newScale = Math.min(Math.max(scale * factor, MIN_SCALE), MAX_SCALE)
      const ratio = newScale / scale
      setOffset((prev) => ({
        x: mx - (mx - prev.x) * ratio,
        y: my - (my - prev.y) * ratio,
      }))
      setScale(newScale)
    },
    [scale]
  )

  // Drag pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      setIsDragging(true)
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    },
    [offset]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) {
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }
      if (isDragging) {
        setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
      }
    },
    [isDragging, dragStart]
  )

  const handleMouseUp = useCallback(() => setIsDragging(false), [])
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
    setHoveredPatch(null)
  }, [])

  const resetView = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const fitScale = Math.min(rect.width / grid.mosaicW, rect.height / grid.mosaicH) * 0.95
    const initialScale = Math.max(Math.min(fitScale, 1.5), MIN_SCALE)
    setScale(initialScale)
    setOffset({
      x: (rect.width - grid.mosaicW * initialScale) / 2,
      y: (rect.height - grid.mosaicH * initialScale) / 2,
    })
  }, [grid.mosaicW, grid.mosaicH])

  // Build patch position map for quick lookup
  const patchPositionMap = useMemo(() => {
    const map = new Map<string, { col: number; row: number }>()
    for (const p of patches) {
      const col = p.ix - grid.ixMin
      const row = grid.iyMax - p.iy
      map.set(p.patch_id, { col, row })
    }
    return map
  }, [patches, grid.ixMin, grid.iyMax])

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
      {/* Loading overlay */}
      {isImageLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-30">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
            <span className="text-sm text-slate-500">Mosaic 大图加载中...</span>
          </div>
        </div>
      )}

      {/* Transform container: all children scale/pan together */}
      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          transformOrigin: '0 0',
          width: grid.mosaicW,
          height: grid.mosaicH,
          willChange: 'transform',
        }}
      >
        {/* Background mosaic image */}
        <img
          src={mosaicUrl}
          alt="patch mosaic"
          className="block"
          style={{ width: grid.mosaicW, height: grid.mosaicH }}
          draggable={false}
          onLoad={() => setIsImageLoading(false)}
          onError={() => setIsImageLoading(false)}
        />

        {/* Patch interaction overlays */}
        {patches.map((patch) => {
          const pos = patchPositionMap.get(patch.patch_id)
          if (!pos) return null
          const isHovered = hoveredPatch === patch.patch_id
          const isSelected = selectedPatchId === patch.patch_id

          return (
            <div
              key={patch.patch_id}
              className="absolute"
              style={{
                left: pos.col * TILE_SIZE,
                top: pos.row * TILE_SIZE,
                width: TILE_SIZE,
                height: TILE_SIZE,
                cursor: 'pointer',
                zIndex: isHovered ? 10 : 1,
              }}
              onMouseEnter={() => setHoveredPatch(patch.patch_id)}
              onMouseLeave={() => setHoveredPatch(null)}
              onClick={(e) => {
                e.stopPropagation()
                onSelectPatch(patch)
              }}
            >
              {/* Hover / Selected highlight border */}
              {(isSelected || isHovered) && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    boxShadow: isSelected
                      ? '0 0 0 3px #0ea5e9, 0 4px 12px rgba(0,0,0,0.15)'
                      : '0 0 0 2px rgba(14,165,233,0.6), 0 2px 8px rgba(0,0,0,0.1)',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Tooltip (outside transform container, uses screen coordinates) */}
      <AnimatePresence>
        {hoveredPatch && !isDragging && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute pointer-events-none z-20"
            style={{ left: mousePos.x + 12, top: mousePos.y - 30 }}
          >
            <div className="bg-slate-800/90 backdrop-blur-sm text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 shadow-lg whitespace-nowrap">
              {hoveredPatch}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {patches.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-slate-400 text-sm flex flex-col items-center gap-2">
            <Grid3X3 className="w-8 h-8 opacity-50" />
            <div>暂无 Patch 数据</div>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-20">
        <button
          onClick={(e) => { e.stopPropagation(); setScale((s) => Math.min(s * 1.3, MAX_SCALE)) }}
          className="w-9 h-9 rounded-lg bg-white/80 backdrop-blur-sm border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-white flex items-center justify-center transition-colors shadow-sm"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setScale((s) => Math.max(s / 1.3, MIN_SCALE)) }}
          className="w-9 h-9 rounded-lg bg-white/80 backdrop-blur-sm border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-white flex items-center justify-center transition-colors shadow-sm"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); resetView() }}
          className="w-9 h-9 rounded-lg bg-white/80 backdrop-blur-sm border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-white flex items-center justify-center transition-colors shadow-sm"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Scale indicator */}
      <div className="absolute top-4 right-4 z-20">
        <div className="bg-white/80 backdrop-blur-sm text-slate-600 text-xs px-2.5 py-1 rounded-lg border border-slate-300 shadow-sm">
          {Math.round(scale * 100)}%
        </div>
      </div>

      {/* Info bar */}
      <div className="absolute bottom-4 left-4 z-20">
        <div className="bg-white/80 backdrop-blur-sm text-slate-500 text-xs px-3 py-1.5 rounded-lg border border-slate-300 shadow-sm">
          共 {patches.length} 个 Patch · 滚轮缩放 · 拖拽平移 · 点击选择
        </div>
      </div>
    </div>
  )
}
