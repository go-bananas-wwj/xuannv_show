import { Send, Sparkles } from 'lucide-react'
import { useState } from 'react'
import GlassPanel from './GlassPanel'

interface AgentPromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  loading: boolean
}

const EXAMPLES = [
  '找出哈尔滨新区 2024 年 3 月到 8 月之间新建的建筑工地',
  '生成松北新区的土地变化监测报告，重点关注农田转建设用地',
  '对比 2023 全年与 2024 全年的城市扩张区域',
]

export default function AgentPromptInput({
  value,
  onChange,
  onSubmit,
  loading,
}: AgentPromptInputProps) {
  const [showExamples, setShowExamples] = useState(false)

  return (
    <div className="space-y-4">
      <GlassPanel className="p-6">
        <label className="block text-sm font-medium text-slate-600 mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          描述您的监测需求
        </label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例如：找出哈尔滨新区 2024 年 3 月到 8 月之间新建的建筑工地..."
          className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:border-violet-300 focus:ring-1 focus:ring-violet-200 transition-all"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              onSubmit()
            }
          }}
        />
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{value.length} 字符</span>
            <button
              onClick={() => setShowExamples(!showExamples)}
              className="text-xs text-violet-500 hover:text-violet-600 transition-colors"
            >
              {showExamples ? '隐藏示例' : '查看示例'}
            </button>
          </div>
          <button
            onClick={onSubmit}
            disabled={loading || !value.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-600 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-violet-300 border-t-violet-500 rounded-full animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                提交任务
                <span className="hidden sm:inline text-xs text-slate-400">
                  Ctrl+Enter
                </span>
              </>
            )}
          </button>
        </div>
      </GlassPanel>

      {showExamples && (
        <GlassPanel className="p-6">
          <h3 className="text-sm font-medium text-slate-600 mb-3">示例提示词</h3>
          <div className="space-y-2">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => onChange(ex)}
                className="w-full text-left px-4 py-3 rounded-lg bg-slate-50 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all"
              >
                {ex}
              </button>
            ))}
          </div>
        </GlassPanel>
      )}
    </div>
  )
}
