import { create } from 'zustand'
import type { PatchMeta } from '@/types'

export interface ClassDef {
  id: string
  name: string
  color: string
}

export interface Annotation {
  id: string
  patch_id: string
  month: string
  class_id: string
  mask_rle: string
  score: number
  created_at: string
}

export interface MaskCandidate {
  mask_b64: string
  score: number
}

export interface TrainingJob {
  job_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  accuracy?: number
  n_samples?: number
  message?: string
}

interface AnnotateState {
  selectedMonth: string
  selectedPatch: PatchMeta | null
  classes: ClassDef[]
  activeClassId: string | null
  annotations: Annotation[]
  isLoadingMask: boolean
  maskCandidates: MaskCandidate[]
  selectedMaskIndex: number
  trainingJob: TrainingJob | null
  trainedModelPath: string | null
  inferenceImageUrl: string | null
  isEmbeddingReady: boolean

  setSelectedMonth: (month: string) => void
  setSelectedPatch: (patch: PatchMeta | null) => void
  setClasses: (classes: ClassDef[]) => void
  addClass: (cls: ClassDef) => void
  removeClass: (id: string) => void
  setActiveClassId: (id: string | null) => void
  setAnnotations: (annotations: Annotation[]) => void
  addAnnotation: (ann: Annotation) => void
  removeAnnotation: (id: string) => void
  setIsLoadingMask: (loading: boolean) => void
  setMaskCandidates: (candidates: MaskCandidate[]) => void
  setSelectedMaskIndex: (index: number) => void
  setTrainingJob: (job: TrainingJob | null) => void
  setTrainedModelPath: (path: string | null) => void
  setInferenceImageUrl: (url: string | null) => void
  setIsEmbeddingReady: (ready: boolean) => void
}

export const useAnnotateStore = create<AnnotateState>((set) => ({
  selectedMonth: '2025-04',
  selectedPatch: null,
  classes: [],
  activeClassId: null,
  annotations: [],
  isLoadingMask: false,
  maskCandidates: [],
  selectedMaskIndex: 0,
  trainingJob: null,
  trainedModelPath: null,
  inferenceImageUrl: null,
  isEmbeddingReady: false,

  setSelectedMonth: (month) => set({ selectedMonth: month }),
  setSelectedPatch: (patch) => set({ selectedPatch: patch, isEmbeddingReady: false, maskCandidates: [] }),
  setClasses: (classes) => set({ classes }),
  addClass: (cls) => set((state) => ({ classes: [...state.classes, cls] })),
  removeClass: (id) => set((state) => ({ classes: state.classes.filter((c) => c.id !== id) })),
  setActiveClassId: (id) => set({ activeClassId: id }),
  setAnnotations: (annotations) => set({ annotations }),
  addAnnotation: (ann) => set((state) => ({ annotations: [...state.annotations, ann] })),
  removeAnnotation: (id) => set((state) => ({ annotations: state.annotations.filter((a) => a.id !== id) })),
  setIsLoadingMask: (loading) => set({ isLoadingMask: loading }),
  setMaskCandidates: (candidates) => set({ maskCandidates: candidates, selectedMaskIndex: 0 }),
  setSelectedMaskIndex: (index) => set({ selectedMaskIndex: index }),
  setTrainingJob: (job) => set({ trainingJob: job }),
  setTrainedModelPath: (path) => set({ trainedModelPath: path }),
  setInferenceImageUrl: (url) => set({ inferenceImageUrl: url }),
  setIsEmbeddingReady: (ready) => set({ isEmbeddingReady: ready }),
}))
