import type { ProcurementDemandVersion } from './demand'
import type { ProcurementRollingAssessment } from './execution'
import type {
  ProcurementOptimizationInput,
  ProcurementOptimizationResult,
  ProcurementPlanVersion,
} from './optimization'
import type { ProcurementForecastSnapshot } from './price-forecast'

export interface ProcurementMaterial {
  plant: string
  materialCode: string
  materialDescription?: string | null
  baseUnit?: string | null
  purchasingUnit?: string | null
}

export interface ProcurementSupplier {
  supplierCode: string
  supplierName?: string | null
  address?: string | null
  region?: string | null
  enabledStatus?: string | null
  riskScore?: number | null
  qualificationExpiry?: string | null
  paymentTerms?: string | null
  currency?: string | null
  // SCOS 落库记录的 SAP 主数据同步时间（带时区的 ISO 时间）。
  syncedAt?: string | null
}

export type ProcurementSupplierStatus = '启用' | '停用'

export interface ProcurementQuote {
  quoteNumber: string
  quoteLineNumber: string
  supplierCode: string
  materialCode: string
  quoteDate?: string | null
  // SCOS 落库记录的 E采报价同步时间（带时区的 ISO 时间）。
  syncedAt?: string | null
  unitPrice?: number | null
  currency?: string | null
  taxIncluded?: string | boolean | null
  taxRate?: number | null
  pricingUnit?: string | null
  validFrom?: string | null
  validTo?: string | null
  availableDate?: string | null
  availableQuantity?: number | null
  dailySupplyCapacity?: number | null
  minimumOrderQuantity?: number | null
  purchaseIncrement?: number | null
}

export interface ProcurementExecutionRow {
  purchaseOrderNumber: string
  purchaseOrderLineNumber: string
  supplierCode?: string | null
  supplierName?: string | null
  materialCode?: string | null
  purchaseQuantity?: number | null
  unit?: string | null
  receivedQuantity?: number | null
  openDeliveryQuantity?: number | null
  plannedArrivalDate?: string | null
  estimatedArrivalTime?: string | null
  actualArrivalTime?: string | null
  inspectionStatus?: string | null
}

export interface ProcurementSupplierDelivery extends ProcurementExecutionRow {
  purchaseOrderDate?: string | null
  materialName?: string | null
}

export interface ProcurementDraftInput {
  month: string
  plant: string
  materialCode: string
  unit: string
  demandQuantity?: number
  demandSnapshot?: ProcurementDemandVersion
  forecastSnapshot?: ProcurementForecastSnapshot
  rollingAssessment?: ProcurementRollingAssessment
  confirmedQuantity?: number
  demandNote: string
  supplierCodes: string[]
  excludedSupplierCodes?: string[]
  optimizationInput?: ProcurementOptimizationInput
  optimizationResult?: ProcurementOptimizationResult
  savedPlans?: ProcurementPlanVersion[]
  selectedPlanVersion?: number
  supplierReview: string
  minSupplierCount?: number
  maxSupplierShare?: number
  minSelectedSupplierShare?: number
  annualFundingRate?: number
  costNote: string
  reviewNote: string
}

export interface ProcurementDraft extends ProcurementDraftInput {
  id: string
  createdOn?: string
}
