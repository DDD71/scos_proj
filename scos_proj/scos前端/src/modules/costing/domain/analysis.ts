import type { CostingOrder, CostingRelation } from '../model/snapshot'

export const formatQuantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format
const amount = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' })

export function money(value: number | null | undefined) {
  return value == null ? '—' : amount.format(value)
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function sumMoney<T>(items: readonly T[], select: (item: T) => number) {
  return items.reduce((total, item) => total + Math.round(select(item) * 100), 0) / 100
}

export function traceRelations(
  relations: readonly CostingRelation[],
  start: string,
  direction: 'up' | 'down',
) {
  const source = direction === 'up' ? 'to' : 'from'
  const target = direction === 'up' ? 'from' : 'to'
  const grouped = new Map<string, CostingRelation[]>()
  for (const relation of relations) {
    const group = grouped.get(relation[source]) ?? []
    group.push(relation)
    grouped.set(relation[source], group)
  }
  const pending = [start]
  const visited = new Set(pending)
  const result: CostingRelation[] = []
  for (const batch of pending) {
    for (const relation of grouped.get(batch) ?? []) {
      result.push(relation)
      if (!visited.has(relation[target])) {
        pending.push(relation[target])
        visited.add(relation[target])
      }
    }
  }
  return result
}

export const dimensions = {
  productionOrder: '生产订单',
  salesOrder: '销售订单',
  sku: 'SKU',
  customer: '客户',
  supplier: '供应商',
  channel: '渠道',
  region: '区域',
}
export type CostDimension = keyof typeof dimensions

export function summarizeOrders(orders: readonly CostingOrder[]) {
  const revenue = sumMoney(orders, (row) => row.revenue)
  const fullCost = sumMoney(orders, (row) => row.fullCost)
  const profit = roundMoney(revenue - fullCost)
  return {
    revenue,
    fullCost,
    profit,
    productionCost: sumMoney(orders, (row) => row.productionCost),
    margin: revenue > 0 ? profit / revenue : null,
  }
}

export function groupOrders(orders: readonly CostingOrder[], dimension: CostDimension) {
  const groups = new Map<string, CostingOrder[]>()
  for (const order of orders) {
    const label = dimension === 'sku' ? order.sku : `${order[dimension]} · ${order.sku}`
    const group = groups.get(label) ?? []
    group.push(order)
    groups.set(label, group)
  }
  return [...groups].map(([label, orders]) => ({ label, orders, ...summarizeOrders(orders) }))
}

export function formatRate(value: number | null | undefined) {
  return value == null
    ? '不适用'
    : new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 2 }).format(value)
}
