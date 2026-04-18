import { motion } from 'framer-motion'
import {
  Flame,
  Globe,
  Trees,
  Waves,
  Building2,
  type LucideProps,
} from 'lucide-react'
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
  globe: Globe,
  trees: Trees,
  waves: Waves,
  building2: Building2,
}

export default function TaskHeadSelector({
  heads,
  activeHead,
  onSelect,
}: TaskHeadSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
              className={`relative p-5 h-full transition-all duration-300 ${
                isActive ? 'ring-2 ring-sky-300 shadow-md' : ''
              }`}
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
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: `${head.color}12` }}
                >
                  <Icon className="w-5 h-5" style={{ color: head.color }} />
                </div>

                <h3 className="font-medium text-slate-700 text-sm mb-1">{head.name}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {head.description}
                </p>

                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 flex items-center gap-2"
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: head.color }}
                    />
                    <span className="text-xs" style={{ color: head.color }}>
                      已选择
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
