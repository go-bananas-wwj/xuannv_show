import { Layers } from 'lucide-react'

interface DataSourceSwitcherProps {
  value: 'monthly' | 'embedding'
  onChange: (source: 'monthly' | 'embedding') => void
}

export default function DataSourceSwitcher({ value, onChange }: DataSourceSwitcherProps) {
  return (
    <div className="flex items-center gap-3">
      <Layers className="w-4 h-4 text-slate-400" />
      <div className="flex gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
        <button
          onClick={() => onChange('monthly')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            value === 'monthly'
              ? 'bg-sky-100 text-sky-700 border border-sky-200'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          月度数据
        </button>
        <button
          onClick={() => onChange('embedding')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            value === 'embedding'
              ? 'bg-amber-100 text-amber-700 border border-amber-200'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Embedding
        </button>
      </div>
    </div>
  )
}
