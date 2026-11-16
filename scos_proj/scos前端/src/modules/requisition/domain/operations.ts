import type { RequisitionExecutionPlan, RequisitionExecutionRow } from '../model/execution'
import type { RequisitionIssueContext } from '../model/operations'
import type { RequisitionSnapshot } from '../model/types'
import { projectRequisition, requisitionWeekDates, requisitionWeekOf } from './plan'

export function requisitionExecutionCause(row: RequisitionExecutionRow): string {
  if (row.releaseStatus === '已撤回') return '原批次已撤回，复核补货安排'
  if (row.releaseError || row.deviation) return row.releaseError ?? row.deviation ?? ''
  if (row.commitmentDate && row.commitmentDate > row.plannedDate) return '供应商承诺晚于计划'
  if (row.commitmentQuantity != null && row.commitmentQuantity < row.plannedQuantity)
    return '供应商承诺量不足'
  if (row.estimatedArrivalDate && row.estimatedArrivalDate > row.plannedDate) return '预计到货延期'
  if (row.inspectionStatus && /冻结|拒收/.test(row.inspectionStatus)) return row.inspectionStatus
  if (
    row.transportStatus === '已到厂' &&
    row.receivedQuantity != null &&
    row.receivedQuantity < row.plannedQuantity
  )
    return '实收数量不足'
  if (row.transportStatus === '异常') return '运输异常'
  return ''
}

export function requisitionExecutionIssue(
  snapshot: RequisitionSnapshot,
  plan: RequisitionExecutionPlan,
  row: RequisitionExecutionRow,
): RequisitionIssueContext | undefined {
  const materialCode =
    plan.source?.materialCode ??
    snapshot.supplies.find(({ id }) => id === row.contractId)?.materialCode
  const material = snapshot.materials.find(({ code }) => code === materialCode)
  if (!material) return
  const date = row.plannedDate < snapshot.startDate ? snapshot.startDate : row.plannedDate
  const weekStart = requisitionWeekOf(date)
  const projection = projectRequisition(
    material,
    snapshot.startDate,
    requisitionWeekDates(weekStart).filter((day) => day >= snapshot.startDate),
    snapshot.fixedArrivals,
  )
  const gap = projection.find(({ shortage }) => shortage != null && shortage > 0)
  return {
    id: `execution:${row.id}`,
    planId: plan.id,
    executionRowId: row.id,
    plannedDate: row.plannedDate,
    plannedQuantity: row.plannedQuantity,
    feedbackDate: row.estimatedArrivalDate ?? row.commitmentDate,
    feedbackQuantity: row.receivedQuantity || row.commitmentQuantity,
    materialCode: material.code,
    materialName: material.name,
    weekStart,
    unit: material.unit,
    cause: requisitionExecutionCause(row) || '执行反馈待复核',
    riskKnown: projection.length > 0 && projection.every(({ shortage }) => shortage != null),
    ...(gap ? { riskDate: gap.date, shortage: gap.shortage ?? undefined } : {}),
  }
}
