import type { RequisitionArrival } from './types'

export type RequisitionReleaseStatus = '待下达' | '下达失败' | '已下达' | '已撤回'

export interface RequisitionExecutionRow {
  id: string
  contractId: string
  supplierName: string
  orderId?: string
  orderLineNumber?: string
  materialName: string
  unit: string
  plannedDate: string
  plannedQuantity: number
  releaseStatus: RequisitionReleaseStatus
  dispatchReference?: string
  releaseError?: string
  commitmentDate?: string
  commitmentQuantity?: number
  shippedQuantity?: number
  estimatedArrivalDate?: string
  transportStatus?: string
  receivedQuantity?: number
  qualifiedQuantity?: number
  inspectionStatus?: string
  qualifiedAvailableDate?: string | null
  deviation?: string
}

export interface RequisitionExecutionPlan {
  id: string
  plant: string
  rows: RequisitionExecutionRow[]
  source?: {
    submissionId?: string
    weekStart: string
    materialCode: string
    demandVersion: string
    inventoryVersion: string
    conditionVersion: string
    expectedQuantity?: number
    warehouseCapacity?: number
    supplierOrder?: readonly string[]
    manuallyAdjusted?: boolean
    adjustmentReason?: string
    coordinationId?: string
    confirmedAt: string
  }
}

export interface RequisitionPlanPublication {
  submissionId: string
  weekStart: string
  plant: string
  materialCode: string
  materialName: string
  unit: string
  demandVersion: string
  inventoryVersion: string
  conditionVersion: string
  expectedQuantity?: number
  supplierOrder?: readonly string[]
  manuallyAdjusted?: boolean
  adjustmentReason?: string
  coordinationId?: string
  suggestions: readonly RequisitionArrival[]
}
