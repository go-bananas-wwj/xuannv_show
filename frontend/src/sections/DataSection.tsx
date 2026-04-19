import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, MapPin, Eye, Database } from 'lucide-react'
import {
  MapContainer,
  TileLayer,
  Rectangle,
  Popup,
  useMapEvent,
} from 'react-leaflet'
import type { LatLngBoundsLiteral } from 'leaflet'
import PatchDetailPanel from '@/components/PatchDetailPanel'
import GlassPanel from '@/components/GlassPanel'

interface PatchOverlay {
  patch_id: string
  ix: number
  iy: number
  bounds_wgs84: [number, number, number, number]
  sources: Record<string, number>
  crs: string
  time_range: [string, string]
}

function MapClickHandler({
  onMapClick,
}: {
  onMapClick: () => void
}) {
  useMapEvent('click', onMapClick)
  return null
}

function formatPatchId(patchId: string): string {
  const num = patchId.replace(/^patch_0*/, '')
  return `${num}号栅格`
}

export default function DataSection() {
  const [patches, setPatches] = useState<PatchOverlay[]>([])
  const [previewPatch, setPreviewPatch] = useState<PatchOverlay | null>(null)
  const [detailPatch, setDetailPatch] = useState<PatchOverlay | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/data/patches_meta.json')
      .then((res) => res.json())
      .then((data) => {
        const valid = data
          .filter((p: any) => p.bounds_wgs84 && p.bounds_wgs84.length === 4)
          .map((p: any) => ({
            patch_id: p.patch_id,
            ix: p.ix ?? 0,
            iy: p.iy ?? 0,
            bounds_wgs84: p.bounds_wgs84 as [number, number, number, number],
            sources: p.sources,
            crs: p.crs,
            time_range: p.time_range,
          }))
        setPatches(valid)
      })
      .catch((err) => console.error('Failed to load patches:', err))
      .finally(() => setLoading(false))
  }, [])

  const mapCenter: [number, number] = useMemo(() => {
    if (patches.length === 0) return [45.8, 126.55]
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180
    for (const p of patches) {
      const [, bMinLat, , bMaxLat] = p.bounds_wgs84
      minLat = Math.min(minLat, bMinLat)
      maxLat = Math.max(maxLat, bMaxLat)
      minLon = Math.min(minLon, p.bounds_wgs84[0])
      maxLon = Math.max(maxLon, p.bounds_wgs84[2])
    }
    return [(minLat + maxLat) / 2, (minLon + maxLon) / 2]
  }, [patches])

  const patchBounds = useCallback(
    (p: PatchOverlay): LatLngBoundsLiteral => {
      const [minLon, minLat, maxLon, maxLat] = p.bounds_wgs84
      return [
        [minLat, minLon],
        [maxLat, maxLon],
      ]
    },
    []
  )

  const handleMapClick = () => {
    setPreviewPatch(null)
    setDetailPatch(null)
  }

  const handlePatchClick = (patch: PatchOverlay) => {
    setPreviewPatch(patch)
    setDetailPatch(null)
  }

  return (
    <section id="section-data" className="relative py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <LayoutGrid className="w-5 h-5 text-sky-500" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-800">
              数据与嵌入场浏览
            </h2>
          </div>
          <p className="text-slate-500 max-w-2xl">
            交互式地图展示训练数据覆盖区域，点击栅格矩形查看详情与嵌入预览
          </p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <div className="lg:w-64 space-y-4 shrink-0">
            {/* Region info */}
            <GlassPanel className="p-5">
              <h3 className="font-medium text-slate-700 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-500" />
                区域信息
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">区域</span>
                  <span className="text-slate-700">哈尔滨新区</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">坐标系</span>
                  <span className="text-slate-700 font-mono text-xs">EPSG:32652</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">栅格数量</span>
                  <span className="text-slate-700 font-mono">{patches.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">时间范围</span>
                  <span className="text-slate-700 text-xs">2023-01 ~ 2025-10</span>
                </div>
              </div>
            </GlassPanel>

            {/* Selected patch preview */}
            {previewPatch && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <GlassPanel className="p-5 border-sky-200">
                  <h3 className="font-medium text-slate-700 mb-3 flex items-center gap-2">
                    <Database className="w-4 h-4 text-sky-500" />
                    当前栅格
                  </h3>
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-slate-500">编号</span>
                      <span className="text-slate-700 font-medium">
                        {formatPatchId(previewPatch.patch_id)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">传感器</span>
                      <span className="text-slate-700 font-mono">
                        {Object.keys(previewPatch.sources).length} 种
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">时间</span>
                      <span className="text-slate-700 text-xs">
                        {previewPatch.time_range[0]} ~ {previewPatch.time_range[1]}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setDetailPatch(previewPatch)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 text-white hover:bg-sky-600 transition-colors text-sm font-medium"
                  >
                    <Eye className="w-4 h-4" />
                    查看数据
                  </button>
                </GlassPanel>
              </motion.div>
            )}
          </div>

          {/* Map */}
          <GlassPanel className="lg:flex-1 relative overflow-hidden p-0">
            {loading ? (
              <div className="flex items-center justify-center h-[500px] lg:h-[600px]">
                <div className="w-8 h-8 border-2 border-sky-300 border-t-sky-500 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="h-[500px] lg:h-[600px]">
                <MapContainer
                  center={mapCenter}
                  zoom={13}
                  scrollWheelZoom={true}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapClickHandler onMapClick={handleMapClick} />
                  {patches.map((patch) => {
                    const isPreview = previewPatch?.patch_id === patch.patch_id
                    return (
                      <Rectangle
                        key={patch.patch_id}
                        bounds={patchBounds(patch)}
                        pathOptions={{
                          color: isPreview ? '#f59e0b' : '#0ea5e9',
                          weight: isPreview ? 2.5 : 1,
                          fillColor: isPreview ? '#f59e0b' : '#0ea5e9',
                          fillOpacity: isPreview ? 0.35 : 0.12,
                        }}
                        eventHandlers={{
                          click: (e) => {
                            e.originalEvent.stopPropagation()
                            handlePatchClick(patch)
                          },
                        }}
                      >
                        <Popup>
                          <div className="text-sm">
                            <p className="font-medium text-slate-800">
                              {formatPatchId(patch.patch_id)}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {Object.keys(patch.sources).length} 种传感器
                            </p>
                            <button
                              onClick={() => handlePatchClick(patch)}
                              className="mt-2 flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700"
                            >
                              <Eye className="w-3 h-3" />
                              查看详情
                            </button>
                          </div>
                        </Popup>
                      </Rectangle>
                    )
                  })}
                </MapContainer>
              </div>
            )}
          </GlassPanel>
        </div>
      </div>

      <PatchDetailPanel
        patch={detailPatch as any}
        onClose={() => setDetailPatch(null)}
      />
    </section>
  )
}
