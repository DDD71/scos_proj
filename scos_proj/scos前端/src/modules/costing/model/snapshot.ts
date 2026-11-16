import type { CostingQualityCase } from './traceability'

export interface CostingContext {
  factory: string
  period: string
  snapshot: string
  lineageVersion: string
  costVersion: string
  poolRuleVersion: string
  analysisVersion: string
  ruleVersion: string
}

export interface CostingBatch {
  id: string
  line: string
  stage: string
  order: number
  material: string
  device: string
  start: string
  end: string
  qty: number
  unit: string
  status: string
  rule: string
  source: string
}

export interface CostingRelation {
  id: string
  from: string
  to: string
  qty: number
  unit: string
  upstreamShare: string
  downstreamShare: string
  yield: string
  method: string
  evidence: string
  confidence: string
  source: string
  status: string
}

export interface CostingBatchResult {
  batch: string
  line: string
  stage: string
  material: string
  quantity: number
  unit: string
  inboundCost: number
  directCost: number
  poolCost: number
  adjustment: number
  totalCost: number
  unitCost: number | null
  status: string
}

export interface CostingDirectItem {
  id: string
  batch: string
  itemCode: string
  costCategory: string
  costName: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
  source: string
  evidence: string
  status: string
}

export interface CostingPool {
  poolCode: string
  poolName: string
  benefitScope: string
  primaryDriver: string
  backupDriver: string
  periodAmount: number
  status: string
}

export interface CostingPoolDraftInput {
  poolCode?: string
  poolName: string
  costCenter: string
  costElement: string
  periodAmount: number
  benefitScope: string
  primaryDriver: string
  backupDriver: string
  sourceReference: string
}

export interface CostingPoolDraft extends CostingPoolDraftInput {
  id: string
}

export interface CostingAllocation {
  id: string
  poolCode: string
  batch: string
  itemCode: string
  costName: string
  driverName: string
  driverQuantity: number
  driverUnit: string
  allocationRate: number
  amount: number
}

export interface CostingOrder {
  id: string
  salesOrder: string
  productionOrder: string
  sku: string
  customer: string
  supplier: string
  channel: string
  region: string
  date: string
  quantity: number
  unit: string
  settlementBatch: string
  productionCost: number
  fullCost: number
  revenue: number
  costCategories: Record<string, number>
}

export interface CostingOrderBatch {
  id: string
  productionOrder: string
  batch: string
  settlementBatch: string
  quantity: number
  unit: string
  recognizedProductionCost: number
}

export interface CostingRule {
  id: string
  engine: string
  version: string
  name: string
  owner: string
  severity: string
  summary: string
  formulas: { name: string; expression: string; explanation: string }[]
  validations: { errorCode: string; message: string; action: string }[]
  sampleExecution?: { title: string; steps: string[] }
}

export interface CostingFinancialPeriod {
  period: string
  revenue?: number
  fullCost?: number
  cashflow?: number
  inventory: number
  receivables: number
  payables: number
  dio?: number
  dso?: number
  dpo?: number
  nonCash?: number
  workingCapitalIncrease?: number
}

export interface CostingFinancialSnapshot {
  version: string
  history: CostingFinancialPeriod[]
  budget: CostingFinancialPeriod
  priorYear: CostingFinancialPeriod
}

export interface CostingBatchBenchmark {
  factory: string
  period: string
  line: string
  stage: string
  material: string
  unit: string
  totalCost: number
  quantity: number
  version: string
  source: string
}

export interface CostingSnapshot {
  context: CostingContext
  batches: CostingBatch[]
  relations: CostingRelation[]
  transfers: { relationId: string; amount: number }[]
  costs: CostingBatchResult[]
  direct: CostingDirectItem[]
  catalog: {
    code: string
    category: string
    name: string
    directEligibility: string
    sourceSystem: string
    directCondition: string
  }[]
  pools: CostingPool[]
  poolExampleCodes?: string[]
  allocations: CostingAllocation[]
  orders: CostingOrder[]
  orderBatches: CostingOrderBatch[]
  qualityCases?: CostingQualityCase[]
  rules: CostingRule[]
  financial?: CostingFinancialSnapshot
  batchCostBenchmarks?: CostingBatchBenchmark[]
  standardCosts?: {
    material: string
    stage: string
    version: string
    unitCost: number
    unit: string
  }[]
}
