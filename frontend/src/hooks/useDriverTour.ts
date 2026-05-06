import { useEffect, useRef, useCallback } from 'react'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useTourStore } from '@/stores/tourStore'
import { useAuthStore } from '@/stores/authStore'

export interface TourStep {
  element: string
  title: string
  description: string
  position?: 'left' | 'right' | 'top' | 'bottom'
}

export function useAnnotateTour(steps: TourStep[]) {
  const driverRef = useRef<Driver | null>(null)
  const tourStore = useTourStore()
  const authStore = useAuthStore()
  const stepsRef = useRef(steps)
  stepsRef.current = steps

  const startTour = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy()
    }

    const d = driver({
      showProgress: true,
      progressText: '{{current}} / {{total}}',
      allowClose: true,
      overlayClickBehavior: 'close',
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: 'xuannv-tour-popover',
      nextBtnText: '下一步 →',
      prevBtnText: '← 上一步',
      doneBtnText: '完成 ✓',
      steps: stepsRef.current.map((s, idx) => ({
        element: s.element,
        popover: {
          title: s.title,
          description: s.description,
          side: s.position || 'bottom',
          align: 'center',
          onNextClick: () => {
            tourStore.setCurrentStep(idx + 1)
            d.moveNext()
          },
          onPrevClick: () => {
            tourStore.setCurrentStep(Math.max(0, idx - 1))
            d.movePrevious()
          },
        },
      })),
      onDestroyed: () => {
        if (tourStore.isRunning) {
          tourStore.setCompleted()
          if (authStore.user) {
            import('@/utils/api').then(({ markTourCompleted }) => {
              markTourCompleted().catch(() => {})
            })
          }
        }
      },
    })

    driverRef.current = d
    tourStore.setIsRunning(true)
    d.drive()
  }, [tourStore, authStore.user])

  useEffect(() => {
    return () => {
      if (driverRef.current) {
        driverRef.current.destroy()
        driverRef.current = null
      }
    }
  }, [])

  return { startTour, isRunning: tourStore.isRunning }
}
