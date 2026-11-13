// 初始视图类型，正式字段与单位需在后端联调时确认。
import type { VersionReference } from '@/shared/types/business'

export interface BatchCostSummary extends VersionReference {
  batchId: string
  quantity: number
  quantityUnit: string
  currency: string
  transferredCost: number
  directCost: number
  allocatedCost: number
  totalCost: number
}
