import type {
  InventoryDailyAmounts,
  InventoryProduct,
  InventoryProjectionDay,
  InventorySnapshot,
} from '../model/types'
import { projectInventory } from './inventory'
import { buildInventoryPlanDetails } from './inventory-plan-details'

function difference(actual: number | null, plan: number | null) {
  return actual === null || plan === null ? null : Number((actual - plan).toFixed(3))
}

function inventoryVariance(actual: InventoryDailyAmounts | null, plan: InventoryDailyAmounts) {
  return {
    production: difference(actual?.production ?? null, plan.production),
    outbound: difference(actual?.outbound ?? null, plan.outbound),
    availableReceipt: difference(actual?.availableReceipt ?? null, plan.availableReceipt),
    closingStock: difference(actual?.closingStock ?? null, plan.closingStock),
  }
}

function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

function actualStockAnchor(product: InventoryProduct) {
  const records = product.dailyExecution ?? []
  return records.reduce<{ date: string; closingStock: number } | null>((last, record) => {
    const closingStock = record.actual?.closingStock
    return closingStock != null && (!last || record.date > last.date)
      ? { date: record.date, closingStock }
      : last
  }, null)
}

export function buildInventoryDailyMonitoring(
  snapshot: InventorySnapshot,
  product: InventoryProduct,
  overrides: Readonly<Record<string, number>> = {},
) {
  const baseline = projectInventory(snapshot, product, product.policy)
  const recorded = new Map(product.dailyExecution?.map((row) => [row.date, row]))
  const days = buildInventoryPlanDetails(baseline, product, snapshot.snapshotTime).map((row) => {
    const executed = recorded.get(row.date)
    const planned = executed?.planned ?? {
      production: row.workshopOutput,
      outbound: row.demand,
      availableReceipt: row.warehouseReceipt,
      closingStock: row.closingStock,
    }
    const actual = executed?.actual ?? null
    return { date: row.date, planned, actual, variance: inventoryVariance(actual, planned) }
  })

  const latestObservedStock = actualStockAnchor(product)
  const anchor =
    latestObservedStock && latestObservedStock.date >= snapshot.openingDate
      ? latestObservedStock
      : null
  if (!anchor) {
    const projection = Object.keys(overrides).length
      ? projectInventory(snapshot, product, product.policy, overrides)
      : baseline
    return { baseline, projection, days, anchor }
  }

  // Start on the date after the WMS close so same-day inbounds are already represented in that stock.
  const openingDate = shiftDate(anchor.date, 1)
  const rolledSnapshot = { ...snapshot, openingDate }
  const rollingProduct = (closingStock: number) => ({
    ...product,
    availableStock: closingStock,
    physicalStock: closingStock + Math.max(0, product.physicalStock - product.availableStock),
  })
  const rolled = projectInventory(
    rolledSnapshot,
    rollingProduct(anchor.closingStock),
    product.policy,
    overrides,
  )
  const originalClose = recorded.get(anchor.date)?.planned.closingStock
  const originalForecast =
    originalClose == null
      ? baseline
      : projectInventory(rolledSnapshot, rollingProduct(originalClose))
  const originalPlan = baseline.map((row, index) => ({
    ...row,
    closingStock:
      row.date > anchor.date
        ? originalForecast[index]!.closingStock
        : (recorded.get(row.date)?.planned.closingStock ?? row.closingStock),
  }))
  const projection = baseline.map((row, index): InventoryProjectionDay => {
    if (row.date > anchor.date) return rolled[index]!
    const actual = recorded.get(row.date)?.actual
    const measured = actual?.closingStock ?? null
    return {
      ...row,
      isActual: measured !== null,
      openingStock: recorded.get(shiftDate(row.date, -1))?.actual?.closingStock ?? row.openingStock,
      demand: actual?.outbound ?? row.demand,
      confirmedReceipt: actual?.availableReceipt ?? row.confirmedReceipt,
      closingStock: measured ?? row.closingStock,
      scenarioClosingStock: measured ?? row.scenarioClosingStock,
      safetyGap:
        measured !== null && row.safetyStock !== null
          ? Number(Math.max(0, row.safetyStock - measured).toFixed(3))
          : row.safetyGap,
      shortage: measured === null ? row.shortage : null,
      scenarioShortage: measured === null ? row.scenarioShortage : null,
      locked: true,
      suggestedQuantity: 0,
      suggestedAvailableDate: null,
      plannedQuantity: 0,
      quotaRisk: measured === null && row.quotaRisk,
      plannedCapacityRisk: measured === null && row.plannedCapacityRisk,
      replenishmentReason: measured === null ? '历史日期' : '已按实际期末库存滚动',
    }
  })
  return { baseline: originalPlan, projection, days, anchor }
}
