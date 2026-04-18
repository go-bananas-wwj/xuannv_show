import { Layers } from 'lucide-react'

interface DataSourceSwitcherProps {
  value: 'monthly' | 'embedding'
  onChange: (source: 'monthly' | 'embedding') => void
}

export default function DataSourceSwitcher({ value, onChange }: DataSourceSwitcherProps) {
  return (
    <div className="flex items-center gap-3">
      <Layers className="w-4 h-4 text-slate-500" />
      <div className="flex gap-2 p-1 rounded-xl bg-white/5 border border-white/5">
        <button
          onClick={() => onChange('monthly')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            value === 'monthly'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          月度数据
        </button>
        <button
          onClick={() => onChange('embedding')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            value === 'embedding'
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Embedding
        </button>
      </div>
    </div>
  )
}
