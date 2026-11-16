import type {
  RequisitionArrival,
  RequisitionDailyProjection,
  RequisitionMaterial,
  RequisitionSupply,
} from '../model/types'

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}

export function firstCompleteRequisitionWeek(startDate: string): string {
  const weekday = new Date(`${startDate}T00:00:00Z`).getUTCDay()
  return addDays(startDate, (8 - weekday) % 7)
}

export function requisitionWeekOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, -((weekday + 6) % 7))
}

export function requisitionWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

const quantity = (value: number) => Number(value.toFixed(3))

export function sameRequisitionBatch(first: RequisitionArrival, second: RequisitionArrival) {
  return (
    first.materialCode === second.materialCode &&
    first.orderId === second.orderId &&
    first.orderLineNumber === second.orderLineNumber &&
    first.date === second.date
  )
}

function arrivalsOn(
  arrivals: readonly RequisitionArrival[],
  materialCode: string,
  date: string,
  contractId?: string,
): number {
  return quantity(
    arrivals
      .filter(
        (arrival) =>
          arrival.materialCode === materialCode &&
          arrival.date === date &&
          (contractId === undefined || arrival.contractId === contractId),
      )
      .reduce((sum, arrival) => sum + arrival.quantity, 0),
  )
}

function emptyProjection(date: string): RequisitionDailyProjection {
  return {
    date,
    demand: null,
    fixedArrival: null,
    fixedAvailableArrival: null,
    suggestedArrival: null,
    openingStock: null,
    closingStock: null,
    warehousePeak: null,
    unavailableStock: null,
    shortage: null,
    safetyBufferGap: null,
  }
}

function unavailableStock(material: RequisitionMaterial): number | null {
  const { onHandStock, availableStock } = material
  return onHandStock == null || availableStock == null || onHandStock < availableStock
    ? null
    : quantity(onHandStock - availableStock)
}

export function projectRequisition(
  material: RequisitionMaterial,
  startDate: string,
  dates: readonly string[],
  fixedArrivals: readonly RequisitionArrival[],
  suggestions: readonly RequisitionArrival[] = [],
): RequisitionDailyProjection[] {
  const lastDate = [...dates].sort().at(-1)
  if (!lastDate) return []

  const projections = new Map<string, RequisitionDailyProjection>()
  let openingStock = material.availableStock
  let physicalAvailable = material.availableStock
  let unavailable = unavailableStock(material)
  const materialArrivals = fixedArrivals.filter(
    ({ materialCode }) => materialCode === material.code,
  )
  for (let date = startDate; date <= lastDate; date = addDays(date, 1)) {
    const demand = material.dailyDemand[date] ?? null
    const fixedArrival = arrivalsOn(materialArrivals, material.code, date)
    const fixedAvailableArrival = quantity(
      materialArrivals.reduce((total, arrival) => {
        const releaseDate =
          arrival.availableDate === undefined ? arrival.date : arrival.availableDate
        return releaseDate === date
          ? total + Math.min(arrival.availableQuantity ?? arrival.quantity, arrival.quantity)
          : total
      }, 0),
    )
    const suggestedArrival = arrivalsOn(suggestions, material.code, date)
    const warehousePeak: number | null =
      physicalAvailable === null || unavailable === null
        ? null
        : quantity(physicalAvailable + unavailable + fixedArrival + suggestedArrival)
    const availableAfterReceipt =
      physicalAvailable === null
        ? null
        : quantity(physicalAvailable + fixedAvailableArrival + suggestedArrival)
    unavailable =
      unavailable === null ? null : quantity(unavailable + fixedArrival - fixedAvailableArrival)
    const closingStock: number | null =
      openingStock === null || demand === null
        ? null
        : quantity(openingStock + fixedAvailableArrival + suggestedArrival - demand)
    projections.set(date, {
      date,
      demand,
      fixedArrival,
      fixedAvailableArrival,
      suggestedArrival,
      openingStock,
      closingStock,
      warehousePeak,
      unavailableStock: unavailable,
      shortage: closingStock === null ? null : Math.max(0, -closingStock),
      safetyBufferGap:
        closingStock === null || material.safetyBuffer == null
          ? null
          : quantity(Math.max(0, material.safetyBuffer - Math.max(0, closingStock))),
    })
    openingStock = closingStock
    // 生产缺口可累计，但缺料不会把实物库存消耗成负数。
    physicalAvailable =
      availableAfterReceipt === null || demand === null
        ? null
        : Math.max(0, quantity(availableAfterReceipt - demand))
  }
  return dates.map((date) => projections.get(date) ?? emptyProjection(date))
}

export function isRequisitionSupplyEmbargoed(supply: RequisitionSupply, date: string): boolean {
  const restriction = supply.restrictions
    ?.filter(({ status, effectiveDate }) => status === '已确认' && effectiveDate <= date)
    .sort((first, second) => second.effectiveDate.localeCompare(first.effectiveDate))[0]
  return restriction ? restriction.action === '禁运' : supply.embargoed
}

export function canSupply(supply: RequisitionSupply, date: string): boolean {
  return (
    supply.status === '有效' &&
    Boolean(supply.orderId) &&
    !isRequisitionSupplyEmbargoed(supply, date) &&
    date >= supply.earliestArrival &&
    date <= supply.latestArrival &&
    date <= supply.validTo
  )
}

interface RequisitionWarehouseWindow {
  startDate: string
  dates: readonly string[]
  capacity: number
}

function warehouseIssue(
  projection: readonly RequisitionDailyProjection[],
  capacity: number,
  unit: string,
): string | undefined {
  if (!Number.isFinite(capacity) || capacity <= 0) return '请填写有效的仓容上限。'
  for (const day of projection) {
    if (day.warehousePeak === null) return `${day.date}：缺少可校验仓容的库存或耗用数据。`
    if (day.warehousePeak > capacity) {
      return `${day.date}：预计入库后仓容占用 ${day.warehousePeak} ${unit}，超过仓容上限 ${capacity} ${unit}。`
    }
  }
}

export function validateRequisitionSuggestions(
  material: RequisitionMaterial,
  supplies: readonly RequisitionSupply[],
  fixedArrivals: readonly RequisitionArrival[],
  suggestions: readonly RequisitionArrival[],
  warehouse?: RequisitionWarehouseWindow,
): string[] {
  const errors = new Set<string>()
  const materialSupplies = supplies.filter((supply) => supply.materialCode === material.code)
  for (const arrival of suggestions) {
    const { contractId, orderId, date, quantity: amount } = arrival
    const prefix = `${date || '未填写日期'} · ${contractId || '未关联合同'}`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount <= 0) {
      errors.add(`${prefix}：请填写有效到货日期及正数到货量。`)
      continue
    }
    if (material.dailyDemand[date] == null) {
      errors.add(`${prefix}：缺少当日需求数据。`)
      continue
    }

    const supply = materialSupplies.find(
      (item) => item.id === contractId && item.orderId === orderId,
    )
    if (!supply || arrival.materialCode !== material.code || !canSupply(supply, date)) {
      errors.add(`${prefix}：对应订单或到货条件不可用。`)
      continue
    }
    if (amount < supply.minimumQuantity) {
      errors.add(`${prefix}：单次到货量低于起送量 ${supply.minimumQuantity}${material.unit}。`)
    }

    const contractToday =
      arrivalsOn(fixedArrivals, material.code, date, contractId) +
      arrivalsOn(suggestions, material.code, date, contractId)
    if (quantity(contractToday) > supply.dailyCapacity) {
      errors.add(`${prefix}：超过当日可供量 ${supply.dailyCapacity}${material.unit}。`)
    }
    const contractTotal = suggestions
      .filter((item) => item.contractId === contractId)
      .reduce((sum, item) => sum + item.quantity, 0)
    if (quantity(contractTotal) > supply.remainingQuantity) {
      errors.add(
        `${contractId}：新增要货超过合同可安排余量 ${supply.remainingQuantity}${material.unit}。`,
      )
    }
  }
  const receivingDays = warehouse?.dates ?? new Set(suggestions.map(({ date }) => date))
  for (const date of receivingDays) {
    const receiving = quantity(
      arrivalsOn(fixedArrivals, material.code, date) + arrivalsOn(suggestions, material.code, date),
    )
    if (material.receivingCapacity === null) {
      errors.add('请补充工厂日收货能力。')
      break
    }
    if (receiving > material.receivingCapacity) {
      errors.add(
        `${date}：到货合计 ${receiving} ${material.unit}，超过日收货上限 ${material.receivingCapacity} ${material.unit}。`,
      )
    }
  }
  if (warehouse) {
    const projection = projectRequisition(
      material,
      warehouse.startDate,
      warehouse.dates,
      fixedArrivals,
      suggestions,
    )
    const issue = warehouseIssue(projection, warehouse.capacity, material.unit)
    if (issue) errors.add(issue)
  }
  return [...errors]
}

function warehouseReceiptRoom(
  projection: readonly RequisitionDailyProjection[],
  date: string,
  warehouseCapacity: number,
  unavailable: number,
): number {
  let room = warehouseCapacity
  let extraConsumption = 0
  for (const day of projection) {
    if (day.date < date) continue
    if (day.warehousePeak === null || day.demand === null) return 0
    // 提前到货要预留后续固定到货的仓容。能被当天实际耗用的新增量不再占下一天的仓容。
    room = Math.min(room, warehouseCapacity - day.warehousePeak + extraConsumption)
    extraConsumption += Math.max(
      0,
      day.demand - (day.warehousePeak - (day.unavailableStock ?? unavailable)),
    )
  }
  return quantity(room)
}

interface RequisitionPlacement {
  date: string
  supply: RequisitionSupply
  amount: number
  existing?: RequisitionArrival
}

function addSuggestedArrival(
  suggestions: RequisitionArrival[],
  { date, supply, amount, existing }: RequisitionPlacement,
) {
  if (existing) {
    existing.quantity = quantity(existing.quantity + amount)
    return
  }
  const prefix = `REQ-${date}-${supply.id}`
  let sequence = 1
  while (suggestions.some(({ id }) => id === `${prefix}-${sequence}`)) sequence++
  suggestions.push({
    id: `${prefix}-${sequence}`,
    materialCode: supply.materialCode,
    supplierName: supply.supplierName,
    contractId: supply.id,
    orderId: supply.orderId,
    date,
    quantity: amount,
    status: '建议',
    locked: false,
  })
}

function allocateRequisitionArrivals(
  material: RequisitionMaterial,
  startDate: string,
  dates: readonly string[],
  fixedArrivals: readonly RequisitionArrival[],
  supplies: readonly RequisitionSupply[],
  warehouseCapacity: number,
  lockedSuggestions: readonly RequisitionArrival[],
  consolidate: boolean,
  expectedQuantity: number | undefined,
): {
  suggestions: RequisitionArrival[]
  constraintMessage?: string
  projection?: RequisitionDailyProjection[]
} {
  const suggestions = lockedSuggestions.map((row) => ({ ...row }))
  const target = expectedQuantity ?? Infinity
  const remaining = () =>
    quantity(target - suggestions.reduce((total, row) => total + row.quantity, 0))
  if (remaining() < 0) {
    return { suggestions, constraintMessage: '已锁定批次的数量超过预期要货量。' }
  }
  const orderedDates = [...dates].sort()
  const project = () =>
    projectRequisition(material, startDate, orderedDates, fixedArrivals, suggestions)
  let projection = project()
  const initialIssue = validateRequisitionSuggestions(
    material,
    supplies,
    fixedArrivals,
    suggestions,
    {
      startDate,
      dates: orderedDates,
      capacity: warehouseCapacity,
    },
  )[0]
  if (initialIssue) return { suggestions, constraintMessage: initialIssue }

  const unavailable = unavailableStock(material)
  if (unavailable === null || projection.some(({ shortage }) => shortage === null)) {
    return { suggestions, constraintMessage: '请先补齐本周实物在库量、可用量和生产耗用数据。' }
  }
  const receivingCapacity = material.receivingCapacity
  if (receivingCapacity === null) {
    return { suggestions, constraintMessage: '请先补齐工厂日收货能力。' }
  }

  const eligibleSupplies = supplies
    .filter((supply) => supply.materialCode === material.code)
    .sort((left, right) => left.priority - right.priority)
  const placeArrival = (
    days: readonly RequisitionDailyProjection[],
    need: number,
    supplement = false,
  ) => {
    const budget = remaining()
    if (budget <= 0) return '已达到预期要货量'
    let warehouseLimited = false
    let receivingLimited = false

    for (const supply of eligibleSupplies) {
      const used = suggestions
        .filter((row) => row.contractId === supply.id)
        .reduce((sum, row) => sum + row.quantity, 0)
      const candidates: RequisitionPlacement[] = []
      for (const day of days) {
        if (!canSupply(supply, day.date)) continue
        const existing = suggestions.find(
          (row) => row.contractId === supply.id && row.date === day.date && !row.locked,
        )
        const minimum = existing ? 0.001 : Math.max(0.001, supply.minimumQuantity)
        const supplierRoom = quantity(
          Math.min(
            supply.remainingQuantity - used,
            supply.dailyCapacity -
              arrivalsOn(fixedArrivals, material.code, day.date, supply.id) -
              arrivalsOn(suggestions, material.code, day.date, supply.id),
          ),
        )
        if (supplierRoom < minimum || budget < minimum) continue

        const receivingRoom = quantity(
          receivingCapacity - (day.fixedArrival ?? 0) - (day.suggestedArrival ?? 0),
        )
        if (receivingRoom < minimum) {
          receivingLimited = true
          continue
        }
        const warehouseRoom = warehouseReceiptRoom(
          projection,
          day.date,
          warehouseCapacity,
          unavailable,
        )
        if (warehouseRoom < minimum) {
          warehouseLimited = true
          continue
        }

        const amount = quantity(
          Math.min(supplierRoom, receivingRoom, warehouseRoom, budget, Math.max(minimum, need)),
        )
        candidates.push({ supply, date: day.date, amount, existing })
      }

      const minimumQuantity = Math.max(0.001, supply.minimumQuantity)
      const canUseNewBatch = candidates.some(
        ({ existing, amount }) => !existing && amount >= minimumQuantity,
      )
      const preferred =
        supplement && canUseNewBatch
          ? candidates.filter(
              ({ existing, amount }) =>
                !existing || amount === budget || quantity(budget - amount) >= minimumQuantity,
            )
          : candidates
      const placement = preferred.sort(
        (left, right) =>
          (supplement ? Number(Boolean(right.existing)) - Number(Boolean(left.existing)) : 0) ||
          right.amount - left.amount ||
          Number(Boolean(right.existing)) - Number(Boolean(left.existing)),
      )[0]
      if (!placement) continue

      // 补库可以拆批，预留下一批起送量，避免只剩无法起送的尾量。
      const tail = quantity(budget - placement.amount)
      const splitAmount = quantity(budget - minimumQuantity)
      if (
        supplement &&
        tail > 0 &&
        tail < minimumQuantity &&
        candidates.some(
          (candidate) => candidate.date !== placement.date && candidate.amount >= minimumQuantity,
        ) &&
        splitAmount >= (placement.existing ? 0.001 : minimumQuantity)
      ) {
        placement.amount = splitAmount
      }
      addSuggestedArrival(suggestions, placement)
      projection = project()
      return
    }

    if (warehouseLimited) return '仓容余量不足以安排下一批到货'
    if (receivingLimited) return '日收货余量不足以安排下一批到货'
    return '合同余量、供货日期或起送量限制了剩余供货'
  }

  let constraintMessage: string | undefined
  for (const [index, deadline] of orderedDates.entries()) {
    while ((projection[index]?.shortage ?? 0) > 0) {
      const dailyNeed = projection[index]?.shortage ?? 0
      const need = consolidate
        ? Math.max(...projection.slice(index).map(({ shortage }) => shortage ?? 0))
        : dailyNeed
      const issue = placeArrival(projection.slice(0, index + 1).reverse(), need)
      if (issue) {
        constraintMessage ??= `${deadline}：仍缺 ${dailyNeed} ${material.unit}，${issue}。`
        break
      }
    }
  }

  while (expectedQuantity !== undefined && remaining() > 0) {
    const issue = placeArrival([...projection].reverse(), remaining(), true)
    if (issue) {
      const targetIssue = `预期要货量尚差 ${remaining()} ${material.unit}，${issue}。`
      constraintMessage = `${constraintMessage ?? ''}${targetIssue}`
      break
    }
  }

  return { suggestions, constraintMessage, projection }
}

export function suggestRequisitionArrivals(
  material: RequisitionMaterial,
  startDate: string,
  dates: readonly string[],
  fixedArrivals: readonly RequisitionArrival[],
  supplies: readonly RequisitionSupply[],
  warehouseCapacity: number,
  lockedSuggestions: readonly RequisitionArrival[] = [],
  expectedQuantity?: number,
): { suggestions: RequisitionArrival[]; constraintMessage?: string } {
  if (
    expectedQuantity !== undefined &&
    (!Number.isFinite(expectedQuantity) || expectedQuantity < 0)
  ) {
    return {
      suggestions: lockedSuggestions.map((row) => ({ ...row })),
      constraintMessage: '请填写有效的预期要货量。',
    }
  }
  let target = expectedQuantity
  if (target !== undefined) {
    const rounded = quantity(target)
    target = rounded > target ? quantity(rounded - 0.001) : rounded
  }
  const inputs = [
    material,
    startDate,
    dates,
    fixedArrivals,
    supplies,
    warehouseCapacity,
    lockedSuggestions,
  ] as const
  let plan = allocateRequisitionArrivals(...inputs, true, target)
  if (plan.projection && plan.constraintMessage) {
    // 提前并批可能使后续仓容余量低于起送量。只在按需安排能更早减少缺料时切换。
    const dailyPlan = allocateRequisitionArrivals(...inputs, false, target)
    const firstDifference = plan.projection.findIndex(
      ({ shortage }, index) => shortage !== dailyPlan.projection?.[index]?.shortage,
    )
    const coversProductionEarlier =
      firstDifference >= 0 &&
      (dailyPlan.projection?.[firstDifference]?.shortage ?? Infinity) <
        (plan.projection[firstDifference]?.shortage ?? Infinity)
    const schedulesMore =
      target !== undefined &&
      firstDifference < 0 &&
      dailyPlan.suggestions.reduce((total, row) => total + row.quantity, 0) >
        plan.suggestions.reduce((total, row) => total + row.quantity, 0)
    if (coversProductionEarlier || schedulesMore) {
      plan = dailyPlan
    }
  }
  return { suggestions: plan.suggestions, constraintMessage: plan.constraintMessage }
}
