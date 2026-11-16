import type { RequisitionRestriction } from './operations'

// 初始视图类型，正式字段与单位需在后端联调时确认。
export interface ArrivalAllocation {
  id: string
  contractId: string
  supplierId: string
  arrivalDate: string
  quantity: number
  unit: string
  locked: boolean
}

export interface RequisitionMaterial {
  code: string
  name: string
  category: '原料' | '辅料' | '包材'
  unit: string
  /** WMS 库存查询快照的「可用数量」。 */
  availableStock: number | null
  /** WMS 库存查询快照的「在库量」，包含仍占用仓容的不可用库存。 */
  onHandStock: number | null
  /** WMS 库存快照中与该物料对应的仓库上限。 */
  warehouseCapacity: number | null
  receivingCapacity: number | null
  demandSource: string
  safetyBuffer?: number
  dailyDemand: Record<string, number | null>
}

export interface RequisitionArrival {
  id: string
  materialCode: string
  supplierName: string
  contractId: string
  orderId: string
  orderLineNumber?: string
  arrivalPlanNumber?: string
  plannedArrivalDate?: string
  estimatedArrivalTime?: string
  /** 固定到货使用最新预计到厂日期。 */
  date: string
  quantity: number
  /** 数量以收货为准；部分放行或时间待定通过可投料字段表达。 */
  availableQuantity?: number
  availableDate?: string | null
  status: '已确认' | '已下达' | '运输中' | '已到厂' | '建议'
  locked: boolean
}

export interface RequisitionSupply {
  id: string
  orderId: string
  materialCode: string
  supplierId: string
  supplierName: string
  signedAt: string
  validTo: string
  earliestArrival: string
  latestArrival: string
  contractQuantity?: number | null
  executedQuantity?: number | null
  /** 已扣除执行量及固定到货占用，新增建议不得再次扣减固定到货。 */
  remainingQuantity: number
  dailyCapacity: number
  minimumQuantity: number
  priority: number
  status: string
  embargoed: boolean
  restrictions?: RequisitionRestriction[]
}

export interface RequisitionSnapshot {
  plant: string
  snapshotTime: string
  startDate: string
  demandVersion: string
  inventoryVersion: string
  inventorySnapshotTime?: string
  conditionVersion: string
  materials: RequisitionMaterial[]
  fixedArrivals: RequisitionArrival[]
  supplies: RequisitionSupply[]
  planningDemo?: {
    weekStart: string
    materialCode: string
    arrivalId: string
    originalDate: string
    delayedDate: string
    quantity: number
    delayed: boolean
  }
}

export interface RequisitionDailyProjection {
  date: string
  demand: number | null
  fixedArrival: number | null
  fixedAvailableArrival: number | null
  suggestedArrival: number | null
  openingStock: number | null
  closingStock: number | null
  /** 当日到货入库、投料前的预计实物占仓量。 */
  warehousePeak: number | null
  unavailableStock: number | null
  /** 截至当日尚未覆盖的生产耗用量。 */
  shortage: number | null
  safetyBufferGap: number | null
}
