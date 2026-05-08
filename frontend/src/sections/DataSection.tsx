import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, MapPin, Eye, Database, Globe } from 'lucide-react'
import {
  MapContainer,
  TileLayer,
  Rectangle,
  Popup,
  useMap,
  useMapEvent,
} from 'react-leaflet'
import type { LatLngBoundsLiteral } from 'leaflet'

interface PatchOverlay {
  patch_id: string
  ix: number
  iy: number
  bounds_wgs84: [number, number, number, number]
  sources: Record<string, number>
  crs: string
  time_range: [string, string]
}
import PatchDetailPanel from '@/components/PatchDetailPanel'
import GlassPanel from '@/components/GlassPanel'
import { usePatches } from '@/App'
import GlobalEmbeddingModal from '@/components/GlobalEmbeddingModal'

function MapClickHandler({
  onMapClick,
}: {
  onMapClick: () => void
}) {
  useMapEvent('click', onMapClick)
  return null
}

function MapFitBounds({ bounds }: { bounds: LatLngBoundsLiteral }) {
  const map = useMap()
  useMemo(() => {
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 })
    }
  }, [map, bounds])
  return null
}

function useVisiblePatches(patches: PatchOverlay[]) {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set(patches.map((p) => p.patch_id)))
  const map = useMap()
  const updateVisible = useCallback(() => {
    const bounds = map.getBounds()
    const visible = new Set<string>()
    for (const p of patches) {
      const [w, s, e, n] = p.bounds_wgs84
      if (bounds.intersects([
        [s, w],
        [n, e],
      ] as LatLngBoundsLiteral)) {
        visible.add(p.patch_id)
      }
    }
    setVisibleIds(visible)
  }, [map, patches])
  useMapEvent('moveend', updateVisible)
  useMapEvent('zoomend', updateVisible)
  return visibleIds
}

function formatPatchId(patchId: string): string {
  const num = patchId.replace(/^patch_0*/, '')
  return `${num}号栅格`
}

function VisiblePatchesRenderer({
  patches,
  previewPatch,
  patchBounds,
  handlePatchClick,
  setDetailPatch,
}: {
  patches: PatchOverlay[]
  previewPatch: PatchOverlay | null
  patchBounds: (p: PatchOverlay) => LatLngBoundsLiteral
  handlePatchClick: (patch: PatchOverlay) => void
  setDetailPatch: (patch: PatchOverlay | null) => void
}) {
  const visibleIds = useVisiblePatches(patches)
  return (
    <>
      {patches.map((patch) => {
        if (!visibleIds.has(patch.patch_id)) return null
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
                  onClick={() => {
                    handlePatchClick(patch)
                    setDetailPatch(patch)
                  }}
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
    </>
  )
}

export default function DataSection() {
  const patches = usePatches()
  const [previewPatch, setPreviewPatch] = useState<PatchOverlay | null>(null)
  const [detailPatch, setDetailPatch] = useState<PatchOverlay | null>(null)
  const [showGlobalModal, setShowGlobalModal] = useState(false)
  const loading = patches.length === 0

  const allBounds: LatLngBoundsLiteral = useMemo(() => {
    if (patches.length === 0) return [[45.8, 126.55], [45.8, 126.55]]
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180
    for (const p of patches) {
      const [w, s, e, n] = p.bounds_wgs84
      minLat = Math.min(minLat, s)
      maxLat = Math.max(maxLat, n)
      minLon = Math.min(minLon, w)
      maxLon = Math.max(maxLon, e)
    }
    return [[minLat, minLon], [maxLat, maxLon]]
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
              <button
                onClick={() => setShowGlobalModal(true)}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 transition-colors text-sm font-medium"
              >
                <Globe className="w-4 h-4" />
                查看全域数据嵌入
              </button>
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
                  bounds={allBounds}
                  scrollWheelZoom={true}
                  preferCanvas={true}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapFitBounds bounds={allBounds} />
                  <MapClickHandler onMapClick={handleMapClick} />
                  <VisiblePatchesRenderer
                    patches={patches}
                    previewPatch={previewPatch}
                    patchBounds={patchBounds}
                    handlePatchClick={handlePatchClick}
                    setDetailPatch={setDetailPatch}
                  />
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
      <GlobalEmbeddingModal
        isOpen={showGlobalModal}
        onClose={() => setShowGlobalModal(false)}
      />
    </section>
  )
}
