import { replacePoolAdoption } from '../domain/pool-trial'
import type { CostingPoolAdoption } from '../model/pool-trial'
import type { CostingContext, CostingPoolDraft, CostingPoolDraftInput } from '../model/snapshot'

type Period = Pick<CostingContext, 'factory' | 'period'>

function storageKey({ factory, period }: Period) {
  return 'scos.mock.costing.pool-drafts.' + JSON.stringify([factory, period])
}

interface PoolStorage {
  drafts: CostingPoolDraft[]
  adoptions: CostingPoolAdoption[]
}

function readPoolStorage(scope: Period): PoolStorage {
  const stored = JSON.parse(localStorage.getItem(storageKey(scope)) ?? '[]') as
    PoolStorage | CostingPoolDraft[]
  return Array.isArray(stored) ? { drafts: stored, adoptions: [] } : stored
}

export function listMockPoolDrafts(scope: Period) {
  return readPoolStorage(scope).drafts
}

export function listMockPoolAdoptions(scope: Period) {
  return readPoolStorage(scope).adoptions
}

export function saveMockPoolDraft(scope: Period, input: CostingPoolDraftInput, id?: string) {
  const state = readPoolStorage(scope)
  const { drafts } = state
  const index = drafts.findIndex(
    (draft) => draft.id === id || (input.poolCode && draft.poolCode === input.poolCode),
  )
  const saved = { ...input, id: drafts[index]?.id ?? id ?? crypto.randomUUID() }
  if (index === -1) drafts.unshift(saved)
  else drafts[index] = saved
  localStorage.setItem(storageKey(scope), JSON.stringify(state))
  return saved
}

export function adoptMockPoolTrial(scope: Period, adoption: CostingPoolAdoption) {
  const { trial } = adoption
  const state = readPoolStorage(scope)
  const draft = state.drafts.find((row) => row.id === trial.draft.id)
  if (JSON.stringify(draft) !== JSON.stringify(trial.draft)) {
    throw new Error('草稿已变更，请重新打开费用池试算。')
  }
  if (trial.reason || trial.unallocated) {
    throw new Error('存在未分摊金额，请调整后重新试算。')
  }
  state.drafts = state.drafts.filter((row) => row.id !== trial.draft.id)
  state.adoptions = replacePoolAdoption(state.adoptions, adoption)
  localStorage.setItem(storageKey(scope), JSON.stringify(state))
  return state.adoptions
}
