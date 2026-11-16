export const coordinationDirections = [
  '供应商协调',
  '采购合同协调',
  '生产计划协调',
  '仓储物流协调',
  '质量复核',
  '数据核对',
] as const
export type CoordinationDirection = (typeof coordinationDirections)[number]

export interface RequisitionIssueContext {
  id: string
  materialCode: string
  materialName: string
  weekStart: string
  unit: string
  cause: string
  riskDate?: string
  shortage?: number
  riskKnown?: boolean
  planId?: string
  executionRowId?: string
  plannedDate?: string
  plannedQuantity?: number
  feedbackDate?: string
  feedbackQuantity?: number
}

export interface RequisitionCoordination extends RequisitionIssueContext {
  direction: CoordinationDirection
  owner: string
  result: string
  status: '协调中' | '已关闭'
  updatedAt: string
}

export interface RequisitionRestriction {
  id: string
  supplierId: string
  materialCode: string
  contractId?: string
  action: '禁运' | '解除'
  reason: string
  effectiveDate: string
  status: '待复核' | '已确认'
}

export interface RequisitionReleaseIssue {
  rowId: string
  reason: string
}
