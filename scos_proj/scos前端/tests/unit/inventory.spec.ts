import { describe, expect, it } from 'vitest'
import { projectInventory } from '../../src/modules/inventory/domain/inventory'
import { buildInventoryDailyMonitoring } from '../../src/modules/inventory/domain/inventory-daily-monitoring'
import { buildInventoryPlanDetails } from '../../src/modules/inventory/domain/inventory-plan-details'
import {
  addCalendarMonths,
  buildCalendarWindow,
  buildInventoryCalendar,
} from '../../src/modules/inventory/domain/overview-calendar'
import { summarizeInventoryWeeks } from '../../src/modules/inventory/domain/overview-weeks'
import { getMockInventorySnapshot } from '../../src/modules/inventory/mocks/inventory-snapshot.mock'
import type { InventoryProjectionDay } from '../../src/modules/inventory/model/types'

function fructoseSnapshot() {
  const snapshot = getMockInventorySnapshot()
  const product = snapshot.products.find(({ code }) => code === 'FG-F55')!
  return { snapshot, product }
}

describe('成品补货计划', () => {
  it('系统补充量不超过月度剩余额度，超额人工试算会显示风险', () => {
    const { snapshot, product } = fructoseSnapshot()
    product.monthlyProduction = { quota: 1050, completed: 0, scheduled: 750 }

    const rows = projectInventory(snapshot, product)
    expect(rows.reduce((total, row) => total + (row.suggestedQuantity ?? 0), 0)).toBe(300)

    const adjusted = projectInventory(snapshot, product, product.policy, { '2026-10-06': 350 })
    expect(adjusted.find(({ date }) => date === '2026-10-06')).toMatchObject({
      plannedQuantity: 350,
      quotaRisk: true,
      replenishmentReason: '受月度剩余额度限制',
    })
  })

  it('已承接批次保护原补充日期，按预计可销售日计入基准库存', () => {
    const { snapshot, product } = fructoseSnapshot()
    product.confirmedPlanDates = ['2026-10-13']
    product.receipts.push({ date: '2026-10-16', quantity: 50, confirmed: true })

    const rows = projectInventory(snapshot, product, product.policy, { '2026-10-13': 350 })
    expect(rows.find(({ date }) => date === '2026-10-13')).toMatchObject({
      locked: true,
      plannedQuantity: 0,
      confirmedReceipt: 0,
    })
    expect(rows.find(({ date }) => date === '2026-10-16')).toMatchObject({ confirmedReceipt: 50 })
  })

  it('跨日转运按车间完工日和入库日分别归集，按实际交接和入库时间标记状态', () => {
    const { snapshot, product } = fructoseSnapshot()
    const rows = projectInventory(snapshot, product)
    const details = buildInventoryPlanDetails(rows, product, snapshot.snapshotTime)

    expect(details.find(({ date }) => date === '2026-09-28')).toMatchObject({
      workshopOutput: 770,
      confirmedReceipt: null,
    })
    expect(details.find(({ date }) => date === '2026-09-29')).toMatchObject({
      workshopOutput: 0,
      warehouseReceipt: 900,
      confirmedReceipt: 900,
      productionTransfers: Array.from({ length: 3 }, () => ({ status: '在途', quantity: 300 })),
    })
    expect(details.find(({ date }) => date === '2026-10-15')).toMatchObject({
      workshopOutput: 350,
      confirmedReceipt: 350,
      productionTransfers: [{ status: '计划入库', quantity: 350 }],
    })

    const updatedDetails = buildInventoryPlanDetails(rows, product, '2026-09-29T02:00:00+08:00')
    expect(updatedDetails.find(({ date }) => date === '2026-09-29')).toMatchObject({
      warehouseReceipt: 900,
      productionTransfers: Array.from({ length: 3 }, () => ({ status: '已入库', quantity: 300 })),
    })
  })
})

describe('周库存水位', () => {
  it('按周内每日安全库存和出货缺口判断等级，保留周末可用库存', () => {
    const { snapshot, product } = fructoseSnapshot()
    const days = projectInventory(snapshot, product)
      .filter(({ week }) => week === 2)
      .map((day) => ({
        ...day,
        scenarioClosingStock: 100,
        safetyStock: 100,
        scenarioShortage: 0,
      }))
    const weekWith = (...changes: Partial<InventoryProjectionDay>[]) =>
      summarizeInventoryWeeks(days.map((day, index) => ({ ...day, ...changes[index] })))[0]

    expect(weekWith()).toMatchObject({
      closingStock: 100,
      safetyStock: 100,
      minimumStock: 100,
      stockStatus: 'adequate',
    })
    expect(weekWith({ scenarioClosingStock: 99 })).toMatchObject({
      closingStock: 100,
      minimumStock: 99,
      stockStatus: 'below-safety',
    })
    expect(
      weekWith({ scenarioClosingStock: 99 }, { scenarioClosingStock: 0, scenarioShortage: 1 }),
    ).toMatchObject({
      closingStock: 100,
      minimumStock: 0,
      stockStatus: 'shortage',
    })
    expect(weekWith({ scenarioClosingStock: null, scenarioShortage: null })).toMatchObject({
      minimumStock: null,
      stockStatus: 'unknown',
    })
  })
})

describe('日度库存日历', () => {
  it('日历分别归集实际完工、实际可用入库和未来补充计划', () => {
    const { snapshot, product } = fructoseSnapshot()
    const monitoring = buildInventoryDailyMonitoring(snapshot, product, { '2026-10-13': 400 })
    const days = buildInventoryCalendar(monitoring.projection, monitoring.days)
    const day = (date: string) => days.find((item) => item.date === date)

    expect(day('2026-09-29')).toMatchObject({
      isActual: true,
      productionDemand: 0,
      productionOutput: 900,
      status: 'adequate',
    })
    expect(day('2026-10-12')).toMatchObject({
      isActual: true,
      availableStock: 460,
      productionDemand: 80,
      productionOutput: 80,
    })
    expect(day('2026-10-13')).toMatchObject({ productionDemand: 400, productionOutput: 0 })
    expect(day('2026-10-14')?.status).toBe('shortage')
    expect(day('2026-10-15')?.productionOutput).toBe(350)
    expect(day('2026-10-16')?.productionOutput).toBe(400)
  })

  it('按四周跨月展示长区间，超出预测数据的日期保留为暂无预测', () => {
    const { snapshot, product } = fructoseSnapshot()
    const days = buildInventoryCalendar(projectInventory(snapshot, product))

    expect(addCalendarMonths('2027-12-31', 2)).toBe('2028-02-29')
    const first = buildCalendarWindow('2026-09-29', '2026-11-29', 0, days)
    expect(first).toMatchObject({
      firstDate: '2026-09-29',
      lastDate: '2026-10-23',
      lastPage: 2,
      offset: 3,
    })
    expect(first.days).toHaveLength(25)
    expect(first.days.at(-1)).toHaveProperty('availableStock')

    const next = buildCalendarWindow('2026-09-29', '2026-11-29', 1, days)
    expect(next).toMatchObject({ firstDate: '2026-10-24', lastDate: '2026-11-20', offset: 0 })
    expect(next.days).toHaveLength(28)
    expect(next.days[0]).toEqual({ date: '2026-10-24', status: 'unavailable' })

    const last = buildCalendarWindow('2026-11-20', '2027-02-05', 2, days)
    expect(last).toMatchObject({ firstDate: '2027-01-09', lastDate: '2027-02-05', lastPage: 2 })
    expect(last.days).toHaveLength(28)
  })
})
