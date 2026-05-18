import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Calendar, MapPin, BarChart3 } from 'lucide-react'
import config from '@/config.json'

interface PatchDetailModalProps {
  isOpen: boolean
  onClose: () => void
  patchId: string | null
  headId: string
  period: string
}

export default function PatchDetailModal({
  isOpen,
  onClose,
  patchId,
  headId,
  period,
}: PatchDetailModalProps) {
  const [detailUrl, setDetailUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const detailUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isOpen || !patchId) {
      setDetailUrl(null)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    setDetailUrl(null)

    const controller = new AbortController()
    const url = `/api/heads/${headId}/patch/${patchId}/detail?period=${encodeURIComponent(period)}`

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob)
        if (detailUrlRef.current) {
          URL.revokeObjectURL(detailUrlRef.current)
        }
        detailUrlRef.current = objectUrl
        setDetailUrl(objectUrl)
        setLoading(false)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err.message || '加载失败')
        setLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [isOpen, patchId, headId, period])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (detailUrlRef.current) {
        URL.revokeObjectURL(detailUrlRef.current)
        detailUrlRef.current = null
      }
    }
  }, [])

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative bg-white rounded-2xl shadow-2xl max-w-[1400px] w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-sky-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{patchId || 'Patch Detail'}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar className="w-3 h-3" />
                    <span>{formatPeriod(period)}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">加载详情中...</p>
                  </div>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">{error}</p>
                  </div>
                </div>
              ) : detailUrl ? (
                <div className="space-y-4">
                  <img
                    src={detailUrl}
                    alt={`${patchId} detail`}
                    className="w-full rounded-lg"
                  />
                  {/* 图例说明 */}
                  <LegendBar headId={headId} />
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function formatPeriod(period: string): string {
  if (period.includes('_vs_')) {
    const [before, after] = period.split('_vs_')
    return `${before} vs ${after}`
  }
  return period
}

function LegendBar({ headId }: { headId: string }) {
  if (headId === 'change_detection') {
    return (
      <div className="flex items-center justify-center gap-3 text-xs text-slate-500 flex-wrap">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
          <div className="w-3 h-3 rounded bg-slate-300" />
          <span>前期 S2</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
          <div className="w-3 h-3 rounded bg-slate-400" />
          <span>后期 S2</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
          <div className="w-3 h-3 rounded bg-indigo-300" />
          <span>变化前嵌入</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
          <div className="w-3 h-3 rounded bg-indigo-400" />
          <span>变化后嵌入</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
          <div className="w-3 h-3 rounded bg-gradient-to-r from-blue-400 to-red-500" />
          <span>变化概率</span>
        </div>
      </div>
    )
  }

  const legend = (config.legends as Record<string, { label: string; color: string }[]>)[headId]
  if (!legend) return null

  return (
    <div className="flex items-center justify-center gap-2 text-xs text-slate-500 flex-wrap">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
        <div className="w-3 h-3 rounded bg-slate-300" />
        <span>S2 前期</span>
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
        <div className="w-3 h-3 rounded bg-purple-200" />
        <span>SAR 前期</span>
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
        <div className="w-3 h-3 rounded bg-purple-400" />
        <span>SAR 后期</span>
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
        <div className="w-3 h-3 rounded bg-slate-400" />
        <span>S2 后期</span>
      </div>
      {legend.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100"
        >
          <div
            className="w-3 h-3 rounded"
            style={{ backgroundColor: item.color }}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}
