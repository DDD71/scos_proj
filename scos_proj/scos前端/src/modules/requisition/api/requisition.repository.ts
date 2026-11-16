import { env } from '@/shared/config/env'
import {
  projectRequisition,
  sameRequisitionBatch,
  suggestRequisitionArrivals,
  validateRequisitionSuggestions,
} from '../domain/plan'
import type { RequisitionExecutionPlan, RequisitionPlanPublication } from '../model/execution'
import type {
  RequisitionArrival,
  RequisitionMaterial,
  RequisitionSnapshot,
  RequisitionSupply,
} from '../model/types'

export type { RequisitionPlanPublication } from '../model/execution'

export async function getRequisitionSnapshot(): Promise<RequisitionSnapshot> {
  if (env.dataSource !== 'mock') throw new Error('要货业务接口尚未接入。')
  const { getMockRequisitionSnapshotWithPublications } =
    await import('../mocks/requisition-execution.mock')
  return getMockRequisitionSnapshotWithPublications()
}

interface RequisitionSuggestionInput {
  material: RequisitionMaterial
  startDate: string
  dates: readonly string[]
  fixedArrivals: readonly RequisitionArrival[]
  supplies: readonly RequisitionSupply[]
  warehouseCapacity: number
  locked: readonly RequisitionArrival[]
  expectedQuantity: number
  usePreset: boolean
}

export async function getRequisitionSuggestions({
  material,
  startDate,
  dates,
  fixedArrivals,
  supplies,
  warehouseCapacity,
  locked,
  expectedQuantity,
  usePreset,
}: RequisitionSuggestionInput): Promise<{
  suggestions: RequisitionArrival[]
  constraintMessage?: string
}> {
  if (env.dataSource !== 'mock') throw new Error('要货建议接口尚未接入。')
  const preferred = supplies[0]
  if (usePreset && preferred && expectedQuantity > 0) {
    const { getMockRequisitionSuggestions } = await import('../mocks/requisition-planning.mock')
    const preset = getMockRequisitionSuggestions(preferred)
    const suggestions = [
      ...locked,
      ...preset.filter(
        (row) => !locked.some((item) => item.id === row.id || sameRequisitionBatch(item, row)),
      ),
    ]
    const plannedQuantity = Number(
      suggestions.reduce((sum, row) => sum + row.quantity, 0).toFixed(3),
    )
    if (
      plannedQuantity === expectedQuantity &&
      !validateRequisitionSuggestions(material, supplies, fixedArrivals, suggestions, {
        startDate,
        dates,
        capacity: warehouseCapacity,
      }).length &&
      projectRequisition(material, startDate, dates, fixedArrivals, suggestions).every(
        ({ shortage }) => shortage === 0,
      )
    ) {
      return { suggestions }
    }
  }
  return suggestRequisitionArrivals(
    material,
    startDate,
    dates,
    fixedArrivals,
    supplies,
    warehouseCapacity,
    locked,
    expectedQuantity,
  )
}

export async function simulateRequisitionArrivalDelay(delayed: boolean): Promise<void> {
  if (env.dataSource !== 'mock') return
  const { setMockRequisitionArrivalDelay } = await import('../mocks/requisition-planning.mock')
  setMockRequisitionArrivalDelay(delayed)
}

export async function simulateRequisitionInspection(released: boolean) {
  if (env.dataSource !== 'mock') return
  const { simulateMockRequisitionInspection } = await import('../mocks/requisition-execution.mock')
  simulateMockRequisitionInspection(released)
}

export async function checkRequisitionRelease(planId: string, rowIds: string[]) {
  if (env.dataSource !== 'mock') throw new Error('下达校验接口尚未接入。')
  const { checkMockRequisitionRelease } = await import('../mocks/requisition-execution.mock')
  return checkMockRequisitionRelease(planId, rowIds)
}

export async function lookupRequisitionReceipt(planId: string, rowId: string) {
  if (env.dataSource !== 'mock') throw new Error('回执查询接口尚未接入。')
  const { lookupMockRequisitionReceipt } = await import('../mocks/requisition-execution.mock')
  return lookupMockRequisitionReceipt(planId, rowId)
}

export async function withdrawRequisitionRow(planId: string, rowId: string) {
  if (env.dataSource !== 'mock') throw new Error('要货撤回接口尚未接入。')
  const { withdrawMockRequisitionRow } = await import('../mocks/requisition-execution.mock')
  withdrawMockRequisitionRow(planId, rowId)
}

export async function publishRequisitionPlan(
  input: RequisitionPlanPublication,
): Promise<RequisitionExecutionPlan> {
  if (env.dataSource !== 'mock') throw new Error('要货计划发布接口尚未接入。')
  const { publishMockRequisitionPlan } = await import('../mocks/requisition-execution.mock')
  return publishMockRequisitionPlan(input)
}

export async function listRequisitionExecutionPlans(): Promise<RequisitionExecutionPlan[]> {
  if (env.dataSource !== 'mock') throw new Error('要货执行接口尚未接入。')
  const { listMockRequisitionExecutionPlans } = await import('../mocks/requisition-execution.mock')
  return listMockRequisitionExecutionPlans()
}

export async function releaseRequisitionRows(planId: string, rowIds: string[], retry = false) {
  if (env.dataSource !== 'mock') throw new Error('要货下达接口尚未接入。')
  const { releaseMockRequisitionRows } = await import('../mocks/requisition-execution.mock')
  releaseMockRequisitionRows(planId, rowIds, retry)
}
