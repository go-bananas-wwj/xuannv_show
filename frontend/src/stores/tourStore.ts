import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface TourState {
  hasCompletedAnnotateTour: boolean
  isRunning: boolean
  currentStep: number
  setCompleted: () => void
  resetTour: () => void
  setCurrentStep: (step: number) => void
  setIsRunning: (running: boolean) => void
}

export const useTourStore = create<TourState>()(
  persist(
    (set) => ({
      hasCompletedAnnotateTour: false,
      isRunning: false,
      currentStep: 0,
      setCompleted: () => set({ hasCompletedAnnotateTour: true, isRunning: false }),
      resetTour: () => set({ hasCompletedAnnotateTour: false, currentStep: 0, isRunning: false }),
      setCurrentStep: (step) => set({ currentStep: step }),
      setIsRunning: (running) => set({ isRunning: running }),
    }),
    {
      name: 'xuannv-tour',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        hasCompletedAnnotateTour: state.hasCompletedAnnotateTour,
      }),
    }
  )
)
