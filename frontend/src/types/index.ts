export interface PatchMeta {
  patch_id: string
  ix: number
  iy: number
  bounds: [number, number, number, number]
  bounds_wgs84?: [number, number, number, number]
  crs: string
  sources: Record<string, number>
  time_range: [string, string]
  thumbnail_path?: string
}

export interface TaskHead {
  id: string
  name: string
  nameEn: string
  icon: string
  description: string
  color: string
}

export interface RegionConfig {
  region: string
  name: string
  nameEn: string
  bounds: [number, number, number, number]
  boundsUtm?: [number, number, number, number]
  crs: string
  patches: string
  embeddings: string
  results: string
  available_heads: TaskHead[]
  time_range: [string, string]
  sources: string[]
  sourceDisplayNames: Record<string, string>
}

export interface AgentTaskRequest {
  prompt: string
  region: string
  time_range?: [string, string]
}

export interface AgentTaskResponse {
  report_html: string
  result_image_url?: string
  statistics: {
    change_areas: number
    total_area_ha: number
    confidence: number
    categories?: Record<string, number>
  }
}

export interface AgentTaskSubmitResponse {
  task_id: string
  status: string
}

export interface AgentTaskStatus {
  task_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  prompt: string
  created_at: number
  started_at: number | null
  completed_at: number | null
  elapsed_seconds: number | null
  result: {
    report_markdown: string
    report_html: string
    statistics: {
      change_areas: number
      total_area_ha: number
      confidence: number
      categories?: Record<string, number>
    }
    tools_used: string[]
  } | null
  error: string | null
}

export interface EmbeddingPreview {
  patch_id: string
  version: string
  image_url: string
}

export interface HeadResult {
  head_id: string
  period: string
  image_url: string
  heatmap_url?: string
}
