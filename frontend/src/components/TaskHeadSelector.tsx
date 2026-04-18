import { motion } from 'framer-motion'
import { Flame, Layers, Brain, type LucideProps } from 'lucide-react'
import GlassPanel from './GlassPanel'

interface Head {
  id: string
  name: string
  icon: string
  description: string
  color: string
}

interface TaskHeadSelectorProps {
  heads: Head[]
  activeHead: string | null
  onSelect: (headId: string | null) => void
}

const iconMap: Record<string, React.FC<LucideProps>> = {
  flame: Flame,
  layers: Layers,
  brain: Brain,
}

export default function TaskHeadSelector({
  heads,
  activeHead,
  onSelect,
}: TaskHeadSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {heads.map((head) => {
        const Icon = iconMap[head.icon] || Flame
        const isActive = activeHead === head.id

        return (
          <motion.div
            key={head.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(isActive ? null : head.id)}
            className="cursor-pointer"
          >
            <GlassPanel
              className={`relative p-6 h-full transition-all duration-300 ${
                isActive ? 'border-glow' : ''
              }`}
              glow={isActive}
            >
              <div
                className="absolute inset-0 rounded-xl transition-opacity duration-300"
                style={{
                  background: isActive ? `${head.color}08` : 'transparent',
                  opacity: isActive ? 1 : 0,
                }}
              />

              <div className="relative z-10">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${head.color}15` }}
                >
                  <Icon className="w-6 h-6" style={{ color: head.color }} />
                </div>

                <h3 className="font-medium text-slate-100 mb-2">{head.name}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {head.description}
                </p>

                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 flex items-center gap-2"
                  >
                    <div
                      className="w-2 h-2 rounded-full animate-pulse"
                      style={{ background: head.color }}
                    />
                    <span className="text-xs" style={{ color: head.color }}>
                      已接入
                    </span>
                  </motion.div>
                )}
              </div>
            </GlassPanel>
          </motion.div>
        )
      })}
    </div>
  )
}
