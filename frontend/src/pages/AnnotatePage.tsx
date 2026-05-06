import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowLeftCircle, ZoomIn, ZoomOut, Maximize, Trash2, Save, Play, Loader2, Plus, X, Hand, MousePointer2, GraduationCap } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAnnotateStore } from '@/stores/annotateStore'
import { useTourStore } from '@/stores/tourStore'
import { useAuthStore } from '@/stores/authStore'
import { useAnnotateTour } from '@/hooks/useDriverTour'
import {
  fetchPatches, preloadSAM3Embedding, segmentWithSAM,
  fetchClasses, createClass, fetchAnnotations, saveAnnotation, deleteAnnotation,
} from '@/utils/api'
import type { PatchMeta } from '@/types'
import PatchMosaicSelector from '@/components/PatchMosaicSelector'

const MONTHS = ['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10']

interface PromptPoint {
  x: number
  y: number
  label: number // 1 = positive, 0 = negative
}

const ANNOTATE_TOUR_STEPS = [
  {
    element: '#tour-step-classes',
    title: '① 创建类别',
    description: '先在这里创建标注类别（如"建筑"、"道路"、"水体"），并为每个类别选择颜色。点击右侧的 + 按钮即可添加。',
    position: 'left' as const,
  },
  {
    element: '#tour-step-drawmode',
    title: '② 选择标注工具',
    description: '支持三种标注方式：SAM3 智能分割（推荐）、多边形标注、折线标注。启用 SAM3 后，只需点击正负点即可自动分割目标。',
    position: 'left' as const,
  },
  {
    element: '#tour-step-canvas',
    title: '③ 在影像上标注',
    description: '在画布区域点击进行标注。SAM 模式下：左键=正点（要保留的区域），右键/Shift+左键=负点（要排除的区域）。Ctrl+滚轮缩放，中键/空格+拖拽平移。',
    position: 'bottom' as const,
  },
  {
    element: '#tour-step-save',
    title: '④ 保存标注',
    description: '完成标注后，按 A 键或点击保存按钮，将标注数据关联到当前类别。不满意可以按 R 或 Esc 取消重做。',
    position: 'top' as const,
  },
  {
    element: '#tour-step-train',
    title: '⑤ 训练分类模型',
    description: '积累足够标注样本后，点击"训练分类头"按钮，系统将自动训练一个专属的分类模型。训练完成后可在模型仓库中查看和应用。',
    position: 'top' as const,
  },
]

export default function AnnotatePage() {
  const store = useAnnotateStore()
  const tourStore = useTourStore()
  const authStore = useAuthStore()
  const { startTour } = useAnnotateTour(ANNOTATE_TOUR_STEPS)
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
  const [samEnabled, setSamEnabled] = useState(false)
  const [tintedMaskObjs, setTintedMaskObjs] = useState<HTMLCanvasElement[]>([])
  const [samLoading, setSamLoading] = useState(false)
  const [samError, setSamError] = useState<string | null>(null)
  type DrawMode = 'sam' | 'polygon' | 'polyline'
  const [drawMode, setDrawMode] = useState<DrawMode>('polygon')
  const [viewMode, setViewMode] = useState<'select' | 'annotate'>('select')
  const [dataSource, setDataSource] = useState<'s2' | 's1' | 'landsat'>('s2')
  const [showTrainDialog, setShowTrainDialog] = useState(false)
  const [trainModelName, setTrainModelName] = useState('')
  const navigate = useNavigate()
  const [drawingPoints, setDrawingPoints] = useState<Array<{x: number, y: number}>>([])
  const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null)
  const [finishedGeometry, setFinishedGeometry] = useState<{type: 'polygon' | 'polyline', points: Array<{x: number, y: number}>} | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(1)

  // ── Tint a mask image with a color using destination-in composite ──
  const tintMask = useCallback((maskImg: HTMLImageElement, color: string): HTMLCanvasElement => {
    const c = document.createElement('canvas')
    c.width = maskImg.naturalWidth
    c.height = maskImg.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.fillStyle = color
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(maskImg, 0, 0)
    return c
  }, [])

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  // ── Load patches / classes / annotations on mount ──
  useEffect(() => {
    fetchPatches().then(setPatches).catch(console.error)
    fetchClasses().then(store.setClasses).catch(console.error)
    fetchAnnotations().then(store.setAnnotations).catch(console.error)
  }, [])

  // ── Auto-start tour for new users when entering annotate view ──
  useEffect(() => {
    if (viewMode === 'annotate' && !tourStore.hasCompletedAnnotateTour && !tourStore.isRunning && authStore.isLoggedIn) {
      // Delay to ensure DOM elements are rendered
      const timer = setTimeout(() => {
        startTour()
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [viewMode, tourStore.hasCompletedAnnotateTour, tourStore.isRunning, authStore.isLoggedIn, startTour])

  // ── When a patch is selected from mosaic, enter annotate mode ──
  useEffect(() => {
    if (store.selectedPatch && viewMode === 'select') {
      setViewMode('annotate')
    }
  }, [store.selectedPatch])

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
      setSamEnabled(false)
      setSamError(null)
      setDrawingPoints([])
      setFinishedGeometry(null)
      setMousePos(null)
      return
    }
    const patch = store.selectedPatch
    const month = store.selectedMonth
    const url = `/api/patches/${patch.patch_id}/image?month=${month}&source=${dataSource}`
    setImageUrl(url)
    setMaskObjs([])
    setPoints([])
    setScale(1)
    setOffset({ x: 0, y: 0 })
    store.setIsEmbeddingReady(false)
    store.setMaskCandidates([])
    setSamEnabled(false)
    setSamError(null)
  }, [store.selectedPatch, store.selectedMonth, dataSource])

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
    if (store.maskCandidates.length === 0) { setMaskObjs([]); setTintedMaskObjs([]); return }
    const objs: HTMLImageElement[] = new Array(store.maskCandidates.length)
    let loaded = 0
    store.maskCandidates.forEach((m, i) => {
      const img = new Image()
      img.onload = () => {
        objs[i] = img
        loaded++
        if (loaded === store.maskCandidates.length) {
          setMaskObjs([...objs])
          // Tint all masks with active class color
          const activeClass = store.classes.find(c => c.id === store.activeClassId)
          const tintColor = activeClass?.color || '#00ffff'
          setTintedMaskObjs(objs.map(raw => tintMask(raw, tintColor)))
        }
      }
      img.src = `data:image/png;base64,${m.mask_b64}`
    })
  }, [store.maskCandidates])

  // ── Re-tint masks when active class changes ──
  useEffect(() => {
    if (maskObjs.length === 0) return
    const activeClass = store.classes.find(c => c.id === store.activeClassId)
    const tintColor = activeClass?.color || '#00ffff'
    setTintedMaskObjs(maskObjs.map(raw => tintMask(raw, tintColor)))
  }, [store.activeClassId, store.classes])

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

    // Image border (helps users see where the image is)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'
    ctx.lineWidth = 1
    ctx.strokeRect(drawX, drawY, imgW * scale, imgH * scale)

    // Mask preview overlay (tinted with class color)
    const tintedMask = tintedMaskObjs[store.selectedMaskIndex]
    if (tintedMask) {
      ctx.save()
      ctx.globalAlpha = 0.55
      ctx.drawImage(tintedMask, drawX, drawY, imgW * scale, imgH * scale)
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

    // Finished geometry (polygon / polyline)
    if (finishedGeometry) {
      const pts = finishedGeometry.points
      if (pts.length >= 2) {
        ctx.beginPath()
        ctx.moveTo(drawX + pts[0].x * imgW * scale, drawY + pts[0].y * imgH * scale)
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(drawX + pts[i].x * imgW * scale, drawY + pts[i].y * imgH * scale)
        }
        if (finishedGeometry.type === 'polygon') {
          ctx.closePath()
          ctx.fillStyle = 'rgba(6, 182, 212, 0.25)'
          ctx.fill()
        }
        ctx.strokeStyle = '#06b6d4'
        ctx.lineWidth = 2
        ctx.setLineDash([])
        ctx.stroke()
        // Vertices
        for (const p of pts) {
          const vx = drawX + p.x * imgW * scale
          const vy = drawY + p.y * imgH * scale
          ctx.beginPath()
          ctx.arc(vx, vy, 4, 0, Math.PI * 2)
          ctx.fillStyle = '#06b6d4'
          ctx.fill()
          ctx.strokeStyle = 'white'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }
    }

    // In-progress drawing (polygon / polyline)
    if ((drawMode === 'polygon' || drawMode === 'polyline') && drawingPoints.length > 0) {
      const pts = drawingPoints
      // Solid lines between placed vertices
      ctx.beginPath()
      ctx.moveTo(drawX + pts[0].x * imgW * scale, drawY + pts[0].y * imgH * scale)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(drawX + pts[i].x * imgW * scale, drawY + pts[i].y * imgH * scale)
      }
      ctx.strokeStyle = '#06b6d4'
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.stroke()

      // Dashed preview line from last vertex to mouse
      if (mousePos) {
        ctx.beginPath()
        ctx.moveTo(drawX + pts[pts.length - 1].x * imgW * scale, drawY + pts[pts.length - 1].y * imgH * scale)
        ctx.lineTo(drawX + mousePos.x * imgW * scale, drawY + mousePos.y * imgH * scale)
        ctx.strokeStyle = '#06b6d4'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.stroke()
        ctx.setLineDash([])
      }

      // For polygon: dashed closing edge from first vertex to mouse
      if (drawMode === 'polygon' && mousePos && pts.length >= 2) {
        ctx.beginPath()
        ctx.moveTo(drawX + pts[0].x * imgW * scale, drawY + pts[0].y * imgH * scale)
        ctx.lineTo(drawX + mousePos.x * imgW * scale, drawY + mousePos.y * imgH * scale)
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Vertex dots
      for (const p of pts) {
        const vx = drawX + p.x * imgW * scale
        const vy = drawY + p.y * imgH * scale
        ctx.beginPath()
        ctx.arc(vx, vy, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#06b6d4'
        ctx.fill()
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    // Crosshair in create mode (optional polish)
    if (mode === 'create' && !isPanning && points.length === 0 && !store.isLoadingMask && drawingPoints.length === 0 && !finishedGeometry) {
      // Subtle crosshair at center when no points
    }

    ctx.restore()
  }, [imageObj, tintedMaskObjs, scale, offset, points, store.selectedMaskIndex, mode, isPanning, drawMode, drawingPoints, mousePos, finishedGeometry])

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
    // Pan: middle-click or space+left-click
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

    if (mode !== 'create') return
    if (e.button !== 0) return

    const pos = screenToImage(e.clientX, e.clientY)
    if (!pos) return

    if (drawMode === 'sam') {
      // SAM mode: requires SAM enabled and embedding ready
      if (!store.selectedPatch || !samEnabled || !store.isEmbeddingReady) return
      const isNegative = e.shiftKey || false  // right-click handled by onContextMenu preventDefault
      const newPoint: PromptPoint = { x: pos.x, y: pos.y, label: isNegative ? 0 : 1 }
      setPoints(prev => {
        const next = [...prev, newPoint]
        const embeddingId = `${store.selectedPatch!.patch_id}_${store.selectedMonth}`
        store.setIsLoadingMask(true)
        segmentWithSAM(
          embeddingId,
          next.map(p => [p.x, p.y]),
          next.map(p => p.label),
          true
        ).then(result => {
          store.setMaskCandidates(result.masks_b64.map((b64, i) => ({
            mask_b64: b64,
            score: result.scores[i],
          })))
        }).catch(err => {
          console.error('SAM segmentation failed:', err)
        }).finally(() => {
          store.setIsLoadingMask(false)
        })
        return next
      })
    } else if (drawMode === 'polygon' || drawMode === 'polyline') {
      // Polygon / Polyline mode: add vertex
      if (!store.selectedPatch) return
      setDrawingPoints(prev => [...prev, pos])
    }
  }, [isSpacePressed, offset, mode, store.selectedPatch, store.selectedMonth, store.isEmbeddingReady, samEnabled, drawMode, screenToImage])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.screenX - panStart.screenX
      const dy = e.screenY - panStart.screenY
      setOffset({ x: panStart.offsetX + dx, y: panStart.offsetY + dy })
    }
    // Track mouse for drawing preview
    if ((drawMode === 'polygon' || drawMode === 'polyline') && drawingPoints.length > 0) {
      const pos = screenToImage(e.clientX, e.clientY)
      if (pos) setMousePos(pos)
    }
  }, [isPanning, panStart, drawMode, drawingPoints.length, screenToImage])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const finishDrawing = useCallback(() => {
    if (drawingPoints.length === 0) return
    if (drawMode === 'polygon' && drawingPoints.length < 3) {
      alert('多边形至少需要 3 个点')
      return
    }
    if (drawMode === 'polyline' && drawingPoints.length < 2) {
      alert('折线至少需要 2 个点')
      return
    }
    if (drawMode !== 'polygon' && drawMode !== 'polyline') return
    setFinishedGeometry({ type: drawMode, points: [...drawingPoints] })
    setDrawingPoints([])
    setMousePos(null)
  }, [drawMode, drawingPoints])

  const cancelDrawing = useCallback(() => {
    setDrawingPoints([])
    setMousePos(null)
    setFinishedGeometry(null)
    store.setMaskCandidates([])
    setPoints([])
  }, [store])

  // ── Annotation actions ──
  const handleSaveAnnotation = useCallback(async () => {
    if (!store.selectedPatch) return
    if (!store.activeClassId) {
      alert('请先创建并选择一个类别，再保存标注')
      setIsAddingClass(true)
      return
    }
    try {
      let ann
      if (finishedGeometry) {
        // Save polygon / polyline annotation
        ann = await saveAnnotation({
          patch_id: store.selectedPatch.patch_id,
          month: store.selectedMonth,
          class_id: store.activeClassId,
          score: 1.0,
          geometry: {
            type: finishedGeometry.type,
            points: finishedGeometry.points.map(p => [p.x, p.y]),
          },
        })
        setFinishedGeometry(null)
      } else if (store.maskCandidates.length > 0) {
        // Save SAM mask annotation
        const mask = store.maskCandidates[store.selectedMaskIndex]
        ann = await saveAnnotation({
          patch_id: store.selectedPatch.patch_id,
          month: store.selectedMonth,
          class_id: store.activeClassId,
          score: mask.score,
          geometry: { type: 'mask', mask_b64: mask.mask_b64 },
        })
        store.setMaskCandidates([])
        setPoints([])
      } else {
        return
      }
      store.addAnnotation(ann)
    } catch (err) {
      console.error('Failed to save annotation:', err)
    }
  }, [store.selectedPatch, store.selectedMonth, store.activeClassId, store.maskCandidates, store.selectedMaskIndex, finishedGeometry])

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

  const handleTrain = () => {
    setTrainModelName(`分类头_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '')}`)
    setShowTrainDialog(true)
  }

  const handleConfirmTrain = async () => {
    if (!trainModelName.trim()) return
    setIsTraining(true)
    setShowTrainDialog(false)
    try {
      const { createModel } = await import('@/utils/api')
      const { job_id } = await createModel(trainModelName.trim())
      store.setTrainingJob({ job_id, status: 'running' })
      // Poll status
      const interval = setInterval(async () => {
        try {
          const { getTrainingStatus } = await import('@/utils/api')
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
      // Navigate to model hub after a short delay
      setTimeout(() => navigate('/models'), 500)
    } catch (err) {
      console.error('Failed to start training:', err)
    } finally {
      setIsTraining(false)
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

      if (e.key === 'Enter') {
        if (drawingPoints.length > 0) {
          finishDrawing()
        }
      }

      if ((e.key === 'a' || e.key === 'A')) {
        if (store.maskCandidates.length > 0 || finishedGeometry) {
          handleSaveAnnotation()
        }
      }
      if (e.key === 'r' || e.key === 'R') {
        store.setMaskCandidates([])
        setPoints([])
        cancelDrawing()
      }
      if (e.key === 'Escape') {
        if (drawingPoints.length > 0) {
          cancelDrawing()
        } else {
          store.setMaskCandidates([])
          setPoints([])
          setFinishedGeometry(null)
        }
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
  }, [store.maskCandidates, store.activeClassId, points, handleSaveAnnotation, drawingPoints, finishedGeometry, finishDrawing, cancelDrawing])

  return (
    <div className="h-dvh bg-slate-50 text-slate-800 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          {viewMode === 'select' ? (
            <Link to="/" className="flex items-center gap-1 text-slate-500 hover:text-slate-700">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">返回首页</span>
            </Link>
          ) : (
            <button
              onClick={() => {
                setViewMode('select')
                store.setSelectedPatch(null)
              }}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-700"
            >
              <ArrowLeftCircle className="w-4 h-4" />
              <span className="text-sm">返回选择</span>
            </button>
          )}
          <h1 className="font-display font-bold text-lg">
            {viewMode === 'select' ? '选择 Patch 进行标注' : '自定义训练 — 交互式标注'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'annotate' && (
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
          )}
          {store.trainedModelPath && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200">
              模型已训练
            </span>
          )}
          {viewMode === 'annotate' && (
            <button
              onClick={() => {
                tourStore.resetTour()
                setTimeout(() => startTour(), 100)
              }}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
              title="重新查看新手引导"
            >
              <GraduationCap className="w-3 h-3" />
              引导
            </button>
          )}
        </div>
      </header>

      {viewMode === 'select' ? (
        <div className="flex-1 p-4 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500">月份</label>
              <select
                value={store.selectedMonth}
                onChange={(e) => store.setSelectedMonth(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <span className="text-xs text-slate-400">点击 Patch 进入标注 · 滚轮缩放 · 拖拽平移</span>
          </div>
          <div className="flex-1 overflow-hidden rounded-xl border border-slate-200">
            <PatchMosaicSelector
              patches={patches}
              selectedPatchId={store.selectedPatch?.patch_id || null}
              onSelectPatch={(p) => store.setSelectedPatch(p)}
              mosaicUrl={`/api/patches/mosaic_image?month=${store.selectedMonth}&source=${dataSource}&tile_size=128`}
            />
          </div>
        </div>
      ) : (
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
                <span className="w-px h-4 bg-slate-200 mx-1" />
                <select
                  value={dataSource}
                  onChange={(e) => setDataSource(e.target.value as 's2' | 's1' | 'landsat')}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600"
                  title="数据源"
                >
                  <option value="s2">S2 (RGB)</option>
                  <option value="s1">S1 (SAR)</option>
                  <option value="landsat">Landsat</option>
                </select>
                <span className="text-xs text-slate-300 ml-2 hidden sm:inline">
                  Ctrl+滚轮缩放 · 中键/空格+拖拽平移
                </span>
              </div>
              <div className="flex items-center gap-2">
                {samEnabled && store.isEmbeddingReady && (
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                    SAM 就绪
                  </span>
                )}
                {samEnabled && !store.isEmbeddingReady && !samLoading && samError && (
                  <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                    SAM 加载失败
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
                    {drawMode === 'sam' && samEnabled && store.isEmbeddingReady
                      ? '左键=正点 · 右键/Shift+左键=负点 · Ctrl+滚轮=缩放 · 中键/空格+拖拽=平移 · 1/2/3=切换mask · A=接受 · R=取消'
                      : drawMode === 'polygon'
                      ? '左键=添加顶点 · 双击/Enter=闭合多边形 · Esc=取消 · Ctrl+滚轮=缩放 · 中键/空格+拖拽=平移 · A=保存'
                      : drawMode === 'polyline'
                      ? '左键=添加顶点 · 双击/Enter=完成折线 · Esc=取消 · Ctrl+滚轮=缩放 · 中键/空格+拖拽=平移 · A=保存'
                      : 'Ctrl+滚轮=缩放 · 中键/空格+拖拽=平移 · 请选择标注模式'}
                  </div>

                  {/* Canvas container */}
                  <div
                    id="tour-step-canvas"
                    ref={canvasContainerRef}
                    className={cn(
                      'absolute inset-0',
                      isSpacePressed ? 'cursor-grab' : mode === 'create' ? 'cursor-crosshair' : 'cursor-default'
                    )}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onDoubleClick={finishDrawing}
                    onContextMenu={(e) => e.preventDefault()}
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
                    id="tour-step-save"
                    onClick={handleSaveAnnotation}
                    className="flex items-center gap-1 px-3 py-1.5 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600"
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

            {/* Finished geometry save bar (polygon / polyline) */}
            {finishedGeometry && (
              <div className="px-4 py-3 bg-white border-t border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">
                    {finishedGeometry.type === 'polygon' ? '已闭合多边形' : '已完成折线'} — 共 {finishedGeometry.points.length} 个点
                  </span>
                  <span className="text-xs text-slate-400">A=保存 · R=取消 · Esc=取消</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveAnnotation}
                    className="flex items-center gap-1 px-3 py-1.5 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600"
                  >
                    <Save className="w-3.5 h-3.5" />
                    保存标注 (A)
                  </button>
                  <button
                    onClick={() => { setFinishedGeometry(null); setDrawingPoints([]) }}
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
                id="tour-step-train"
                onClick={handleTrain}
                disabled={isTraining || store.annotations.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-900 disabled:opacity-50"
              >
                {isTraining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                训练分类头
              </button>
              <Link
                to="/models"
                className="flex items-center gap-1.5 px-4 py-2 bg-white text-slate-700 text-sm rounded-lg hover:bg-slate-50 border border-slate-200"
              >
                仓库
              </Link>
              <Link
                to="/apply"
                className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600"
              >
                应用
              </Link>
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

          {/* Train dialog */}
          {showTrainDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 w-full max-w-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-4">训练分类头</h3>
                <div className="mb-4">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">分类头名称</label>
                  <input
                    type="text"
                    value={trainModelName}
                    onChange={(e) => setTrainModelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmTrain()
                      if (e.key === 'Escape') setShowTrainDialog(false)
                    }}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowTrainDialog(false)}
                    className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmTrain}
                    disabled={!trainModelName.trim() || isTraining}
                    className="px-4 py-2 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50"
                  >
                    {isTraining ? <Loader2 className="w-4 h-4 animate-spin inline" /> : '开始训练'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Right panel */}
          <aside className="w-72 border-l border-slate-200 bg-white flex flex-col">
            {/* SAM3 toggle & Draw mode selector */}
            <div id="tour-step-drawmode" className="p-3 border-b border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500">标注模式</span>
                {samEnabled && store.isEmbeddingReady && (
                  <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">SAM 就绪</span>
                )}
              </div>

              {!samEnabled ? (
                <button
                  onClick={async () => {
                    if (!store.selectedPatch) return
                    setSamLoading(true)
                    setSamError(null)
                    try {
                      await preloadSAM3Embedding(store.selectedPatch.patch_id, store.selectedMonth)
                      store.setIsEmbeddingReady(true)
                      setSamEnabled(true)
                      setDrawMode('sam')
                    } catch (err: any) {
                      console.error('Failed to preload SAM embedding:', err)
                      setSamError(err.message || '加载失败')
                      store.setIsEmbeddingReady(false)
                    } finally {
                      setSamLoading(false)
                    }
                  }}
                  disabled={!store.selectedPatch || samLoading}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600 disabled:opacity-50 mb-2"
                >
                  {samLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {samLoading ? '加载中...' : '启用 SAM3 辅助标注'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSamEnabled(false)
                    store.setIsEmbeddingReady(false)
                    store.setMaskCandidates([])
                    setPoints([])
                    setSamError(null)
                    setDrawMode('polygon')
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-slate-500 text-sm rounded-lg hover:bg-slate-100 border border-slate-200 mb-2"
                >
                  <X className="w-4 h-4" />
                  关闭 SAM3
                </button>
              )}

              {/* Mode radio buttons */}
              <div className="space-y-1">
                {samEnabled && (
                  <label className="flex items-center gap-2 text-sm px-2 py-1 rounded cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="drawMode"
                      checked={drawMode === 'sam'}
                      onChange={() => setDrawMode('sam')}
                      className="accent-sky-500"
                    />
                    <span className={drawMode === 'sam' ? 'text-sky-600 font-medium' : 'text-slate-600'}>SAM 辅助标注</span>
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm px-2 py-1 rounded cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="drawMode"
                    checked={drawMode === 'polygon'}
                    onChange={() => setDrawMode('polygon')}
                    className="accent-sky-500"
                  />
                  <span className={drawMode === 'polygon' ? 'text-sky-600 font-medium' : 'text-slate-600'}>多边形标注</span>
                </label>
                <label className="flex items-center gap-2 text-sm px-2 py-1 rounded cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="drawMode"
                    checked={drawMode === 'polyline'}
                    onChange={() => setDrawMode('polyline')}
                    className="accent-sky-500"
                  />
                  <span className={drawMode === 'polyline' ? 'text-sky-600 font-medium' : 'text-slate-600'}>折线标注</span>
                </label>
              </div>

              {samError && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded">
                  {samError}
                </div>
              )}
            </div>

            {/* Classes */}
            <div id="tour-step-classes" className="p-3 border-b border-slate-100">
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
      )}
    </div>
  )
}
