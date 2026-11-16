import type {
  InventoryPolicyParameters,
  InventoryPolicyResult,
  InventoryProduct,
  InventoryProjectionDay,
  InventorySnapshot,
} from '../model/types'

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}

const quantity = (value: number) => Number(value.toFixed(3))

export function remainingMonthlyProduction(product: InventoryProduct): number | null {
  const production = product.monthlyProduction
  return production
    ? quantity(Math.max(0, production.quota - production.completed - production.scheduled))
    : null
}

export function distributeInventoryDemand(
  month: string,
  monthlyDemand: number,
  explicitOrders: Readonly<Record<string, number>>,
): Record<string, number> {
  const [year, monthNumber] = month.split('-').map(Number)
  const monthDays = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate()
  const dates = Array.from({ length: monthDays }, (_, index) => addDays(`${month}-01`, index))
  const fixedDemand = dates.reduce((sum, date) => sum + (explicitOrders[date] ?? 0), 0)
  const remainingDates = dates.filter((date) => explicitOrders[date] === undefined).length
  const daily = remainingDates ? Math.max(0, monthlyDemand - fixedDemand) / remainingDates : 0
  return Object.fromEntries(dates.map((date) => [date, explicitOrders[date] ?? daily]))
}

function normalQuantile(percent: number): number {
  const probability = percent / 100
  let lower = 0
  let upper = 6
  // 正态累计分布近似，用二分计算服务水平的分位值。
  for (let iteration = 0; iteration < 30; iteration++) {
    const mid = (lower + upper) / 2
    const x = mid / Math.SQRT2
    const a = 1 / (1 + 0.3275911 * x)
    const poly =
      ((((1.061405429 * a - 1.453152027) * a + 1.421413741) * a - 0.284496736) * a + 0.254829592) *
      a
    const cumulative = 1 - (poly * Math.exp(-x * x)) / 2
    if (cumulative < probability) lower = mid
    else upper = mid
  }
  return (lower + upper) / 2
}

function safetyLevels(
  product: Pick<InventoryProduct, 'historyStdDev'>,
  params: InventoryPolicyParameters,
) {
  if (params.type === 'static') {
    return { safetyStock: params.staticSafetyStock, targetSafetyStock: params.staticSafetyStock }
  }
  const z = normalQuantile(params.serviceLevel)
  return {
    safetyStock: z * product.historyStdDev * Math.sqrt(params.leadDays),
    targetSafetyStock: z * product.historyStdDev * Math.sqrt(params.leadDays + params.reviewDays),
  }
}

function demandAfter(product: InventoryProduct, date: string, days: number): number | null {
  let total = 0
  for (let offset = 1; offset <= days; offset++) {
    const demand = product.dailyDemand[addDays(date, offset)]
    if (demand === undefined) return null
    total += demand
  }
  return total
}

export function calculateInventoryPolicy(
  product: Pick<
    InventoryProduct,
    'historyStdDev' | 'historyMean' | 'policy' | 'capacity' | 'storageType'
  >,
  params: InventoryPolicyParameters = product.policy,
): InventoryPolicyResult {
  const { safetyStock, targetSafetyStock } = safetyLevels(product, params)
  // 策略卡用所选 SKU 的历史日均需求作统一可比较的测算。
  const reorderPoint = product.historyMean * params.leadDays + safetyStock
  const targetStock =
    product.historyMean * (params.leadDays + params.reviewDays) + targetSafetyStock
  return {
    safetyStock: quantity(safetyStock),
    targetSafetyStock: quantity(targetSafetyStock),
    reorderPoint: quantity(reorderPoint),
    targetStock: quantity(targetStock),
    capacityRisk: targetStock > product.capacity,
    sharedCapacityPending: product.storageType === 'shared',
  }
}

function sumThrough(receipts: ReadonlyMap<string, number>, after: string, through: string) {
  let total = 0
  for (const [date, amount] of receipts) {
    if (date > after && date <= through) total += amount
  }
  return total
}

export function projectInventory(
  snapshot: InventorySnapshot,
  product: InventoryProduct,
  params: InventoryPolicyParameters = product.policy,
  overrides: Readonly<Record<string, number>> = {},
): InventoryProjectionDay[] {
  const confirmed = new Map<string, number>()
  for (const receipt of product.receipts) {
    if (receipt.confirmed) {
      confirmed.set(receipt.date, (confirmed.get(receipt.date) ?? 0) + receipt.quantity)
    }
  }
  const { safetyStock, targetSafetyStock } = safetyLevels(product, params)
  const sharedCapacityPending = product.storageType === 'shared'
  const inaccessibleStock = Math.max(0, product.physicalStock - product.availableStock)
  const otherOccupiedStock = sharedCapacityPending
    ? snapshot.products
        .filter(
          ({ code, storageGroup }) =>
            code !== product.code && storageGroup === product.storageGroup,
        )
        .reduce((sum, item) => sum + item.physicalStock, 0)
    : 0
  // 共享罐先扣同组其他成品当前实占，确认共享调度时还需复核同日变化。
  const availableCapacity = Math.max(0, product.capacity - otherOccupiedStock)
  const cutoff = snapshot.snapshotTime.slice(0, 10)
  const lockEnd = addDays(cutoff, snapshot.lockDays)
  const proposals = new Map<string, number>()
  const scenario = new Map<string, number>()
  let baseStock: number | null = product.availableStock
  let suggestedStock: number | null = product.availableStock
  let scenarioStock: number | null = product.availableStock
  let remainingSystemQuota = remainingMonthlyProduction(product)
  let remainingScenarioQuota = remainingSystemQuota

  return Array.from({ length: snapshot.days }, (_, index) => {
    const date = addDays(snapshot.startDate, index)
    const week = 1 + Math.floor(index / 7)
    const locked =
      index < snapshot.lockDays ||
      date <= lockEnd ||
      (product.confirmedPlanDates?.includes(date) ?? false)
    const demand = product.dailyDemand[date] ?? null
    const demandSource: InventoryProjectionDay['demandSource'] =
      demand === null
        ? null
        : product.explicitOrderDates.includes(date)
          ? '明确销售订单'
          : date.startsWith(snapshot.month)
            ? '月出货计划分摊'
            : '月计划日均估计'
    const confirmedReceipt = date < snapshot.openingDate ? null : (confirmed.get(date) ?? 0)
    const openingStock = date < snapshot.openingDate ? null : baseStock
    const state = {
      date,
      week,
      locked,
      demand,
      demandSource,
      openingStock,
      confirmedReceipt,
      safetyStock: quantity(safetyStock),
      sharedCapacityPending,
    }

    if (
      openingStock === null ||
      demand === null ||
      suggestedStock === null ||
      scenarioStock === null
    ) {
      if (date >= snapshot.openingDate) {
        baseStock = null
        suggestedStock = null
        scenarioStock = null
      }
      return {
        ...state,
        closingStock: null,
        scenarioClosingStock: null,
        safetyGap: null,
        shortage: null,
        scenarioShortage: null,
        suggestedAvailableDate: null,
        suggestedQuantity: locked ? 0 : null,
        plannedQuantity: locked ? 0 : null,
        reorderPoint: null,
        targetStock: null,
        inventoryPosition: null,
        rawSuggestion: null,
        replenishmentReason: locked ? '日期已锁定' : '需求或库存数据待补充',
        quotaRisk: false,
        plannedCapacityRisk: false,
        capacityRisk: false,
      }
    }

    const incoming = confirmedReceipt ?? 0
    const available = openingStock + incoming
    const suggestedAvailable = suggestedStock + incoming + (proposals.get(date) ?? 0)
    const scenarioAvailable = scenarioStock + incoming + (scenario.get(date) ?? 0)
    const shortage = quantity(Math.max(0, demand - available))
    const scenarioShortage = quantity(Math.max(0, demand - scenarioAvailable))
    baseStock = quantity(Math.max(0, available - demand))
    suggestedStock = quantity(Math.max(0, suggestedAvailable - demand))
    scenarioStock = quantity(Math.max(0, scenarioAvailable - demand))

    const dueDate = addDays(date, params.leadDays)
    const leadDemand = demandAfter(product, date, params.leadDays)
    const reviewDemand = demandAfter(product, date, params.leadDays + params.reviewDays)
    const reorder = leadDemand === null ? null : leadDemand + safetyStock
    const target = reviewDemand === null ? null : reviewDemand + targetSafetyStock
    const confirmedPipeline = sumThrough(confirmed, date, dueDate)
    const projectedStock = suggestedStock + confirmedPipeline + sumThrough(proposals, date, dueDate)
    const rawSuggestion =
      reorder !== null && target !== null
        ? projectedStock < reorder
          ? target - projectedStock
          : 0
        : null
    const availableSpace = Math.max(0, availableCapacity - inaccessibleStock - projectedStock)
    const withinMonth = date.startsWith(snapshot.month)
    const systemQuota = withinMonth ? remainingSystemQuota : null
    const scenarioQuota = withinMonth ? remainingScenarioQuota : null
    const feasible = rawSuggestion === null ? null : Math.min(rawSuggestion, availableSpace)
    const suggestedQuantity = locked
      ? 0
      : feasible === null
        ? null
        : quantity(Math.min(feasible, systemQuota ?? feasible))
    const scenarioDefault =
      suggestedQuantity === null
        ? null
        : quantity(Math.min(suggestedQuantity, scenarioQuota ?? suggestedQuantity))
    const plannedQuantity = locked ? 0 : (overrides[date] ?? scenarioDefault)
    const quotaRisk = scenarioQuota !== null && (plannedQuantity ?? 0) > scenarioQuota
    if (systemQuota !== null && suggestedQuantity) {
      remainingSystemQuota = quantity(Math.max(0, systemQuota - suggestedQuantity))
    }
    if (scenarioQuota !== null && plannedQuantity) {
      remainingScenarioQuota = quantity(Math.max(0, scenarioQuota - plannedQuantity))
    }
    if (suggestedQuantity) proposals.set(dueDate, (proposals.get(dueDate) ?? 0) + suggestedQuantity)
    if (plannedQuantity) scenario.set(dueDate, (scenario.get(dueDate) ?? 0) + plannedQuantity)
    const projectedScenario =
      scenarioStock + confirmedPipeline + sumThrough(scenario, date, dueDate)
    const plannedCapacityRisk =
      scenarioAvailable + inaccessibleStock > availableCapacity ||
      projectedScenario + inaccessibleStock > availableCapacity
    let replenishmentReason = '库存位置达到再订货点'
    if (locked) replenishmentReason = '日期已锁定'
    else if (rawSuggestion === null) replenishmentReason = '后续出货需求待补充'
    else if (
      quotaRisk ||
      (feasible !== null && systemQuota !== null && feasible > systemQuota) ||
      (suggestedQuantity !== null && scenarioQuota !== null && suggestedQuantity > scenarioQuota)
    ) {
      replenishmentReason = '受月度剩余额度限制'
    } else if (rawSuggestion > availableSpace || plannedCapacityRisk) {
      replenishmentReason = '受有效罐容限制'
    } else if (rawSuggestion > 0) replenishmentReason = '库存位置低于再订货点'

    return {
      ...state,
      closingStock: baseStock,
      scenarioClosingStock: scenarioStock,
      safetyGap: quantity(Math.max(0, safetyStock - baseStock)),
      shortage,
      scenarioShortage,
      suggestedAvailableDate: plannedQuantity ? dueDate : null,
      suggestedQuantity,
      plannedQuantity,
      reorderPoint: reorder === null ? null : quantity(reorder),
      targetStock: target === null ? null : quantity(target),
      inventoryPosition: quantity(projectedStock),
      rawSuggestion: rawSuggestion === null ? null : quantity(rawSuggestion),
      replenishmentReason,
      quotaRisk,
      plannedCapacityRisk,
      capacityRisk:
        (target !== null && target > availableCapacity) ||
        (!locked && rawSuggestion !== null && rawSuggestion > availableSpace) ||
        available + inaccessibleStock > availableCapacity ||
        plannedCapacityRisk,
    }
  })
}
