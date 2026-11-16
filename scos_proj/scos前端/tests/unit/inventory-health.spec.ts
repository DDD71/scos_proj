import { describe, expect, it } from 'vitest'
import { buildInventoryHealthReport } from '../../src/modules/inventory/domain/inventory-health'
import { inventoryHealthHistoryMock } from '../../src/modules/inventory/mocks/inventory-health-history.mock'

const [september, august] = inventoryHealthHistoryMock

describe('库存健康度月度复盘', () => {
  it('按可比日期计算累计偏差，并以月末当天的期末库存比较库存偏差', () => {
    const report = buildInventoryHealthReport(september!)
    expect(report.reportedDays).toBe(29)
    expect(report.days).toHaveLength(30)
    expect(report.days.find(({ date }) => date === '2026-09-07')?.variance.production).toBeNull()
    expect(report.metrics.find(({ key }) => key === 'production')).toMatchObject({
      planned: 13_385,
      actual: 13_365,
      variance: -20,
      comparedDays: 29,
    })
    expect(report.metrics.find(({ key }) => key === 'closingStock')).toMatchObject({
      basis: 'monthEnd',
      planned: 2200,
      actual: 2126,
      variance: -74,
    })
    expect(report.recommendation).toMatchObject({
      status: 'review',
      dates: ['2026-09-18', '2026-09-19', '2026-09-20'],
    })
    expect(report.verdict).toMatchObject({
      level: 'yellow',
      strategyEffectiveness: 'improve',
      actualLowDays: 7,
      plannedLowDays: 3,
      missingRiskDates: [],
    })
    expect(report.trackingTasks).toContainEqual(
      expect.objectContaining({ target: 'strategy', dates: report.recommendation.dates }),
    )
  })

  it('区分执行偏差和原计划库存不足', () => {
    const report = buildInventoryHealthReport({
      ...august!,
      days: august!.days.map((day) =>
        day.date === '2026-08-02' ? { ...day, stockoutQty: 12 } : day,
      ),
    })
    expect(report.recommendation).toMatchObject({
      status: 'keep',
      title: '优先核查执行偏差',
      dates: ['2026-08-02'],
    })
    expect(report.verdict).toMatchObject({
      level: 'red',
      strategyEffectiveness: 'attention',
      stockoutDays: 1,
      evidenceDates: ['2026-08-02'],
    })
    expect(report.trackingTasks).toEqual([
      expect.objectContaining({ target: 'daily', dates: ['2026-08-02'] }),
    ])
  })

  it('缺少缺货回传或月末库存时保留未知状态', () => {
    const priorMonth = august!
    const report = buildInventoryHealthReport({
      ...priorMonth,
      days: priorMonth.days.map((day) =>
        day.date === '2026-08-31' ? { ...day, stockoutQty: null, actual: null } : day,
      ),
    })
    expect(report.recommendation).toMatchObject({
      status: 'insufficient',
      dates: ['2026-08-31'],
    })
    expect(report.verdict).toMatchObject({
      level: 'insufficient',
      strategyEffectiveness: 'insufficient',
      missingRiskDates: ['2026-08-31'],
    })
    expect(report.metrics.find(({ key }) => key === 'closingStock')).toMatchObject({
      planned: 447,
      actual: null,
      variance: null,
    })
    expect(report.alerts).toEqual([
      expect.objectContaining({ title: '实绩数据待补齐', dates: ['2026-08-31'] }),
    ])
  })

  it('区分完整执行回传和完整风险评估', () => {
    expect(buildInventoryHealthReport(august!).verdict).toMatchObject({
      level: 'green',
      strategyEffectiveness: 'effective',
    })

    const report = buildInventoryHealthReport({
      ...august!,
      days: august!.days.map((day) => {
        if (day.date === '2026-08-01') return { ...day, safetyStock: null }
        if (day.date === '2026-08-02')
          return { ...day, planned: { ...day.planned, closingStock: null } }
        return day
      }),
    })
    expect(report.reportedDays).toBe(31)
    expect(report.verdict).toMatchObject({
      level: 'insufficient',
      strategyEffectiveness: 'insufficient',
      missingRiskDates: ['2026-08-01', '2026-08-02'],
    })
  })

  it('数据不全时仍显示已证实的缺货', () => {
    const report = buildInventoryHealthReport({
      ...august!,
      days: august!.days.map((day) => {
        if (day.date === '2026-08-01') return { ...day, safetyStock: null }
        if (day.date === '2026-08-02') return { ...day, stockoutQty: 12 }
        return day
      }),
    })
    expect(report.verdict).toMatchObject({
      level: 'red',
      strategyEffectiveness: 'insufficient',
      stockoutDays: 1,
      missingRiskDates: ['2026-08-01'],
      evidenceDates: ['2026-08-01', '2026-08-02'],
    })
  })
})
