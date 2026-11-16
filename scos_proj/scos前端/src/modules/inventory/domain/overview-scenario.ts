import type { InventoryProjectionDay } from '../model/types'

export type InventoryStockStatus = 'adequate' | 'below-safety' | 'shortage' | 'unknown'

export function getScenarioStockStatus({
  isActual,
  scenarioClosingStock,
  safetyStock,
  scenarioShortage,
}: InventoryProjectionDay): InventoryStockStatus {
  if ((scenarioShortage ?? 0) > 0) return 'shortage'
  if (scenarioClosingStock !== null && safetyStock !== null && scenarioClosingStock < safetyStock) {
    return 'below-safety'
  }
  return scenarioClosingStock === null ||
    safetyStock === null ||
    (!isActual && scenarioShortage === null)
    ? 'unknown'
    : 'adequate'
}

export function listPlannedInventoryReplenishments(projection: readonly InventoryProjectionDay[]) {
  return projection.flatMap(({ date, locked, plannedQuantity, suggestedAvailableDate }) =>
    !locked && plannedQuantity !== null && plannedQuantity > 0 && suggestedAvailableDate
      ? [{ date, availableDate: suggestedAvailableDate, quantity: plannedQuantity }]
      : [],
  )
}
