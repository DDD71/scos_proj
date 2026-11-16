import type { CostingAllocation, CostingPoolDraft } from './snapshot'

export interface CostingPoolTrial {
  draft: CostingPoolDraft
  poolCode: string
  allocations: CostingAllocation[]
  unallocated: number
  reason?: string
}

export interface CostingPoolAdoption {
  sourceVersion: string
  adoptedAt: string
  trial: CostingPoolTrial
}
