import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { User, Lock, ArrowRight, LogIn, UserPlus, AlertCircle } from 'lucide-react'
import GlassPanel from '@/components/GlassPanel'
import { useAuthStore } from '@/stores/authStore'
import { login, register } from '@/utils/api'

export default function LoginPage() {
  const navigate = useNavigate()
  const auth = useAuthStore()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码')
      return
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致')
        return
      }
      if (password.length < 4) {
        setError('密码至少需要 4 位')
        return
      }
    }

    setIsSubmitting(true)
    try {
      if (mode === 'login') {
        const res = await login(username.trim(), password)
        auth.login(res.user)
        navigate('/annotate')
      } else {
        await register(username.trim(), password)
        // 注册成功后自动登录
        const res = await login(username.trim(), password)
        auth.login(res.user)
        navigate('/annotate')
      }
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto mb-4">
            <User className="w-7 h-7 text-sky-500" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-800">
            {mode === 'login' ? '欢迎回来' : '创建账号'}
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            {mode === 'login'
              ? '登录后开始你的遥感标注之旅'
              : '注册后即可使用自定义训练功能'}
          </p>
        </div>

        <GlassPanel className="p-8">
          {error && (
            <div className="mb-4 flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">用户名</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all"
                />
              </div>
            </div>

            {mode === 'register' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <label className="block text-sm font-medium text-slate-700 mb-1">确认密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入密码"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all"
                  />
                </div>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors font-medium text-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : mode === 'login' ? (
                <>
                  <LogIn className="w-4 h-4" />
                  登录
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  注册
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            {mode === 'login' ? (
              <>
                还没有账号？{' '}
                <button
                  onClick={() => { setMode('register'); setError('') }}
                  className="text-sky-600 hover:text-sky-700 font-medium inline-flex items-center gap-0.5"
                >
                  立即注册 <ArrowRight className="w-3 h-3" />
                </button>
              </>
            ) : (
              <>
                已有账号？{' '}
                <button
                  onClick={() => { setMode('login'); setError('') }}
                  className="text-sky-600 hover:text-sky-700 font-medium inline-flex items-center gap-0.5"
                >
                  直接登录 <ArrowRight className="w-3 h-3" />
                </button>
              </>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 text-center">
            <Link to="/" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              ← 返回首页
            </Link>
          </div>
        </GlassPanel>
      </motion.div>
    </div>
  )
}
