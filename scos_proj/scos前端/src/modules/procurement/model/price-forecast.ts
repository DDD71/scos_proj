export type ProcurementPriceForecastMethod = 'price' | 'change' | 'trend'
export type ProcurementPriceForecastDirection = 'up' | 'flat' | 'down'
export type ProcurementPriceForecastStatus = 'draft' | 'submitted' | 'published' | 'deleted'
export type ProcurementPriceForecastGranularity = 'month' | 'quarter' | 'year'

export interface ProcurementPriceForecastPeriod {
  month: string
  endMonth?: string
  value?: number
  direction?: ProcurementPriceForecastDirection
  strength?: '轻微' | '温和' | '明显'
  confidence?: '低' | '中' | '高'
  basis?: string
}

export interface ProcurementPriceForecastInput {
  method: ProcurementPriceForecastMethod
  granularity?: ProcurementPriceForecastGranularity
  periods: ProcurementPriceForecastPeriod[]
  baselinePrice?: number
  basis: string
  source?: string
  riskNote?: string
}

export interface ProcurementPriceForecast extends ProcurementPriceForecastInput {
  id: string
  status: ProcurementPriceForecastStatus
  updatedAt: string
  materialCode: string
  currency: string
  unit: string
  replacesId?: string
  supersededById?: string
  submittedBy?: string
  publishedBy?: string
  publishedAt?: string
  audit?: { action: string; actor: string; at: string }[]
}

export interface ProcurementForecastSnapshot {
  forecasts: ProcurementPriceForecast[]
  history: ProcurementFuturesClose[]
  referenceContract?: string
  capturedAt: string
  frozenAt?: string
}

export interface ProcurementFuturesClose {
  month: string
  price: number
}

export const forecastGranularityLabels = { month: '月', quarter: '季', year: '年' }
export const forecastGranularityMonths = { month: 1, quarter: 3, year: 12 }

export const priceForecastMethodLabels: Record<ProcurementPriceForecastMethod, string> = {
  price: '直接价格',
  change: '涨跌幅',
  trend: '仅趋势',
}

export const priceForecastDirectionLabels: Record<ProcurementPriceForecastDirection, string> = {
  up: '上涨',
  flat: '持平',
  down: '下跌',
}

export const priceForecastStatusLabels: Record<ProcurementPriceForecastStatus, string> = {
  draft: '草稿',
  submitted: '待审核',
  published: '已发布',
  deleted: '已删除',
}

export function isActivePriceForecast(forecast: ProcurementPriceForecast): boolean {
  return forecast.status === 'published' && !forecast.supersededById
}

export function shiftForecastMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  return date.toISOString().slice(0, 7)
}

export function forecastPeriodMonths(period: ProcurementPriceForecastPeriod) {
  const months = [period.month]
  if (!period.endMonth) return months
  for (
    let month = shiftForecastMonth(period.month, 1);
    month <= period.endMonth;
    month = shiftForecastMonth(month, 1)
  ) {
    months.push(month)
  }
  return months
}

export function formatForecastRange(forecast: ProcurementPriceForecast) {
  const first = forecast.periods[0]
  const last = forecast.periods.at(-1)
  const end = last?.endMonth ?? last?.month
  if (!first || !end) return '—'
  return first.month === end ? end : `${first.month} 至 ${end}`
}

export function getPublishedPriceForecastPoints(
  forecasts: readonly ProcurementPriceForecast[],
  history: readonly ProcurementFuturesClose[] = [],
) {
  const periods = forecasts
    .filter((forecast) => isActivePriceForecast(forecast) && forecast.method !== 'trend')
    .flatMap((forecast) => forecast.periods.map((period) => ({ forecast, period })))
    .sort((a, b) => a.period.month.localeCompare(b.period.month))
  const points: { month: string; price: number; method: 'price' | 'change' }[] = []
  for (const { forecast, period } of periods) {
    if (period.value == null || !Number.isFinite(period.value)) continue
    const method = forecast.method === 'change' ? 'change' : 'price'
    const last = points.at(-1)
    let price = period.value
    if (method === 'change') {
      const baseline =
        last?.month === shiftForecastMonth(period.month, -1)
          ? last.price
          : (forecast.baselinePrice ??
            history.filter((point) => point.month < period.month).at(-1)?.price)
      if (baseline == null) continue
      price = Number((baseline * (1 + period.value / 100)).toFixed(2))
    }
    for (const month of forecastPeriodMonths(period)) points.push({ month, price, method })
  }
  return points
}

export function forecastsForPlan(
  forecasts: readonly ProcurementPriceForecast[],
  month: string,
  currency: string,
  unit: string,
) {
  const end = shiftForecastMonth(month, 6)
  const active = forecasts.filter(
    (forecast) =>
      isActivePriceForecast(forecast) && forecast.currency === currency && forecast.unit === unit,
  )
  const selected = new Set(
    active.filter((forecast) =>
      forecast.periods.some(
        (period) => period.month <= end && (period.endMonth ?? period.month) >= month,
      ),
    ),
  )
  // 涨跌幅可能承接方案月之前的预测，相关基准版本一并保存。
  for (const forecast of selected) {
    if (forecast.method !== 'change' || !forecast.periods[0]) continue
    const precedingMonth = shiftForecastMonth(forecast.periods[0].month, -1)
    const preceding = active.find(
      (record) =>
        record.method !== 'trend' &&
        record.periods.some((period) => (period.endMonth ?? period.month) === precedingMonth),
    )
    if (preceding) selected.add(preceding)
  }
  return [...selected]
}

export function validatePriceForecast(input: ProcurementPriceForecastInput): string | undefined {
  if (!input.basis.trim()) return '请填写判断依据。'
  if (!input.periods.length) return '请至少添加一个预测月份。'

  const months = new Set<string>()
  const step = forecastGranularityMonths[input.granularity ?? 'month']
  let previousEnd: string | undefined
  for (const period of [...input.periods].sort((a, b) => a.month.localeCompare(b.month))) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period.month)) return '请填写有效的预测月份。'
    if (months.has(period.month)) return `${period.month} 的预测数据重复。`
    months.add(period.month)
    const end = period.endMonth ?? period.month
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(end) ||
      end < period.month ||
      end > shiftForecastMonth(period.month, step - 1)
    )
      return '预测期间与所选颗粒度不一致。'
    if (previousEnd && period.month !== shiftForecastMonth(previousEnd, 1))
      return '预测期间须连续。'
    previousEnd = end

    if (input.method === 'trend') {
      if (!period.direction) return `请选择 ${period.month} 的趋势。`
    } else {
      if (period.value == null || !Number.isFinite(period.value)) {
        return `请填写 ${period.month} 的${priceForecastMethodLabels[input.method]}。`
      }
      if (input.method === 'price' && period.value <= 0) return '预测价格须大于零。'
      if (input.method === 'change' && period.value <= -100) return '涨跌幅须大于 -100%。'
    }
  }

  if (
    input.method === 'change' &&
    (input.baselinePrice == null ||
      !Number.isFinite(input.baselinePrice) ||
      input.baselinePrice <= 0)
  ) {
    return '涨跌幅预测须填写大于零的基准价格。'
  }
}
