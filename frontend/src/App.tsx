import { useRef } from 'react'
import { motion } from 'framer-motion'
import Navigation from '@/components/Navigation'
import HeroSection from '@/sections/HeroSection'
import AboutSection from '@/sections/AboutSection'
import DataSection from '@/sections/DataSection'
import MonitoringSection from '@/sections/MonitoringSection'
import AgentSection from '@/sections/AgentSection'
import ContactSection from '@/sections/ContactSection'

function App() {
  const introRef = useRef<HTMLDivElement>(null)
  const aboutRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<HTMLDivElement>(null)
  const downstreamRef = useRef<HTMLDivElement>(null)
  const agentRef = useRef<HTMLDivElement>(null)
  const contactRef = useRef<HTMLDivElement>(null)

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
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
        <AboutSection />
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
  )
}

export default App
