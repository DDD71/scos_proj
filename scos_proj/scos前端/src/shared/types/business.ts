export interface VersionReference {
  id: string
  version: string
  snapshotId: string
}

export type PlanStatus = 'draft' | 'in_review' | 'published' | 'archived'

export interface AsyncJob {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  progress: number | null
  resultId?: string
  message?: string
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
