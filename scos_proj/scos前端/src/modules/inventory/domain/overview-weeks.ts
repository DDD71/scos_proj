import type { InventoryProjectionDay } from '../model/types'
import {
  getScenarioStockStatus,
  listPlannedInventoryReplenishments,
  type InventoryStockStatus,
} from './overview-scenario'

export interface InventoryWeekSummary {
  week: number
  firstDate: string
  lastDate: string
  demand: number | null
  confirmedReceipt: number | null
  replenishmentReceipt: number
  stockChange: number | null
  closingStock: number | null
  safetyStock: number | null
  minimumStock: number | null
  stockStatus: InventoryStockStatus
}

function addKnownQuantity(total: number | null, quantity: number | null) {
  return total === null || quantity === null ? null : total + quantity
}

function roundQuantity(quantity: number): number
function roundQuantity(quantity: number | null): number | null
function roundQuantity(quantity: number | null) {
  return quantity === null ? null : Number(quantity.toFixed(3))
}

const stockStatusPriority: Record<InventoryStockStatus, number> = {
  adequate: 0,
  unknown: 1,
  'below-safety': 2,
  shortage: 3,
}

export function summarizeInventoryWeeks(
  projection: readonly InventoryProjectionDay[],
): InventoryWeekSummary[] {
  const replenishmentByDate = new Map<string, number>()
  for (const { availableDate, quantity } of listPlannedInventoryReplenishments(projection)) {
    replenishmentByDate.set(availableDate, (replenishmentByDate.get(availableDate) ?? 0) + quantity)
  }

  const weeks: InventoryWeekSummary[] = []
  let previousDay: InventoryProjectionDay | undefined
  let weekOpeningStock: number | null = null
  for (const day of projection) {
    let week = weeks.at(-1)
    if (!week || week.week !== day.week) {
      weekOpeningStock = previousDay ? previousDay.scenarioClosingStock : day.openingStock
      week = {
        week: day.week,
        firstDate: day.date,
        lastDate: day.date,
        demand: 0,
        confirmedReceipt: 0,
        replenishmentReceipt: 0,
        stockChange: null,
        closingStock: null,
        safetyStock: null,
        minimumStock: day.scenarioClosingStock,
        stockStatus: 'adequate',
      }
      weeks.push(week)
    }

    week.lastDate = day.date
    week.demand = addKnownQuantity(week.demand, day.demand)
    week.confirmedReceipt = addKnownQuantity(week.confirmedReceipt, day.confirmedReceipt)
    week.replenishmentReceipt += replenishmentByDate.get(day.date) ?? 0
    week.closingStock = day.scenarioClosingStock
    week.safetyStock = day.safetyStock
    week.minimumStock =
      week.minimumStock === null || day.scenarioClosingStock === null
        ? null
        : Math.min(week.minimumStock, day.scenarioClosingStock)
    const dayStatus = getScenarioStockStatus(day)
    if (stockStatusPriority[dayStatus] > stockStatusPriority[week.stockStatus]) {
      week.stockStatus = dayStatus
    }
    week.stockChange =
      weekOpeningStock === null || day.scenarioClosingStock === null
        ? null
        : day.scenarioClosingStock - weekOpeningStock
    previousDay = day
  }

  return weeks.map((week) => ({
    ...week,
    demand: roundQuantity(week.demand),
    confirmedReceipt: roundQuantity(week.confirmedReceipt),
    replenishmentReceipt: roundQuantity(week.replenishmentReceipt),
    stockChange: roundQuantity(week.stockChange),
  }))
}
