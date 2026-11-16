import { env } from '@/shared/config/env'
import type { InventorySnapshot } from '../model/types'
import type { MonthlyInventoryPlan, WeeklyInventoryPlan } from '../model/inventory-plans'
export type * from '../model/inventory-plans'

export async function readMonthlyInventoryPlan(
  snapshot: InventorySnapshot,
  code: string,
): Promise<MonthlyInventoryPlan | undefined> {
  if (env.dataSource !== 'mock') throw new Error('库存计划接口尚未接入。')
  const adapter = await import('../mocks/inventory-plans.mock')
  return adapter.readMonthlyInventoryPlan(snapshot, code)
}

export async function saveMonthlyInventoryPlan(
  snapshot: InventorySnapshot,
  code: string,
  plan: MonthlyInventoryPlan,
): Promise<void> {
  if (env.dataSource !== 'mock') throw new Error('库存计划接口尚未接入。')
  const adapter = await import('../mocks/inventory-plans.mock')
  return adapter.saveMonthlyInventoryPlan(snapshot, code, plan)
}

export async function readWeeklyInventoryPlans(
  snapshot: InventorySnapshot,
  code: string,
): Promise<Record<number, WeeklyInventoryPlan>> {
  if (env.dataSource !== 'mock') throw new Error('库存计划接口尚未接入。')
  const adapter = await import('../mocks/inventory-plans.mock')
  return adapter.readWeeklyInventoryPlans(snapshot, code)
}

export async function saveWeeklyInventoryPlan(
  snapshot: InventorySnapshot,
  code: string,
  week: number,
  plan: WeeklyInventoryPlan,
): Promise<void> {
  if (env.dataSource !== 'mock') throw new Error('库存计划接口尚未接入。')
  const adapter = await import('../mocks/inventory-plans.mock')
  return adapter.saveWeeklyInventoryPlan(snapshot, code, week, plan)
}
