import { create } from 'zustand'
import type { PatchMeta } from '@/types'

export interface ClassDef {
  id: string
  name: string
  color: string
}

export interface GeometryMask {
  type: 'mask'
  mask_b64: string
}

export interface GeometryPolygon {
  type: 'polygon'
  points: Array<[number, number]>
}

export interface GeometryPolyline {
  type: 'polyline'
  points: Array<[number, number]>
}

export type Geometry = GeometryMask | GeometryPolygon | GeometryPolyline

export interface Annotation {
  id: string
  patch_id: string
  month: string
  class_id: string
  score: number
  created_at: string
  geometry: Geometry
  before_month?: string
  after_month?: string
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

type AnnotationMode = 'segmentation' | 'change_detection'

interface AnnotateState {
  selectedMonth: string
  selectedBeforeMonth: string
  selectedAfterMonth: string
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
  annotationMode: AnnotationMode

  setSelectedMonth: (month: string) => void
  setSelectedBeforeMonth: (month: string) => void
  setSelectedAfterMonth: (month: string) => void
  setSelectedPatch: (patch: PatchMeta | null) => void
  setClasses: (classes: ClassDef[]) => void
  addClass: (cls: ClassDef) => void
  removeClass: (id: string) => void
  updateClassName: (id: string, name: string) => void
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
  setAnnotationMode: (mode: AnnotationMode) => void
  // System models
  systemModels: Array<{ id: string; name: string; description: string; available: boolean }>
  setSystemModels: (models: Array<{ id: string; name: string; description: string; available: boolean }>) => void
}

export const useAnnotateStore = create<AnnotateState>((set) => ({
  selectedMonth: '2025-04',
  selectedBeforeMonth: '2025-04',
  selectedAfterMonth: '2025-10',
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
  annotationMode: 'segmentation',
  systemModels: [],

  setSelectedMonth: (month) => set({ selectedMonth: month }),
  setSelectedBeforeMonth: (month) => set({ selectedBeforeMonth: month }),
  setSelectedAfterMonth: (month) => set({ selectedAfterMonth: month }),
  setSelectedPatch: (patch) => set({ selectedPatch: patch, isEmbeddingReady: false, maskCandidates: [] }),
  setClasses: (classes) => set((state) => ({
    classes,
    activeClassId: state.activeClassId ?? (classes.length > 0 ? classes[0].id : null),
  })),
  addClass: (cls) => set((state) => ({ classes: [...state.classes, cls] })),
  removeClass: (id) => set((state) => ({
    classes: state.classes.filter((c) => c.id !== id),
    activeClassId: state.activeClassId === id ? null : state.activeClassId,
    annotations: state.annotations.filter((a) => a.class_id !== id),
  })),
  updateClassName: (id, name) => set((state) => ({
    classes: state.classes.map((c) => c.id === id ? { ...c, name } : c),
  })),
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
  setAnnotationMode: (mode) => set({ annotationMode: mode }),
  setSystemModels: (models) => set({ systemModels: models }),
}))
