import type { InventoryPolicyParameters, InventorySnapshot } from '../model/types'

export type StrategyPeriod = Pick<InventorySnapshot, 'plant' | 'month'>

export interface InventoryPolicyScenario {
  parameters: InventoryPolicyParameters
  reason: string
}

export interface InventoryPolicyVersion extends InventoryPolicyScenario {
  version: string
  publishedAt?: string
}

export interface InventoryPolicyVersions {
  versions: InventoryPolicyVersion[]
  activeVersion: string
  legacyDraft?: InventoryPolicyScenario
}

export interface LegacyPolicyWorkflow {
  draft?: InventoryPolicyScenario
  review?: InventoryPolicyScenario
  published?: InventoryPolicyVersion
}
