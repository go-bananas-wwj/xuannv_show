import { motion } from 'framer-motion'

interface HeadTransitionProps {
  isActive: boolean
  color: string
}

export default function HeadTransition({ isActive, color }: HeadTransitionProps) {
  if (!isActive) return null

  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
      {/* Light flow from edges */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.6, 0] }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at center, ${color}20 0%, transparent 70%)`,
        }}
      />

      {/* Corner beams */}
      {[
        'top-0 left-0',
        'top-0 right-0',
        'bottom-0 left-0',
        'bottom-0 right-0',
      ].map((pos, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1, 1.5] }}
          transition={{ duration: 0.6, delay: i * 0.05 }}
          className={`absolute w-20 h-20 ${pos}`}
          style={{
            background: `radial-gradient(circle, ${color}40 0%, transparent 70%)`,
          }}
        />
      ))}

      {/* Center pulse */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.5], opacity: [0.8, 0] }}
        transition={{ duration: 0.8 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full"
        style={{
          border: `2px solid ${color}60`,
        }}
      />
    </div>
  )
}
