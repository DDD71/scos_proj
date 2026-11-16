import type { QualityDisposition } from '../model/traceability'
import { http } from '@/shared/api/http'
import { env } from '@/shared/config/env'
import type { CostingPoolAdoption } from '../model/pool-trial'
import type {
  CostingContext,
  CostingPoolDraft,
  CostingPoolDraftInput,
  CostingSnapshot,
} from '../model/snapshot'

type CostingPoolPeriod = Pick<CostingContext, 'factory' | 'period'>
const poolDraftsPath = '/v1/costing/pool-drafts'

export async function getCostingSnapshot(): Promise<CostingSnapshot> {
  if (env.dataSource === 'mock') {
    const { loadMockCostingSnapshot } = await import('../mocks/costing.mock')
    return loadMockCostingSnapshot()
  }

  // 查询契约待与 SCOS 后端联调。
  const { data } = await http.get<CostingSnapshot>('/v1/costing/snapshot')
  return data
}

export async function listCostingPoolDrafts(scope: CostingPoolPeriod): Promise<CostingPoolDraft[]> {
  if (env.dataSource === 'mock') {
    const { listMockPoolDrafts } = await import('../mocks/costing-pool-drafts.mock')
    return listMockPoolDrafts(scope)
  }
  const { data } = await http.get<CostingPoolDraft[]>(poolDraftsPath, { params: scope })
  return data
}

export async function saveCostingPoolDraft(
  scope: CostingPoolPeriod,
  input: CostingPoolDraftInput,
  id?: string,
): Promise<CostingPoolDraft> {
  if (env.dataSource === 'mock') {
    const { saveMockPoolDraft } = await import('../mocks/costing-pool-drafts.mock')
    return saveMockPoolDraft(scope, input, id)
  }
  const body = { ...scope, ...input }
  const { data } = id
    ? await http.put<CostingPoolDraft>(`${poolDraftsPath}/${encodeURIComponent(id)}`, body)
    : await http.post<CostingPoolDraft>(poolDraftsPath, body)
  return data
}

export async function listCostingPoolAdoptions(scope: CostingPoolPeriod) {
  if (env.dataSource !== 'mock') throw new Error('费用池试算采用记录接口尚未接入。')
  const { listMockPoolAdoptions } = await import('../mocks/costing-pool-drafts.mock')
  return listMockPoolAdoptions(scope)
}

export async function adoptCostingPoolTrial(
  scope: CostingPoolPeriod,
  adoption: CostingPoolAdoption,
) {
  if (env.dataSource !== 'mock') throw new Error('费用池试算采用接口尚未接入。')
  const { adoptMockPoolTrial } = await import('../mocks/costing-pool-drafts.mock')
  return adoptMockPoolTrial(scope, adoption)
}

export async function loadQualityDisposition(scope: string, id: string) {
  if (env.dataSource !== 'mock') throw new Error('质量处置查询接口尚未接入。')
  return (await import('../mocks/costing-trace.mock')).loadMockQualityDisposition(scope, id)
}

export async function saveQualityDisposition(
  scope: string,
  id: string,
  record: QualityDisposition,
) {
  if (env.dataSource !== 'mock') throw new Error('质量处置保存接口尚未接入。')
  return (await import('../mocks/costing-trace.mock')).saveMockQualityDisposition(scope, id, record)
}
