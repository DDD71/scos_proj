import { env } from '@/shared/config/env'
import type { RequisitionCoordination, RequisitionRestriction } from '../model/operations'

export async function listRequisitionCoordination(): Promise<RequisitionCoordination[]> {
  if (env.dataSource !== 'mock') throw new Error('要货协调与禁运接口尚未接入。')
  const adapter = await import('../mocks/requisition-operations.mock')
  return adapter.listRequisitionCoordination()
}

export async function saveRequisitionCoordination(item: RequisitionCoordination): Promise<void> {
  if (env.dataSource !== 'mock') throw new Error('要货协调与禁运接口尚未接入。')
  const adapter = await import('../mocks/requisition-operations.mock')
  return adapter.saveRequisitionCoordination(item)
}

export async function listRequisitionRestrictions(): Promise<RequisitionRestriction[]> {
  if (env.dataSource !== 'mock') throw new Error('要货协调与禁运接口尚未接入。')
  const adapter = await import('../mocks/requisition-operations.mock')
  return adapter.listRequisitionRestrictions()
}

export async function saveRequisitionRestriction(item: RequisitionRestriction): Promise<void> {
  if (env.dataSource !== 'mock') throw new Error('要货协调与禁运接口尚未接入。')
  const adapter = await import('../mocks/requisition-operations.mock')
  return adapter.saveRequisitionRestriction(item)
}
