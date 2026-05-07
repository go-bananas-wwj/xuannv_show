import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Play, Loader2, CheckSquare, Square, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { listModels, inferBatchWithModel, listSystemModels, inferSystemModel } from '@/utils/api'
import { fetchPatches } from '@/utils/api'
import type { ModelInfo, SystemModel } from '@/utils/api'
import type { PatchMeta } from '@/types'

const MONTHS = ['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10']

export default function ModelApplyPage() {
  const [searchParams] = useSearchParams()
  const initialModelId = searchParams.get('model_id') || ''

  const [models, setModels] = useState<ModelInfo[]>([])
  const [systemModels, setSystemModels] = useState<SystemModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState(initialModelId)
  const [selectedMonth, setSelectedMonth] = useState('2025-04')
  const [patches, setPatches] = useState<PatchMeta[]>([])
  const [selectedPatchIds, setSelectedPatchIds] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<Array<{ patch_id: string; image_url: string }>>([])
  const [isInferring, setIsInferring] = useState(false)
  const [loading, setLoading] = useState(true)
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listModels(), fetchPatches(), listSystemModels()])
      .then(([m, p, sys]) => {
        setModels(m.filter((x) => x.status === 'completed'))
        setSystemModels(sys)
        setPatches(p)
        // Auto-select first model if none selected
        if (!selectedModelId) {
          const firstUser = m.find((x) => x.status === 'completed')
          if (firstUser) {
            setSelectedModelId(firstUser.id)
          } else if (sys.length > 0) {
            setSelectedModelId(`sys_${sys[0].id}`)
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const togglePatch = (patchId: string) => {
    setSelectedPatchIds((prev) => {
      const next = new Set(prev)
      if (next.has(patchId)) next.delete(patchId)
      else next.add(patchId)
      return next
    })
  }

  const selectAll = () => {
    setSelectedPatchIds(new Set(patches.map((p) => p.patch_id)))
  }

  const clearAll = () => {
    setSelectedPatchIds(new Set())
  }

  const isSystemModel = selectedModelId.startsWith('sys_')
  const selectedSystemModel = isSystemModel
    ? systemModels.find((m) => `sys_${m.id}` === selectedModelId)
    : null

  const handleInfer = async () => {
    if (!selectedModelId || selectedPatchIds.size === 0) return
    setIsInferring(true)
    setResults([])
    try {
      if (isSystemModel && selectedSystemModel) {
        // Serial inference for system models
        const patchIds = Array.from(selectedPatchIds)
        const batchResults: Array<{ patch_id: string; image_url: string }> = []
        for (const patchId of patchIds) {
          try {
            const { result_url } = await inferSystemModel(
              selectedSystemModel.id,
              patchId,
              selectedMonth
            )
            batchResults.push({ patch_id: patchId, image_url: result_url })
          } catch (e) {
            console.error(`System model inference failed for ${patchId}:`, e)
            batchResults.push({ patch_id: patchId, image_url: '' })
          }
        }
        setResults(batchResults)
      } else {
        const res = await inferBatchWithModel(
          selectedModelId,
          Array.from(selectedPatchIds),
          selectedMonth
        )
        setResults(res)
      }
    } catch (err) {
      console.error('Batch inference failed:', err)
    } finally {
      setIsInferring(false)
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-800 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <Link to="/models" className="flex items-center gap-1 text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">返回仓库</span>
          </Link>
          <h1 className="font-display font-bold text-xl">应用测试</h1>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-500">分类头</label>
                  <select
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white min-w-[200px]"
                  >
                    {models.length === 0 && systemModels.length === 0 && (
                      <option value="">暂无可用分类头</option>
                    )}
                    {models.length > 0 && (
                      <optgroup label="自定义分类头">
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </optgroup>
                    )}
                    {systemModels.length > 0 && (
                      <optgroup label="系统预置模型">
                        {systemModels.map((m) => (
                          <option key={`sys_${m.id}`} value={`sys_${m.id}`}>{m.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-500">月份</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-slate-400">
                    已选 {selectedPatchIds.size} / {patches.length} 个 Patch
                  </span>
                  <button
                    onClick={selectAll}
                    className="text-xs text-sky-600 hover:text-sky-700 px-2 py-1"
                  >
                    全选
                  </button>
                  <button
                    onClick={clearAll}
                    className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1"
                  >
                    清空
                  </button>
                  <button
                    onClick={handleInfer}
                    disabled={!selectedModelId || selectedPatchIds.size === 0 || isInferring}
                    className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600 disabled:opacity-50"
                  >
                    {isInferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {isInferring ? '推理中...' : '批量推理'}
                  </button>
                </div>
              </div>
            </div>

            {/* Patch grid */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
              <h2 className="text-sm font-medium text-slate-700 mb-3">选择 Patch</h2>
              <div className="grid grid-cols-10 gap-2 max-h-[400px] overflow-y-auto p-1">
                {patches.map((patch) => {
                  const isSelected = selectedPatchIds.has(patch.patch_id)
                  return (
                    <div
                      key={patch.patch_id}
                      className={cn(
                        'relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all',
                        isSelected ? 'border-sky-500' : 'border-transparent hover:border-slate-300'
                      )}
                      onClick={() => togglePatch(patch.patch_id)}
                    >
                      <img
                        src={`/api/patches/${patch.patch_id}/image?month=${selectedMonth}&source=s2`}
                        alt={patch.patch_id}
                        loading="lazy"
                        className="w-full aspect-square object-cover"
                        draggable={false}
                      />
                      {/* Checkbox indicator */}
                      <div className="absolute top-1 left-1">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-sky-500 bg-white rounded" />
                        ) : (
                          <Square className="w-4 h-4 text-white/70" />
                        )}
                      </div>
                      {/* Patch ID */}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[10px] text-center py-0.5 truncate">
                        {patch.patch_id}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="text-sm font-medium text-slate-700 mb-3">推理结果 ({results.length})</h2>
                <div className="grid grid-cols-10 gap-2">
                  {results.map((res) => (
                    <div
                      key={res.patch_id}
                      className="relative rounded-lg overflow-hidden border border-slate-100 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => res.image_url && setEnlargedImage(res.image_url)}
                    >
                      {res.image_url ? (
                        <img
                          src={res.image_url}
                          alt={res.patch_id}
                          className="w-full aspect-square object-cover"
                        />
                      ) : (
                        <div className="w-full aspect-square bg-slate-100 flex items-center justify-center">
                          <span className="text-xs text-slate-400">失败</span>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[10px] text-center py-0.5 truncate">
                        {res.patch_id}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Enlarged image modal */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={enlargedImage}
              alt="Enlarged"
              className="max-w-[90vw] max-h-[90vh] rounded-lg"
            />
            <button
              onClick={() => setEnlargedImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-slate-600 flex items-center justify-center shadow-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
