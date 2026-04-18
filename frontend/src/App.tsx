import { useRef } from 'react'
import { motion } from 'framer-motion'
import Navigation from '@/components/Navigation'
import HeroSection from '@/sections/HeroSection'
import GlobeSection from '@/sections/GlobeSection'
import MonitoringSection from '@/sections/MonitoringSection'
import AgentSection from '@/sections/AgentSection'

function App() {
  const globeRef = useRef<HTMLDivElement>(null)
  const monitoringRef = useRef<HTMLDivElement>(null)
  const agentRef = useRef<HTMLDivElement>(null)

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-dvh bg-space-950 text-slate-200 overflow-x-hidden">
      <Navigation
        onNavigate={(section) => {
          if (section === 'globe') scrollTo(globeRef)
          if (section === 'monitoring') scrollTo(monitoringRef)
          if (section === 'agent') scrollTo(agentRef)
        }}
      />

      <HeroSection onExplore={() => scrollTo(globeRef)} />

      <motion.div
        ref={globeRef}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8 }}
      >
        <GlobeSection />
      </motion.div>

      <motion.div
        ref={monitoringRef}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8 }}
      >
        <MonitoringSection />
      </motion.div>

      <motion.div
        ref={agentRef}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8 }}
      >
        <AgentSection />
      </motion.div>

      <footer className="py-8 text-center text-sm text-slate-500 border-t border-slate-800/50">
        <p>玄女底座 Visualization Platform | AlphaEarth Foundations</p>
      </footer>
    </div>
  )
}

export default App
