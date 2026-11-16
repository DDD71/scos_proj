import { env } from '@/shared/config/env'
import type { InventoryPolicyParameters } from '../model/types'
import type {
  StrategyPeriod,
  InventoryPolicyVersions,
  InventoryPolicyScenario,
} from '../model/inventory-policy'
export type * from '../model/inventory-policy'
export { sameInventoryPolicyParameters } from '../domain/policy-parameters'

export async function readInventoryPolicyVersions(
  period: StrategyPeriod,
  productCode: string,
  baseline: InventoryPolicyParameters,
  baselineVersion: string,
): Promise<InventoryPolicyVersions> {
  if (env.dataSource !== 'mock') throw new Error('库存策略接口尚未接入。')
  const adapter = await import('../mocks/inventory-policy.mock')
  return adapter.readInventoryPolicyVersions(period, productCode, baseline, baselineVersion)
}

export async function confirmInventoryPolicy(
  period: StrategyPeriod,
  productCode: string,
  state: InventoryPolicyVersions,
  scenario: InventoryPolicyScenario,
  selectedVersion?: string,
): Promise<InventoryPolicyVersions> {
  if (env.dataSource !== 'mock') throw new Error('库存策略接口尚未接入。')
  const adapter = await import('../mocks/inventory-policy.mock')
  return adapter.confirmInventoryPolicy(period, productCode, state, scenario, selectedVersion)
}
