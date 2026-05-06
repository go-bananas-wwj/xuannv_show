import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface User {
  user_id: string
  username: string
  role: string
  created_at: string
}

interface AuthState {
  user: User | null
  isLoggedIn: boolean
  isLoading: boolean
  // Actions
  setUser: (user: User | null) => void
  setLoggedIn: (val: boolean) => void
  setLoading: (val: boolean) => void
  login: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoggedIn: false,
      isLoading: true,
      setUser: (user) => set({ user }),
      setLoggedIn: (isLoggedIn) => set({ isLoggedIn }),
      setLoading: (isLoading) => set({ isLoading }),
      login: (user) => set({ user, isLoggedIn: true, isLoading: false }),
      logout: () => set({ user: null, isLoggedIn: false, isLoading: false }),
    }),
    {
      name: 'xuannv-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user, isLoggedIn: state.isLoggedIn }),
    }
  )
)
