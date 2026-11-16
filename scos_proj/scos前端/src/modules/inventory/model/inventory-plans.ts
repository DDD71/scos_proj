export interface MonthlyInventoryPlan {
  draftQuantity?: number
  confirmedQuantity?: number
}

export interface WeeklyInventoryBatch {
  date: string
  availableDate: string
  quantity: number
}

export interface WeeklyInventoryPlan {
  status: '待生产确认' | '已确认'
  policyVersion: string
  batches: WeeklyInventoryBatch[]
}
