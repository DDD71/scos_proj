import type { FinishedProductDemandInput } from '../types/finished-product-demands'
import { env } from '../config/env'
export type * from '../types/finished-product-demands'
export { matchesFinishedProductDemand } from '../lib/finished-product-demands'

export async function readFinishedProductDemands() {
  if (env.dataSource !== 'mock') throw new Error('成品需求查询接口尚未接入。')
  return (await import('./mocks/finished-product-demands.mock')).readFinishedProductDemands()
}

export async function publishFinishedProductDemand(input: FinishedProductDemandInput) {
  if (env.dataSource !== 'mock') throw new Error('成品需求发布接口尚未接入。')
  return (await import('./mocks/finished-product-demands.mock')).publishFinishedProductDemand(input)
}
