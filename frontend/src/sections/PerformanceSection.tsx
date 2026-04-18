import { useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3 } from 'lucide-react'
import GlassPanel from '@/components/GlassPanel'

const TABS = ['训练曲线', '少样本性能', 'MLP下游指标', '模型对比']

export default function PerformanceSection() {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <section id="section-performance" className="relative py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-violet-500" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-800">
              模型性能分析
            </h2>
          </div>
          <p className="text-slate-500 max-w-2xl">
            训练曲线、少样本效果、MLP 下游指标与模型版本横向对比。
          </p>
        </motion.div>

        {/* Sub tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((tab, idx) => (
            <button
              key={tab}
              onClick={() => setActiveTab(idx)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === idx
                  ? 'bg-sky-50 text-sky-600 border border-sky-200'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 0 && (
          <GlassPanel className="p-6">
            <h3 className="text-lg font-medium text-slate-700 mb-4">训练曲线</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {['Total Loss', 'Reconstruction Loss', 'Uniform & Consistency', 'Classification Loss'].map(
                (label) => (
                  <div
                    key={label}
                    className="h-48 rounded-lg bg-slate-50 flex items-center justify-center"
                  >
                    <span className="text-sm text-slate-400">{label} — 图表占位</span>
                  </div>
                )
              )}
            </div>
            <div className="mt-4 p-4 bg-slate-50 rounded-lg">
              <h4 className="text-sm font-medium text-slate-600 mb-2">最终指标</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-slate-400 text-xs">Version</div>
                  <div className="text-slate-700 font-mono">V2</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Epochs</div>
                  <div className="text-slate-700 font-mono">500</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Best Loss</div>
                  <div className="text-slate-700 font-mono">0.2847</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Final LR</div>
                  <div className="text-slate-700 font-mono">1.0e-6</div>
                </div>
              </div>
            </div>
          </GlassPanel>
        )}

        {activeTab === 1 && (
          <GlassPanel className="p-6">
            <h3 className="text-lg font-medium text-slate-700 mb-4">
              少样本变化检测 — 哈尔滨新区 2025 (V2)
            </h3>
            <div className="h-80 rounded-lg bg-slate-50 flex items-center justify-center mb-4">
              <span className="text-sm text-slate-400">Few-Shot AUC 曲线 — 图表占位</span>
            </div>
            <div className="grid grid-cols-5 gap-4 text-sm">
              {[1, 10, 50, 100, 500].map((shot, i) => (
                <div key={shot} className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-slate-400 text-xs mb-1">{shot}-shot</div>
                  <div className="text-slate-700 font-mono font-medium">
                    {[0.495, 0.519, 0.552, 0.587, 0.689][i]}
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>
        )}

        {activeTab === 2 && (
          <GlassPanel className="p-6">
            <h3 className="text-lg font-medium text-slate-700 mb-4">MLP 下游变化检测指标 (V2)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="h-48 rounded-lg bg-slate-50 flex items-center justify-center">
                <span className="text-sm text-slate-400">AUC-ROC 柱状图 — 占位</span>
              </div>
              <div className="h-48 rounded-lg bg-slate-50 flex items-center justify-center">
                <span className="text-sm text-slate-400">F1 Score 柱状图 — 占位</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">类别</th>
                    <th className="text-right py-2 px-3 text-slate-500 font-medium">AUC</th>
                    <th className="text-right py-2 px-3 text-slate-500 font-medium">F1</th>
                    <th className="text-right py-2 px-3 text-slate-500 font-medium">AP</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: '建筑工地', auc: '0.8234±0.0312', f1: '0.7412±0.0289', ap: '0.7856±0.0301' },
                    { name: '房屋拆除', auc: '0.7987±0.0298', f1: '0.7123±0.0312', ap: '0.7567±0.0287' },
                    { name: '非农非粮', auc: '0.8123±0.0276', f1: '0.7345±0.0291', ap: '0.7723±0.0275' },
                  ].map((row) => (
                    <tr key={row.name} className="border-b border-slate-100">
                      <td className="py-2 px-3 text-slate-700">{row.name}</td>
                      <td className="py-2 px-3 text-right text-slate-700 font-mono">{row.auc}</td>
                      <td className="py-2 px-3 text-right text-slate-700 font-mono">{row.f1}</td>
                      <td className="py-2 px-3 text-right text-slate-700 font-mono">{row.ap}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        )}

        {activeTab === 3 && (
          <GlassPanel className="p-6">
            <h3 className="text-lg font-medium text-slate-700 mb-4">模型版本对比</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">指标</th>
                    <th className="text-right py-2 px-3 text-slate-500 font-medium">V1 Baseline</th>
                    <th className="text-right py-2 px-3 text-slate-500 font-medium">V2 Temporal</th>
                    <th className="text-right py-2 px-3 text-slate-500 font-medium">V3 Dual-Window</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['反坍缩机制', 'skip-L2 + raw uniformity', '+ temporal contrastive', '+ non-overlap windows'],
                    ['Embedding Dim', '128', '128', '128'],
                    ['Training Epochs', '400', '500', '600'],
                    ['Harbin CD AUC (500-shot)', '0.512', '0.689', '0.886'],
                    ['JRC Water BA', '0.84', '0.845', '0.85'],
                    ['Precomputed Embeddings', 'Yes', 'Yes', 'Yes'],
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className={`py-2 px-3 ${
                            j === 0 ? 'text-slate-700 font-medium' : 'text-slate-600 text-right'
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        )}
      </div>
    </section>
  )
}
