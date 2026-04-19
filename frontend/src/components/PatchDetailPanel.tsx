import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MapPin, Calendar, Database, Image as ImageIcon } from 'lucide-react'

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
  const embeddingUrl = patch
    ? `/data/embeddings/v2/${patch.patch_id}.png`
    : null

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (patch) {
      window.addEventListener('keydown', handleKey)
      return () => window.removeEventListener('keydown', handleKey)
    }
  }, [patch, onClose])

  return (
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
            className="w-full max-w-2xl mx-4 rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-xl shadow-2xl overflow-hidden"
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

            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {/* Embedding preview image */}
              <div className="aspect-video rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-6 overflow-hidden">
                {embeddingUrl ? (
                  <img
                    src={embeddingUrl}
                    alt={`${patch.patch_id} embedding preview`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                      const parent = (e.target as HTMLImageElement).parentElement
                      if (parent) {
                        parent.innerHTML = `
                          <div class="text-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-10 h-10 text-slate-400 mx-auto mb-2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                            <p class="text-sm text-slate-500">暂无预览图</p>
                          </div>
                        `
                      }
                    }}
                  />
                ) : (
                  <div className="text-center">
                    <ImageIcon className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">栅格缩略图</p>
                  </div>
                )}
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
  )
}
