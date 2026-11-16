export type ScenarioKind = 'supply' | 'demand' | 'production' | 'contract'
export type WeekState = '正常生产' | '停车' | '开车'

export interface SandboxLocation {
  id: string
  name: string
  coordinates: [number, number]
}

export interface DailyProduct {
  id: string
  name: string
  unit: string
  opening: number | null
  physical: number | null
  safety: number | null
  capacity: number | null
  receivingCapacity?: number | null
  demand: Record<string, number | null>
  /** 保留快照策略字段，以便旧沙盘方案仍可匹配原基线版本。 */
  inventoryPolicy?: {
    historyMean: number
    historyStdDev: number
    capacity: number
    storageType: 'shared' | 'dedicated'
    policy: {
      type: 'dynamic'
      serviceLevel: number
      leadDays: number
      reviewDays: number
      staticSafetyStock: number
    }
  }
}

export interface SandboxOrder {
  id: string
  name: string
  productId: string
  date: string
  quantity: number
  rawUsage: number
  customerId: string
}

export interface SandboxProduction {
  id: string
  lineId: string
  lineName: string
  productId: string
  availableDate: string
  quantity: number
  confirmed: boolean
}

export interface ArrivalOption {
  id: string
  label: string
  productId: string
  date: string
  plannedDate: string
  quantity: number
  contractId?: string
  supplierId?: string
  sourceId: string
  target?: string
  locked: boolean
  availableDate?: string | null
  availableQuantity?: number
  location?: SandboxLocation
}

export interface MitigationOption {
  id: string
  supplierId: string
  label: string
  earliest: string
  latest: string
  maximum: number
  dailyMaximum: number
  minimum: number
  productId: string
  restrictions?: { effectiveDate: string; blocked: boolean }[]
}

export interface ContractProfile {
  id: string
  name: string
  bomVersion: string
  rawUsage: number
  auxUnit: number
  capacity: number
  load: number
  fixed: number
  energyAtFull: number
  energyFactor: number
  shutdown: number
  startup: number
  rawPrice: number
  salePrice: number
  openingRaw: number
}

export interface SandboxBaseline {
  id: string
  plant: string
  time: string
  start: string
  versions: { name: string; value: string }[]
  modelVersion: string
  factoryLocation?: SandboxLocation
  arrivals: ArrivalOption[]
  products: DailyProduct[]
  orders: SandboxOrder[]
  production: SandboxProduction[]
  mitigations: MitigationOption[]
  profiles: ContractProfile[]
  customers: { id: string; name: string }[]
}

export interface DailyInput {
  kind: Exclude<ScenarioKind, 'contract'>
  objectId: string
  horizon: 7 | 14
  start: string
  quantityPct: number
  days: number
  priceAssumption?: { base: number; increasePct: number }
  alternative?: { id: string; date: string; quantity: number }
}

export interface ContractMonthInput {
  month: string
  delivery: number
  purchase: number
  price: number
}

export interface ContractWeekInput {
  start: string
  end: string
  month: string
  state: WeekState
  load: number
}

export interface ContractPriceAdjustment {
  month: string
  change: number
}

export interface ContractLoadAdjustment {
  startWeek: string
  endWeek: string
  load: number
}

export interface ContractInput {
  kind: 'contract'
  objectId: string
  customer: string
  quantity: number
  salePrice: number
  startMonth: string
  duration: number
  penaltyType: 'amount' | 'rate'
  penalty: number
  openingRaw: number
  openingPrice: number
  capacity: number
  endPurchasePrice?: number
  purchaseCurveStart?: string
  purchaseAdjustments?: ContractPriceAdjustment[]
  productionAdjustments?: ContractLoadAdjustment[]
  months: ContractMonthInput[]
  weeks: ContractWeekInput[]
}

export type SandboxInput = DailyInput | ContractInput

export interface SandboxRunProgress {
  status: '排队中' | '运行中'
  message: string
  percent?: number
}

type ArchivedInventoryInput = Omit<DailyInput, 'kind'> & {
  kind: 'inventory'
  policy?: { serviceLevel: number; leadDays: number }
}
export type ResultKind = '可计算' | '未评估' | '不可行'

export interface SandboxMetric {
  key: string
  label: string
  unit: string
  base: number | null
  simulated: number | null
  alternative?: number | null
  reason?: string
}

export interface SandboxDay {
  date: string
  opening: number | null
  receipt: number | null
  demand: number | null
  closing: number | null
  shortage: number | null
  capacityExceeded?: boolean
}

export interface SandboxPoint {
  date: string
  baseline: SandboxDay
  simulated: SandboxDay
  alternative?: SandboxDay
}

export interface SandboxDiagnostic {
  area: string
  status: ResultKind
  detail: string
}

export interface SandboxImpact {
  object: string
  base: string
  simulated: string
  date?: string
  to?: string
}

export interface DailyResult {
  kind: 'daily'
  itemName: string
  unit: string
  days: SandboxPoint[]
  safety: number | null
  baselineSafety?: number | null
  capacity: number | null
  firstBreach?: string
  firstShortage?: string
  firstCapacity?: string
  impacts: SandboxImpact[]
  locations?: { factory: SandboxLocation; affected: SandboxLocation; date: string }
}

export type CostPart = 'fixed' | 'raw' | 'aux' | 'energy' | 'startStop'
export type Costs = Record<CostPart, number>

export interface ContractWeekResult extends ContractWeekInput {
  theoretical: number
  output: number
  rawEnding: number
  costs: Costs
}

export interface ContractMonthResult extends ContractMonthInput {
  output: number
  fulfilled: number
  backlog: number
  rawEnding: number
  finishedEnding: number
  revenue: number
  cogs: number
  periodExpense: number
  penalty: number
  profit: number
}

export interface ContractForecastDay {
  date: string
  purchasePrice: number
  productionCost: number
  profit: number
}

export interface ContractResult {
  kind: 'contract'
  months: ContractMonthResult[]
  baselineMonths: ContractMonthResult[]
  forecast?: ContractForecastDay[]
  weeks: ContractWeekResult[]
  costs: Costs
  output: number
  rawRequirement: number
}

export interface SandboxRun {
  id: string
  scenarioVersion: string
  baselineId: string
  baselineTime: string
  baselineVersions?: SandboxBaseline['versions']
  modelVersion: string
  createdAt: string
  input: SandboxInput | ArchivedInventoryInput
  changes: SandboxImpact[]
  eventId?: string
  status: '成功' | '部分完成' | '不可行'
  title: string
  comparisonKey: string
  metrics: SandboxMetric[]
  diagnostics: SandboxDiagnostic[]
  result: DailyResult | ContractResult
}

export interface SandboxEvaluation {
  id: string
  runId: string
  department: string
  owner: string
  dueAt: string
  rationale: string
  decision?: '采纳' | '部分采纳' | '不采纳'
  status: '待受理' | '已受理' | '退回' | '已反馈' | '已归档'
  feedback?: string
}

export interface SandboxHistory {
  runs: { name: string; run: SandboxRun }[]
  evaluations: SandboxEvaluation[]
}

export interface SandboxContext {
  snapshot?: string
  eventId?: string
}
