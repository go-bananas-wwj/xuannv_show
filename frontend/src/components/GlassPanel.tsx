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
        'rounded-xl border border-slate-200/80 bg-white/70 backdrop-blur-xl',
        glow && 'border-glow',
        className
      )}
    >
      {children}
    </div>
  )
}
