import { motion, AnimatePresence } from 'framer-motion'
import { X, MapPin, Calendar, Database, Image as ImageIcon } from 'lucide-react'
import GlassPanel from './GlassPanel'

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

export default function PatchDetailPanel({ patch, onClose }: PatchDetailPanelProps) {
  return (
    <AnimatePresence>
      {patch && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed top-0 right-0 h-full w-full max-w-md z-50"
        >
          <GlassPanel className="h-full overflow-y-auto p-6 border-l border-white/10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-100">{patch.patch_id}</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Thumbnail placeholder */}
            <div className="aspect-video rounded-lg bg-space-900/80 border border-white/5 flex items-center justify-center mb-6">
              <div className="text-center">
                <ImageIcon className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500">栅格缩略图</p>
              </div>
            </div>

            {/* Info grid */}
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-cyan-400 mt-1 shrink-0" />
                <div>
                  <p className="text-sm text-slate-500 mb-1">坐标边界</p>
                  <p className="text-sm text-slate-300 font-mono">
                    [{patch.bounds_wgs84.map((v) => v.toFixed(4)).join(', ')}]
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{patch.crs}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-cyan-400 mt-1 shrink-0" />
                <div>
                  <p className="text-sm text-slate-500 mb-1">时间范围</p>
                  <p className="text-sm text-slate-300">
                    {patch.time_range[0]} ~ {patch.time_range[1]}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Database className="w-4 h-4 text-cyan-400 mt-1 shrink-0" />
                <div>
                  <p className="text-sm text-slate-500 mb-1">传感器数据</p>
                  <div className="space-y-1 mt-2">
                    {Object.entries(patch.sources).map(([src, count]) => (
                      <div
                        key={src}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5"
                      >
                        <span className="text-sm text-slate-300">
                          {SOURCE_NAMES[src] || src}
                        </span>
                        <span className="text-xs text-cyan-400 font-mono">
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
          </GlassPanel>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
