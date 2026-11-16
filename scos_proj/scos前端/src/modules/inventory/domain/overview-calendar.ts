import type { InventoryDailyExecution, InventoryProjectionDay } from '../model/types'
import {
  getScenarioStockStatus,
  listPlannedInventoryReplenishments,
  type InventoryStockStatus,
} from './overview-scenario'

export interface InventoryCalendarDay {
  date: string
  availableStock: number | null
  productionDemand: number | null
  productionOutput: number | null
  isActual?: boolean
  status: InventoryStockStatus
}

export type DisplayCalendarDay = InventoryCalendarDay | { date: string; status: 'unavailable' }

export function addCalendarMonths(date: string, months: number): string {
  const shifted = new Date(`${date}T00:00:00Z`)
  const dayOfMonth = shifted.getUTCDate()
  shifted.setUTCDate(1)
  shifted.setUTCMonth(shifted.getUTCMonth() + months)
  const monthEnd = new Date(shifted)
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0)
  shifted.setUTCDate(Math.min(dayOfMonth, monthEnd.getUTCDate()))
  return shifted.toISOString().slice(0, 10)
}

const daysPerWeek = 7
const daysPerPage = daysPerWeek * 4
const millisecondsPerDay = 86_400_000

function formatCalendarDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

export function buildCalendarWindow(
  start: string,
  end: string,
  page: number,
  days: readonly InventoryCalendarDay[],
) {
  const startDate = new Date(`${start}T00:00:00Z`)
  const startTime = startDate.getTime()
  const endTime = Date.parse(`${end}T00:00:00Z`)
  const daysSinceSaturday = (startDate.getUTCDay() + 1) % daysPerWeek
  const firstSaturday = startTime - daysSinceSaturday * millisecondsPerDay
  const pageDuration = daysPerPage * millisecondsPerDay
  const lastPage = Math.floor((endTime - firstSaturday) / pageDuration)
  const pageStart = firstSaturday + Math.min(page, lastPage) * pageDuration
  const firstTime = Math.max(startTime, pageStart)
  const lastTime = Math.min(endTime, pageStart + (daysPerPage - 1) * millisecondsPerDay)
  const knownDays = new Map(days.map((day) => [day.date, day]))
  const visibleDays = (lastTime - firstTime) / millisecondsPerDay + 1
  const calendarDays: DisplayCalendarDay[] = Array.from({ length: visibleDays }, (_, index) => {
    const date = formatCalendarDate(firstTime + index * millisecondsPerDay)
    return knownDays.get(date) ?? { date, status: 'unavailable' }
  })

  return {
    firstDate: formatCalendarDate(firstTime),
    lastDate: formatCalendarDate(lastTime),
    days: calendarDays,
    lastPage,
    offset: (firstTime - pageStart) / millisecondsPerDay,
  }
}

export function buildInventoryCalendar(
  projection: readonly InventoryProjectionDay[],
  execution: readonly InventoryDailyExecution[] = [],
): InventoryCalendarDay[] {
  const actualByDate = new Map(execution.map(({ date, actual }) => [date, actual]))
  const plannedOutputByDate = new Map<string, number>()
  for (const { availableDate, quantity } of listPlannedInventoryReplenishments(projection)) {
    plannedOutputByDate.set(availableDate, (plannedOutputByDate.get(availableDate) ?? 0) + quantity)
  }

  return projection.map((day) => ({
    date: day.date,
    availableStock: day.scenarioClosingStock,
    isActual: day.isActual,
    productionDemand: day.isActual
      ? (actualByDate.get(day.date)?.production ?? null)
      : day.plannedQuantity,
    productionOutput:
      day.isActual || day.confirmedReceipt === null
        ? day.confirmedReceipt
        : day.confirmedReceipt + (plannedOutputByDate.get(day.date) ?? 0),
    status: getScenarioStockStatus(day),
  }))
}
