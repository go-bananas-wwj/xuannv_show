import axios from 'axios'
import type { PatchMeta, AgentTaskRequest, AgentTaskResponse, EmbeddingPreview, HeadResult } from '@/types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.detail || error.message || 'Unknown error'
    console.error('API Error:', message)
    return Promise.reject(new Error(message))
  }
)

// Patches API
export async function fetchPatches(): Promise<PatchMeta[]> {
  const { data } = await api.get<PatchMeta[]>('/patches')
  return data
}

export async function fetchPatchById(patchId: string): Promise<PatchMeta> {
  const { data } = await api.get<PatchMeta>(`/patches/${patchId}`)
  return data
}

// Embeddings API
export async function fetchEmbeddingPreview(
  patchId: string,
  version: string = 'v2'
): Promise<EmbeddingPreview> {
  const { data } = await api.get<EmbeddingPreview>('/embeddings/preview', {
    params: { patch_id: patchId, version },
  })
  return data
}

// Heads API
export async function fetchAvailableHeads(): Promise<Array<{ id: string; name: string; description: string }>> {
  const { data } = await api.get('/heads')
  return data
}

export async function fetchHeadResult(
  headId: string,
  period: string
): Promise<HeadResult> {
  const { data } = await api.get<HeadResult>(`/heads/${headId}/result`, {
    params: { period },
  })
  return data
}

// Agent API
export async function submitAgentTask(
  request: AgentTaskRequest
): Promise<AgentTaskResponse> {
  const { data } = await api.post<AgentTaskResponse>('/agent/task', request)
  return data
}

// ── Annotate API ──

// SAM preloading
export async function preloadSAM3Embedding(
  patchId: string,
  month: string
): Promise<{ embedding_id: string }> {
  const { data } = await api.post('/annotate/sam/embed', { patch_id: patchId, month })
  return data
}

// SAM segmentation
export async function segmentWithSAM(
  embeddingId: string,
  pointCoords: Array<[number, number]>,
  pointLabels: number[],
  multimaskOutput: boolean = true
): Promise<{ masks_b64: string[]; scores: number[] }> {
  const { data } = await api.post('/annotate/sam/segment', {
    embedding_id: embeddingId,
    point_coords: pointCoords,
    point_labels: pointLabels,
    multimask_output: multimaskOutput,
  })
  return data
}

// Classes CRUD
export interface ClassDef {
  id: string
  name: string
  color: string
}

export interface ClassCreate {
  name: string
  color: string
}

export async function fetchClasses(): Promise<ClassDef[]> {
  const { data } = await api.get<ClassDef[]>('/annotate/classes')
  return data
}

export async function createClass(cls: ClassCreate): Promise<ClassDef> {
  const { data } = await api.post<ClassDef>('/annotate/classes', cls)
  return data
}

export async function deleteClass(id: string): Promise<void> {
  await api.delete(`/annotate/classes/${id}`)
}

// Annotations CRUD
export interface Annotation {
  id: string
  patch_id: string
  month: string
  class_id: string
  mask_b64: string
  score: number
  created_at: string
}

export interface AnnotationCreate {
  patch_id: string
  month: string
  class_id: string
  mask_b64: string
  score: number
}

export async function fetchAnnotations(): Promise<Annotation[]> {
  const { data } = await api.get<Annotation[]>('/annotate/annotations')
  return data
}

export async function saveAnnotation(ann: AnnotationCreate): Promise<Annotation> {
  const { data } = await api.post<Annotation>('/annotate/annotations', ann)
  return data
}

export async function deleteAnnotation(id: string): Promise<void> {
  await api.delete(`/annotate/annotations/${id}`)
}

// Training
export interface TrainingStatus {
  job_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  accuracy?: number
  n_samples?: number
  model_path?: string
  message?: string
}

export async function startTraining(): Promise<{ job_id: string }> {
  const { data } = await api.post('/annotate/train')
  return data
}

export async function getTrainingStatus(jobId: string): Promise<TrainingStatus> {
  const { data } = await api.get<TrainingStatus>(`/annotate/train/${jobId}`)
  return data
}

// Inference
export interface InferenceResult {
  image_url: string
}

export async function inferWithCustomModel(
  patchId: string,
  month: string
): Promise<InferenceResult> {
  const { data } = await api.post<InferenceResult>('/annotate/infer', {
    patch_id: patchId,
    month,
  })
  return data
}

export default api
