import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

interface PatchInfo {
  patch_id: string
  ix: number
  iy: number
}

interface MosaicViewerProps {
  mosaicUrl: string | null
  patches: PatchInfo[]
  tileSize: number
  onPatchClick: (patchId: string) => void
  loading?: boolean
}

export default function MosaicViewer({
  mosaicUrl,
  patches,
  tileSize,
  onPatchClick,
  loading = false,
}: MosaicViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredPatch, setHoveredPatch] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [imgLoaded, setImgLoaded] = useState(false)

  // 计算网格边界
  const grid = useMemo(() => {
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

    // 建立坐标到 patch 的映射
    const coordMap = new Map<string, string>()
    patches.forEach((p) => {
      coordMap.set(`${p.ix},${p.iy}`, p.patch_id)
    })

    return { ixMin, ixMax, iyMin, iyMax, nCols, nRows, mosaicW, mosaicH, coordMap }
  }, [patches, tileSize])

  // 将屏幕坐标转换为 mosaic 上的像素坐标
  const screenToMosaic = useCallback(
    (sx: number, sy: number) => {
      if (!containerRef.current) return { x: 0, y: 0 }
      const rect = containerRef.current.getBoundingClientRect()
      const mx = (sx - rect.left - offset.x) / scale
      const my = (sy - rect.top - offset.y) / scale
      return { x: mx, y: my }
    },
    [offset, scale]
  )

  // 根据 mosaic 像素坐标查找 patch
  const getPatchAtPos = useCallback(
    (mx: number, my: number): string | null => {
      const col = Math.floor(mx / tileSize)
      const row = Math.floor(my / tileSize)
      const iy = grid.iyMax - row // iy=0 在顶部
      const ix = grid.ixMin + col
      return grid.coordMap.get(`${ix},${iy}`) || null
    },
    [grid, tileSize]
  )

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

      // 以鼠标位置为中心缩放
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

      // 更新 tooltip 位置
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })

      // 更新悬停 patch
      const { x: mx, y: my } = screenToMosaic(e.clientX, e.clientY)
      const patchId = getPatchAtPos(mx, my)
      setHoveredPatch(patchId)

      if (isDragging) {
        setOffset({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        })
      }
    },
    [isDragging, dragStart, screenToMosaic, getPatchAtPos]
  )

  // 拖拽结束
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // 点击 patch
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return
      const { x: mx, y: my } = screenToMosaic(e.clientX, e.clientY)
      const patchId = getPatchAtPos(mx, my)
      if (patchId) {
        onPatchClick(patchId)
      }
    },
    [isDragging, screenToMosaic, getPatchAtPos, onPatchClick]
  )

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

  // 自动居中（首次加载）
  useEffect(() => {
    if (imgLoaded && containerRef.current) {
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
  }, [imgLoaded, grid.mosaicW, grid.mosaicH])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-900 rounded-xl overflow-hidden cursor-crosshair select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {loading || !mosaicUrl ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">加载 mosaic 中...</p>
          </div>
        </div>
      ) : (
        <>
          <img
            src={mosaicUrl}
            alt="Mosaic"
            className="absolute origin-top-left"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              width: grid.mosaicW,
              height: grid.mosaicH,
              imageRendering: 'auto',
            }}
            draggable={false}
            onLoad={() => setImgLoaded(true)}
          />

          {/* 悬停高亮框 */}
          <AnimatePresence>
            {hoveredPatch && !isDragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute pointer-events-none"
                style={{
                  left: offset.x,
                  top: offset.y,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              >
                {/* 找到 hoveredPatch 的坐标并画框 */}
                <HoveredPatchOverlay
                  patches={patches}
                  hoveredPatch={hoveredPatch}
                  tileSize={tileSize}
                  grid={grid}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tooltip */}
          <AnimatePresence>
            {hoveredPatch && !isDragging && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute pointer-events-none z-10"
                style={{
                  left: mousePos.x + 12,
                  top: mousePos.y - 30,
                }}
              >
                <div className="bg-slate-800/90 backdrop-blur-sm text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 shadow-lg whitespace-nowrap">
                  {hoveredPatch}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* 缩放控制按钮 */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setScale((s) => Math.min(s * 1.3, 8))
          }}
          className="w-9 h-9 rounded-lg bg-slate-800/80 backdrop-blur-sm border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setScale((s) => Math.max(s / 1.3, 0.3))
          }}
          className="w-9 h-9 rounded-lg bg-slate-800/80 backdrop-blur-sm border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            resetView()
          }}
          className="w-9 h-9 rounded-lg bg-slate-800/80 backdrop-blur-sm border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* 缩放比例显示 */}
      <div className="absolute top-4 right-4 z-10">
        <div className="bg-slate-800/80 backdrop-blur-sm text-slate-300 text-xs px-2.5 py-1 rounded-lg border border-slate-600">
          {Math.round(scale * 100)}%
        </div>
      </div>
    </div>
  )
}

// 悬停高亮框子组件
function HoveredPatchOverlay({
  patches,
  hoveredPatch,
  tileSize,
  grid,
}: {
  patches: PatchInfo[]
  hoveredPatch: string
  tileSize: number
  grid: { ixMin: number; iyMax: number; nRows: number }
}) {
  const patch = patches.find((p) => p.patch_id === hoveredPatch)
  if (!patch) return null

  const col = patch.ix - grid.ixMin
  // iy=0 在顶部，所以 row = grid.iyMax - patch.iy
  const actualRow = grid.iyMax - patch.iy

  return (
    <div
      className="absolute border-2 border-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]"
      style={{
        left: col * tileSize,
        top: actualRow * tileSize,
        width: tileSize,
        height: tileSize,
      }}
    />
  )
}
