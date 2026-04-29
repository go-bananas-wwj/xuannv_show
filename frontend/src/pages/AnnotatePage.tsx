import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ZoomIn, ZoomOut, Maximize, Trash2, Save, Play, Loader2, Plus, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAnnotateStore } from '@/stores/annotateStore'
import { fetchPatches, preloadSAM3Embedding, segmentWithSAM, fetchClasses, createClass, fetchAnnotations, saveAnnotation, deleteAnnotation, startTraining, getTrainingStatus, inferWithCustomModel } from '@/utils/api'
import type { PatchMeta } from '@/types'

const MONTHS = ['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10']

export default function AnnotatePage() {
  const store = useAnnotateStore()
  const [patches, setPatches] = useState<PatchMeta[]>([])
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [isAddingClass, setIsAddingClass] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [newClassColor, setNewClassColor] = useState('#FF4444')
  const [isTraining, setIsTraining] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Load patches on mount
  useEffect(() => {
    fetchPatches().then(setPatches).catch(console.error)
    fetchClasses().then(store.setClasses).catch(console.error)
    fetchAnnotations().then(store.setAnnotations).catch(console.error)
  }, [])

  // When patch/month changes, load image and preload SAM embedding
  useEffect(() => {
    if (!store.selectedPatch) {
      setImageUrl(null)
      return
    }
    const patch = store.selectedPatch
    const month = store.selectedMonth
    const url = `/api/patches/${patch.patch_id}/image?month=${month}`
    setImageUrl(url)
    store.setIsEmbeddingReady(false)
    preloadSAM3Embedding(patch.patch_id, month)
      .then(() => store.setIsEmbeddingReady(true))
      .catch((err) => {
        console.error('Failed to preload SAM embedding:', err)
        store.setIsEmbeddingReady(false)
      })
  }, [store.selectedPatch, store.selectedMonth])

  // Handle canvas click for SAM segmentation
  const handleCanvasClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!store.selectedPatch || !store.isEmbeddingReady || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return

    const isNegative = e.shiftKey || e.button === 2
    store.setIsLoadingMask(true)
    try {
      const embeddingId = `${store.selectedPatch.patch_id}_${store.selectedMonth}`
      const result = await segmentWithSAM(
        embeddingId,
        [[x, y]],
        [isNegative ? 0 : 1],
        true
      )
      store.setMaskCandidates(result.masks_rle.map((rle, i) => ({
        mask_rle: rle,
        score: result.scores[i],
      })))
    } catch (err) {
      console.error('SAM segmentation failed:', err)
    } finally {
      store.setIsLoadingMask(false)
    }
  }, [store.selectedPatch, store.selectedMonth, store.isEmbeddingReady])

  const handleSaveAnnotation = async () => {
    if (!store.selectedPatch || !store.activeClassId || store.maskCandidates.length === 0) return
    const mask = store.maskCandidates[store.selectedMaskIndex]
    try {
      const ann = await saveAnnotation({
        patch_id: store.selectedPatch.patch_id,
        month: store.selectedMonth,
        class_id: store.activeClassId,
        mask_rle: mask.mask_rle,
        score: mask.score,
      })
      store.addAnnotation(ann)
      store.setMaskCandidates([])
    } catch (err) {
      console.error('Failed to save annotation:', err)
    }
  }

  const handleDeleteAnnotation = async (id: string) => {
    try {
      await deleteAnnotation(id)
      store.removeAnnotation(id)
    } catch (err) {
      console.error('Failed to delete annotation:', err)
    }
  }

  const handleAddClass = async () => {
    if (!newClassName.trim()) return
    try {
      const cls = await createClass({ name: newClassName.trim(), color: newClassColor })
      store.addClass(cls)
      setNewClassName('')
      setIsAddingClass(false)
    } catch (err) {
      console.error('Failed to create class:', err)
    }
  }

  const handleTrain = async () => {
    setIsTraining(true)
    try {
      const { job_id } = await startTraining()
      store.setTrainingJob({ job_id, status: 'running' })
      // Poll for status
      const interval = setInterval(async () => {
        try {
          const status = await getTrainingStatus(job_id)
          store.setTrainingJob(status)
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(interval)
            if (status.status === 'completed' && status.model_path) {
              store.setTrainedModelPath(status.model_path)
            }
          }
        } catch (err) {
          clearInterval(interval)
        }
      }, 2000)
    } catch (err) {
      console.error('Failed to start training:', err)
    } finally {
      setIsTraining(false)
    }
  }

  const handleInfer = async () => {
    if (!store.selectedPatch) return
    try {
      const result = await inferWithCustomModel(store.selectedPatch.patch_id, store.selectedMonth)
      store.setInferenceImageUrl(result.image_url)
    } catch (err) {
      console.error('Inference failed:', err)
    }
  }

  return (
    <div className="h-dvh bg-slate-50 text-slate-800 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-1 text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">返回</span>
          </Link>
          <h1 className="font-display font-bold text-lg">自定义训练 — 交互式标注</h1>
        </div>
        <div className="flex items-center gap-2">
          {store.trainedModelPath && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200">
              模型已训练
            </span>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <aside className="w-64 border-r border-slate-200 bg-white flex flex-col">
          <div className="p-3 border-b border-slate-100">
            <label className="text-xs font-medium text-slate-500 mb-1 block">月份</label>
            <select
              value={store.selectedMonth}
              onChange={(e) => store.setSelectedMonth(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <label className="text-xs font-medium text-slate-500 mb-1 block px-1">Patch 列表</label>
            <div className="space-y-1">
              {patches.map((patch) => (
                <button
                  key={patch.patch_id}
                  onClick={() => store.setSelectedPatch(patch)}
                  className={cn(
                    'w-full text-left text-sm px-3 py-2 rounded-lg transition-colors',
                    store.selectedPatch?.patch_id === patch.patch_id
                      ? 'bg-sky-50 text-sky-700 border border-sky-200'
                      : 'hover:bg-slate-50 text-slate-600'
                  )}
                >
                  {patch.patch_id}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Center canvas */}
        <main className="flex-1 flex flex-col bg-slate-100">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200">
            <div className="flex items-center gap-2">
              <button onClick={() => setScale((s) => Math.min(s + 0.25, 3))} className="p-1.5 rounded hover:bg-slate-100">
                <ZoomIn className="w-4 h-4 text-slate-500" />
              </button>
              <button onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))} className="p-1.5 rounded hover:bg-slate-100">
                <ZoomOut className="w-4 h-4 text-slate-500" />
              </button>
              <button onClick={() => setScale(1)} className="p-1.5 rounded hover:bg-slate-100">
                <Maximize className="w-4 h-4 text-slate-500" />
              </button>
              <span className="text-xs text-slate-400 ml-1">{Math.round(scale * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              {store.isEmbeddingReady && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                  SAM 就绪
                </span>
              )}
              {store.isLoadingMask && (
                <span className="text-xs text-sky-600 bg-sky-50 px-2 py-1 rounded flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  分割中...
                </span>
              )}
            </div>
          </div>

          {/* Canvas area */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            {imageUrl ? (
              <div
                ref={canvasRef}
                className="relative cursor-crosshair"
                style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
                onClick={handleCanvasClick}
                onContextMenu={(e) => { e.preventDefault(); handleCanvasClick(e as any) }}
              >
                <img
                  src={imageUrl}
                  alt="S2"
                  className="block max-w-[512px] max-h-[512px] rounded-lg shadow"
                  draggable={false}
                />
                {/* Mask overlay would go here */}
              </div>
            ) : (
              <div className="text-slate-400 text-sm">请选择一个 Patch 开始标注</div>
            )}
          </div>

          {/* Mask candidates */}
          {store.maskCandidates.length > 0 && (
            <div className="px-4 py-3 bg-white border-t border-slate-200">
              <div className="text-xs text-slate-500 mb-2">选择最佳 mask：</div>
              <div className="flex gap-2">
                {store.maskCandidates.map((mask, i) => (
                  <button
                    key={i}
                    onClick={() => store.setSelectedMaskIndex(i)}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm border transition-all',
                      store.selectedMaskIndex === i
                        ? 'bg-sky-50 border-sky-300 text-sky-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    )}
                  >
                    Mask {i + 1} ({(mask.score * 100).toFixed(1)}%)
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSaveAnnotation}
                  disabled={!store.activeClassId}
                  className="flex items-center gap-1 px-3 py-1.5 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  保存标注
                </button>
                <button
                  onClick={() => store.setMaskCandidates([])}
                  className="flex items-center gap-1 px-3 py-1.5 text-slate-500 text-sm rounded-lg hover:bg-slate-100"
                >
                  <X className="w-3.5 h-3.5" />
                  取消
                </button>
              </div>
            </div>
          )}

          {/* Bottom action bar */}
          <div className="flex items-center gap-2 px-4 py-3 bg-white border-t border-slate-200">
            <button
              onClick={handleTrain}
              disabled={isTraining || store.annotations.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-900 disabled:opacity-50"
            >
              {isTraining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              训练分类头
            </button>
            {store.trainedModelPath && (
              <button
                onClick={handleInfer}
                disabled={!store.selectedPatch}
                className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600 disabled:opacity-50"
              >
                推理
              </button>
            )}
            {store.trainingJob && (
              <span className={cn(
                'text-xs px-2 py-1 rounded',
                store.trainingJob.status === 'completed' ? 'text-green-600 bg-green-50' :
                store.trainingJob.status === 'failed' ? 'text-red-600 bg-red-50' :
                'text-sky-600 bg-sky-50'
              )}>
                {store.trainingJob.status === 'completed' ? `准确率: ${(store.trainingJob.accuracy! * 100).toFixed(1)}%` :
                 store.trainingJob.status === 'failed' ? '训练失败' :
                 '训练中...'}
              </span>
            )}
          </div>
        </main>

        {/* Right panel */}
        <aside className="w-72 border-l border-slate-200 bg-white flex flex-col">
          {/* Classes */}
          <div className="p-3 border-b border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">自定义类别</span>
              <button
                onClick={() => setIsAddingClass(!isAddingClass)}
                className="text-sky-500 hover:text-sky-600"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {isAddingClass && (
              <div className="space-y-2 mb-2">
                <input
                  type="text"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="类别名称"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newClassColor}
                    onChange={(e) => setNewClassColor(e.target.value)}
                    className="w-8 h-8 rounded border border-slate-200"
                  />
                  <button
                    onClick={handleAddClass}
                    className="flex-1 px-3 py-1.5 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600"
                  >
                    添加
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-1">
              {store.classes.map((cls) => (
                <button
                  key={cls.id}
                  onClick={() => store.setActiveClassId(cls.id)}
                  className={cn(
                    'w-full flex items-center gap-2 text-left text-sm px-3 py-2 rounded-lg transition-colors',
                    store.activeClassId === cls.id
                      ? 'bg-sky-50 border border-sky-200'
                      : 'hover:bg-slate-50'
                  )}
                >
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cls.color }} />
                  <span className="flex-1">{cls.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); store.removeClass(cls.id) }}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </button>
              ))}
            </div>
          </div>

          {/* Annotations list */}
          <div className="flex-1 overflow-y-auto p-3">
            <span className="text-xs font-medium text-slate-500 mb-2 block">
              标注列表 ({store.annotations.length})
            </span>
            <div className="space-y-2">
              {store.annotations.map((ann) => {
                const cls = store.classes.find((c) => c.id === ann.class_id)
                return (
                  <div
                    key={ann.id}
                    className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50"
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cls?.color || '#999' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{cls?.name || ann.class_id}</div>
                      <div className="text-xs text-slate-400">{ann.patch_id} / {ann.month}</div>
                    </div>
                    <button
                      onClick={() => handleDeleteAnnotation(ann.id)}
                      className="text-slate-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
