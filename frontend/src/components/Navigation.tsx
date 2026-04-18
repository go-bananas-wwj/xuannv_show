import { useState, useEffect } from 'react'
import {
  BookOpen,
  LayoutGrid,
  ScanSearch,
  Flame,
  Waves,
  BarChart3,
  Bot,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/utils/cn'

interface NavigationProps {
  onNavigate: (
    section:
      | 'intro'
      | 'data'
      | 'anomaly'
      | 'cd'
      | 'downstream'
      | 'performance'
      | 'agent'
  ) => void
}

export default function Navigation({ onNavigate }: NavigationProps) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('intro')

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)

      const sections = [
        'intro',
        'data',
        'anomaly',
        'cd',
        'downstream',
        'performance',
        'agent',
      ]
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
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navItems = [
    { id: 'intro' as const, label: '项目介绍', icon: BookOpen },
    { id: 'data' as const, label: '数据浏览', icon: LayoutGrid },
    { id: 'anomaly' as const, label: '空间异常', icon: ScanSearch },
    { id: 'cd' as const, label: '变化检测', icon: Flame },
    { id: 'downstream' as const, label: '下游任务', icon: Waves },
    { id: 'performance' as const, label: '性能分析', icon: BarChart3 },
    { id: 'agent' as const, label: '智能体报告', icon: Bot },
  ]

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled ? 'glass-strong py-2 shadow-sm' : 'bg-transparent py-4'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <LayoutGrid className="w-4 h-4 text-sky-500" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-slate-800">
            玄女底座
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => (
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
          {navItems.map((item) => (
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
        </div>
      )}
    </nav>
  )
}
