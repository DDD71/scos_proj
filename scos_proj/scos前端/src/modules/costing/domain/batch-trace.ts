import type { CostingSnapshot } from '../model/snapshot'
import { traceRelations } from './analysis'

export const traceSearchTypes = {
  batch: '批次号',
  order: '销售订单',
  customer: '客户',
} as const

export type TraceSearchType = keyof typeof traceSearchTypes
export type TraceDirection = 'both' | 'up' | 'down'

export function findTraceRoots(data: CostingSnapshot, type: TraceSearchType, keyword: string) {
  const search = keyword.trim().toLowerCase()
  if (!search) return []
  if (type === 'batch') {
    return data.batches
      .filter((batch) => batch.id.toLowerCase() === search)
      .map((batch) => batch.id)
  }

  const matched = data.orders.filter((order) => {
    const value = type === 'order' ? order.salesOrder : order.customer
    return type === 'order' ? value.toLowerCase() === search : value.toLowerCase().includes(search)
  })
  return [...new Set(matched.map((order) => order.settlementBatch))]
}

export function traceBatchSelection(
  data: CostingSnapshot,
  roots: readonly string[],
  direction: TraceDirection,
) {
  const ids = new Set(roots)
  const directions = direction === 'both' ? (['up', 'down'] as const) : [direction]
  const relations = new Map(
    roots.flatMap((root) =>
      directions.flatMap((side) =>
        traceRelations(data.relations, root, side).map(
          (relation) => [relation.id, relation] as const,
        ),
      ),
    ),
  )
  for (const relation of relations.values()) {
    ids.add(relation.from)
    ids.add(relation.to)
  }
  const batches = data.batches.filter((batch) => ids.has(batch.id))
  const orders = data.orders.filter((order) => ids.has(order.settlementBatch))
  const found = new Set(batches.map((batch) => batch.id))

  return {
    batches,
    orders,
    relations: [...relations.values()],
    missingBatches: [...ids].filter((id) => !found.has(id)),
  }
}
