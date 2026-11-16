import { calendarDaysBetween } from '../model/business-logic'
import { addDays, round } from '../model/scenarios'
import type { ContractInput, ContractLoadAdjustment, ContractProfile } from '../model/types'

function includesWeek(range: ContractLoadAdjustment, date: string) {
  return range.startWeek <= date && date <= range.endWeek
}

export function pricePlan(
  input: ContractInput,
  baselinePrice: number,
  curve?: ReturnType<typeof purchaseCurve>,
) {
  if (input.purchaseCurveStart) {
    const prices = new Map<string, { total: number; count: number }>()
    for (const { month, price } of curve ?? purchaseCurve(input, baselinePrice)) {
      const previous = prices.get(month) ?? { total: 0, count: 0 }
      prices.set(month, { total: previous.total + price, count: previous.count + 1 })
    }
    return input.months.map((row) => {
      const entry = prices.get(row.month)
      return entry ? { ...row, price: round(entry.total / entry.count, 2) } : row
    })
  }
  if (!input.purchaseAdjustments) return input.months
  const nodes = new Map(input.purchaseAdjustments.map(({ month, change }) => [month, change]))
  let price = baselinePrice
  return input.months.map((month) => {
    const change = nodes.get(month.month)
    if (change !== undefined) price = round(baselinePrice + change, 2)
    return { ...month, price }
  })
}

export function purchaseCurve(input: ContractInput, baselinePrice: number) {
  const first = input.months[0]?.month
  const last = input.months.at(-1)?.month
  const start = input.purchaseCurveStart
  if (!first || !last || !start) return []
  const firstDate = `${first}-01`
  const [year, month] = last.split('-').map(Number)
  const lastDate = new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10)
  const anchors = new Map([[start, baselinePrice]])
  for (const node of input.purchaseAdjustments ?? []) {
    const day = `${node.month}-01`
    if (node.month < start.slice(0, 7)) continue
    anchors.set(day < start ? start : day, round(baselinePrice + node.change, 2))
  }
  const points = [...anchors].sort(([a], [b]) => a.localeCompare(b))
  let index = 0
  return Array.from({ length: calendarDaysBetween(firstDate, lastDate) + 1 }, (_, offset) => {
    const date = addDays(firstDate, offset)
    while (points[index + 1] && date >= points[index + 1]![0]) index += 1
    const [fromDate, fromPrice] = points[index]!
    const next = points[index + 1]
    const price =
      date < start
        ? baselinePrice
        : next
          ? round(
              fromPrice +
                ((next[1] - fromPrice) * calendarDaysBetween(fromDate, date)) /
                  calendarDaysBetween(fromDate, next[0]),
              2,
            )
          : fromPrice
    return { date, month: date.slice(0, 7), price, anchor: anchors.has(date) }
  })
}

export function productionPlan(input: ContractInput) {
  const ranges = input.productionAdjustments ?? []
  return input.weeks.map((week) => {
    const range = ranges.find((range) => includesWeek(range, week.start))
    return range && week.state === '正常生产' ? { ...week, load: range.load } : week
  })
}

export function contractAdjustmentError(input: ContractInput, profile: ContractProfile) {
  const nodes = input.purchaseAdjustments ?? []
  const months = new Set(input.months.map(({ month }) => month))
  if (new Set(nodes.map(({ month }) => month)).size !== nodes.length)
    return '同一个月只能设置一条调价节点。'
  for (const node of nodes) {
    if (
      !months.has(node.month) ||
      (input.purchaseCurveStart && node.month < input.purchaseCurveStart.slice(0, 7))
    )
      return '请选择推演起点至合同到期之间的价格节点。'
    if (!Number.isFinite(node.change) || round(profile.rawPrice + node.change, 2) <= 0)
      return `${node.month} 调整后的采购价须大于 0。`
  }

  const weeks = new Set(input.weeks.map(({ start }) => start))
  const ranges = [...(input.productionAdjustments ?? [])].sort((a, b) =>
    a.startWeek.localeCompare(b.startWeek),
  )
  for (const [index, range] of ranges.entries()) {
    if (!weeks.has(range.startWeek) || !weeks.has(range.endWeek) || range.startWeek > range.endWeek)
      return '请选择合同期内的起止生产周，结束周不能早于开始周。'
    if (!Number.isInteger(range.load) || range.load < 50 || range.load > 100)
      return '区间负荷应为 50% 至 100% 的整数。'
    if (index && ranges[index - 1]!.endWeek >= range.startWeek) return '生产负荷区间不能重叠。'
    if (!input.weeks.some((week) => week.state === '正常生产' && includesWeek(range, week.start)))
      return '生产负荷区间至少需要包含一个正常生产周。'
  }
  return ''
}
