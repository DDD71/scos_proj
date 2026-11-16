import type { ProcurementExecutionRow } from './types'

export interface ProcurementExecutionRisk {
  type: string
  reason: string
  affectedQuantity?: number | null
  owner?: string | null
  dueAt?: string | null
}

export interface ProcurementExecutionEvent {
  source: 'SAP' | 'TMS' | 'QMS/LIMS' | 'CON' | 'E采'
  description: string
  occurredAt?: string | null
  reference?: string | null
}

export interface ProcurementArrivalSchedule {
  transportNumber: string
  tripNumber?: string | null
  committedQuantity?: number | null
  unit?: string | null
  shippedOn?: string | null
  estimatedArrivalTime?: string | null
  actualArrivalTime?: string | null
  status?: string | null
}

export interface ProcurementExecutionOrder extends ProcurementExecutionRow {
  contractNumber?: string | null
  materialName?: string | null
  executionStatus?: string | null
  shippedQuantity?: number | null
  qualifiedQuantity?: number | null
  updatedAt?: string | null
  arrivals?: ProcurementArrivalSchedule[]
  events?: ProcurementExecutionEvent[]
  risk?: ProcurementExecutionRisk | null
}

export interface ProcurementRollingAssessment {
  basePlanNumber: string
  latestDemandVersion: string
  baselineDemand: number
  latestDemand: number
  demandIncrease: number
  protectedQuantity: number
  unit: string
  affectedOrders: {
    orderKey: string
    supplierName?: string | null
    riskType: string
    reason: string
    quantity: number
  }[]
}

export function executionOrderKey(row: ProcurementExecutionRow) {
  return `${row.purchaseOrderNumber} / ${row.purchaseOrderLineNumber}`
}
