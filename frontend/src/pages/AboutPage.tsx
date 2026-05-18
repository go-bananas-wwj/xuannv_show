import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import AboutHero from '@/sections/about/AboutHero'
import AboutProblem from '@/sections/about/AboutProblem'
import AboutSolution from '@/sections/about/AboutSolution'
import AboutCapabilities from '@/sections/about/AboutCapabilities'
import AboutEvidence from '@/sections/about/AboutEvidence'
import AboutIntelligence from '@/sections/about/AboutIntelligence'
import AboutCustomization from '@/sections/about/AboutCustomization'
import AboutEmbedding from '@/sections/about/AboutEmbedding'
import AboutEcosystem from '@/sections/about/AboutEcosystem'
import AboutClosing from '@/sections/about/AboutClosing'

export default function AboutPage() {
  const problemRef = useRef<HTMLDivElement>(null)

  const scrollToProblem = () => {
    problemRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Back to home nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between bg-[#0a0a0f]/80 backdrop-blur-md border-b border-white/5">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回首页</span>
        </Link>
        <div className="text-sm font-medium text-slate-400">玄女底座</div>
      </nav>

      <main className="pt-0">
        <AboutHero onExplore={scrollToProblem} />
        <div ref={problemRef}>
          <AboutProblem />
        </div>
        <AboutSolution />
        <AboutCapabilities />
        <AboutEvidence />
        <AboutIntelligence />
        <AboutCustomization />
        <AboutEmbedding />
        <AboutEcosystem />
        <AboutClosing />
      </main>
    </div>
  )
}
