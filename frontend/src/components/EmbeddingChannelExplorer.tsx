import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { SlidersHorizontal, Shuffle, RotateCcw, Image, Sparkles } from 'lucide-react'

export interface EmbeddingPreset {
  id: string
  name: string
  color: string
  description: string
  top3: number[]
  top3_weights: number[]
}

interface EmbeddingChannelExplorerProps {
  patchId: string
  month: string
  compact?: boolean
}

type ViewMode = 'pca' | 'preset' | 'custom'

export default function EmbeddingChannelExplorer({
  patchId,
  month,
}: EmbeddingChannelExplorerProps) {
  const [mode, setMode] = useState<ViewMode>('pca')
  const [presets, setPresets] = useState<EmbeddingPreset[]>([])
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [channels, setChannels] = useState({ r: 0, g: 1, b: 2 })
  const [imageUrl, setImageUrl] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load presets on mount
  useEffect(() => {
    fetch('/api/embeddings/presets')
      .then((r) => r.json())
      .then((data) => {
        setPresets(data)
        if (data.length > 0) {
          setActivePreset(data[0].id)
        }
      })
      .catch((err) => console.error('Failed to load presets:', err))
  }, [])

  // Generate image URL based on current mode
  const updateImageUrl = useCallback(() => {
    let url: string
    if (mode === 'pca') {
      url = `/api/embeddings/preview?patch_id=${patchId}&region=harbin&version=v2`
    } else if (mode === 'preset' && activePreset) {
      url = `/api/embeddings/semantic-preview?patch_id=${patchId}&month=${month}&preset=${activePreset}`
    } else {
      url = `/api/embeddings/channel-preview?patch_id=${patchId}&month=${month}&ch_r=${channels.r}&ch_g=${channels.g}&ch_b=${channels.b}`
    }
    setImageUrl(url)
    setLoading(true)
    setError(null)
  }, [mode, activePreset, channels, patchId, month])

  // Debounced update for slider mode
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateImageUrl()
    }, mode === 'custom' ? 200 : 0)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [mode, activePreset, channels, updateImageUrl])

  const handleRandom = () => {
    setChannels({
      r: Math.floor(Math.random() * 128),
      g: Math.floor(Math.random() * 128),
      b: Math.floor(Math.random() * 128),
    })
    setMode('custom')
  }

  const handleReset = () => {
    setChannels({ r: 0, g: 1, b: 2 })
    setMode('pca')
  }

  const activePresetData = presets.find((p) => p.id === activePreset)

  const sliderClass =
    'w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-200 accent-sky-500'

  return (
    <div className="space-y-4">
      {/* View mode tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100/80">
        {[
          { id: 'pca' as ViewMode, label: 'PCA-RGB', icon: Image },
          { id: 'preset' as ViewMode, label: '语义预设', icon: Sparkles },
          { id: 'custom' as ViewMode, label: '自定义', icon: SlidersHorizontal },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === tab.id
                  ? 'bg-white text-sky-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Preset buttons */}
      {mode === 'preset' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap gap-2"
        >
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setActivePreset(preset.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                activePreset === preset.id
                  ? 'text-white shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
              style={
                activePreset === preset.id
                  ? { backgroundColor: preset.color, borderColor: preset.color }
                  : {}
              }
            >
              {preset.name}
            </button>
          ))}
        </motion.div>
      )}

      {/* Custom sliders */}
      {mode === 'custom' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-100"
        >
          {[
            { key: 'r' as const, label: 'R', color: '#ef4444' },
            { key: 'g' as const, label: 'G', color: '#22c55e' },
            { key: 'b' as const, label: 'B', color: '#3b82f6' },
          ].map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-3">
              <span
                className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: color }}
              >
                {label}
              </span>
              <input
                type="range"
                min={0}
                max={127}
                value={channels[key]}
                onChange={(e) =>
                  setChannels((prev) => ({ ...prev, [key]: parseInt(e.target.value) }))
                }
                className={sliderClass}
              />
              <span className="w-10 text-right text-sm font-mono text-slate-600 tabular-nums">
                {channels[key]}
              </span>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleRandom}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Shuffle className="w-3 h-3" />
              随机
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              重置
            </button>
          </div>
        </motion.div>
      )}

      {/* Preview image */}
      <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Embedding preview"
            className="w-full aspect-square object-contain"
            style={{ imageRendering: 'pixelated' }}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false)
              setError('加载失败')
            }}
          />
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80">
            <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50/90">
            <span className="text-sm text-red-500">{error}</span>
          </div>
        )}
      </div>

      {/* Caption */}
      <p className="text-xs text-slate-400 text-center">
        {mode === 'pca' && 'PCA-RGB：取方差最大的前3个主成分'}
        {mode === 'preset' && activePresetData && (
          <>
            基于线性探针权重，展示与<strong>{activePresetData.name}</strong>最相关的3个维度
            （dim {activePresetData.top3.join(', ')}）
          </>
        )}
        {mode === 'custom' && (
          <>
            自定义通道：R=dim{channels.r}, G=dim{channels.g}, B=dim{channels.b}
          </>
        )}
      </p>
    </div>
  )
}
