import type { CostingPoolAdoption, CostingPoolTrial } from '../model/pool-trial'
import type { CostingPoolDraft, CostingSnapshot } from '../model/snapshot'
import { roundMoney, sumMoney } from './analysis'

export const batchQuantityDriver = '批次数量（Mock）'

function splitCents(total: number, weights: number[]) {
  if (!total) return weights.map(() => 0)
  const sum = weights.reduce((value, weight) => value + weight, 0)
  const parts = weights.map((weight, index) => {
    const exact = (Math.abs(total) * weight) / sum
    const cents = Math.floor(exact)
    return { index, cents, remainder: exact - cents }
  })
  const remaining = Math.abs(total) - parts.reduce((value, part) => value + part.cents, 0)
  const amounts = parts.map((part) => part.cents)
  for (const { index } of parts
    .sort((a, b) => b.remainder - a.remainder || b.cents - a.cents)
    .slice(0, remaining)) {
    amounts[index]!++
  }
  return amounts.map((amount) => amount * Math.sign(total))
}

export function createPoolTrial(data: CostingSnapshot, draft: CostingPoolDraft): CostingPoolTrial {
  const poolCode = draft.poolCode ?? `MOCK-${draft.id}`
  const original = data.pools.find((pool) => pool.poolCode === poolCode)
  const scope =
    original?.benefitScope === draft.benefitScope
      ? original
      : data.pools.find((pool) => pool.benefitScope === draft.benefitScope)
  const missing = (reason: string) => ({
    draft,
    poolCode,
    allocations: [],
    unallocated: roundMoney(draft.periodAmount),
    reason,
  })
  if (!scope) return missing('当前 Mock 数据找不到该受益范围对应的批次。')

  const costs = new Map(data.costs.map((cost) => [cost.batch, cost]))
  const samples = data.allocations.filter((row) => row.poolCode === scope.poolCode)
  const quantityBased = draft.primaryDriver === batchQuantityDriver
  const basis = quantityBased
    ? [...new Map(samples.map((row) => [row.batch, row])).values()].flatMap((row) => {
        const cost = costs.get(row.batch)
        return cost && cost.quantity > 0
          ? [{ ...row, driverQuantity: cost.quantity, driverUnit: cost.unit }]
          : []
      })
    : samples.filter(
        (row) =>
          row.driverName === draft.primaryDriver && row.driverQuantity > 0 && costs.has(row.batch),
      )
  if (!basis.length)
    return missing('当前 Mock 数据缺少该分摊动因的有效基数。可在分摊设置中改用批次数量。')
  if (
    new Set(basis.map((item) => item.batch)).size < new Set(samples.map((item) => item.batch)).size
  ) {
    return missing('部分受益批次缺少有效基数，当前草稿金额仍待分摊。')
  }
  if (new Set(basis.map((item) => item.driverUnit)).size > 1) {
    return missing('受益批次的动因单位不一致，需统一计量单位后再试算。')
  }
  if (
    original?.poolCode === scope.poolCode &&
    original.primaryDriver === draft.primaryDriver &&
    sumMoney(samples, (row) => row.amount) === roundMoney(draft.periodAmount)
  ) {
    return { draft, poolCode, allocations: samples, unallocated: 0 }
  }

  const weights = basis.map((row) => row.driverQuantity)
  const cents = splitCents(Math.round(draft.periodAmount * 100), weights)
  const rate = roundMoney(draft.periodAmount) / weights.reduce((sum, weight) => sum + weight, 0)
  const allocations = basis.map((row, index) => ({
    ...row,
    id: original?.poolCode === scope.poolCode ? row.id : `TRIAL-${poolCode}-${index + 1}`,
    poolCode,
    itemCode: draft.costElement || row.itemCode,
    costName: original?.poolCode === scope.poolCode ? row.costName : draft.poolName,
    driverName: draft.primaryDriver,
    allocationRate: rate,
    amount: cents[index]! / 100,
  }))
  return { draft, poolCode, allocations, unallocated: 0 }
}

export function replacePoolAdoption(
  adoptions: CostingPoolAdoption[],
  adoption: CostingPoolAdoption,
) {
  return [...adoptions.filter((row) => row.trial.poolCode !== adoption.trial.poolCode), adoption]
}

export function applyPoolAdoptions(
  data: CostingSnapshot,
  adoptions: CostingPoolAdoption[],
): CostingSnapshot {
  const applicable = adoptions.filter(
    ({ sourceVersion }) => sourceVersion === data.context.costVersion,
  )
  const latest = applicable.at(-1)
  if (!latest) return data
  const applied = new Map(applicable.map(({ trial }) => [trial.poolCode, trial]))
  const pools = new Map(data.pools.map((pool) => [pool.poolCode, pool]))
  const poolDeltas = new Map<string, number>()
  function addPoolDelta(batch: string, cents: number) {
    poolDeltas.set(batch, (poolDeltas.get(batch) ?? 0) + cents)
  }
  const allocations = data.allocations.filter((row) => {
    if (!applied.has(row.poolCode)) return true
    addPoolDelta(row.batch, -Math.round(row.amount * 100))
    return false
  })
  for (const { poolCode, draft, allocations: rows } of applied.values()) {
    pools.set(poolCode, { ...draft, poolCode, status: '已采用' })
    for (const row of rows) {
      addPoolDelta(row.batch, Math.round(row.amount * 100))
      allocations.push(row)
    }
  }

  const outbound = new Map<string, CostingSnapshot['relations']>()
  for (const relation of data.relations) {
    const rows = outbound.get(relation.from) ?? []
    rows.push(relation)
    outbound.set(relation.from, rows)
  }
  const stage = new Map(data.batches.map((row) => [row.id, row.order]))
  const inboundDeltas = new Map<string, number>()
  const transferDeltas = new Map<string, number>()
  const baseline = new Map(data.transfers.map((row) => [row.relationId, row.amount]))
  const adjusted = new Map<string, (typeof data.costs)[number]>()
  for (const cost of [...data.costs].sort(
    (a, b) => (stage.get(a.batch) ?? 0) - (stage.get(b.batch) ?? 0),
  )) {
    const poolDelta = poolDeltas.get(cost.batch) ?? 0
    const inboundDelta = inboundDeltas.get(cost.batch) ?? 0
    const delta = poolDelta + inboundDelta
    if (!poolDelta && !inboundDelta) continue
    const totalCost = roundMoney(cost.totalCost + delta / 100)
    adjusted.set(cost.batch, {
      ...cost,
      poolCost: roundMoney(cost.poolCost + poolDelta / 100),
      inboundCost: roundMoney(cost.inboundCost + inboundDelta / 100),
      totalCost,
      unitCost:
        cost.unitCost == null || !cost.quantity
          ? cost.unitCost
          : roundMoney(totalCost / cost.quantity),
      status: 'Mock 试算已采用',
    })

    // 用演示快照已记录的边金额分配增减额，保留未转出的成本。
    const edges = (outbound.get(cost.batch) ?? []).filter(
      (edge) => (baseline.get(edge.id) ?? 0) > 0,
    )
    const weights = edges.map((edge) => baseline.get(edge.id)!)
    const transferred = weights.reduce((sum, weight) => sum + weight, 0)
    if (!delta || !transferred) continue
    const transferable = Math.round((delta * transferred) / Math.max(cost.totalCost, transferred))
    const changes = splitCents(transferable, weights)
    edges.forEach((edge, index) => {
      const change = changes[index]!
      transferDeltas.set(edge.id, change)
      inboundDeltas.set(edge.to, (inboundDeltas.get(edge.to) ?? 0) + change)
    })
  }

  return {
    ...data,
    context: { ...data.context, costVersion: `MOCK-${latest.adoptedAt}` },
    pools: [...pools.values()],
    allocations,
    costs: data.costs.map((cost) => adjusted.get(cost.batch) ?? cost),
    transfers: data.transfers.map((row) => ({
      ...row,
      amount: roundMoney(row.amount + (transferDeltas.get(row.relationId) ?? 0) / 100),
    })),
  }
}

export function summarizePoolTrial(
  before: CostingSnapshot,
  after: CostingSnapshot,
  trial: CostingPoolTrial,
) {
  const previous = new Map<string, number>()
  const next = new Map<string, number>()
  for (const row of before.allocations) {
    if (row.poolCode === trial.poolCode) {
      previous.set(row.batch, (previous.get(row.batch) ?? 0) + Math.round(row.amount * 100))
    }
  }
  for (const row of trial.allocations) {
    next.set(row.batch, (next.get(row.batch) ?? 0) + Math.round(row.amount * 100))
  }
  const originalCosts = new Map(before.costs.map((cost) => [cost.batch, cost.totalCost]))
  const affected = after.costs.flatMap((row) => {
    const oldAmount = (previous.get(row.batch) ?? 0) / 100
    const newAmount = (next.get(row.batch) ?? 0) / 100
    const totalChange = roundMoney(row.totalCost - (originalCosts.get(row.batch) ?? row.totalCost))
    const change = roundMoney(newAmount - oldAmount)
    return change || totalChange
      ? [{ batch: row.batch, oldAmount, newAmount, change, totalChange }]
      : []
  })
  affected.sort((a, b) => Math.abs(b.totalChange) - Math.abs(a.totalChange))
  return { affected, allocated: sumMoney(trial.allocations, (row) => row.amount) }
}
