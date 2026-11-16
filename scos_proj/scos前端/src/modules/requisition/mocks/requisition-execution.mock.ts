import {
  canSupply,
  isRequisitionSupplyEmbargoed,
  projectRequisition,
  requisitionWeekDates,
  validateRequisitionSuggestions,
} from '../domain/plan'
import { listRequisitionRestrictions } from './requisition-operations.mock'
import type {
  RequisitionExecutionPlan,
  RequisitionExecutionRow,
  RequisitionPlanPublication,
} from '../model/execution'
import type { RequisitionArrival, RequisitionSnapshot } from '../model/types'
import type { RequisitionReleaseIssue } from '../model/operations'
import { getMockRequisitionPlanningDemo } from './requisition-planning.mock'
import { getMockRequisitionSnapshot } from './requisition-snapshot.mock'

const storageKey = 'scos.mock.requisition.release'
const inspectionKey = 'scos.mock.requisition.partial-inspection'
const publicationsKey = 'scos.mock.requisition.published-plans'
const { plant, supplies, materials } = getMockRequisitionSnapshot()

function row(
  contractId: string,
  data: Omit<
    RequisitionExecutionRow,
    'contractId' | 'supplierName' | 'orderId' | 'materialName' | 'unit'
  >,
): RequisitionExecutionRow {
  const supply = supplies.find((item) => item.id === contractId)!
  const material = materials.find((item) => item.code === supply.materialCode)!
  return {
    ...data,
    contractId,
    supplierName: supply.supplierName,
    orderId: supply.orderId,
    materialName: material.name,
    unit: material.unit,
  }
}

// 前五行沿用要货 DEMO 的 execution 快照。另补两行演示下达与失败重试。
const plans: RequisitionExecutionPlan[] = [
  {
    id: 'REQPLN-20260929-V1',
    plant,
    rows: [
      row('HT-YM-260801', {
        id: 'REQEXE-001',
        plannedDate: '2026-09-30',
        plannedQuantity: 600,
        releaseStatus: '已下达',
        commitmentDate: '2026-09-30',
        commitmentQuantity: 600,
        shippedQuantity: 600,
        estimatedArrivalDate: '2026-09-30',
        transportStatus: '运输中',
        receivedQuantity: 0,
        qualifiedQuantity: 0,
        inspectionStatus: '待检',
      }),
      row('HT-YM-260806', {
        id: 'REQEXE-002',
        plannedDate: '2026-10-02',
        plannedQuantity: 500,
        releaseStatus: '已下达',
        commitmentDate: '2026-10-02',
        commitmentQuantity: 500,
        shippedQuantity: 500,
        estimatedArrivalDate: '2026-10-02',
        transportStatus: '运输中',
        receivedQuantity: 0,
        qualifiedQuantity: 0,
        inspectionStatus: '待检',
      }),
      row('HT-YM-260812', {
        id: 'REQEXE-003',
        plannedDate: '2026-10-05',
        plannedQuantity: 400,
        releaseStatus: '已下达',
        commitmentDate: '2026-10-06',
        commitmentQuantity: 400,
        shippedQuantity: 0,
        estimatedArrivalDate: '2026-10-06',
        transportStatus: '待发运',
        receivedQuantity: 0,
        qualifiedQuantity: 0,
        inspectionStatus: '待检',
        deviation: '供应商承诺到货延期 1 天',
      }),
      row('HT-YM-260822', {
        id: 'REQEXE-004',
        plannedDate: '2026-10-07',
        plannedQuantity: 300,
        releaseStatus: '已下达',
        commitmentDate: '2026-10-07',
        commitmentQuantity: 300,
        shippedQuantity: 300,
        estimatedArrivalDate: '2026-10-08',
        transportStatus: '异常',
        receivedQuantity: 0,
        qualifiedQuantity: 0,
        inspectionStatus: '待检',
        deviation: '禁运前已发运，预计到厂延期 1 天',
      }),
      row('HT-YM-260801', {
        id: 'REQEXE-006',
        plannedDate: '2026-10-09',
        plannedQuantity: 500,
        releaseStatus: '待下达',
      }),
      row('HT-YM-260818', {
        id: 'REQEXE-007',
        plannedDate: '2026-10-10',
        plannedQuantity: 300,
        releaseStatus: '待下达',
      }),
    ],
  },
  {
    id: 'REQPLN-20260925-V2',
    plant,
    rows: [
      row('HT-YM-260818', {
        id: 'REQEXE-005',
        plannedDate: '2026-09-29',
        plannedQuantity: 300,
        releaseStatus: '已下达',
        commitmentDate: '2026-09-29',
        commitmentQuantity: 300,
        shippedQuantity: 300,
        estimatedArrivalDate: '2026-09-29',
        transportStatus: '已到厂',
        receivedQuantity: 300,
        qualifiedQuantity: 240,
        inspectionStatus: '部分冻结',
        deviation: '60 吨待复检',
      }),
    ],
  },
]

type ReleaseResult = Pick<
  RequisitionExecutionRow,
  'releaseStatus' | 'dispatchReference' | 'releaseError'
>

function releases(): Record<string, ReleaseResult> {
  return JSON.parse(sessionStorage.getItem(storageKey) ?? '{}')
}

function publications(): RequisitionExecutionPlan[] {
  return JSON.parse(sessionStorage.getItem(publicationsKey) ?? '[]')
}

function withReleases(plan: RequisitionExecutionPlan, saved: Record<string, ReleaseResult>) {
  return {
    ...plan,
    rows: plan.rows.map((row) => ({ ...row, ...saved[row.id] })),
  }
}

export function listMockRequisitionExecutionPlans(): RequisitionExecutionPlan[] {
  const saved = releases()
  const demo = getMockRequisitionPlanningDemo()
  const inspection = sessionStorage.getItem(inspectionKey)
  return [...publications(), ...plans].map((plan) => ({
    ...plan,
    rows: withReleases(plan, saved).rows.map((row) => {
      if (row.id === 'REQEXE-003' && demo.delayed)
        return {
          ...row,
          estimatedArrivalDate: demo.delayedDate,
          transportStatus: '异常',
          deviation: '在途反馈更新，预计到厂改为 10 月 9 日',
        }
      if (row.id === 'REQEXE-004' && inspection)
        return {
          ...row,
          transportStatus: '已到厂',
          receivedQuantity: 300,
          qualifiedQuantity: inspection === 'released' ? 300 : 240,
          qualifiedAvailableDate: row.estimatedArrivalDate,
          inspectionStatus: inspection === 'released' ? '已合格' : '部分冻结',
          deviation: inspection === 'released' ? undefined : '60 吨待复检，暂不可投料',
        }
      return row
    }),
  }))
}

export function simulateMockRequisitionInspection(released: boolean) {
  sessionStorage.setItem(inspectionKey, released ? 'released' : 'held')
}

function supplyKey(materialCode: string, contractId: string, orderId: string) {
  return JSON.stringify([materialCode, contractId, orderId])
}

export function getMockRequisitionSnapshotWithPublications(): RequisitionSnapshot {
  const snapshot = getMockRequisitionSnapshot()
  const planningDemo = getMockRequisitionPlanningDemo()
  const restrictions = listRequisitionRestrictions()
  const planRows = listMockRequisitionExecutionPlans()
  const inspection = planRows.flatMap(({ rows }) => rows).find(({ id }) => id === 'REQEXE-004')
  const confirmed: RequisitionArrival[] = []
  const occupied = new Map<string, number>()
  for (const { id, plant, source, rows } of planRows) {
    if (!source || plant !== snapshot.plant) continue
    for (const row of rows) {
      if (!row.orderId || row.releaseStatus === '已撤回') continue
      const key = supplyKey(source.materialCode, row.contractId, row.orderId)
      occupied.set(key, (occupied.get(key) ?? 0) + row.plannedQuantity)
      if (row.releaseStatus === '下达失败') continue
      const order = snapshot.supplies.find(
        (supply) => supply.id === row.contractId && supply.orderId === row.orderId,
      )
      if (
        order &&
        row.releaseStatus !== '已下达' &&
        !canSupply(
          {
            ...order,
            restrictions: restrictionsFor(order, restrictions),
          },
          row.plannedDate,
        )
      )
        continue
      const received = row.receivedQuantity != null && row.transportStatus === '已到厂'
      confirmed.push({
        id: row.id,
        materialCode: source.materialCode,
        supplierName: row.supplierName,
        contractId: row.contractId,
        orderId: row.orderId,
        orderLineNumber: row.orderLineNumber,
        arrivalPlanNumber: id,
        plannedArrivalDate: row.plannedDate,
        estimatedArrivalTime: row.estimatedArrivalDate,
        date: row.estimatedArrivalDate ?? row.plannedDate,
        quantity: received
          ? (row.receivedQuantity ?? 0)
          : (row.commitmentQuantity ?? row.plannedQuantity),
        ...(received
          ? {
              availableQuantity: row.qualifiedQuantity ?? 0,
              availableDate: row.qualifiedAvailableDate,
            }
          : {}),
        status: row.releaseStatus === '已下达' ? '已下达' : '已确认',
        locked: true,
      })
    }
  }
  return {
    ...snapshot,
    planningDemo,
    fixedArrivals: [
      ...snapshot.fixedArrivals.map((arrival) => {
        if (planningDemo.delayed && arrival.id === planningDemo.arrivalId)
          return {
            ...arrival,
            date: planningDemo.delayedDate,
            estimatedArrivalTime: planningDemo.delayedDate,
          }
        if (arrival.id === 'FIX-004' && inspection?.receivedQuantity) {
          return {
            ...arrival,
            status: '已到厂' as const,
            quantity: inspection.receivedQuantity,
            availableQuantity: inspection.qualifiedQuantity,
            availableDate: inspection.qualifiedAvailableDate,
          }
        }
        return arrival
      }),
      ...confirmed,
    ],
    supplies: snapshot.supplies.map((supply) => {
      const reserved = occupied.get(supplyKey(supply.materialCode, supply.id, supply.orderId)) ?? 0
      return {
        ...supply,
        restrictions: restrictionsFor(supply, restrictions),
        remainingQuantity: Number((supply.remainingQuantity - reserved).toFixed(3)),
      }
    }),
  }
}

function restrictionsFor(
  supply: RequisitionSnapshot['supplies'][number],
  restrictions: ReturnType<typeof listRequisitionRestrictions>,
) {
  return restrictions.filter(
    (item) =>
      item.supplierId === supply.supplierId &&
      item.materialCode === supply.materialCode &&
      (!item.contractId || item.contractId === supply.id),
  )
}

export function publishMockRequisitionPlan(input: RequisitionPlanPublication) {
  const { submissionId, weekStart, materialCode, materialName, plant, unit } = input
  const saved = publications()
  const existing = saved.find(({ source }) => source?.submissionId === submissionId)
  if (existing) return withReleases(existing, releases())

  const suggestions = input.suggestions.filter(({ status }) => status === '建议')
  if (!suggestions.length) throw new Error('当前计划没有新增要货建议。')

  const snapshot = getMockRequisitionSnapshotWithPublications()
  const material = snapshot.materials.find(({ code }) => code === materialCode)
  if (!material || snapshot.plant !== plant) throw new Error('未找到要货物料或工厂。')
  const { warehouseCapacity } = material
  if (warehouseCapacity == null) throw new Error('WMS 仓库上限待补充。')

  const dates = requisitionWeekDates(weekStart)
  if (suggestions.some(({ date, orderId }) => !dates.includes(date) || !orderId)) {
    throw new Error('请核对本周到货日期及采购订单。')
  }
  const [error] = validateRequisitionSuggestions(
    material,
    snapshot.supplies,
    snapshot.fixedArrivals,
    suggestions,
    { startDate: snapshot.startDate, dates, capacity: warehouseCapacity },
  )
  if (error) throw new Error(error)

  const productionIssue = projectRequisition(
    material,
    snapshot.startDate,
    dates,
    snapshot.fixedArrivals,
    suggestions,
  ).find(({ shortage }) => shortage !== 0)
  if (productionIssue) {
    throw new Error(
      productionIssue.shortage === null
        ? '请先补齐本周库存和耗用数据。'
        : `${productionIssue.date} 仍有生产缺口，请先调整到货安排。`,
    )
  }

  const version =
    saved.filter(
      ({ source }) => source?.weekStart === weekStart && source.materialCode === materialCode,
    ).length + 1
  const id = `REQPLN-${weekStart.replaceAll('-', '')}-${materialCode}-V${version}`
  const plan: RequisitionExecutionPlan = {
    id,
    plant,
    source: {
      submissionId,
      weekStart,
      materialCode,
      demandVersion: input.demandVersion,
      inventoryVersion: input.inventoryVersion,
      conditionVersion: input.conditionVersion,
      ...(input.expectedQuantity === undefined ? {} : { expectedQuantity: input.expectedQuantity }),
      warehouseCapacity,
      ...(input.supplierOrder ? { supplierOrder: [...input.supplierOrder] } : {}),
      ...(input.manuallyAdjusted === undefined ? {} : { manuallyAdjusted: input.manuallyAdjusted }),
      ...(input.adjustmentReason ? { adjustmentReason: input.adjustmentReason } : {}),
      ...(input.coordinationId ? { coordinationId: input.coordinationId } : {}),
      confirmedAt: new Date().toISOString(),
    },
    rows: suggestions.map((arrival, index) => ({
      id: `${id}-${index + 1}`,
      contractId: arrival.contractId,
      supplierName: arrival.supplierName,
      orderId: arrival.orderId,
      ...(arrival.orderLineNumber ? { orderLineNumber: arrival.orderLineNumber } : {}),
      materialName,
      unit,
      plannedDate: arrival.date,
      plannedQuantity: arrival.quantity,
      releaseStatus: '待下达',
    })),
  }
  sessionStorage.setItem(publicationsKey, JSON.stringify([plan, ...saved]))
  return plan
}

export function releaseMockRequisitionRows(planId: string, rowIds: string[], retry: boolean) {
  const saved = releases()
  const plan = listMockRequisitionExecutionPlans().find(({ id }) => id === planId)
  const denied = new Set(checkMockRequisitionRelease(planId, rowIds).map(({ rowId }) => rowId))
  for (const row of plan?.rows ?? []) {
    if (denied.has(row.id)) continue
    if (!rowIds.includes(row.id) || row.releaseStatus !== (retry ? '下达失败' : '待下达')) continue
    saved[row.id] =
      row.id === 'REQEXE-007' && !retry
        ? { releaseStatus: '下达失败', releaseError: '模拟：外部系统响应超时，可重试。' }
        : { releaseStatus: '已下达', dispatchReference: 'DEMO-' + row.id }
  }
  sessionStorage.setItem(storageKey, JSON.stringify(saved))
}

export function checkMockRequisitionRelease(
  planId: string,
  rowIds: string[],
): RequisitionReleaseIssue[] {
  const plan = listMockRequisitionExecutionPlans().find(({ id }) => id === planId)
  const snapshot = getMockRequisitionSnapshotWithPublications()
  const material = snapshot.materials.find(({ code }) => code === plan?.source?.materialCode)
  const forecast =
    material && plan?.source
      ? projectRequisition(
          material,
          snapshot.startDate,
          requisitionWeekDates(plan.source.weekStart),
          snapshot.fixedArrivals,
        )
      : []
  return (plan?.rows ?? [])
    .filter(({ id }) => rowIds.includes(id))
    .flatMap((row) => {
      const supply = snapshot.supplies.find(
        ({ id, orderId }) => id === row.contractId && orderId === row.orderId,
      )
      if (!supply || !canSupply(supply, row.plannedDate)) {
        const reason =
          supply && isRequisitionSupplyEmbargoed(supply, row.plannedDate)
            ? '供应商在计划到厂日处于禁运范围，请重新安排该批次。'
            : '采购订单或交付窗口已失效，请核对供货条件。'
        return [{ rowId: row.id, reason }]
      }
      const arrivalDate = row.estimatedArrivalDate ?? row.plannedDate
      const day = forecast.find(({ date }) => date === arrivalDate)
      if (day && material) {
        if (
          day.warehousePeak == null ||
          material.warehouseCapacity == null ||
          material.receivingCapacity == null
        )
          return [{ rowId: row.id, reason: '最新仓容、库存或日收货能力待核实。' }]
        const failedQuantity = row.releaseStatus === '下达失败' ? row.plannedQuantity : 0
        if ((day.fixedArrival ?? 0) + failedQuantity > material.receivingCapacity)
          return [{ rowId: row.id, reason: '预计到厂当日总收货量已超过最新收货上限。' }]
        if (day.warehousePeak + failedQuantity > material.warehouseCapacity)
          return [{ rowId: row.id, reason: '预计到厂当日占仓已超过最新原料仓容。' }]
      }
      return []
    })
}

export function lookupMockRequisitionReceipt(planId: string, rowId: string): string | undefined {
  const row = listMockRequisitionExecutionPlans()
    .find(({ id }) => id === planId)
    ?.rows.find(({ id }) => id === rowId)
  if (row?.dispatchReference) return row.dispatchReference
  if (row?.id !== 'REQEXE-007' || row.releaseStatus !== '下达失败') return
  const reference = `DEMO-${rowId}`
  sessionStorage.setItem(
    storageKey,
    JSON.stringify({
      ...releases(),
      [rowId]: { releaseStatus: '已下达', dispatchReference: reference },
    }),
  )
  return reference
}

export function withdrawMockRequisitionRow(planId: string, rowId: string): void {
  const row = listMockRequisitionExecutionPlans()
    .find(({ id }) => id === planId)
    ?.rows.find(({ id }) => id === rowId)
  if (row?.releaseStatus !== '待下达' || !checkMockRequisitionRelease(planId, [rowId]).length)
    throw new Error('仅可撤回校验受阻的待下达批次。')
  sessionStorage.setItem(
    storageKey,
    JSON.stringify({
      ...releases(),
      [rowId]: { releaseStatus: '已撤回' },
    }),
  )
}
