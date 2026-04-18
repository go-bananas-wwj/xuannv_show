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

export default api
