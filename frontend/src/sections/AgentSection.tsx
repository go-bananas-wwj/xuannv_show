import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, FileText, BarChart3 } from 'lucide-react'
import AgentPromptInput from '@/components/AgentPromptInput'
import StatisticsChart from '@/components/StatisticsChart'
import ExportButtons from '@/components/ExportButtons'
import GlassPanel from '@/components/GlassPanel'
import { submitAgentTask } from '@/utils/api'
import type { AgentTaskResponse } from '@/types'

export default function AgentSection() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AgentTaskResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await submitAgentTask({
        prompt,
        region: 'harbin',
      })
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setLoading(false)
    }
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
              <Bot className="w-5 h-5 text-violet-500" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-800">
              智能体任务报告
            </h2>
          </div>
          <p className="text-slate-500 max-w-2xl">
            用自然语言描述遥感监测需求，智能体自动解析并生成任务报告
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6">
          <AgentPromptInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleSubmit}
            loading={loading}
          />

          <div className="space-y-4">
            <AnimatePresence mode="wait">
              {loading && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <GlassPanel className="p-8">
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="w-10 h-10 border-2 border-violet-300 border-t-violet-500 rounded-full animate-spin mb-4" />
                      <p className="text-slate-500">智能体分析中...</p>
                      <p className="text-slate-400 text-sm mt-1">
                        正在解析需求并调用对应 Task Head
                      </p>
                    </div>
                  </GlassPanel>
                </motion.div>
              )}

              {error && !loading && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <GlassPanel className="p-6 border-red-200">
                    <p className="text-red-500">{error}</p>
                  </GlassPanel>
                </motion.div>
              )}

              {result && !loading && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <GlassPanel className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-violet-500" />
                        <h3 className="font-medium text-slate-700">任务报告</h3>
                      </div>
                      <ExportButtons />
                    </div>
                    <div
                      className="prose prose-slate prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: result.report_html }}
                    />
                  </GlassPanel>

                  <GlassPanel className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart3 className="w-5 h-5 text-sky-500" />
                      <h3 className="font-medium text-slate-700">统计图表</h3>
                    </div>
                    <StatisticsChart statistics={result.statistics} />
                  </GlassPanel>
                </motion.div>
              )}

              {!result && !loading && !error && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <GlassPanel className="min-h-[300px] flex items-center justify-center">
                    <div className="text-center">
                      <Bot className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                      <p className="text-slate-400">
                        输入监测需求，智能体将为您生成报告
                      </p>
                    </div>
                  </GlassPanel>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}
