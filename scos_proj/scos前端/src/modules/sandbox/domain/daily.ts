import { addDays, round, scenarioTitle } from '../model/scenarios'
import type {
  DailyInput,
  DailyProduct,
  SandboxBaseline,
  SandboxDay,
  SandboxDiagnostic,
  SandboxImpact,
  SandboxMetric,
  SandboxRun,
} from '../model/types'

type Movements = Record<string, number>
interface Receipt {
  date: string
  quantity: number
  contractId?: string
  supplierId?: string
  availableDate?: string | null
  availableQuantity?: number
}
const totalOn = (items: Receipt[], date: string) =>
  items.filter((item) => item.date === date).reduce((sum, item) => sum + item.quantity, 0)
const sum = (values: number[]) => round(values.reduce((total, value) => total + value, 0))

function project(
  product: DailyProduct,
  dates: string[],
  receipts: Receipt[],
  adjustments: Movements,
) {
  let balance: number | null = product.opening
  let physical: number | null = product.physical
  let available: number | null = product.opening
  return dates.map((date): SandboxDay => {
    const demand =
      product.demand[date] == null ? null : round(product.demand[date] + (adjustments[date] ?? 0))
    const receipt = totalOn(receipts, date)
    const released = receipts.reduce((sum, item) => {
      const release = item.availableDate === undefined ? item.date : item.availableDate
      return sum + (release === date ? (item.availableQuantity ?? item.quantity) : 0)
    }, 0)
    const opening = balance
    const peak: number | null = physical == null ? null : physical + receipt
    const capacityExceeded = product.capacity != null && peak != null && peak > product.capacity
    const consumed: number | null =
      available == null || demand == null ? null : Math.min(available + released, demand)
    balance = opening == null || demand == null ? null : round(opening + released - demand)
    available = consumed == null || available == null ? null : available + released - consumed
    physical = peak == null || consumed == null ? null : peak - consumed
    return {
      date,
      opening,
      receipt,
      demand,
      closing: balance,
      shortage: balance == null ? null : Math.max(0, -balance),
      capacityExceeded,
    }
  })
}

function dailyMetrics(
  base: SandboxDay[],
  sim: SandboxDay[],
  alternative: SandboxDay[] | undefined,
  unit: string,
) {
  const minimum = (rows: SandboxDay[]) =>
    rows.every((row) => row.closing != null) ? Math.min(...rows.map((row) => row.closing!)) : null
  const gap = (rows: SandboxDay[]) =>
    rows.every((row) => row.shortage != null) ? Math.max(...rows.map((row) => row.shortage!)) : null
  const closing = (rows: SandboxDay[]) => rows.at(-1)?.closing ?? null
  return [
    { key: 'minimum', label: '最低预计库存', get: minimum },
    { key: 'closing', label: '期末预计库存', get: closing },
    { key: 'shortage', label: '最大累计缺口', get: gap },
  ].map(({ get, key, label }): SandboxMetric => {
    const baseValue = get(base)
    const simulated = get(sim)
    return {
      key,
      label,
      unit,
      base: baseValue,
      simulated,
      ...(alternative ? { alternative: get(alternative) } : {}),
      ...(baseValue == null || simulated == null ? { reason: '该时段缺少逐日需求或库存数据' } : {}),
    }
  })
}

export function computeDaily(
  snapshot: SandboxBaseline,
  input: DailyInput,
): Pick<
  SandboxRun,
  'title' | 'status' | 'metrics' | 'diagnostics' | 'comparisonKey' | 'changes' | 'result'
> {
  const { kind, objectId, quantityPct, days } = input
  const last = addDays(snapshot.start, input.horizon - 1)
  const dates = Array.from({ length: input.horizon }, (_, index) => addDays(snapshot.start, index))
  const arrival =
    kind === 'supply' ? snapshot.arrivals.find((item) => item.id === objectId) : undefined
  const order = kind === 'demand' ? snapshot.orders.find((item) => item.id === objectId) : undefined
  const production =
    kind === 'production'
      ? snapshot.production.filter((item) => item.confirmed && item.lineId === objectId)
      : []
  const product = snapshot.products.find(
    (item) => item.id === (arrival?.productId ?? order?.productId ?? production[0]?.productId),
  )
  if (!product) throw new Error('所选业务对象缺少可用的基线。')
  if (arrival?.locked) throw new Error('该批次已进入收货或质检阶段，请选择待到货的批次。')
  if (![7, 14].includes(input.horizon)) throw new Error('请选择 7 天或 14 天的推演时段。')
  const maxDays = { supply: 14, demand: 7, production: 5 }[kind]
  const minPct = kind === 'demand' ? -30 : 0
  const maxPct = { supply: 100, demand: 50, production: 60 }[kind]
  if (
    !Number.isInteger(days) ||
    days < 0 ||
    days > maxDays ||
    !Number.isFinite(quantityPct) ||
    quantityPct < minPct ||
    quantityPct > maxPct
  )
    throw new Error('调整比例或天数超出了场景允许范围。')

  const start = input.start
  if (kind === 'production' && (start < snapshot.start || start > last || !dates.includes(start)))
    throw new Error('请选择评估时段内的产能变化开始日期。')
  const affectedDate = arrival?.date ?? order?.date
  if (affectedDate && (affectedDate < snapshot.start || affectedDate > last))
    throw new Error('所选单据在评估时段外，请调整评估天数或更换单据。')
  const unit = product.unit
  const show = (value: number) => `${round(value)} ${unit}`
  const impacts: SandboxImpact[] = []
  const changes: SandboxImpact[] = []
  const diagnostics: SandboxDiagnostic[] = []
  const extraMetrics: SandboxMetric[] = []
  const adjustments: Movements = {}
  const raw = kind === 'supply'
  const baseReceipts: Receipt[] = raw
    ? snapshot.arrivals.filter((item) => item.productId === product.id)
    : snapshot.production
        .filter((item) => item.confirmed && item.productId === product.id)
        .map((item) => ({ date: item.availableDate, quantity: item.quantity }))

  let scenarioReceipts = baseReceipts
  if (arrival) {
    const date = addDays(arrival.date, days)
    const quantity = round(arrival.quantity * (1 - quantityPct / 100))
    scenarioReceipts = snapshot.arrivals
      .filter((item) => item.productId === product.id)
      .map((item) =>
        item.id === arrival.id
          ? {
              ...item,
              date,
              quantity,
              availableDate: item.availableDate
                ? addDays(item.availableDate, days)
                : item.availableDate,
              availableQuantity:
                item.availableQuantity == null
                  ? undefined
                  : round(item.availableQuantity * (1 - quantityPct / 100)),
            }
          : item,
      )
    impacts.push({
      object: arrival.label,
      base: `${arrival.date} · ${show(arrival.quantity)}`,
      simulated: `${date} · ${show(quantity)}${date > last ? '（超出时段）' : ''}`,
      date: arrival.date,
      to: arrival.target,
    })
    changes.push(...impacts)
    diagnostics.push({
      area: '排程及交付',
      status: '未评估',
      detail: '缺少原料不足日到具体生产计划及销售订单行的关联结果。',
    })
    diagnostics.push({
      area: '替代采购成本',
      status: '未评估',
      detail: '需由采购模块返回有效报价、运输费用和可行方案。',
    })
    if (input.priceAssumption) {
      const { base, increasePct } = input.priceAssumption
      if (
        unit !== '吨' ||
        !Number.isFinite(base) ||
        base <= 0 ||
        !Number.isFinite(increasePct) ||
        increasePct < -100
      )
        throw new Error('请填写有效的采购净价与价格变化比例。')
      const simulatedPrice = round(base * (1 + increasePct / 100), 2)
      extraMetrics.push(
        {
          key: 'supply-price',
          label: '该批假设采购净价',
          unit: '元/吨',
          base,
          simulated: simulatedPrice,
        },
        {
          key: 'supply-value',
          label: '该批假设采购净额',
          unit: '元',
          base: round(arrival.quantity * base, 2),
          simulated: round(quantity * simulatedPrice, 2),
        },
      )
      changes.push({
        object: '人工假设采购净价',
        base: `${base} 元/吨`,
        simulated: `${simulatedPrice} 元/吨`,
      })
    }
  }
  if (order) {
    const date = addDays(order.date, -days)
    const quantity = round(order.quantity * (1 + quantityPct / 100))
    if (date < snapshot.start) throw new Error('提前后的交付日期早于基线，请减少提前天数。')
    if ((product.demand[order.date] ?? 0) < order.quantity)
      throw new Error('该订单行数量和需求基线无法核对。')
    adjustments[order.date] = -order.quantity
    adjustments[date] = (adjustments[date] ?? 0) + quantity
    impacts.push({
      object: order.name,
      base: `${order.date} · ${show(order.quantity)}`,
      simulated: `${date} · ${show(quantity)}`,
      date,
    })
    changes.push(...impacts)
    extraMetrics.push({
      key: 'gross-raw',
      label: '该订单 BOM 折算玉米淀粉需求',
      unit: '吨',
      base: round(order.quantity * order.rawUsage),
      simulated: round(quantity * order.rawUsage),
    })
    diagnostics.push({
      area: '有限产能及净采购缺口',
      status: '未评估',
      detail: '库存结果使用当前已发布补充计划；需由精益排程、采购模块重算。',
    })
  }
  if (production.length) {
    const selected = production.filter(
      (item) => item.availableDate >= start && item.availableDate < addDays(start, days),
    )
    const byDate = new Map<string, number>()
    for (const item of selected) {
      const lost = round((item.quantity * quantityPct) / 100)
      byDate.set(item.availableDate, (byDate.get(item.availableDate) ?? 0) + lost)
      if (lost && item.availableDate <= last)
        impacts.push({
          object: `${item.lineName} · ${item.id}`,
          date: item.availableDate,
          base: show(item.quantity),
          simulated: show(item.quantity - lost),
          to: '/scheduling',
        })
    }
    scenarioReceipts = snapshot.production
      .filter((item) => item.confirmed && item.productId === product.id)
      .map((item) => ({
        date: item.availableDate,
        quantity:
          production.includes(item) && selected.includes(item)
            ? round(item.quantity * (1 - quantityPct / 100))
            : item.quantity,
      }))
    extraMetrics.push({
      key: 'lost-output',
      label: '时段内计划产量缺口',
      unit,
      base: 0,
      simulated: sum([...byDate].filter(([date]) => date <= last).map(([, value]) => value)),
    })
    changes.push({
      object: production[0]!.lineName,
      base: '当前计划产量',
      simulated: `${start} 起下降 ${quantityPct}% · 持续 ${days} 天`,
      date: start,
    })
    diagnostics.push({
      area: '补产、完工重排与增量成本',
      status: '未评估',
      detail: '需由精益排程及成本核算评估可调计划和费用。',
    })
    if (days > 0 && !selected.length)
      diagnostics.push({
        area: '场景时段',
        status: '可计算',
        detail: '所选时间内没有此产线的已确认入库计划。',
      })
  }

  const baseline = project(product, dates, baseReceipts, {})
  const scenario = project(product, dates, scenarioReceipts, adjustments)
  const missing = scenario.some((row) => row.closing == null)
  let alternative: SandboxDay[] | undefined
  let alternativeReceipts: Receipt[] | undefined
  if (input.alternative) {
    const { date, quantity, id } = input.alternative
    const candidate = snapshot.mitigations.find(
      (item) => item.id === id && item.productId === product.id,
    )
    const blocked = candidate?.restrictions
      ?.filter((item) => item.effectiveDate <= date)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]?.blocked
    const onThatDay = snapshot.arrivals
      .filter((item) => item.contractId === id && item.date === date)
      .reduce((sum, item) => sum + item.quantity, 0)
    if (
      !candidate ||
      blocked ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      date < candidate.earliest ||
      date > candidate.latest ||
      !dates.includes(date) ||
      quantity < candidate.minimum ||
      quantity > Math.min(candidate.maximum, candidate.dailyMaximum - onThatDay)
    )
      throw new Error('应对方案超出合同余量、日供货能力、最小批量或允许日期。')
    alternativeReceipts = [
      ...scenarioReceipts,
      { date, quantity, contractId: id, supplierId: candidate.supplierId },
    ]
    alternative = project(product, dates, alternativeReceipts, adjustments)
    impacts.push({
      object: candidate.label,
      base: '无补位到货',
      simulated: `${date} 模拟补位 ${show(quantity)}`,
      date,
    })
    changes.push(impacts.at(-1)!)
  }

  const firstShortage = scenario.find((row) => (row.shortage ?? 0) > 0)?.date
  const firstCapacity = (alternative ?? scenario).find((row) => row.capacityExceeded)?.date
  const safety = product.safety
  const firstBreach =
    safety == null
      ? undefined
      : scenario.find((row) => row.closing != null && row.closing < safety)?.date
  const availabilityNote = missing
    ? '部分日期缺少需求数据，相关指标未评估。'
    : '同一快照逐日评估，可查看低于安全库存和出现缺口的日期。'
  diagnostics.unshift({
    area: '库存与供需',
    status: missing ? '未评估' : '可计算',
    detail: availabilityNote,
  })
  if (safety == null)
    diagnostics.push({ area: '安全库存', status: '未评估', detail: '该物料未配置安全库存。' })
  if (product.capacity == null)
    diagnostics.push({
      area: '仓容',
      status: '未评估',
      detail: '缺少可用于本物料的仓容上限，或该物料使用共享罐。',
    })
  if (firstCapacity)
    diagnostics.push({
      area: '仓容',
      status: '不可行',
      detail: `${firstCapacity} 预计入库后超过仓容上限，请调整到货安排。`,
    })
  if (raw && input.alternative && product.receivingCapacity != null) {
    const day = alternative?.find((row) => row.date === input.alternative?.date)
    if ((day?.receipt ?? 0) > product.receivingCapacity)
      diagnostics.push({
        area: '收货能力',
        status: '不可行',
        detail: `${day?.date} 的合计到货量超过日收货能力。`,
      })
  }
  if (!raw && firstShortage) {
    impacts.push(
      ...snapshot.orders
        .filter(
          (item) =>
            item.productId === product.id &&
            item.id !== order?.id &&
            item.date >= firstShortage &&
            (scenario.find((row) => row.date === item.date)?.shortage ?? 0) > 0,
        )
        .map((item) => ({
          object: item.name,
          date: item.date,
          base: `${item.date} · ${show(item.quantity)}`,
          simulated: '当日库存有缺口，存在交付风险',
        })),
    )
  }
  if (raw) {
    const share = (receipts: Receipt[]) => {
      const grouped = new Map<string, number>()
      for (const receipt of receipts.filter((row) => dates.includes(row.date))) {
        if (!receipt.supplierId) return null
        grouped.set(receipt.supplierId, (grouped.get(receipt.supplierId) ?? 0) + receipt.quantity)
      }
      const amounts = [...grouped.values()]
      const total = sum(amounts)
      return total > 0 ? round((Math.max(...amounts) / total) * 100, 2) : null
    }
    const receiptTotal = (rows: SandboxDay[]) => sum(rows.map((row) => row.receipt ?? 0))
    extraMetrics.push({
      key: 'incoming',
      label: '时段内到货量',
      unit,
      base: receiptTotal(baseline),
      simulated: receiptTotal(scenario),
      ...(alternative ? { alternative: receiptTotal(alternative) } : {}),
    })
    extraMetrics.push({
      key: 'supplier-share',
      label: '最大单一供应商到货份额',
      unit: '%',
      base: share(baseReceipts),
      simulated: share(scenarioReceipts),
      ...(alternativeReceipts ? { alternative: share(alternativeReceipts) } : {}),
      reason: '按所选时段的到货量计算；时段内无到货时不计算份额。',
    })
  }
  return {
    title: `${scenarioTitle(kind)} · ${arrival?.label ?? order?.name ?? production[0]?.lineName ?? product.name}`,
    comparisonKey: JSON.stringify([
      kind,
      snapshot.id,
      snapshot.modelVersion,
      objectId,
      snapshot.start,
      input.horizon,
      unit,
      input.priceAssumption?.base,
    ]),
    status: diagnostics.some((item) => item.status === '不可行')
      ? '不可行'
      : diagnostics.some((item) => item.status === '未评估')
        ? '部分完成'
        : '成功',
    metrics: [...dailyMetrics(baseline, scenario, alternative, unit), ...extraMetrics],
    diagnostics,
    changes,
    result: {
      kind: 'daily',
      itemName: product.name,
      unit,
      safety,
      capacity: product.capacity,
      firstBreach,
      firstShortage,
      firstCapacity,
      impacts,
      days: dates.map((date, index) => ({
        date,
        baseline: baseline[index]!,
        simulated: scenario[index]!,
        alternative: alternative?.[index],
      })),
      locations:
        snapshot.factoryLocation && arrival?.location
          ? { factory: snapshot.factoryLocation, affected: arrival.location, date: arrival.date }
          : undefined,
    },
  }
}
