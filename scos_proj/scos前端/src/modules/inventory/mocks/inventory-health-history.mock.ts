import type { InventoryHealthDay, InventoryHealthMonth } from '../domain/inventory-health'

const dailyOutbound = [420, 385, 405, 390, 415, 375, 410]

const septemberPlanStock = [
  480, 510, 460, 440, 520, 485, 450, 455, 448, 460, 420, 380, 260, 240, 210, 195, 185, 155, 148,
  152, 205, 530, 905, 1295, 1685, 1748, 1814, 1874, 2374, 2200,
]

// Three 300 t lots completed on Sep 26–28 are released by WMS together on Sep 29.
const septemberPendingBeforeRelease = [0, 0, 0, 0, 300, 600, 900, 0]

function makeHealthMonth(
  period: string,
  openingStock: number,
  planStockLevels: readonly number[],
): InventoryHealthMonth {
  let plannedOpening = openingStock
  let actualOpening = openingStock
  let plannedPending = 0
  let actualPending = 0
  const september = period === '2026-09'

  const days: InventoryHealthDay[] = planStockLevels.map((planClosing, index) => {
    const ordinal = index + 1
    const date = `${period}-${String(ordinal).padStart(2, '0')}`
    const plannedOutbound =
      september && ordinal === 29 ? 400 : dailyOutbound[index % dailyOutbound.length]!
    const plannedReceipt = planClosing - plannedOpening + plannedOutbound
    const regularPendingEnd = [0, 25, 35, 18][index % 4]!
    const plannedPendingEnd = september
      ? (septemberPendingBeforeRelease[ordinal - 22] ?? regularPendingEnd)
      : ordinal === planStockLevels.length
        ? 0
        : regularPendingEnd
    const plannedProduction = plannedReceipt + plannedPendingEnd - plannedPending
    const receiptDelta = september
      ? (({ 15: -45, 21: 45, 26: -20 } as Partial<Record<number, number>>)[ordinal] ?? 0)
      : (({ 8: -10, 9: 10 } as Partial<Record<number, number>>)[ordinal] ?? 0)
    const outboundDelta = september
      ? (({ 17: 30, 18: 24 } as Partial<Record<number, number>>)[ordinal] ?? 0)
      : (({ 4: 12, 14: -5 } as Partial<Record<number, number>>)[ordinal] ?? 0)
    const actualReceipt = plannedReceipt + receiptDelta
    const intendedOutbound = plannedOutbound + outboundDelta
    const actualOutbound = Math.min(actualOpening + actualReceipt, intendedOutbound)
    const actualClosing = actualOpening + actualReceipt - actualOutbound
    const actualPendingEnd =
      plannedPendingEnd + (september && ordinal >= 15 && ordinal <= 20 ? 45 : 0)
    const actualProduction = actualReceipt + actualPendingEnd - actualPending

    plannedOpening = planClosing
    actualOpening = actualClosing
    plannedPending = plannedPendingEnd
    actualPending = actualPendingEnd

    return {
      date,
      safetyStock: 166.477,
      stockoutQty: intendedOutbound - actualOutbound,
      planned: {
        production: plannedProduction,
        availableReceipt: plannedReceipt,
        outbound: plannedOutbound,
        closingStock: planClosing,
      },
      actual: {
        production: september && ordinal === 7 ? null : actualProduction,
        availableReceipt: actualReceipt,
        outbound: actualOutbound,
        closingStock: actualClosing,
      },
    }
  })

  const monthCode = period.replace('-', '')
  return {
    plant: '中粮太仓工厂',
    period,
    productCode: 'FG-F55',
    planVersion: `MP-${monthCode}-V1`,
    strategyVersion: `STGY-${monthCode}-V1`,
    source: '月度计划快照、MES 车间完工、WMS 可用入库和出库及库存日结（演示）',
    days,
  }
}

// Closed months against their own published plan. Plant output and released receipts
// have independent timings, and a missing MES return stays blank in the report.
export const inventoryHealthHistoryMock: readonly InventoryHealthMonth[] = [
  makeHealthMonth('2026-09', 440, septemberPlanStock),
  makeHealthMonth('2026-08', 780, [
    ...Array.from({ length: 29 }, (_, index) => 790 + (index % 6) * 22),
    660,
    447,
  ]),
]
