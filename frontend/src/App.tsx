import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useRef, useEffect, useState, createContext, useContext, lazy, Suspense } from 'react'
import { motion } from 'framer-motion'
import Navigation from '@/components/Navigation'
import HeroSection from '@/sections/HeroSection'
import AboutSection from '@/sections/AboutSection'
import DataSection from '@/sections/DataSection'
import MonitoringSection from '@/sections/MonitoringSection'
import AgentSection from '@/sections/AgentSection'
import TrainingSection from '@/sections/TrainingSection'
import ContactSection from '@/sections/ContactSection'
import AnnotatePage from '@/pages/AnnotatePage'
import LoginPage from '@/pages/LoginPage'
import ModelHubPage from '@/pages/ModelHubPage'
import ModelApplyPage from '@/pages/ModelApplyPage'
const AboutPage = lazy(() => import('@/pages/AboutPage'))
import AuthGuard from '@/components/AuthGuard'
import { useAuthStore } from '@/stores/authStore'
import { getMe } from '@/utils/api'

interface PatchMeta {
  patch_id: string
  ix: number
  iy: number
  bounds_wgs84: [number, number, number, number]
  sources: Record<string, number>
  crs: string
  time_range: [string, string]
}

const PatchesContext = createContext<PatchMeta[]>([])

export function usePatches() {
  return useContext(PatchesContext)
}

function HomePage() {
  const introRef = useRef<HTMLDivElement>(null)
  const aboutRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<HTMLDivElement>(null)
  const downstreamRef = useRef<HTMLDivElement>(null)
  const agentRef = useRef<HTMLDivElement>(null)
  const trainingRef = useRef<HTMLDivElement>(null)
  const contactRef = useRef<HTMLDivElement>(null)
  const [patches, setPatches] = useState<PatchMeta[]>([])

  useEffect(() => {
    fetch('/data/patches_meta.json')
      .then((res) => res.json())
      .then((data) => {
        const valid = data
          .filter((p: any) => p.bounds_wgs84 && p.bounds_wgs84.length === 4)
          .map((p: any) => ({
            patch_id: p.patch_id,
            ix: p.ix ?? 0,
            iy: p.iy ?? 0,
            bounds_wgs84: p.bounds_wgs84 as [number, number, number, number],
            sources: p.sources,
            crs: p.crs,
            time_range: p.time_range,
          }))
        setPatches(valid)
      })
      .catch((err) => console.error('Failed to load patches:', err))
  }, [])

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <PatchesContext.Provider value={patches}>
      <div
        className="h-dvh bg-slate-50 text-slate-800 overflow-x-hidden overflow-y-auto scroll-smooth"
        style={{ scrollSnapType: 'y mandatory' }}
      >
        <Navigation
          onNavigate={(section) => {
            if (section === 'intro') scrollTo(introRef)
            if (section === 'about') scrollTo(aboutRef)
            if (section === 'data') scrollTo(dataRef)
            if (section === 'downstream') scrollTo(downstreamRef)
            if (section === 'agent') scrollTo(agentRef)
            if (section === 'training') scrollTo(trainingRef)
            if (section === 'contact') scrollTo(contactRef)
          }}
        />

        <motion.div
          ref={introRef}
          className="snap-start"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8 }}
        >
          <HeroSection onExplore={() => scrollTo(aboutRef)} />
        </motion.div>

        <motion.div
          ref={aboutRef}
          className="snap-start"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8 }}
        >
          <AboutSection onExploreData={() => scrollTo(dataRef)} />
        </motion.div>

        <motion.div
          ref={dataRef}
          className="snap-start"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8 }}
        >
          <DataSection />
        </motion.div>

        <motion.div
          ref={downstreamRef}
          className="snap-start"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8 }}
        >
          <MonitoringSection />
        </motion.div>

        <motion.div
          ref={agentRef}
          className="snap-start"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8 }}
        >
          <AgentSection />
        </motion.div>

        <motion.div
          ref={trainingRef}
          className="snap-start"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8 }}
        >
          <TrainingSection />
        </motion.div>

        <motion.div
          ref={contactRef}
          className="snap-start"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8 }}
        >
          <ContactSection />
        </motion.div>

        <footer className="snap-start py-8 text-center text-sm text-slate-400 border-t border-slate-200">
          <p>玄女底座 Visualization Platform</p>
        </footer>
      </div>
    </PatchesContext.Provider>
  )
}

function AppRoutes() {
  const auth = useAuthStore()

  useEffect(() => {
    // 页面加载时尝试恢复登录状态
    const restore = async () => {
      try {
        const user = await getMe()
        auth.login(user)
      } catch {
        // 未登录或 session 过期，保持未登录状态
        auth.setLoading(false)
      }
    }
    restore()
  }, [])

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/annotate" element={<AuthGuard><AnnotatePage /></AuthGuard>} />
      <Route path="/models" element={<AuthGuard><ModelHubPage /></AuthGuard>} />
      <Route path="/apply" element={<AuthGuard><ModelApplyPage /></AuthGuard>} />
      <Route
        path="/about"
        element={
          <Suspense fallback={<div className="h-dvh bg-[#0a0a0f] flex items-center justify-center text-white">加载中...</div>}>
            <AboutPage />
          </Suspense>
        }
      />
      <Route path="*" element={<HomePage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
