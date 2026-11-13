// 初始视图类型，正式字段与单位需在后端联调时确认。
import type { PlanStatus, VersionReference } from '@/shared/types/business'

export interface InventoryStrategy extends VersionReference {
  scope: { type: 'sku' | 'category' | 'abc'; code: string }
  policy: 'dynamic' | 'static'
  status: PlanStatus
}
