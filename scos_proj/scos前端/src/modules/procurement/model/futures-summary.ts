import type { ProcurementFuturesCandle } from './futures'

function weekStart(date: Date): string {
  const monday = new Date(date)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  return monday.toISOString().slice(0, 10)
}

function percentChange(first: number, last: number): number | null {
  return first === 0 ? null : ((last - first) / first) * 100
}

export function summarizeProcurementFutures(candles: readonly ProcurementFuturesCandle[]) {
  const sorted = [...candles].sort((left, right) => left.tradeDate.localeCompare(right.tradeDate))
  const latest = sorted.at(-1)
  const latest60Start = sorted.at(-60)
  const close30 = sorted.slice(-30)
  const weeklyCloses = new Map<string, ProcurementFuturesCandle>()

  for (const candle of sorted) {
    const monday = weekStart(new Date(`${candle.tradeDate}T00:00:00Z`))
    weeklyCloses.set(monday, candle)
  }

  const first = sorted[0]
  if (first) {
    const monday = weekStart(new Date(`${first.tradeDate}T00:00:00Z`))
    // 数据从周中开始时，无法确认首周完整。
    if (first.tradeDate !== monday) weeklyCloses.delete(monday)
  }
  if (latest) {
    const date = new Date(`${latest.tradeDate}T00:00:00Z`)
    const day = date.getUTCDay()
    // 没有交易日历时，周一至周四的末根 K 线视为当周尚未结束。
    if (day >= 1 && day <= 4) weeklyCloses.delete(weekStart(date))
  }

  const weeks = [...weeklyCloses.values()]
  const lastWeek = weeks.at(-1)
  const previousWeek = weeks.at(-2)
  return {
    // 最近 60 根的首根收盘价与末根收盘价对比。
    cumulativeChange60:
      latest60Start && latest ? percentChange(latest60Start.close, latest.close) : null,
    weeklyChange:
      previousWeek && lastWeek ? percentChange(previousWeek.close, lastWeek.close) : null,
    weeklyEndDate: lastWeek?.tradeDate ?? null,
    weeklyPreviousEndDate: previousWeek?.tradeDate ?? null,
    ma30:
      close30.length === 30
        ? close30.reduce((total, candle) => total + candle.close, 0) / 30
        : null,
  }
}
