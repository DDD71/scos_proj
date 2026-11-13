// 初始视图类型，正式字段与单位需在后端联调时确认。
import type { VersionReference } from '@/shared/types/business'

export interface ScenarioDraft extends VersionReference {
  name: string
  type: 'demand' | 'supply' | 'production' | 'contract_cost'
  evaluationStatus: 'not_evaluated' | 'running' | 'evaluated' | 'failed'
  jobId?: string
}
