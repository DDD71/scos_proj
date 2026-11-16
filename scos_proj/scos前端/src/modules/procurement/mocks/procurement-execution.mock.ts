import {
  executionOrderKey,
  type ProcurementExecutionOrder,
  type ProcurementRollingAssessment,
} from '../model/execution'
import { listMockPublishedDemandVersions } from './procurement-demand.mock'
import { listMockHistory } from './procurement-history.mock'

const basePlanNumber = 'PUR-202610-V1'
const material = { materialCode: 'RM-CORN-STARCH', materialName: '玉米淀粉', unit: '吨' }

// 订单号、供应商、数量、状态和预警沿用采购 DEMO。行号和事件引用用于展示接口结构。
const orders: ProcurementExecutionOrder[] = [
  {
    ...material,
    purchaseOrderNumber: 'PO-20261001-001',
    purchaseOrderLineNumber: '10',
    contractNumber: 'CTR-202610-01',
    supplierCode: 'SUP-001',
    supplierName: '京粮龙江生物工程有限公司',
    purchaseQuantity: 3200,
    shippedQuantity: 3200,
    receivedQuantity: 2400,
    openDeliveryQuantity: 800,
    qualifiedQuantity: 2400,
    plannedArrivalDate: '2026-10-03',
    estimatedArrivalTime: '2026-10-03',
    executionStatus: '部分到货',
    inspectionStatus: '已判定',
    updatedAt: '2026-10-03 14:20',
    arrivals: [
      {
        transportNumber: 'TMS-DEMO-001',
        committedQuantity: 2400,
        unit: '吨',
        actualArrivalTime: '2026-10-03',
        status: '已到厂',
      },
      { transportNumber: 'TMS-DEMO-002', committedQuantity: 800, unit: '吨', status: '运输中' },
    ],
    events: [
      { source: 'SAP', description: '采购订单行创建', occurredAt: '2026-10-01 09:20' },
      { source: 'TMS', description: '分批发运，共 3,200 吨', reference: 'TMS-DEMO-001' },
      { source: 'TMS', description: '部分到厂，其余批次仍待到厂' },
      { source: 'SAP', description: '已收货 2,400 吨' },
      { source: 'QMS/LIMS', description: '已判定合格 2,400 吨', occurredAt: '2026-10-03 14:20' },
    ],
  },
  {
    ...material,
    purchaseOrderNumber: 'PO-20261001-002',
    purchaseOrderLineNumber: '10',
    contractNumber: 'CTR-202610-02',
    supplierCode: 'SUP-004',
    supplierName: '内蒙古玉王生物科技有限公司',
    purchaseQuantity: 2700,
    shippedQuantity: 2700,
    receivedQuantity: 0,
    openDeliveryQuantity: 2700,
    qualifiedQuantity: 0,
    plannedArrivalDate: '2026-10-04',
    estimatedArrivalTime: '2026-10-04',
    executionStatus: '运输中',
    updatedAt: '2026-10-03 13:45',
    arrivals: [
      {
        transportNumber: 'TMS-DEMO-003',
        committedQuantity: 2700,
        unit: '吨',
        shippedOn: '2026-10-03',
        estimatedArrivalTime: '2026-10-04',
        status: '运输中',
      },
    ],
    events: [
      { source: 'SAP', description: '采购订单行创建', occurredAt: '2026-10-01 09:20' },
      { source: 'TMS', description: '已发运 2,700 吨，运输中', occurredAt: '2026-10-03 13:45' },
    ],
  },
  {
    ...material,
    purchaseOrderNumber: 'PO-20261001-003',
    purchaseOrderLineNumber: '10',
    contractNumber: 'CTR-202610-03',
    supplierCode: 'SUP-002',
    supplierName: '黑龙江龙凤玉米开发有限公司',
    purchaseQuantity: 2600,
    shippedQuantity: 1200,
    receivedQuantity: 0,
    openDeliveryQuantity: 2600,
    qualifiedQuantity: 0,
    executionStatus: '暂停执行',
    updatedAt: '2026-10-09 07:40',
    risk: {
      type: '无限期延期',
      reason: '供应商反馈剩余未执行量无限期延期，暂时无法继续执行。',
      affectedQuantity: 1400,
    },
    events: [
      { source: 'SAP', description: '采购订单行创建', occurredAt: '2026-10-01 09:20' },
      { source: 'TMS', description: '已发运 1,200 吨' },
      { source: 'E采', description: '供应商反馈剩余未执行量延期', occurredAt: '2026-10-09 07:40' },
    ],
  },
  {
    ...material,
    purchaseOrderNumber: 'PO-20261001-004',
    purchaseOrderLineNumber: '10',
    contractNumber: 'CTR-202610-04',
    supplierCode: 'SUP-003',
    supplierName: '黑龙江昊天玉米开发有限公司',
    purchaseQuantity: 1800,
    shippedQuantity: 0,
    receivedQuantity: 0,
    openDeliveryQuantity: 1800,
    qualifiedQuantity: 0,
    executionStatus: '终止处理中',
    updatedAt: '2026-10-09 07:55',
    risk: {
      type: '质量终止',
      reason: '近期连续批次出现质量问题，需要终止合同并转移剩余未执行量。',
      affectedQuantity: 1800,
    },
    events: [
      { source: 'SAP', description: '采购订单行创建', occurredAt: '2026-10-01 09:20' },
      { source: 'CON', description: '合同终止处理中', occurredAt: '2026-10-09 07:55' },
    ],
  },
]

export function listMockExecution(planNumber: string): ProcurementExecutionOrder[] {
  return planNumber === basePlanNumber ? orders : []
}

export function getMockRollingAssessment(
  planNumber: string,
  orderKeys: string[],
): ProcurementRollingAssessment | null {
  const plan = listMockHistory().find((row) => row.planNumber === planNumber)
  if (planNumber !== basePlanNumber || !plan?.month) return null

  const versions = listMockPublishedDemandVersions(plan.month)
  const baseline = versions.find((version) => version.versionId === 'MATDEM-202610-V3')
  const latest = versions.find((version) => version.versionId === 'MATDEM-202610-V4')
  if (!baseline || !latest) return null

  const baselineDemand = baseline.lines.reduce((sum, line) => sum + line.grossQuantity, 0)
  const latestDemand = latest.lines.reduce((sum, line) => sum + line.grossQuantity, 0)
  const planOrders = listMockExecution(planNumber)
  const affectedOrders = planOrders.flatMap((order) => {
    const key = executionOrderKey(order)
    const risk = order.risk
    if (!orderKeys.includes(key) || !risk?.affectedQuantity) return []
    return [
      {
        orderKey: key,
        supplierName: order.supplierName,
        riskType: risk.type,
        reason: risk.reason,
        quantity: risk.affectedQuantity,
      },
    ]
  })

  return {
    basePlanNumber: planNumber,
    latestDemandVersion: latest.versionId,
    baselineDemand,
    latestDemand,
    demandIncrease: Math.max(0, latestDemand - baselineDemand),
    protectedQuantity:
      baselineDemand -
      planOrders.reduce((sum, order) => sum + (order.risk?.affectedQuantity ?? 0), 0),
    unit: latest.unit,
    affectedOrders,
  }
}
