import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, FileText, BarChart3, Loader2, CheckCircle2, AlertCircle, Wrench } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AgentPromptInput from '@/components/AgentPromptInput'
import StatisticsChart from '@/components/StatisticsChart'
import ExportButtons from '@/components/ExportButtons'
import GlassPanel from '@/components/GlassPanel'
import { submitAgentTaskAsync, getAgentTaskStatus } from '@/utils/api'
import config from '@/config.json'
import type { AgentTaskStatus } from '@/types'

const POLL_INTERVAL = 2000  // 2s
const MAX_POLL_TIME = 120000  // 120s

export default function AgentSection() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [taskStatus, setTaskStatus] = useState<AgentTaskStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => clearPolling()
  }, [clearPolling])

  // Elapsed timer
  useEffect(() => {
    if (!loading) return
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [loading])

  const handleSubmit = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    setTaskStatus(null)
    setElapsed(0)
    startTimeRef.current = Date.now()

    try {
      const { task_id } = await submitAgentTaskAsync({
        prompt,
        region: config.region,
      })

      // Start polling
      pollTimerRef.current = setInterval(async () => {
        try {
          const status = await getAgentTaskStatus(task_id)
          setTaskStatus(status)

          if (status.status === 'completed' || status.status === 'failed') {
            clearPolling()
            setLoading(false)
          }

          // Timeout guard
          if (Date.now() - startTimeRef.current > MAX_POLL_TIME) {
            clearPolling()
            setLoading(false)
            setError('任务超时，请稍后重试')
          }
        } catch (err) {
          clearPolling()
          setLoading(false)
          setError(err instanceof Error ? err.message : '轮询失败')
        }
      }, POLL_INTERVAL)
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : '提交失败')
    }
  }

  const renderStatusBadge = () => {
    if (!taskStatus) return null
    const statusConfig = {
      pending: { icon: Loader2, text: '排队中', color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
      running: { icon: Loader2, text: '分析中', color: 'text-violet-500', bg: 'bg-violet-50', border: 'border-violet-200' },
      completed: { icon: CheckCircle2, text: '已完成', color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
      failed: { icon: AlertCircle, text: '失败', color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
    }
    const cfg = statusConfig[taskStatus.status]
    const Icon = cfg.icon
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
        <Icon className={`w-3.5 h-3.5 ${taskStatus.status === 'pending' || taskStatus.status === 'running' ? 'animate-spin' : ''}`} />
        {cfg.text}
        {taskStatus.status === 'running' && taskStatus.elapsed_seconds !== null && (
          <span className="text-slate-400 ml-1">{taskStatus.elapsed_seconds.toFixed(0)}s</span>
        )}
      </span>
    )
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
              {loading && !taskStatus?.result && (
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
                        已用时 {elapsed}s，正在调用 DeepSeek 解析需求
                      </p>
                      {taskStatus && (
                        <div className="mt-4 flex items-center gap-2">
                          {renderStatusBadge()}
                        </div>
                      )}
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
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-red-500 font-medium">任务失败</p>
                        <p className="text-red-400 text-sm mt-1">{error}</p>
                        {taskStatus?.error && (
                          <pre className="mt-3 p-3 bg-red-50 rounded-lg text-xs text-red-600 overflow-auto max-h-40">
                            {taskStatus.error}
                          </pre>
                        )}
                      </div>
                    </div>
                  </GlassPanel>
                </motion.div>
              )}

              {taskStatus?.result && !loading && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {/* Status header */}
                  <div className="flex items-center justify-between">
                    {renderStatusBadge()}
                    {taskStatus.result.tools_used && taskStatus.result.tools_used.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Wrench className="w-3 h-3" />
                        使用了 {taskStatus.result.tools_used.join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Report */}
                  <GlassPanel className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-violet-500" />
                        <h3 className="font-medium text-slate-700">任务报告</h3>
                      </div>
                      <ExportButtons />
                    </div>
                    <div className="prose prose-slate prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {taskStatus.result.report_markdown}
                      </ReactMarkdown>
                    </div>
                  </GlassPanel>

                  {/* Statistics */}
                  {taskStatus.result.statistics && (
                    <GlassPanel className="p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <BarChart3 className="w-5 h-5 text-sky-500" />
                        <h3 className="font-medium text-slate-700">统计图表</h3>
                      </div>
                      <StatisticsChart statistics={taskStatus.result.statistics} />
                    </GlassPanel>
                  )}
                </motion.div>
              )}

              {!taskStatus?.result && !loading && !error && (
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
