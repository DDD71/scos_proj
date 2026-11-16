export interface ProcurementOptimizationParameters {
  minSupplierCount: number
  // 占比按确认采购量计算，输入使用百分数。
  maxSupplierShare: number
  minSelectedSupplierShare: number
  annualFundingRate: number
}

export const defaultProcurementOptimizationParameters: ProcurementOptimizationParameters = {
  minSupplierCount: 1,
  maxSupplierShare: 100,
  minSelectedSupplierShare: 0,
  annualFundingRate: 0,
}

export interface ProcurementOptimizationInput {
  month: string
  plant: string
  materialCode: string
  unit: string
  requestedQuantity: number
  supplierCodes: string[]
  parameters?: ProcurementOptimizationParameters
}

export interface ProcurementOptimizationOffer {
  supplierCode: string
  unitPrice: number
  capacity: number
  minimumQuantity: number
  currency: string
  freightPerUnit?: number
  packagingCreditPerUnit?: number
  paymentDays?: number
}

export interface ProcurementOptimizationAllocation {
  supplierCode: string
  supplierName: string
  quantity: number
  unitPrice: number
  amount: number
  currency: string
  effectiveUnitCost?: number
  estimatedCost?: number
  packagingCredit?: number
}

export interface ProcurementOptimizationResult {
  requestedQuantity: number
  allocatedQuantity: number
  shortageQuantity: number
  totalCost: number | null
  currency: string | null
  allocations: ProcurementOptimizationAllocation[]
  source: 'mock' | 'http'
  estimatedCost?: number
  packagingCredit?: number
  infeasibleReason?: string
}

export interface ProcurementPlanVersion {
  version: number
  savedAt: string
  input: ProcurementOptimizationInput
  result: ProcurementOptimizationResult
  dispatch?: { target: 'E采'; sentAt: string }
}
