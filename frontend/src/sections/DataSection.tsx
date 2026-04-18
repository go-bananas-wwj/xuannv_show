import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, MapPin, Eye } from 'lucide-react'
import {
  MapContainer,
  TileLayer,
  Rectangle,
  Popup,
  useMapEvent,
} from 'react-leaflet'
import type { LatLngBoundsLiteral } from 'leaflet'
import PatchDetailPanel from '@/components/PatchDetailPanel'
import DataSourceSwitcher from '@/components/DataSourceSwitcher'
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

export default function DataSection() {
  const [dataSource, setDataSource] = useState<'monthly' | 'embedding'>('monthly')
  const [patches, setPatches] = useState<PatchOverlay[]>([])
  const [selectedPatch, setSelectedPatch] = useState<PatchOverlay | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

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

  const filteredPatches = filter
    ? patches.filter((p) =>
        p.patch_id.toLowerCase().includes(filter.toLowerCase())
      )
    : patches

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
            交互式地图展示训练数据覆盖区域，点击 Patch 矩形查看详情与 Embedding 预览
          </p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <div className="lg:w-72 space-y-4 shrink-0">
            <GlassPanel className="p-5">
              <h3 className="font-medium text-slate-700 mb-4">Patch 选择器</h3>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="搜索 Patch ID..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 mb-3"
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredPatches.slice(0, 50).map((p) => (
                  <button
                    key={p.patch_id}
                    onClick={() => setSelectedPatch(p)}
                    className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                      selectedPatch?.patch_id === p.patch_id
                        ? 'bg-sky-50 text-sky-700'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-mono">{p.patch_id}</span>
                    <span className="text-xs text-slate-400 ml-2">
                      {Object.keys(p.sources).length} sources
                    </span>
                  </button>
                ))}
                {filteredPatches.length > 50 && (
                  <p className="text-xs text-slate-400 px-3 py-1">
                    ...还有 {filteredPatches.length - 50} 个
                  </p>
                )}
              </div>
            </GlassPanel>

            <GlassPanel className="p-5">
              <h3 className="font-medium text-slate-700 mb-4">数据源切换</h3>
              <DataSourceSwitcher value={dataSource} onChange={setDataSource} />
            </GlassPanel>

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

            <GlassPanel className="p-4">
              <h4 className="text-xs font-medium text-slate-500 mb-2">图例</h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border border-sky-500 bg-sky-500/20" />
                  <span className="text-slate-600">Patch 区域</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border-2 border-amber-500 bg-amber-500/30" />
                  <span className="text-slate-600">选中 Patch</span>
                </div>
              </div>
            </GlassPanel>
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
                  <MapClickHandler onMapClick={() => setSelectedPatch(null)} />
                  {patches.map((patch) => {
                    const isSelected = selectedPatch?.patch_id === patch.patch_id
                    return (
                      <Rectangle
                        key={patch.patch_id}
                        bounds={patchBounds(patch)}
                        pathOptions={{
                          color: isSelected ? '#f59e0b' : '#0ea5e9',
                          weight: isSelected ? 2.5 : 1,
                          fillColor: isSelected ? '#f59e0b' : '#0ea5e9',
                          fillOpacity: isSelected ? 0.35 : 0.12,
                        }}
                        eventHandlers={{
                          click: (e) => {
                            e.originalEvent.stopPropagation()
                            setSelectedPatch(patch)
                          },
                        }}
                      >
                        <Popup>
                          <div className="text-sm">
                            <p className="font-mono font-medium text-slate-800">
                              {patch.patch_id}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {Object.keys(patch.sources).length} 种传感器
                            </p>
                            <button
                              onClick={() => setSelectedPatch(patch)}
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
        patch={selectedPatch as any}
        onClose={() => setSelectedPatch(null)}
      />
    </section>
  )
}
