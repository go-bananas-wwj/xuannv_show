import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ZoomIn, ZoomOut, Maximize, Trash2, Save, Play, Loader2, Plus, X, Hand, MousePointer2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAnnotateStore } from '@/stores/annotateStore'
import {
  fetchPatches, preloadSAM3Embedding, segmentWithSAM,
  fetchClasses, createClass, fetchAnnotations, saveAnnotation, deleteAnnotation,
  startTraining, getTrainingStatus, inferWithCustomModel,
} from '@/utils/api'
import type { PatchMeta } from '@/types'

const MONTHS = ['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10']

interface PromptPoint {
  x: number
  y: number
  label: number // 1 = positive, 0 = negative
}

export default function AnnotatePage() {
  const store = useAnnotateStore()
  const [patches, setPatches] = useState<PatchMeta[]>([])
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null)
  const [maskObjs, setMaskObjs] = useState<HTMLImageElement[]>([])
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [points, setPoints] = useState<PromptPoint[]>([])
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ screenX: 0, screenY: 0, offsetX: 0, offsetY: 0 })
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [isAddingClass, setIsAddingClass] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [newClassColor, setNewClassColor] = useState('#FF4444')
  const [isTraining, setIsTraining] = useState(false)
  const [showInference, setShowInference] = useState(false)
  const [isImageLoading, setIsImageLoading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(1)

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  // ── Load patches / classes / annotations on mount ──
  useEffect(() => {
    fetchPatches().then(setPatches).catch(console.error)
    fetchClasses().then(store.setClasses).catch(console.error)
    fetchAnnotations().then(store.setAnnotations).catch(console.error)
  }, [])

  // ── When patch/month changes ──
  useEffect(() => {
    if (!store.selectedPatch) {
      setImageUrl(null)
      setImageObj(null)
      setMaskObjs([])
      setPoints([])
      setScale(1)
      setOffset({ x: 0, y: 0 })
      store.setIsEmbeddingReady(false)
      store.setMaskCandidates([])
      return
    }
    const patch = store.selectedPatch
    const month = store.selectedMonth
    const url = `/api/patches/${patch.patch_id}/image?month=${month}`
    setImageUrl(url)
    setMaskObjs([])
    setPoints([])
    setScale(1)
    setOffset({ x: 0, y: 0 })
    store.setIsEmbeddingReady(false)
    store.setMaskCandidates([])
    preloadSAM3Embedding(patch.patch_id, month)
      .then(() => store.setIsEmbeddingReady(true))
      .catch((err) => {
        console.error('Failed to preload SAM embedding:', err)
        store.setIsEmbeddingReady(false)
      })
  }, [store.selectedPatch, store.selectedMonth])

  // ── Load image object ──
  useEffect(() => {
    if (!imageUrl) { setImageObj(null); setIsImageLoading(false); return }
    setIsImageLoading(true)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImageObj(img)
      setIsImageLoading(false)
    }
    img.onerror = () => setIsImageLoading(false)
    img.src = imageUrl
  }, [imageUrl])

  // ── Load mask objects ──
  useEffect(() => {
    if (store.maskCandidates.length === 0) { setMaskObjs([]); return }
    const objs: HTMLImageElement[] = new Array(store.maskCandidates.length)
    let loaded = 0
    store.maskCandidates.forEach((m, i) => {
      const img = new Image()
      img.onload = () => {
        objs[i] = img
        loaded++
        if (loaded === store.maskCandidates.length) {
          setMaskObjs([...objs])
        }
      }
      img.src = `data:image/png;base64,${m.mask_b64}`
    })
  }, [store.maskCandidates])

  // ── Canvas render loop ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()

    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
    }

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, rect.width, rect.height)

    if (!imageObj) {
      ctx.fillStyle = '#f1f5f9'
      ctx.fillRect(0, 0, rect.width, rect.height)
      ctx.restore()
      return
    }

    const imgW = imageObj.naturalWidth || 512
    const imgH = imageObj.naturalHeight || 512
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const drawX = centerX + offset.x - (imgW * scale) / 2
    const drawY = centerY + offset.y - (imgH * scale) / 2

    // Base image
    ctx.drawImage(imageObj, drawX, drawY, imgW * scale, imgH * scale)

    // Mask preview overlay
    const maskImg = maskObjs[store.selectedMaskIndex]
    if (maskImg) {
      ctx.save()
      ctx.globalAlpha = 0.35
      ctx.drawImage(maskImg, drawX, drawY, imgW * scale, imgH * scale)
      ctx.restore()
    }

    // Prompt points (LabelMe style)
    for (const p of points) {
      const px = drawX + p.x * imgW * scale
      const py = drawY + p.y * imgH * scale
      const r = Math.max(3, 5 * scale)
      const color = p.label === 1 ? '#22c55e' : '#ef4444'

      // Glow / fill
      ctx.beginPath()
      ctx.arc(px, py, r + 2, 0, Math.PI * 2)
      ctx.fillStyle = color + '20'
      ctx.fill()

      // Main circle
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fillStyle = color + '60'
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()

      // Icon (plus or minus)
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 1.5
      if (p.label === 1) {
        ctx.beginPath()
        ctx.moveTo(px - r * 0.4, py)
        ctx.lineTo(px + r * 0.4, py)
        ctx.moveTo(px, py - r * 0.4)
        ctx.lineTo(px, py + r * 0.4)
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.moveTo(px - r * 0.4, py)
        ctx.lineTo(px + r * 0.4, py)
        ctx.stroke()
      }
    }

    // Crosshair in create mode (optional polish)
    if (mode === 'create' && !isPanning && points.length === 0 && !store.isLoadingMask) {
      // Subtle crosshair at center when no points
    }

    ctx.restore()
  }, [imageObj, maskObjs, scale, offset, points, store.selectedMaskIndex, mode, isPanning])

  // ── Native wheel listener (non-passive) ──
  useEffect(() => {
    const container = canvasContainerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()

      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const currentScale = scaleRef.current
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newScale = Math.min(Math.max(currentScale * delta, 0.3), 8)
      const ratio = newScale / currentScale

      setOffset(prev => ({
        x: prev.x + (mouseX - rect.width / 2) * (1 - ratio),
        y: prev.y + (mouseY - rect.height / 2) * (1 - ratio),
      }))
      setScale(newScale)
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [imageUrl])

  // ── Coordinate mapping ──
  const screenToImage = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || !imageObj) return null
    const rect = canvas.getBoundingClientRect()
    const cx = clientX - rect.left
    const cy = clientY - rect.top

    const imgW = imageObj.naturalWidth || 512
    const imgH = imageObj.naturalHeight || 512
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const drawX = centerX + offset.x - (imgW * scale) / 2
    const drawY = centerY + offset.y - (imgH * scale) / 2

    const nx = (cx - drawX) / (imgW * scale)
    const ny = (cy - drawY) / (imgH * scale)

    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null
    return { x: nx, y: ny }
  }, [imageObj, scale, offset])

  // ── Mouse handlers ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (isSpacePressed && e.button === 0)) {
      setIsPanning(true)
      setPanStart({
        screenX: e.screenX,
        screenY: e.screenY,
        offsetX: offset.x,
        offsetY: offset.y,
      })
      e.preventDefault()
      return
    }
  }, [isSpacePressed, offset])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.screenX - panStart.screenX
      const dy = e.screenY - panStart.screenY
      setOffset({ x: panStart.offsetX + dx, y: panStart.offsetY + dy })
    }
  }, [isPanning, panStart])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  // ── Canvas click for SAM segmentation ──
  const handleCanvasClick = useCallback(async (e: React.MouseEvent) => {
    if (isPanning || mode !== 'create') return
    if (!store.selectedPatch || !store.isEmbeddingReady) return
    if (e.button !== 0 && e.button !== 2) return

    const pos = screenToImage(e.clientX, e.clientY)
    if (!pos) return

    const isNegative = e.shiftKey || e.button === 2
    const newPoint: PromptPoint = { x: pos.x, y: pos.y, label: isNegative ? 0 : 1 }

    let nextPoints: PromptPoint[]
    setPoints(prev => {
      nextPoints = [...prev, newPoint]
      return nextPoints
    })

    store.setIsLoadingMask(true)
    try {
      const embeddingId = `${store.selectedPatch.patch_id}_${store.selectedMonth}`
      const result = await segmentWithSAM(
        embeddingId,
        nextPoints!.map(p => [p.x, p.y]),
        nextPoints!.map(p => p.label),
        true
      )
      store.setMaskCandidates(result.masks_b64.map((b64, i) => ({
        mask_b64: b64,
        score: result.scores[i],
      })))
    } catch (err) {
      console.error('SAM segmentation failed:', err)
    } finally {
      store.setIsLoadingMask(false)
    }
  }, [store.selectedPatch, store.selectedMonth, store.isEmbeddingReady, points, isPanning, mode, screenToImage])

  // ── Annotation actions ──
  const handleSaveAnnotation = useCallback(async () => {
    if (!store.selectedPatch || !store.activeClassId || store.maskCandidates.length === 0) return
    const mask = store.maskCandidates[store.selectedMaskIndex]
    try {
      const ann = await saveAnnotation({
        patch_id: store.selectedPatch.patch_id,
        month: store.selectedMonth,
        class_id: store.activeClassId,
        mask_b64: mask.mask_b64,
        score: mask.score,
      })
      store.addAnnotation(ann)
      store.setMaskCandidates([])
      setPoints([])
    } catch (err) {
      console.error('Failed to save annotation:', err)
    }
  }, [store.selectedPatch, store.selectedMonth, store.activeClassId, store.maskCandidates, store.selectedMaskIndex])

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
      setShowInference(true)
    } catch (err) {
      console.error('Inference failed:', err)
    }
  }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.code === 'Space') {
        setIsSpacePressed(true)
        e.preventDefault()
      }

      if (e.key === '1' && store.maskCandidates.length > 0) store.setSelectedMaskIndex(0)
      if (e.key === '2' && store.maskCandidates.length > 1) store.setSelectedMaskIndex(1)
      if (e.key === '3' && store.maskCandidates.length > 2) store.setSelectedMaskIndex(2)

      if ((e.key === 'a' || e.key === 'A') && store.maskCandidates.length > 0 && store.activeClassId) {
        handleSaveAnnotation()
      }
      if (e.key === 'r' || e.key === 'R') {
        store.setMaskCandidates([])
        setPoints([])
      }
      if (e.key === 'Escape') {
        store.setMaskCandidates([])
        setPoints([])
      }
      if (e.key === 'e' || e.key === 'E') {
        setMode(prev => prev === 'create' ? 'edit' : 'create')
      }
      if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey && points.length > 0) {
        setPoints(prev => prev.slice(0, -1))
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [store.maskCandidates, store.activeClassId, points, handleSaveAnnotation])

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
          <button
            onClick={() => setMode(prev => prev === 'create' ? 'edit' : 'create')}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors',
              mode === 'create'
                ? 'bg-sky-50 border-sky-200 text-sky-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            )}
            title="按 E 切换模式"
          >
            {mode === 'create' ? <MousePointer2 className="w-3 h-3" /> : <Hand className="w-3 h-3" />}
            {mode === 'create' ? '创建模式' : '编辑模式'}
          </button>
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
              <button onClick={() => setScale(s => Math.min(s * 1.2, 8))} className="p-1.5 rounded hover:bg-slate-100" title="放大">
                <ZoomIn className="w-4 h-4 text-slate-500" />
              </button>
              <button onClick={() => setScale(s => Math.max(s / 1.2, 0.3))} className="p-1.5 rounded hover:bg-slate-100" title="缩小">
                <ZoomOut className="w-4 h-4 text-slate-500" />
              </button>
              <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }) }} className="p-1.5 rounded hover:bg-slate-100" title="重置视图">
                <Maximize className="w-4 h-4 text-slate-500" />
              </button>
              <span className="text-xs text-slate-400 ml-1">{Math.round(scale * 100)}%</span>
              <span className="text-xs text-slate-300 ml-2 hidden sm:inline">
                Ctrl+滚轮缩放 · 中键/空格+拖拽平移
              </span>
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
          <div className="flex-1 relative overflow-hidden">
            {imageUrl ? (
              <>
                {/* Hint overlay */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 text-xs text-slate-400 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm pointer-events-none select-none">
                  左键=正点 · 右键/Shift+左键=负点 · Ctrl+滚轮=缩放 · 中键/空格+拖拽=平移 · 1/2/3=切换mask · A=接受 · R=取消
                </div>

                {/* Canvas container */}
                <div
                  ref={canvasContainerRef}
                  className={cn(
                    'absolute inset-0',
                    isSpacePressed ? 'cursor-grab' : mode === 'create' ? 'cursor-crosshair' : 'cursor-default'
                  )}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onClick={handleCanvasClick}
                  onContextMenu={(e) => { e.preventDefault(); handleCanvasClick(e as any) }}
                >
                  <canvas
                    ref={canvasRef}
                    className="w-full h-full block"
                  />

                  {/* Loading overlay */}
                  {(isImageLoading || store.isLoadingMask) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm z-20 pointer-events-none">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
                        <span className="text-sm text-slate-500">
                          {isImageLoading ? '影像加载中...' : 'SAM 分割中...'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-slate-400 text-sm flex flex-col items-center gap-2">
                  <div>请从左侧选择一个 Patch 开始标注</div>
                  <div className="text-xs text-slate-300">选择月份 → 选择 Patch → 点击影像进行标注</div>
                </div>
              </div>
            )}
          </div>

          {/* Inference result overlay */}
          {showInference && store.inferenceImageUrl && (
            <div className="px-4 py-3 bg-white border-t border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500">推理结果</span>
                <button onClick={() => setShowInference(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <img src={store.inferenceImageUrl} alt="Inference" className="max-h-48 rounded border border-slate-200" />
            </div>
          )}

          {/* Mask candidates */}
          {store.maskCandidates.length > 0 && (
            <div className="px-4 py-3 bg-white border-t border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">选择最佳 mask：</span>
                <span className="text-xs text-slate-400">1/2/3=切换 · A=接受 · R=取消 · Esc=取消</span>
              </div>
              <div className="flex gap-2">
                {store.maskCandidates.map((mask, i) => (
                  <button
                    key={i}
                    onClick={() => store.setSelectedMaskIndex(i)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all',
                      store.selectedMaskIndex === i
                        ? 'bg-sky-50 border-sky-300 text-sky-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    )}
                  >
                    {mask.mask_b64 && (
                      <img
                        src={`data:image/png;base64,${mask.mask_b64}`}
                        alt=""
                        className="w-8 h-8 rounded border border-slate-200 opacity-60"
                      />
                    )}
                    <span>Mask {i + 1} ({(mask.score * 100).toFixed(1)}%)</span>
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
                  保存标注 (A)
                </button>
                <button
                  onClick={() => { store.setMaskCandidates([]); setPoints([]) }}
                  className="flex items-center gap-1 px-3 py-1.5 text-slate-500 text-sm rounded-lg hover:bg-slate-100"
                >
                  <X className="w-3.5 h-3.5" />
                  取消 (R)
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
