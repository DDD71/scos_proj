import type { DashboardAlert, DashboardDomain, DashboardMetric } from './types'

export const dashboardDomains: Record<DashboardDomain, string> = {
  sales: '销售',
  inventory: '库存',
  production: '生产',
  procurement: '采购',
  operation: '经营',
}

export const alertLevels: Record<DashboardAlert['level'], string> = {
  urgent: '一级紧急',
  warning: '二级预警',
}

const formatNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })

export function displayValue(value: string | number | null | undefined, unit = ''): string {
  if (value == null) return '待核实'
  if (typeof value === 'string') return value
  const formatted = formatNumber.format(value)
  return unit === '%' ? `${formatted}%` : [formatted, unit].filter(Boolean).join(' ')
}

export function compareMetric(metric: DashboardMetric) {
  const { value, previous, unit, direction } = metric
  if (value == null || previous == null) return
  const diff = Number((value - previous).toFixed(2))
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''
  const positive = direction === 'higher' ? diff > 0 : diff < 0
  return {
    label: `${sign}${displayValue(Math.abs(diff), unit === '%' ? '个百分点' : unit)}`,
    tone: diff === 0 || direction === 'neutral' ? 'neutral' : positive ? 'good' : 'bad',
  }
}

export function displayTimestamp(value: string | null | undefined): string {
  return value ? value.replace('T', ' ').slice(0, 16) : '待核实'
}
