import { useRef } from 'react'
import { motion } from 'framer-motion'
import Navigation from '@/components/Navigation'
import HeroSection from '@/sections/HeroSection'
import DataSection from '@/sections/DataSection'
import MonitoringSection from '@/sections/MonitoringSection'
import AgentSection from '@/sections/AgentSection'

function App() {
  const introRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<HTMLDivElement>(null)
  const downstreamRef = useRef<HTMLDivElement>(null)
  const agentRef = useRef<HTMLDivElement>(null)

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-800 overflow-x-hidden">
      <Navigation
        onNavigate={(section) => {
          if (section === 'intro') scrollTo(introRef)
          if (section === 'data') scrollTo(dataRef)
          if (section === 'downstream') scrollTo(downstreamRef)
          if (section === 'agent') scrollTo(agentRef)
        }}
      />

      <motion.div
        ref={introRef}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8 }}
      >
        <HeroSection onExplore={() => scrollTo(dataRef)} />
      </motion.div>

      <motion.div
        ref={dataRef}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8 }}
      >
        <DataSection />
      </motion.div>

      <motion.div
        ref={downstreamRef}
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

      <footer className="py-8 text-center text-sm text-slate-400 border-t border-slate-200">
        <p>玄女底座 Visualization Platform | AlphaEarth Foundations</p>
      </footer>
    </div>
  )
}

export default App
