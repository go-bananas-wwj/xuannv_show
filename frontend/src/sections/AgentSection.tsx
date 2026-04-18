import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, Send, FileText, BarChart3 } from 'lucide-react'
import GlassPanel from '@/components/GlassPanel'

const EXAMPLES = [
  '找出哈尔滨新区 2024 年 3 月到 8 月之间新建的建筑工地',
  '生成松北新区的土地变化监测报告，重点关注农田转建设用地',
  '对比 2023 全年与 2024 全年的城市扩张区域',
]

export default function AgentSection() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setResult(null)
    // Mock API call
    setTimeout(() => {
      setResult(
        `## 监测任务报告\n\n**任务描述**: ${prompt}\n\n**执行结果**:\n- 检测到变化区域: 12 处\n- 主要变化类型: construction (8), demolition (3), land_conversion (1)\n- 总面积变化: 约 45.6 公顷\n\n**详细分析**:\n变化主要集中在松北区北部的新建开发区，其中建筑工地变化最为显著，与季度 SAR 监测数据高度吻合。`
      )
      setLoading(false)
    }, 1500)
  }

  return (
    <section id="section-agent" className="relative py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-violet-400" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-100">
              智能体任务报告
            </h2>
          </div>
          <p className="text-slate-400 max-w-2xl">
            用自然语言描述遥感监测需求，智能体自动解析并生成任务报告
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <GlassPanel className="p-6">
              <label className="block text-sm font-medium text-slate-300 mb-3">
                描述您的监测需求
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：找出哈尔滨新区 2024 年 3 月到 8 月之间新建的建筑工地..."
                className="w-full h-32 bg-space-900/50 border border-white/10 rounded-xl p-4 text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all"
              />
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-slate-500">
                  {prompt.length} 字符
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !prompt.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                      分析中...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      提交任务
                    </>
                  )}
                </button>
              </div>
            </GlassPanel>

            <GlassPanel className="p-6">
              <h3 className="text-sm font-medium text-slate-300 mb-3">
                示例提示词
              </h3>
              <div className="space-y-2">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(ex)}
                    className="w-full text-left px-4 py-3 rounded-lg bg-white/5 text-sm text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-all"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </GlassPanel>
          </div>

          <div className="space-y-4">
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <GlassPanel className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-cyan-400" />
                    <h3 className="font-medium text-slate-200">任务报告</h3>
                  </div>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <div className="whitespace-pre-line text-slate-300 leading-relaxed">
                      {result}
                    </div>
                  </div>
                </GlassPanel>
              </motion.div>
            )}

            {result && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <GlassPanel className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-5 h-5 text-orange-400" />
                    <h3 className="font-medium text-slate-200">统计图表</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: '变化区域', value: '12', unit: '处' },
                      { label: '总面积', value: '45.6', unit: '公顷' },
                      { label: '置信度', value: '92', unit: '%' },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="text-center p-4 rounded-lg bg-white/5"
                      >
                        <div className="text-2xl font-bold text-cyan-400">
                          {stat.value}
                          <span className="text-sm text-slate-500 ml-1">
                            {stat.unit}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassPanel>
              </motion.div>
            )}

            {!result && !loading && (
              <GlassPanel className="min-h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <Bot className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                  <p className="text-slate-500">
                    输入监测需求，智能体将为您生成报告
                  </p>
                </div>
              </GlassPanel>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
