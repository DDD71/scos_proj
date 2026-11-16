// 初始视图类型，正式字段与单位需在后端联调时确认。
import type { PlanStatus, VersionReference } from '@/shared/types/business'

export interface InventoryStrategy extends VersionReference {
  scope: { type: 'sku' | 'category' | 'abc'; code: string }
  policy: 'dynamic' | 'static'
  status: PlanStatus
}

export interface InventoryPolicyParameters {
  type: 'dynamic' | 'static'
  /** 百分数，如 98 代表 98%。 */
  serviceLevel: number
  leadDays: number
  reviewDays: number
  staticSafetyStock: number
}

export interface InventoryReceipt {
  /** 此日期是样例预计可用日期。 */
  date: string
  quantity: number
  confirmed: boolean
  production?: {
    workshopAt: string
    warehouseAt: string
    transferStartedAt?: string
    receivedAt?: string
  }
}

export interface InventoryMonthlyProduction {
  quota: number
  completed: number
  scheduled: number
}

export interface InventoryDailyAmounts {
  production: number | null
  outbound: number | null
  availableReceipt: number | null
  closingStock: number | null
}

export interface InventoryDailyExecution {
  date: string
  /** 当期已下达计划快照，供实绩复盘。 */
  planned: InventoryDailyAmounts
  /** 生产完工量与已可用入库分开记录，缺项保留为空。 */
  actual: InventoryDailyAmounts | null
}

export interface InventoryProduct {
  code: string
  name: string
  category: string
  abcClass: 'A' | 'B' | 'C'
  unit: string
  monthlyDemand: number
  availableStock: number
  /** 已分配给订单且尚未出库的库存。 */
  allocatedStock: number
  physicalStock: number
  /** 共享罐产品显示组容量，不代表 SKU 独享。 */
  capacity: number
  storageType: 'shared' | 'dedicated'
  storageGroup: string
  historyMean: number
  historyStdDev: number
  dailyDemand: Record<string, number>
  explicitOrderDates: string[]
  receipts: InventoryReceipt[]
  dailyExecution?: InventoryDailyExecution[]
  policy: InventoryPolicyParameters
  policyVersion?: string
  policyBaseline?: { version: string; parameters: InventoryPolicyParameters }
  monthlyProduction?: InventoryMonthlyProduction
  confirmedPlanDates?: string[]
}

export interface InventorySnapshot {
  plant: string
  snapshotId: string
  snapshotTime: string
  strategyVersion: string
  month: string
  startDate: string
  openingDate: string
  days: number
  lockDays: number
  capacity: number
  monthlyProductionLimit: number | null
  weeklyPlanVersion: string
  monthlyPlanVersion: string
  products: InventoryProduct[]
}

export interface InventoryPolicyResult {
  safetyStock: number
  targetSafetyStock: number
  reorderPoint: number
  targetStock: number
  capacityRisk: boolean
  sharedCapacityPending: boolean
}

export interface InventoryProjectionDay {
  date: string
  isActual?: boolean
  week: number
  locked: boolean
  demand: number | null
  demandSource: '明确销售订单' | '月出货计划分摊' | '月计划日均估计' | null
  confirmedReceipt: number | null
  suggestedQuantity: number | null
  plannedQuantity: number | null
  suggestedAvailableDate: string | null
  openingStock: number | null
  closingStock: number | null
  scenarioClosingStock: number | null
  safetyStock: number | null
  reorderPoint: number | null
  targetStock: number | null
  inventoryPosition: number | null
  rawSuggestion: number | null
  replenishmentReason: string
  quotaRisk: boolean
  plannedCapacityRisk: boolean
  safetyGap: number | null
  shortage: number | null
  scenarioShortage: number | null
  capacityRisk: boolean
  sharedCapacityPending: boolean
}
