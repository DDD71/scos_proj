import { describe, expect, it } from 'vitest'
import { buildInventoryDailyMonitoring } from '../../src/modules/inventory/domain/inventory-daily-monitoring'
import { getMockInventorySnapshot } from '../../src/modules/inventory/mocks/inventory-snapshot.mock'

describe('日度库存滚动监控', () => {
  it('按日结记录衔接 9 月末和 10 月初的实际可用库存', () => {
    const snapshot = getMockInventorySnapshot()
    const product = snapshot.products[0]!
    const [opening, ...execution] = product.dailyExecution!

    expect(opening?.date).toBe('2026-09-25')
    expect(execution[0]?.date).toBe('2026-09-26')
    expect(execution.at(-1)?.date).toBe('2026-10-12')
    const receipts = product.receipts.filter(({ production }) => production?.receivedAt)
    let previous = opening!.actual!
    for (const { date, actual } of execution) {
      expect(actual!.closingStock, `${date} 实际期末可用库存`).toBe(
        previous.closingStock! + actual!.availableReceipt! - actual!.outbound!,
      )
      expect(actual!.availableReceipt).toBe(
        receipts.filter((lot) => lot.date === date).reduce((total, lot) => total + lot.quantity, 0),
      )
      expect(actual!.production).toBe(
        receipts
          .filter((lot) => lot.production!.workshopAt.startsWith(date))
          .reduce((total, lot) => total + lot.quantity, 0),
      )
      previous = actual!
    }
    expect(execution.find(({ date }) => date === '2026-09-28')?.actual?.closingStock).toBe(
      product.availableStock,
    )
    expect(execution.find(({ date }) => date === '2026-09-30')?.actual).toMatchObject({
      production: 236,
      availableReceipt: 211,
      closingStock: 2126,
    })
    expect(execution.find(({ date }) => date === '2026-10-01')?.actual).toMatchObject({
      production: 0,
      availableReceipt: 25,
    })
    expect(execution.find(({ date }) => date === '2026-10-11')?.actual?.closingStock).toBe(600)
    const monthlyDemand = Object.entries(product.dailyDemand)
      .filter(([date]) => date.startsWith(snapshot.month))
      .map(([, quantity]) => quantity)
    expect(monthlyDemand).toHaveLength(31)
    expect(monthlyDemand.reduce((total, quantity) => total + quantity, 0)).toBeCloseTo(12_000)
    expect(product.monthlyProduction).toEqual({ quota: 9800, completed: 2949, scheduled: 350 })
  })

  it('保留同日已下达计划，并区分产出、出货、可用入库和库存偏差', () => {
    const snapshot = getMockInventorySnapshot()
    const report = buildInventoryDailyMonitoring(snapshot, snapshot.products[0]!)
    const day = report.days.find(({ date }) => date === '2026-10-12')

    expect(day).toMatchObject({
      planned: { production: 100, outbound: 200, availableReceipt: 100, closingStock: 500 },
      actual: { production: 80, outbound: 220, availableReceipt: 80, closingStock: 460 },
      variance: { production: -20, outbound: 20, availableReceipt: -20, closingStock: -40 },
    })
    expect(report.days.find(({ date }) => date === '2026-10-13')).toMatchObject({
      actual: null,
      variance: { production: null, outbound: null, availableReceipt: null, closingStock: null },
    })
    expect(report.projection.find(({ date }) => date === '2026-10-14')?.shortage).toBe(94.666)
    expect(report.projection.find(({ date }) => date === '2026-10-15')?.confirmedReceipt).toBe(350)
  })

  it('从实际期末余额滚动，既不重复计算当天入库也保留后续已确认批次', () => {
    const snapshot = getMockInventorySnapshot()
    const product = snapshot.products[0]!
    product.receipts.push({ date: '2026-10-13', quantity: 190, confirmed: true })
    const report = buildInventoryDailyMonitoring(snapshot, product, { '2026-10-12': 300 })

    expect(report.anchor).toEqual({ date: '2026-10-12', closingStock: 460 })
    expect(report.projection.find(({ date }) => date === '2026-10-12')).toMatchObject({
      openingStock: 600,
      demand: 220,
      confirmedReceipt: 80,
      closingStock: 460,
      scenarioClosingStock: 460,
      locked: true,
      plannedQuantity: 0,
    })
    expect(report.projection.find(({ date }) => date === '2026-10-13')).toMatchObject({
      openingStock: 460,
      closingStock: 372.667,
      confirmedReceipt: 190,
    })
    expect(report.baseline.find(({ date }) => date === '2026-10-13')?.closingStock).toBe(412.667)
  })

  it('较晚的部分实绩可以用于偏差对照，但只有库存实绩可以更换滚动起点', () => {
    const snapshot = getMockInventorySnapshot()
    const product = snapshot.products[0]!
    product.dailyExecution!.push({
      date: '2026-10-13',
      planned: { production: 100, outbound: 100, availableReceipt: 100, closingStock: 460 },
      actual: { production: 90, outbound: 0, availableReceipt: null, closingStock: null },
    })
    const report = buildInventoryDailyMonitoring(snapshot, product)

    expect(report.anchor).toEqual({ date: '2026-10-12', closingStock: 460 })
    expect(report.days.find(({ date }) => date === '2026-10-13')?.variance).toEqual({
      production: -10,
      outbound: -100,
      availableReceipt: null,
      closingStock: null,
    })
  })
})
