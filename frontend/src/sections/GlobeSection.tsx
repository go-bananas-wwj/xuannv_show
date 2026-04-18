import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Globe, MapPin } from 'lucide-react'
import GlobeViewer from '@/components/GlobeViewer'
import PatchDetailPanel from '@/components/PatchDetailPanel'
import DataSourceSwitcher from '@/components/DataSourceSwitcher'
import GlassPanel from '@/components/GlassPanel'

interface PatchOverlay {
  patch_id: string
  bounds_wgs84: [number, number, number, number]
  sources: Record<string, number>
}

export default function GlobeSection() {
  const [dataSource, setDataSource] = useState<'monthly' | 'embedding'>('monthly')
  const [patches, setPatches] = useState<PatchOverlay[]>([])
  const [selectedPatch, setSelectedPatch] = useState<PatchOverlay | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 从静态 JSON 加载（离线数据，不依赖后端）
    fetch('/data/patches_meta.json')
      .then((res) => res.json())
      .then((data) => {
        const valid = data
          .filter((p: any) => p.bounds_wgs84 && p.bounds_wgs84.length === 4)
          .map((p: any) => ({
            patch_id: p.patch_id,
            bounds_wgs84: p.bounds_wgs84 as [number, number, number, number],
            sources: p.sources,
          }))
        setPatches(valid)
      })
      .catch((err) => console.error('Failed to load patches:', err))
      .finally(() => setLoading(false))
  }, [])

  return (
    <section id="section-globe" className="relative py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Globe className="w-5 h-5 text-cyan-400" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-100">
              训练数据地球可视化
            </h2>
          </div>
          <p className="text-slate-400 max-w-2xl">
            三维地球展示训练数据覆盖区域，点击栅格查看详情
          </p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Globe */}
          <GlassPanel className="lg:flex-1 h-[500px] lg:h-[600px] relative overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              </div>
            ) : (
              <GlobeViewer
                patches={patches}
                selectedPatchId={selectedPatch?.patch_id || null}
                onSelectPatch={setSelectedPatch}
                dataSource={dataSource}
              />
            )}
          </GlassPanel>

          {/* Sidebar */}
          <div className="lg:w-80 space-y-4">
            <GlassPanel className="p-5">
              <h3 className="font-medium text-slate-200 mb-4">数据源切换</h3>
              <DataSourceSwitcher value={dataSource} onChange={setDataSource} />
            </GlassPanel>

            <GlassPanel className="p-5">
              <h3 className="font-medium text-slate-200 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-orange-400" />
                区域信息
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">区域</span>
                  <span className="text-slate-300">哈尔滨新区</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">坐标系</span>
                  <span className="text-slate-300">EPSG:32652</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">栅格数量</span>
                  <span className="text-slate-300 font-mono">{patches.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">时间范围</span>
                  <span className="text-slate-300">2023-01 ~ 2025-10</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">数据源</span>
                  <span className="text-slate-300">5 种传感器</span>
                </div>
              </div>
            </GlassPanel>

            {selectedPatch && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <GlassPanel className="p-5 border-cyan-500/20">
                  <h3 className="font-medium text-cyan-400 mb-2">
                    {selectedPatch.patch_id}
                  </h3>
                  <p className="text-sm text-slate-400 mb-3">
                    传感器: {Object.keys(selectedPatch.sources).length} 种
                  </p>
                  <button
                    onClick={() => setSelectedPatch(null)}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    点击地球其他位置关闭
                  </button>
                </GlassPanel>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Full detail panel */}
      <PatchDetailPanel
        patch={selectedPatch as any}
        onClose={() => setSelectedPatch(null)}
      />
    </section>
  )
}
