import { env } from '@/shared/config/env'
import type { InventoryHealthMonth } from '../domain/inventory-health'
import type { InventorySnapshot } from '../model/types'

export async function getInventorySnapshot(): Promise<InventorySnapshot> {
  if (env.dataSource !== 'mock') throw new Error('成品库存业务接口尚未接入。')
  const { applyConfirmedInventoryReceipts } = await import('../mocks/inventory-plans.mock')
  const { applyPublishedInventoryPolicies } = await import('../mocks/inventory-policy.mock')
  const { getMockInventorySnapshot } = await import('../mocks/inventory-snapshot.mock')
  return applyConfirmedInventoryReceipts(
    applyPublishedInventoryPolicies(getMockInventorySnapshot()),
  )
}

export async function getInventoryHealthHistory(): Promise<readonly InventoryHealthMonth[]> {
  if (env.dataSource !== 'mock') throw new Error('成品库存执行历史接口尚未接入。')
  const { inventoryHealthHistoryMock } = await import('../mocks/inventory-health-history.mock')
  return inventoryHealthHistoryMock
}

export async function listInventoryExceptions() {
  if (env.dataSource !== 'mock') throw new Error('库存异常接口尚未接入。')
  return (await import('../mocks/inventory-review.mock')).inventoryExceptionMock
}
