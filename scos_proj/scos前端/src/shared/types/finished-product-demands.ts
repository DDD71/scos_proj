export interface FinishedProductDemandLine {
  requestedStartDate: string
  requiredAvailableDate: string
  quantity: number
}

export interface FinishedProductDemand {
  id: string
  plant: string
  productCode: string
  productName: string
  unit: string
  snapshotId: string
  businessDate?: string
  publishedAt: string
  lines: FinishedProductDemandLine[]
}

export type FinishedProductDemandInput = Omit<FinishedProductDemand, 'id' | 'publishedAt'>
