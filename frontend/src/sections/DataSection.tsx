import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, MapPin } from 'lucide-react'
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

  const maxIx = Math.max(0, ...patches.map((p) => p.ix))
  const maxIy = Math.max(0, ...patches.map((p) => p.iy))
  const cols = maxIx + 1
  const rows = maxIy + 1

  const patchMap = new Map<string, PatchOverlay>()
  for (const p of patches) {
    patchMap.set(`${p.ix},${p.iy}`, p)
  }

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
            基于网格坐标排列的 Patch 平铺视图，点击栅格查看详情与 Embedding 预览
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
                  <span className="text-slate-500">网格尺寸</span>
                  <span className="text-slate-700 font-mono">{cols} × {rows}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">时间范围</span>
                  <span className="text-slate-700 text-xs">2023-01 ~ 2025-10</span>
                </div>
              </div>
            </GlassPanel>
          </div>

          {/* Grid */}
          <GlassPanel className="lg:flex-1 relative overflow-hidden p-4">
            {loading ? (
              <div className="flex items-center justify-center h-[500px]">
                <div className="w-8 h-8 border-2 border-sky-300 border-t-sky-500 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-auto max-h-[70vh]">
                <div
                  className="grid gap-[2px]"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(28px, 1fr))`,
                  }}
                >
                  {Array.from({ length: rows * cols }).map((_, idx) => {
                    const ix = idx % cols
                    const iy = Math.floor(idx / cols)
                    const patch = patchMap.get(`${ix},${iy}`)
                    const isSelected = patch?.patch_id === selectedPatch?.patch_id

                    if (!patch) {
                      return (
                        <div
                          key={idx}
                          className="aspect-square rounded-sm bg-slate-100"
                        />
                      )
                    }

                    return (
                      <button
                        key={patch.patch_id}
                        onClick={() => setSelectedPatch(patch)}
                        className={`aspect-square rounded-sm overflow-hidden relative transition-all duration-150 hover:scale-110 hover:z-10 ${
                          isSelected ? 'ring-2 ring-sky-500 z-10' : ''
                        }`}
                        title={patch.patch_id}
                      >
                        <img
                          src={`/data/embeddings/v2/${patch.patch_id}.png`}
                          alt={patch.patch_id}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      </button>
                    )
                  })}
                </div>

                {/* Legend */}
                <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-sky-400/60" />
                    <span>月度数据</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-amber-500/60" />
                    <span>Embedding</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-slate-100 border border-slate-200" />
                    <span>无数据</span>
                  </div>
                  <span className="ml-auto font-mono">{patches.length} patches</span>
                </div>
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
