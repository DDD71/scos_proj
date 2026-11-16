import { addDays, costLabels, formatValue, round, scenarioTitle } from '../model/scenarios'
import { calendarDaysBetween } from '../model/business-logic'
import {
  contractAdjustmentError,
  pricePlan,
  productionPlan,
  purchaseCurve,
} from './contract-adjustments'
import type {
  ContractForecastDay,
  ContractInput,
  ContractMonthResult,
  ContractProfile,
  ContractWeekResult,
  Costs,
  SandboxBaseline,
  SandboxImpact,
  SandboxMetric,
  SandboxRun,
} from '../model/types'

const emptyCosts = (): Costs => ({ fixed: 0, raw: 0, aux: 0, energy: 0, startStop: 0 })
const parts = Object.keys(costLabels) as (keyof Costs)[]
const sumCosts = (costs: Costs) => parts.reduce((sum, key) => sum + costs[key], 0)
const divide = (amount: number, quantity: number) =>
  quantity > 0 ? round(amount / quantity, 2) : null
const unitPenalty = (input: ContractInput) =>
  round(input.penaltyType === 'rate' ? (input.salePrice * input.penalty) / 100 : input.penalty, 2)

export function uniformPurchasePrice(months: readonly ContractInput['months'][number][]) {
  const price = months[0]?.price
  return Number.isFinite(price) && months.every((row) => row.price === price) ? price : undefined
}

export function uniformProductionLoad(weeks: ContractInput['weeks']) {
  const normal = weeks.filter((row) => row.state === '正常生产')
  const load = normal[0]?.load
  return Number.isFinite(load) && normal.every((row) => row.load === load) ? load : undefined
}

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
function contractMonths(start: string, duration: number) {
  if (!monthPattern.test(start) || !Number.isInteger(duration) || duration < 1 || duration > 24)
    return []
  const date = new Date(`${start}-01T00:00:00Z`)
  return Array.from({ length: duration }, (_, offset) => {
    const month = new Date(date)
    month.setUTCMonth(date.getUTCMonth() + offset)
    return month.toISOString().slice(0, 7)
  })
}

function monthEnd(month: string) {
  return addDays(`${contractMonths(month, 2)[1]}-01`, -1)
}

function contractDailyPrices(input: ContractInput) {
  const first = input.months[0]
  const last = input.months.at(-1)
  if (!first || !last) return []
  const firstDay = `${first.month}-01`
  const elapsed = calendarDaysBetween(firstDay, monthEnd(last.month))
  const endPrice = input.endPurchasePrice
  return input.months.flatMap((month) => {
    const start = `${month.month}-01`
    const count = calendarDaysBetween(start, monthEnd(month.month)) + 1
    return Array.from({ length: count }, (_, index) => {
      const date = addDays(start, index)
      const price =
        endPrice == null
          ? month.price
          : round(
              first.price +
                (endPrice - first.price) * (calendarDaysBetween(firstDay, date) / elapsed),
              2,
            )
      return { date, month: month.month, price }
    })
  })
}

function contractSchedule(input: ContractInput, profile: ContractProfile) {
  const months = contractMonths(input.startMonth, input.duration)
  if (!months.length) return { months: [], weeks: [] }
  const first = months[0]!
  const last = months.at(-1)!
  const start = `${first}-01`
  const lastDay = monthEnd(last)
  const saturday = addDays(start, -((new Date(`${start}T00:00:00Z`).getUTCDay() + 1) % 7))
  const weeks: ContractInput['weeks'] = []
  for (let date = saturday; date <= lastDay; date = addDays(date, 7)) {
    const middle = addDays(date, 3).slice(0, 7)
    weeks.push({
      start: date,
      end: addDays(date, 6),
      month: middle < first ? first : middle > last ? last : middle,
      state: '正常生产',
      load: profile.load,
    })
  }

  const quantity = Number.isFinite(input.quantity) ? Math.max(0, input.quantity) : 0
  const opening = Number.isFinite(input.openingRaw) ? Math.max(0, input.openingRaw) : 0
  const required = Math.max(0, quantity * profile.rawUsage - opening)
  const split = (total: number, index: number) =>
    round((total * (index + 1)) / months.length) - round((total * index) / months.length)
  return {
    months: months.map((month, index) => ({
      month,
      delivery: round(split(quantity, index)),
      purchase: round(split(required, index)),
      price: profile.rawPrice,
    })),
    weeks,
  }
}

export function createContract(
  profile: ContractProfile,
  startDate: string,
  customer: string,
): ContractInput {
  const input: ContractInput = {
    kind: 'contract',
    objectId: profile.id,
    customer,
    quantity: 6000,
    salePrice: profile.salePrice,
    startMonth: startDate.slice(0, 7),
    purchaseCurveStart: startDate,
    duration: 6,
    penaltyType: 'amount',
    penalty: 260,
    openingRaw: profile.openingRaw,
    openingPrice: profile.rawPrice,
    capacity: profile.capacity,
    months: [],
    weeks: [],
  }
  return { ...input, ...contractSchedule(input, profile) }
}

export function contractError(input: ContractInput, profile: ContractProfile) {
  if (
    input.endPurchasePrice != null &&
    (!Number.isFinite(input.endPurchasePrice) || input.endPurchasePrice <= 0)
  )
    return '请填写大于 0 的到期采购价，或留空使用固定价。'
  const positive = [input.quantity, input.salePrice, input.openingPrice, input.capacity]
  if (!input.customer || positive.some((value) => !Number.isFinite(value) || value <= 0))
    return '请填写客户、合同量、销售单价、期初原料单价和统一周产能。'
  if (
    ![input.penalty, input.openingRaw].every((value) => Number.isFinite(value) && value >= 0) ||
    (input.penaltyType === 'rate' && input.penalty > 100)
  )
    return '期初库存和违约金需为非负数，违约金比例最多为 100%。'
  const expected = contractSchedule(input, profile)
  if (
    !expected.months.length ||
    expected.months.length !== input.months.length ||
    expected.weeks.length !== input.weeks.length ||
    expected.months.some((row, index) => row.month !== input.months[index]?.month) ||
    expected.weeks.some(
      (row, index) =>
        row.start !== input.weeks[index]?.start ||
        row.end !== input.weeks[index]?.end ||
        row.month !== input.weeks[index]?.month,
    )
  )
    return '请生成与合同起始月及期限对应的月度和周度计划。'
  if (
    input.months.some(
      (row) =>
        ![row.delivery, row.purchase].every((value) => Number.isFinite(value) && value >= 0) ||
        !Number.isFinite(row.price) ||
        row.price <= 0,
    )
  )
    return '请填写有效的月度交付量、采购量和采购单价。'
  const due = input.months.reduce((sum, row) => sum + row.delivery, 0)
  if (Math.abs(due - input.quantity) > 0.0005)
    return `各月交付量合计必须等于合同量，当前差额 ${round(due - input.quantity)} 吨。`
  const adjustmentError = contractAdjustmentError(input, profile)
  if (adjustmentError) return adjustmentError
  for (const [index, row] of input.weeks.entries()) {
    if (
      row.state === '正常生产' &&
      (!Number.isInteger(row.load) || row.load < 50 || row.load > 100)
    )
      return '正常生产负荷应为 50% 至 100% 的整数。'
    if (row.state === '停车' && input.weeks[index + 1]?.state !== '开车')
      return `${row.start} 起停车后下一周须开车。`
    if (row.state === '开车' && input.weeks[index - 1]?.state !== '停车')
      return `${row.start} 起的开车周须紧随停车周。`
  }
  return ''
}

function simulate(input: ContractInput, profile: ContractProfile) {
  let raw = input.openingRaw
  let rawValue = raw * input.openingPrice
  let finished = 0
  let finishedValue = 0
  let backlog = 0
  const total = emptyCosts()
  const weeks: ContractWeekResult[] = []
  const months = input.months.map((month, index): ContractMonthResult => {
    raw += month.purchase
    rawValue += month.purchase * month.price
    let output = 0
    let periodExpense = 0
    for (const week of input.weeks.filter((row) => row.month === month.month)) {
      const load = week.state === '正常生产' ? week.load : 20
      const theoretical = (input.capacity * load) / 100
      const quantity = Math.min(theoretical, raw / profile.rawUsage)
      const consumed = quantity * profile.rawUsage
      const costs: Costs = {
        fixed: profile.fixed,
        raw: raw > 0 ? (consumed * rawValue) / raw : 0,
        aux: quantity * profile.auxUnit,
        energy: quantity * profile.energyAtFull * (1 + profile.energyFactor * (100 / load - 1)),
        startStop:
          week.state === '停车' ? profile.shutdown : week.state === '开车' ? profile.startup : 0,
      }
      raw = Math.max(0, raw - consumed)
      rawValue = Math.max(0, rawValue - costs.raw)
      finished += quantity
      if (quantity > 0) finishedValue += sumCosts(costs)
      else periodExpense += sumCosts(costs)
      output += quantity
      for (const key of parts) total[key] += costs[key]
      weeks.push({ ...week, theoretical, output: quantity, rawEnding: raw, costs })
    }
    backlog += month.delivery
    const fulfilled = Math.min(backlog, finished)
    const cogs = finished > 0 ? (fulfilled * finishedValue) / finished : 0
    finished = Math.max(0, finished - fulfilled)
    finishedValue = Math.max(0, finishedValue - cogs)
    backlog = Math.max(0, backlog - fulfilled)
    const penalty = index === input.months.length - 1 ? backlog * unitPenalty(input) : 0
    const revenue = fulfilled * input.salePrice
    return {
      ...month,
      output,
      fulfilled,
      backlog,
      rawEnding: raw,
      finishedEnding: finished,
      revenue,
      cogs,
      periodExpense,
      penalty,
      profit: revenue - cogs - periodExpense - penalty,
    }
  })
  const get = (field: keyof ContractMonthResult) =>
    months.reduce((sum, row) => sum + Number(row[field]), 0)
  return { months, weeks, total, get, backlog, output: get('output') }
}

function simulatePriceForecast(input: ContractInput, profile: ContractProfile) {
  const days = input.purchaseCurveStart
    ? purchaseCurve(input, profile.rawPrice)
    : contractDailyPrices(input)
  let simulation = simulate(input, profile)
  const forecastPoint = ({ date, price }: (typeof days)[number]): ContractForecastDay => ({
    date,
    purchasePrice: price,
    productionCost: round(sumCosts(simulation.total), 2),
    profit: round(simulation.get('profit'), 2),
  })
  if (days.every(({ price }) => price === days[0]?.price))
    return { simulation, forecast: days.map(forecastPoint) }

  const daysByMonth = new Map(
    input.months.map(({ month }) => [month, days.filter((day) => day.month === month).length]),
  )
  const settledPrices = new Map<string, number>()
  let month = ''
  let priceTotal = 0
  let elapsed = 0
  const forecast = days.map((day) => {
    if (day.month !== month) {
      month = day.month
      priceTotal = 0
      elapsed = 0
    }
    priceTotal += day.price
    elapsed += 1
    const count = daysByMonth.get(month)!
    const monthlyPrice = round((priceTotal + (count - elapsed) * day.price) / count, 2)
    if (elapsed === count) settledPrices.set(month, monthlyPrice)
    simulation = simulate(
      {
        ...input,
        months: input.months.map((row) => ({
          ...row,
          price: settledPrices.get(row.month) ?? (row.month === month ? monthlyPrice : day.price),
        })),
      },
      profile,
    )
    return forecastPoint(day)
  })
  return { simulation, forecast }
}

export function computeContract(
  snapshot: SandboxBaseline,
  input: ContractInput,
): Pick<
  SandboxRun,
  'title' | 'status' | 'metrics' | 'diagnostics' | 'comparisonKey' | 'changes' | 'result'
> {
  const profile = snapshot.profiles.find((row) => row.id === input.objectId)
  if (!profile) throw new Error('所选产品没有可用的合同推演模型。')
  const error = contractError(input, profile)
  if (error) throw new Error(error)
  const baseline = {
    ...input,
    salePrice: profile.salePrice,
    months: input.months.map((row) => ({ ...row, price: profile.rawPrice })),
    weeks: input.weeks.map((row) =>
      row.state === '正常生产' ? { ...row, load: profile.load } : row,
    ),
  }
  const base = simulate(baseline, profile)
  const scenario = {
    ...input,
    endPurchasePrice: input.purchaseAdjustments ? undefined : input.endPurchasePrice,
    months: pricePlan(input, profile.rawPrice),
    weeks: productionPlan(input),
  }
  const { simulation: sim, forecast } = simulatePriceForecast(scenario, profile)
  const metric = (
    key: string,
    label: string,
    unit: string,
    baseValue: number | null,
    simulated: number | null,
  ): SandboxMetric => ({
    key,
    label,
    unit,
    base: baseValue == null ? null : round(baseValue, 2),
    simulated: simulated == null ? null : round(simulated, 2),
    ...(baseValue == null || simulated == null ? { reason: '当期无产量，单位成本不适用。' } : {}),
  })
  const startPrice = uniformPurchasePrice(input.months)
  const changes: SandboxImpact[] = [
    {
      object: '玉米淀粉采购价',
      base: profile.rawPrice,
      next: startPrice,
      unit: '元/吨',
    },
    {
      object: '正常生产负荷',
      base: profile.load,
      next: uniformProductionLoad(input.weeks),
      unit: '%',
    },
    { object: '成品售价', base: profile.salePrice, next: input.salePrice, unit: '元/吨' },
  ].flatMap(({ object, base, next, unit }) =>
    (object === '玉米淀粉采购价' && input.purchaseAdjustments) ||
    (object === '正常生产负荷' && input.productionAdjustments) ||
    next == null ||
    next === base
      ? []
      : [{ object, base: formatValue(base, unit), simulated: formatValue(next, unit) }],
  )
  if (input.purchaseCurveStart) {
    for (const node of [...(input.purchaseAdjustments ?? [])].sort((a, b) =>
      a.month.localeCompare(b.month),
    )) {
      changes.push({
        object: '玉米淀粉采购价',
        date: `${node.month}-01`,
        base: formatValue(profile.rawPrice, '元/吨'),
        simulated: `${formatValue(round(profile.rawPrice + node.change, 2), '元/吨')}（${node.month} 节点）`,
      })
    }
  } else if (input.purchaseAdjustments) {
    scenario.months.forEach((row, index) => {
      const previous = scenario.months[index - 1]?.price ?? profile.rawPrice
      if (row.price === previous) return
      changes.push({
        object: '玉米淀粉采购价',
        date: `${row.month}-01`,
        base: formatValue(previous, '元/吨'),
        simulated: `${formatValue(row.price, '元/吨')}（${row.month} 起）`,
      })
    })
  }
  for (const range of input.productionAdjustments ?? []) {
    const end = input.weeks.find((week) => week.start === range.endWeek)?.end ?? range.endWeek
    changes.push({
      object: '正常生产负荷',
      date: range.startWeek,
      base: formatValue(profile.load, '%'),
      simulated: `${formatValue(range.load, '%')}（${range.startWeek} 至 ${end}）`,
    })
  }
  if (scenario.endPurchasePrice != null && scenario.endPurchasePrice !== startPrice) {
    changes.push({
      object: '到期采购价',
      base: formatValue(profile.rawPrice, '元/吨'),
      simulated: formatValue(scenario.endPurchasePrice, '元/吨'),
    })
  }
  return {
    title: `${scenarioTitle('contract')} · ${profile.name}`,
    status: '成功',
    changes,
    comparisonKey: JSON.stringify([
      'contract',
      snapshot.id,
      snapshot.modelVersion,
      input.objectId,
      input.customer,
      input.startMonth,
      input.duration,
      input.quantity,
      input.penaltyType,
      input.penalty,
      input.openingRaw,
      input.openingPrice,
      input.capacity,
      input.months.map(({ delivery, purchase }) => [delivery, purchase]),
      input.weeks.map(({ state }) => state),
    ]),
    metrics: [
      metric('production', '累计生产', '吨', base.output, sim.output),
      metric('fulfilled', '实际履约', '吨', base.get('fulfilled'), sim.get('fulfilled')),
      metric(
        'fulfillmentRate',
        '履约率',
        '%',
        (base.get('fulfilled') / input.quantity) * 100,
        (sim.get('fulfilled') / input.quantity) * 100,
      ),
      metric('backlog', '期末未履约', '吨', base.backlog, sim.backlog),
      metric('revenue', '销售收入', '元', base.get('revenue'), sim.get('revenue')),
      metric(
        'cost',
        '经营成本',
        '元',
        base.get('cogs') + base.get('periodExpense') + base.get('penalty'),
        sim.get('cogs') + sim.get('periodExpense') + sim.get('penalty'),
      ),
      metric('penalty', '期末违约成本', '元', base.get('penalty'), sim.get('penalty')),
      metric('production-cost', '生产成本', '元', sumCosts(base.total), sumCosts(sim.total)),
      metric(
        'unit-cost',
        '单位生产成本',
        '元/吨',
        divide(sumCosts(base.total), base.output),
        divide(sumCosts(sim.total), sim.output),
      ),
      metric('profit', '合同利润', '元', base.get('profit'), sim.get('profit')),
    ],
    diagnostics: [
      {
        area: '合同履约',
        status: '可计算',
        detail:
          round(sim.backlog) > 0
            ? `期末仍有 ${round(sim.backlog)} 吨未履约，已按模拟合同计入违约成本。`
            : '月内欠交优先由后续月份补交，期末无欠交。',
      },
      {
        area: '模拟成本',
        status: '可计算',
        detail:
          '原料和成品采用移动加权计价，空产周费用计入期间费用；合同未售成品及未耗原料保留在库存。',
      },
    ],
    result: {
      kind: 'contract',
      months: sim.months,
      baselineMonths: base.months,
      forecast,
      weeks: sim.weeks,
      costs: sim.total,
      output: sim.output,
      rawRequirement: round(input.quantity * profile.rawUsage),
    },
  }
}
