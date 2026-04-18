import { cn } from '@/utils/cn'

interface GlassPanelProps {
  children: React.ReactNode
  className?: string
  glow?: boolean
}

export default function GlassPanel({
  children,
  className,
  glow = false,
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/5 bg-space-800/60 backdrop-blur-xl',
        glow && 'border-glow',
        className
      )}
    >
      {children}
    </div>
  )
}
