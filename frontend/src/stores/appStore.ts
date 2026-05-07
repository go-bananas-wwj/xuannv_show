import { create } from 'zustand'
import config from '@/config.json'
import type { PatchMeta } from '@/types'

interface AppState {
  region: string
  activeHead: string | null
  selectedPatch: PatchMeta | null
  isLoading: boolean
  error: string | null
  dataSource: 'monthly' | 'embedding'

  selectHead: (headId: string | null) => void
  selectPatch: (patch: PatchMeta | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setDataSource: (source: 'monthly' | 'embedding') => void
  setRegion: (region: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  region: config.region,
  activeHead: null,
  selectedPatch: null,
  isLoading: false,
  error: null,
  dataSource: 'monthly',

  selectHead: (headId) => set({ activeHead: headId }),
  selectPatch: (patch) => set({ selectedPatch: patch }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setDataSource: (source) => set({ dataSource: source }),
  setRegion: (region) => set({ region }),
}))
