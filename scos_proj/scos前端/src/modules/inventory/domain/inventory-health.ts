import type { InventoryDailyAmounts, InventoryDailyExecution } from '../model/types'

export interface InventoryHealthDay extends InventoryDailyExecution {
  safetyStock: number | null
  stockoutQty: number | null
}

export interface InventoryHealthMonth {
  plant: string
  period: string
  productCode: string
  planVersion: string
  strategyVersion: string
  source: string
  days: readonly InventoryHealthDay[]
}

type InventoryHealthMetricKey = keyof InventoryDailyAmounts

export interface InventoryHealthMetric {
  key: InventoryHealthMetricKey
  basis: 'sum' | 'monthEnd'
  planned: number | null
  actual: number | null
  variance: number | null
  comparedDays: number
}

export interface InventoryHealthAlert {
  id: string
  title: string
  detail: string
  dates: string[]
  level: 'warning' | 'danger'
}

interface InventoryHealthRecommendation {
  status: 'review' | 'keep' | 'insufficient'
  title: string
  detail: string
  dates: string[]
  reason: string
}

export interface InventoryHealthTask {
  id: string
  title: string
  detail: string
  dates: string[]
  target: 'strategy' | 'daily'
}

export interface InventoryHealthVerdict {
  level: 'green' | 'yellow' | 'red' | 'insufficient'
  strategyEffectiveness: 'effective' | 'attention' | 'improve' | 'insufficient'
  healthReason: string
  strategyReason: string
  evidenceDates: string[]
  missingRiskDates: string[]
  stockoutDays: number
  actualLowDays: number
  plannedLowDays: number
}

export interface InventoryHealthReport extends Omit<InventoryHealthMonth, 'days'> {
  days: (InventoryHealthDay & { variance: InventoryDailyAmounts })[]
  metrics: InventoryHealthMetric[]
  reportedDays: number
  totalDays: number
  alerts: InventoryHealthAlert[]
  recommendation: InventoryHealthRecommendation
  trackingTasks: InventoryHealthTask[]
  verdict: InventoryHealthVerdict
}

const emptyAmounts: InventoryDailyAmounts = {
  production: null,
  availableReceipt: null,
  outbound: null,
  closingStock: null,
}
const metricKeys = ['production', 'availableReceipt', 'outbound', 'closingStock'] as const
const quantityFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 })

function variance(planned: number | null, actual: number | null) {
  return planned === null || actual === null ? null : Number((actual - planned).toFixed(3))
}

function monthCalendar(period: string) {
  const end = new Date(`${period}-01T00:00:00Z`)
  end.setUTCMonth(end.getUTCMonth() + 1, 0)
  return Array.from(
    { length: end.getUTCDate() },
    (_, index) => `${period}-${String(index + 1).padStart(2, '0')}`,
  )
}

function total(values: number[]) {
  return values.length ? Number(values.reduce((sum, value) => sum + value, 0).toFixed(3)) : null
}

function summarizeMetric(
  key: InventoryHealthMetricKey,
  days: InventoryHealthDay[],
): InventoryHealthMetric {
  if (key === 'closingStock') {
    const last = days.at(-1)
    const planned = last?.planned.closingStock ?? null
    const actual = last?.actual?.closingStock ?? null
    const delta = variance(planned, actual)
    return {
      key,
      basis: 'monthEnd',
      planned,
      actual,
      variance: delta,
      comparedDays: delta === null ? 0 : 1,
    }
  }

  const paired = days.flatMap((day) => {
    const planned = day.planned[key]
    const actual = day.actual?.[key]
    return planned === null || actual == null ? [] : [{ planned, actual }]
  })
  const planned = paired.length
    ? total(paired.map((day) => day.planned))
    : days.every((day) => day.planned[key] !== null)
      ? total(days.map((day) => day.planned[key]!))
      : null
  const actual = total(paired.map((day) => day.actual))
  return {
    key,
    basis: 'sum',
    planned,
    actual,
    variance: variance(planned, actual),
    comparedDays: paired.length,
  }
}

function belowSafety(balance: number | null | undefined, safetyStock: number | null) {
  return balance != null && safetyStock !== null && balance < safetyStock
}

function summarizeFindings(month: InventoryHealthMonth, days: InventoryHealthDay[]) {
  const alerts: InventoryHealthAlert[] = []
  const trackingTasks: InventoryHealthTask[] = []
  const shortfalls = days.filter((day) => (day.stockoutQty ?? 0) > 0)
  const actualLow = days.filter((day) => belowSafety(day.actual?.closingStock, day.safetyStock))
  const planLow = days.filter((day) => belowSafety(day.planned.closingStock, day.safetyStock))
  const missing = days.filter(
    (day) => day.stockoutQty === null || metricKeys.some((key) => day.actual?.[key] == null),
  )
  const incompleteRiskData = days.filter(
    (day) =>
      day.actual?.closingStock == null ||
      day.planned.closingStock === null ||
      day.safetyStock === null ||
      day.stockoutQty === null,
  )
  const evidenceKey = `${month.plant}/${month.productCode}/${month.period}`

  function addFinding(
    code: string,
    level: InventoryHealthAlert['level'],
    title: string,
    detail: string,
    evidence: InventoryHealthDay[],
    taskTitle: string,
    target: InventoryHealthTask['target'],
  ) {
    if (!evidence.length) return
    const id = `${evidenceKey}/${code}`
    const dates = evidence.map((day) => day.date)
    alerts.push({ id, title, detail, dates, level })
    trackingTasks.push({ id, title: taskTitle, detail, dates, target })
  }

  addFinding(
    'stockout',
    'danger',
    '实际发生缺货',
    `已回传缺货 ${quantityFormat.format(total(shortfalls.map((day) => day.stockoutQty!)) ?? 0)} 吨。核查订单履约和补充计划执行。`,
    shortfalls,
    '核查缺货与补充计划执行',
    'daily',
  )
  addFinding(
    'actual-safety',
    'warning',
    '实际期末库存低于安全库存',
    `有 ${actualLow.length} 天的实际期末库存低于当日安全库存。按日期核对可用入库、出货及库存偏差。`,
    actualLow,
    '跟踪低库存日的入库和出货偏差',
    'daily',
  )

  const maxPlanGap = Math.max(
    0,
    ...planLow.map((day) => day.safetyStock! - day.planned.closingStock!),
  )
  addFinding(
    'plan-safety',
    'warning',
    '原计划期末库存低于安全库存',
    `即使按原计划执行，仍有 ${planLow.length} 天低于当日安全库存，最大差 ${quantityFormat.format(maxPlanGap)} 吨。复核补货提前期和补充节奏。`,
    planLow,
    '复核下期库存策略与补充节奏',
    'strategy',
  )
  addFinding(
    'incomplete',
    'warning',
    '实绩数据待补齐',
    `有 ${missing.length} 天缺少一项或多项实绩，月度流量偏差按双方都有数据的日期比较。`,
    missing,
    '跟踪未回传的日度实绩',
    'daily',
  )

  const missingRiskDates = incompleteRiskData.map(({ date }) => date)
  const evidenceDates = [
    ...new Set(
      [...shortfalls, ...actualLow, ...planLow, ...incompleteRiskData].map(({ date }) => date),
    ),
  ].sort()
  const healthReasons = [
    shortfalls.length ? `实际缺货 ${shortfalls.length} 天` : '',
    actualLow.length ? `实际期末库存低于安全库存 ${actualLow.length} 天` : '',
    planLow.length ? `原计划低于安全库存 ${planLow.length} 天` : '',
    missingRiskDates.length ? `有 ${missingRiskDates.length} 天缺少风险评估数据` : '',
  ].filter(Boolean)
  const level = shortfalls.length
    ? 'red'
    : actualLow.length || planLow.length
      ? 'yellow'
      : missingRiskDates.length
        ? 'insufficient'
        : 'green'

  let recommendation: InventoryHealthRecommendation
  let strategyVerdict: Pick<InventoryHealthVerdict, 'strategyEffectiveness' | 'strategyReason'>
  if (planLow.length) {
    const dates = planLow.map((day) => day.date)
    const detail = `原计划有 ${dates.length} 天低于当日安全库存，最大差 ${quantityFormat.format(maxPlanGap)} 吨。建议试算下期补货提前期和补充节奏。`
    strategyVerdict = {
      strategyEffectiveness: 'improve',
      strategyReason: `原计划有 ${dates.length} 天无法覆盖安全库存，建议复核下期补货策略。`,
    }
    recommendation = {
      status: 'review',
      title: '建议复核库存策略',
      detail,
      dates,
      reason: `${month.period} 月度执行复盘。原计划低于安全库存日期 ${dates.join('、')}。${detail}`,
    }
  } else if (incompleteRiskData.length) {
    strategyVerdict = {
      strategyEffectiveness: 'insufficient',
      strategyReason: '部分日期缺少库存、阈值或缺货回传，待补齐后评估。',
    }
    recommendation = {
      status: 'insufficient',
      title: '待补齐数据后判断',
      detail: '部分日期缺少计划库存、实绩库存、安全库存或缺货回传。请先补齐数据再评估策略。',
      dates: missingRiskDates,
      reason: '',
    }
  } else if (actualLow.length || shortfalls.length) {
    strategyVerdict = {
      strategyEffectiveness: 'attention',
      strategyReason: '原计划覆盖安全库存，实际执行出现风险，需先核查执行偏差。',
    }
    recommendation = {
      status: 'keep',
      title: '优先核查执行偏差',
      detail: '原计划覆盖了当日安全库存。请先核查实际补充、出货与缺货回传，再评估参数调整。',
      dates: [...new Set([...actualLow, ...shortfalls].map((day) => day.date))].sort(),
      reason: '',
    }
  } else {
    strategyVerdict = {
      strategyEffectiveness: 'effective',
      strategyReason: '可沿用本期补货参数。',
    }
    recommendation = {
      status: 'keep',
      title: '维持现行策略',
      detail: '本月计划与实际期末库存均达到安全库存，且目前回传无缺货记录。',
      dates: [],
      reason: '',
    }
  }

  const verdict: InventoryHealthVerdict = {
    level,
    ...strategyVerdict,
    healthReason: healthReasons.length
      ? `${healthReasons.join('，')}。`
      : '本月原计划与实际均达到安全库存，且无缺货。',
    evidenceDates,
    missingRiskDates,
    stockoutDays: shortfalls.length,
    actualLowDays: actualLow.length,
    plannedLowDays: planLow.length,
  }

  return { alerts, recommendation, trackingTasks, verdict }
}

export function buildInventoryHealthReport(month: InventoryHealthMonth): InventoryHealthReport {
  const supplied = new Map(month.days.map((day) => [day.date, day]))
  const days = monthCalendar(month.period).map((date) => {
    const row = supplied.get(date) ?? {
      date,
      planned: emptyAmounts,
      actual: null,
      safetyStock: null,
      stockoutQty: null,
    }
    const { planned, actual } = row
    return {
      ...row,
      variance: {
        production: variance(planned.production, actual?.production ?? null),
        availableReceipt: variance(planned.availableReceipt, actual?.availableReceipt ?? null),
        outbound: variance(planned.outbound, actual?.outbound ?? null),
        closingStock: variance(planned.closingStock, actual?.closingStock ?? null),
      },
    }
  })

  return {
    ...month,
    days,
    metrics: metricKeys.map((key) => summarizeMetric(key, days)),
    totalDays: days.length,
    reportedDays: days.filter((day) => metricKeys.every((key) => day.actual?.[key] != null)).length,
    ...summarizeFindings(month, days),
  }
}
