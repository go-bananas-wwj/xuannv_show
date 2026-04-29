import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookOpen, Info, LayoutGrid, Waves, Bot, Mail, Menu, X, PenTool } from 'lucide-react'
import { cn } from '@/utils/cn'

interface NavigationProps {
  onNavigate: (
    section: 'intro' | 'about' | 'data' | 'downstream' | 'agent' | 'contact'
  ) => void
}

export default function Navigation({ onNavigate }: NavigationProps) {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('intro')
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!isHome) {
      setVisible(true)
      setScrolled(true)
      return
    }
    // App 使用 h-dvh overflow-y-auto，滚动发生在内部 div 而非 window
    const scrollContainer = document.querySelector('.h-dvh.overflow-y-auto') || window

    const handleScroll = () => {
      const scrollTop = scrollContainer === window ? window.scrollY : (scrollContainer as Element).scrollTop
      setScrolled(scrollTop > 50)

      const sections = ['intro', 'about', 'data', 'downstream', 'agent', 'contact']
      for (const id of sections) {
        const el = document.getElementById(`section-${id}`)
        if (el) {
          const rect = el.getBoundingClientRect()
          if (rect.top <= 200 && rect.bottom >= 200) {
            setActiveSection(id)
            break
          }
        }
      }

      // 只在 intro section 显示 topbar（增加 60px 缓冲，避免边界闪烁）
      const introEl = document.getElementById('section-intro')
      if (introEl) {
        const rect = introEl.getBoundingClientRect()
        setVisible(rect.bottom > 60)
      }
    }

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [isHome])

  const navItems = [
    { id: 'intro' as const, label: '项目介绍', icon: BookOpen },
    { id: 'about' as const, label: '平台介绍', icon: Info },
    { id: 'data' as const, label: '数据浏览', icon: LayoutGrid },
    { id: 'downstream' as const, label: '下游任务', icon: Waves },
    { id: 'agent' as const, label: '智能体报告', icon: Bot },
    { id: 'contact' as const, label: '联系我们', icon: Mail },
  ]

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        visible ? 'translate-y-0' : '-translate-y-full',
        scrolled || !isHome ? 'glass-strong py-2 shadow-sm' : 'bg-transparent py-4'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <LayoutGrid className="w-4 h-4 text-sky-500" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-slate-800">
            玄女底座
          </span>
        </Link>

        <div className="hidden lg:flex items-center gap-1">
          {isHome && navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all duration-200',
                activeSection === item.id
                  ? 'text-sky-600 bg-sky-50 border border-sky-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
          <Link
            to="/annotate"
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all duration-200',
              location.pathname === '/annotate'
                ? 'text-sky-600 bg-sky-50 border border-sky-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            )}
          >
            <PenTool className="w-4 h-4" />
            自定义训练
          </Link>
        </div>

        <button
          className="lg:hidden text-slate-600"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden glass-strong mt-2 mx-4 rounded-xl p-4 space-y-2 shadow-lg">
          {isHome && navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id)
                setMobileOpen(false)
              }}
              className={cn(
                'flex items-center gap-2 w-full px-4 py-3 rounded-lg text-sm',
                activeSection === item.id
                  ? 'text-sky-600 bg-sky-50'
                  : 'text-slate-500'
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
          <Link
            to="/annotate"
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-2 w-full px-4 py-3 rounded-lg text-sm',
              location.pathname === '/annotate'
                ? 'text-sky-600 bg-sky-50'
                : 'text-slate-500'
            )}
          >
            <PenTool className="w-4 h-4" />
            自定义训练
          </Link>
        </div>
      )}
    </nav>
  )
}
