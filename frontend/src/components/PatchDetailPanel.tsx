import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MapPin, Calendar, Database, AlertCircle, Layers } from 'lucide-react'
import EmbeddingChannelExplorer from './EmbeddingChannelExplorer'

interface PatchDetail {
  patch_id: string
  bounds: number[]
  bounds_wgs84: number[]
  crs: string
  sources: Record<string, number>
  time_range: string[]
}

interface PatchDetailPanelProps {
  patch: PatchDetail | null
  onClose: () => void
}

const SOURCE_NAMES: Record<string, string> = {
  s2: 'Sentinel-2',
  s1: 'Sentinel-1',
  landsat: 'Landsat',
  s2_hr: '高分光学',
  s1_hr: '高分雷达',
  dem: 'DEM',
  worldcover: 'WorldCover',
  dynamic_world: 'Dynamic World',
  jrc_water: 'JRC Water',
}

function formatPatchId(patchId: string): string {
  const num = patchId.replace(/^patch_0*/, '')
  return `${num}号栅格`
}

export default function PatchDetailPanel({ patch, onClose }: PatchDetailPanelProps) {
  const [matrixUrl, setMatrixUrl] = useState<string | null>(null)
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [matrixError, setMatrixError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [isEnlarged, setIsEnlarged] = useState(false)
  const [showEmbedding, setShowEmbedding] = useState(false)
  const matrixUrlRef = useRef<string | null>(null)
  const currentPatchIdRef = useRef<string | null>(null)

  // Fetch Time×Source Matrix when patch changes
  useEffect(() => {
    if (!patch) {
      if (matrixUrlRef.current) {
        URL.revokeObjectURL(matrixUrlRef.current)
        matrixUrlRef.current = null
      }
      setMatrixUrl(null)
      setMatrixError(false)
      setImgLoaded(false)
      setIsEnlarged(false)
      return
    }

    const patchId = patch.patch_id
    currentPatchIdRef.current = patchId
    setMatrixLoading(true)
    setMatrixError(false)
    setImgLoaded(false)

    const controller = new AbortController()
    const staticUrl = `/data/matrix/${patchId}.png`
    const apiUrl = `/api/patches/${patchId}/matrix`

    const tryLoad = (url: string) => {
      fetch(url, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`Matrix not available: ${res.status}`)
          return res.blob()
        })
        .then((blob) => {
          // Ignore if patch has changed while loading
          if (currentPatchIdRef.current !== patchId) return
          const objectUrl = URL.createObjectURL(blob)
          if (matrixUrlRef.current) {
            URL.revokeObjectURL(matrixUrlRef.current)
          }
          matrixUrlRef.current = objectUrl
          setMatrixUrl(objectUrl)
          setMatrixLoading(false)
        })
        .catch((err) => {
          if (err.name === 'AbortError') return
          if (url === staticUrl) {
            tryLoad(apiUrl)
          } else {
            console.error('Matrix fetch failed:', err)
            if (currentPatchIdRef.current === patchId) {
              setMatrixError(true)
              setMatrixLoading(false)
            }
          }
        })
    }

    tryLoad(staticUrl)

    return () => {
      controller.abort()
    }
  }, [patch?.patch_id])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (matrixUrlRef.current) {
        URL.revokeObjectURL(matrixUrlRef.current)
        matrixUrlRef.current = null
      }
    }
  }, [])

  // Reset embedding panel when patch changes
  useEffect(() => {
    if (!patch) {
      setShowEmbedding(false)
    }
  }, [patch?.patch_id])

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEnlarged) {
          setIsEnlarged(false)
        } else {
          onClose()
        }
      }
    }
    if (patch || isEnlarged) {
      window.addEventListener('keydown', handleKey)
      return () => window.removeEventListener('keydown', handleKey)
    }
  }, [patch, isEnlarged, onClose])

  return (
    <>
    <AnimatePresence>
      {patch && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-3xl mx-4 rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/60">
              <h2 className="text-xl font-bold text-slate-800">
                {formatPatchId(patch.patch_id)}
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-6 max-h-[75vh] overflow-y-auto">
              {/* Time×Source Matrix */}
              <div className="mb-6">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                  Time × Source Matrix
                </p>
                <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  {matrixLoading ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3">
                      <div className="w-8 h-8 border-2 border-sky-300 border-t-sky-500 rounded-full animate-spin" />
                      <p className="text-sm text-slate-400">正在渲染矩阵图...</p>
                    </div>
                  ) : matrixError || !matrixUrl ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400">
                      <AlertCircle className="w-10 h-10 opacity-50" />
                      <p className="text-sm">矩阵图加载失败</p>
                      <p className="text-xs text-slate-400">请检查后端服务是否已启动</p>
                    </div>
                  ) : (
                    <div className="relative">
                      {!imgLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                          <div className="w-8 h-8 border-2 border-sky-300 border-t-sky-500 rounded-full animate-spin" />
                        </div>
                      )}
                      <img
                        src={matrixUrl}
                        alt="Time×Source Matrix"
                        className="min-w-full block cursor-zoom-in"
                        style={{ maxHeight: '400px', width: 'auto' }}
                        onLoad={() => setImgLoaded(true)}
                        onError={() => setMatrixError(true)}
                        onClick={() => setIsEnlarged(true)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Embedding preview with channel explorer */}
              <div className="mb-6">
                <button
                  onClick={() => setShowEmbedding((v) => !v)}
                  className="flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wider mb-3 hover:text-sky-500 transition-colors"
                >
                  <Layers className="w-4 h-4" />
                  {showEmbedding ? '隐藏嵌入数据集' : '展示嵌入数据集'}
                </button>
                <AnimatePresence>
                  {showEmbedding && patch && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <EmbeddingChannelExplorer
                          patchId={patch.patch_id}
                          month="2025-04"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Info grid */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-sky-500 mt-1 shrink-0" />
                  <div>
                    <p className="text-sm text-slate-500 mb-1">坐标边界</p>
                    <p className="text-sm text-slate-700 font-mono">
                      [{patch.bounds_wgs84.map((v) => v.toFixed(4)).join(', ')}]
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{patch.crs}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-sky-500 mt-1 shrink-0" />
                  <div>
                    <p className="text-sm text-slate-500 mb-1">时间范围</p>
                    <p className="text-sm text-slate-700">
                      {patch.time_range[0]} ~ {patch.time_range[1]}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Database className="w-4 h-4 text-sky-500 mt-1 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-slate-500 mb-1">传感器数据</p>
                    <div className="space-y-1 mt-2">
                      {Object.entries(patch.sources).map(([src, count]) => (
                        <div
                          key={src}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50"
                        >
                          <span className="text-sm text-slate-700">
                            {SOURCE_NAMES[src] || src}
                          </span>
                          <span className="text-xs text-sky-600 font-mono">
                            {count} 帧
                          </span>
                        </div>
                      ))}
                      {Object.keys(patch.sources).length === 0 && (
                        <p className="text-sm text-slate-500">暂无传感器数据</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Matrix 放大全屏弹窗 */}
    <AnimatePresence>
      {isEnlarged && matrixUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setIsEnlarged(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={matrixUrl}
              alt="Time×Source Matrix Enlarged"
              className="block rounded-lg shadow-2xl"
              style={{ maxWidth: '95vw', maxHeight: '90vh', width: 'auto', height: 'auto' }}
            />
            {/* 关闭按钮 */}
            <button
              onClick={() => setIsEnlarged(false)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-slate-600 hover:text-slate-900 flex items-center justify-center shadow-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            {/* 提示文字 */}
            <p className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-white/70 text-xs whitespace-nowrap">
              点击任意处关闭
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}
