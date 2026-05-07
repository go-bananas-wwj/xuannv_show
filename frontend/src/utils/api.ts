import axios from 'axios'
import type { PatchMeta, AgentTaskRequest, AgentTaskResponse, EmbeddingPreview, HeadResult } from '@/types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true,
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

export async function renameClass(id: string, name: string): Promise<void> {
  await api.patch(`/annotate/classes/${id}`, { name })
}

// Annotations CRUD
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
}

export interface AnnotationCreate {
  patch_id: string
  month: string
  class_id: string
  score: number
  geometry: Geometry
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

export async function importGeoJSON(patchId: string, month: string, classId: string, geojson: object): Promise<{ status: string; created: number; skipped: number }> {
  const { data } = await api.post('/annotate/annotations/import_geojson', { patch_id: patchId, month, class_id: classId, geojson })
  return data
}

export async function importSHP(patchId: string, month: string, classId: string, file: File): Promise<{ status: string; created: number; skipped: number }> {
  const form = new FormData()
  form.append('patch_id', patchId)
  form.append('month', month)
  form.append('class_id', classId)
  form.append('file', file)
  const { data } = await api.post('/annotate/annotations/import_shp', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
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

// ── Models (Classification Heads) ──

export interface ModelInfo {
  id: string
  name: string
  status: 'training' | 'completed' | 'failed'
  created_at: string
  completed_at: string | null
  classes: Array<{ id: string; name: string; color: string }>
  accuracy: number | null
  n_samples: number | null
  model_path: string | null
  message: string | null
}

export async function listModels(): Promise<ModelInfo[]> {
  const { data } = await api.get<ModelInfo[]>('/annotate/models')
  return data
}

export async function createModel(name: string): Promise<{ model_id: string; job_id: string }> {
  const { data } = await api.post('/annotate/models', { name })
  return data
}

export async function getModel(modelId: string): Promise<ModelInfo> {
  const { data } = await api.get<ModelInfo>(`/annotate/models/${modelId}`)
  return data
}

export async function renameModel(modelId: string, name: string): Promise<void> {
  await api.patch(`/annotate/models/${modelId}`, { name })
}

export async function deleteModel(modelId: string): Promise<void> {
  await api.delete(`/annotate/models/${modelId}`)
}

export async function inferWithModel(
  modelId: string,
  patchId: string,
  month: string
): Promise<InferenceResult> {
  const { data } = await api.post<InferenceResult>(`/annotate/models/${modelId}/infer`, {
    patch_id: patchId,
    month,
  })
  return data
}

export interface BatchInferResult {
  patch_id: string
  image_url: string
}

export async function inferBatchWithModel(
  modelId: string,
  patchIds: string[],
  month: string
): Promise<BatchInferResult[]> {
  const { data } = await api.post<BatchInferResult[]>(`/annotate/models/${modelId}/infer_batch`, {
    patch_ids: patchIds,
    month,
  })
  return data
}

// ── Auth API ──

export interface AuthUser {
  user_id: string
  username: string
  role: string
  has_seen_tour?: boolean
  created_at: string
}

export async function register(username: string, password: string): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/register', { username, password })
  return data
}

export async function login(username: string, password: string): Promise<{ status: string; user: AuthUser }> {
  const { data } = await api.post('/auth/login', { username, password })
  return data
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me')
  return data
}

export async function getUsers(): Promise<AuthUser[]> {
  const { data } = await api.get<AuthUser[]>('/auth/users')
  return data
}

export async function markTourCompleted(): Promise<void> {
  await api.post('/auth/tour_completed')
}

// ── System Models API ──

export interface SystemModel {
  id: string
  name: string
  description: string
  available: boolean
}

export interface SystemModelClass {
  id: string
  name: string
  color: string
}

export async function listSystemModels(): Promise<SystemModel[]> {
  const { data } = await api.get<SystemModel[]>('/annotate/system-models')
  return data
}

export async function getSystemModelClasses(modelId: string): Promise<SystemModelClass[]> {
  const { data } = await api.get<SystemModelClass[]>(`/annotate/system-models/${modelId}/classes`)
  return data
}

export async function inferSystemModel(
  modelId: string,
  patchId: string,
  month: string
): Promise<{ result_url: string }> {
  const { data } = await api.post(`/annotate/system-models/${modelId}/infer`, null, {
    params: { patch_id: patchId, month },
  })
  return data
}

export default api
