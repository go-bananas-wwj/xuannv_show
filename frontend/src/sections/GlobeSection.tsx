import { useState } from 'react'
import { motion } from 'framer-motion'
import { Globe, MapPin, Layers } from 'lucide-react'
import GlassPanel from '@/components/GlassPanel'

export default function GlobeSection() {
  const [dataSource, setDataSource] = useState<'monthly' | 'embedding'>('monthly')

  return (
    <section id="section-globe" className="relative py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12"
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
            三维地球展示训练数据覆盖区域，支持数据源切换与栅格详情查看
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          <GlassPanel className="lg:col-span-2 min-h-[500px] flex items-center justify-center">
            <div className="text-center">
              <Globe className="w-16 h-16 text-cyan-500/20 mx-auto mb-4" />
              <p className="text-slate-500">CesiumJS 三维地球加载中...</p>
              <p className="text-slate-600 text-sm mt-2">哈尔滨新区栅格覆盖层</p>
            </div>
          </GlassPanel>

          <div className="space-y-4">
            <GlassPanel className="p-6">
              <h3 className="font-medium text-slate-200 mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                数据源切换
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setDataSource('monthly')}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm transition-all ${
                    dataSource === 'monthly'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'
                  }`}
                >
                  月度数据
                </button>
                <button
                  onClick={() => setDataSource('embedding')}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm transition-all ${
                    dataSource === 'embedding'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'
                  }`}
                >
                  Embedding
                </button>
              </div>
            </GlassPanel>

            <GlassPanel className="p-6">
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
                  <span className="text-slate-500">时间范围</span>
                  <span className="text-slate-300">2023-01 ~ 2025-10</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">数据源</span>
                  <span className="text-slate-300">5 种传感器</span>
                </div>
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>
    </section>
  )
}
