import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Play, Trash2, Edit2, Check, X, Loader2, Box, AlertCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { listModels, renameModel, deleteModel, listSystemModels } from '@/utils/api'
import type { ModelInfo, SystemModel } from '@/utils/api'

export default function ModelHubPage() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [polling, setPolling] = useState(false)
  const [systemModels, setSystemModels] = useState<SystemModel[]>([])

  const loadModels = async () => {
    try {
      const data = await listModels()
      setModels(data)
      // Check if any model is still training
      const hasTraining = data.some((m) => m.status === 'training')
      setPolling(hasTraining)
    } catch (err) {
      console.error('Failed to load models:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadModels()
    listSystemModels().then(setSystemModels).catch(console.error)
  }, [])

  // Poll training status
  useEffect(() => {
    if (!polling) return
    const interval = setInterval(() => {
      loadModels()
    }, 3000)
    return () => clearInterval(interval)
  }, [polling])

  const handleRename = async (modelId: string) => {
    if (!editName.trim()) {
      setEditingId(null)
      return
    }
    try {
      await renameModel(modelId, editName.trim())
      setEditingId(null)
      loadModels()
    } catch (err) {
      console.error('Failed to rename:', err)
    }
  }

  const handleDelete = async (modelId: string) => {
    if (!confirm('确定要删除这个分类头吗？此操作不可恢复。')) return
    try {
      await deleteModel(modelId)
      loadModels()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const statusBadge = (status: string) => {
    const styles = {
      training: 'bg-sky-50 text-sky-600 border-sky-200',
      completed: 'bg-green-50 text-green-600 border-green-200',
      failed: 'bg-red-50 text-red-600 border-red-200',
    }
    const labels = {
      training: '训练中',
      completed: '已完成',
      failed: '失败',
    }
    return (
      <span className={cn('text-xs px-2 py-0.5 rounded border', styles[status as keyof typeof styles] || 'bg-slate-50 text-slate-600')}>
        {labels[status as keyof typeof labels] || status}
      </span>
    )
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-800">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <Link to="/annotate" className="flex items-center gap-1 text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">返回标注</span>
          </Link>
          <h1 className="font-display font-bold text-xl">分类头仓库</h1>
        </div>
        <Link
          to="/apply"
          className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600"
        >
          <Play className="w-4 h-4" />
          应用测试
        </Link>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto p-6">
        {/* System Models */}
        {systemModels.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">系统预置模型</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {systemModels.map((model) => (
                <div
                  key={model.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-800 truncate">{model.name}</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">系统预置</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 truncate">{model.description}</p>
                    </div>
                  </div>
                  <Link
                    to={`/apply?model_id=sys_${model.id}&type=system`}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 bg-sky-500 text-white text-xs rounded-lg hover:bg-sky-600"
                  >
                    <Play className="w-3 h-3" />
                    去应用
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
          </div>
        ) : models.length === 0 && systemModels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Box className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">暂无分类头</p>
            <p className="text-sm">先去标注页面创建标注并训练分类头吧</p>
            <Link
              to="/annotate"
              className="mt-6 px-4 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600"
            >
              去标注
            </Link>
          </div>
        ) : models.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Box className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">暂无自定义分类头</p>
            <Link to="/annotate" className="mt-2 inline-block text-sm text-sky-500 hover:text-sky-600">
              去标注训练 →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((model) => (
              <div
                key={model.id}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    {editingId === model.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(model.id)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="text-sm border border-slate-200 rounded px-2 py-1 w-full"
                          autoFocus
                        />
                        <button onClick={() => handleRename(model.id)} className="text-green-500 hover:text-green-600">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-800 truncate">{model.name}</h3>
                        <button
                          onClick={() => {
                            setEditingId(model.id)
                            setEditName(model.name)
                          }}
                          className="text-slate-300 hover:text-slate-500"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {statusBadge(model.status)}
                      <span className="text-xs text-slate-400">
                        {new Date(model.created_at).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(model.id)}
                    className="text-slate-300 hover:text-red-500 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Classes */}
                <div className="mb-3">
                  <p className="text-xs text-slate-400 mb-1.5">类别</p>
                  <div className="flex flex-wrap gap-1.5">
                    {model.classes.map((cls) => (
                      <span
                        key={cls.id}
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-50 border border-slate-100"
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cls.color }} />
                        {cls.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-semibold text-slate-700">
                      {model.accuracy !== null ? `${(model.accuracy * 100).toFixed(1)}%` : '-'}
                    </p>
                    <p className="text-[10px] text-slate-400">准确率</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-semibold text-slate-700">
                      {model.n_samples !== null ? model.n_samples : '-'}
                    </p>
                    <p className="text-[10px] text-slate-400">训练样本</p>
                  </div>
                </div>

                {/* Message */}
                {model.message && (
                  <div className="flex items-start gap-1.5 text-xs text-red-500 bg-red-50 rounded-lg p-2 mb-3">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{model.message}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {model.status === 'completed' && (
                    <Link
                      to={`/apply?model_id=${model.id}`}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-sky-500 text-white text-xs rounded-lg hover:bg-sky-600"
                    >
                      <Play className="w-3 h-3" />
                      去应用
                    </Link>
                  )}
                  {model.status === 'training' && (
                    <div className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-400 text-xs rounded-lg">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      训练中...
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
