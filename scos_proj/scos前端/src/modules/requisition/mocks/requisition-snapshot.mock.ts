import type {
  RequisitionArrival,
  RequisitionMaterial,
  RequisitionSnapshot,
  RequisitionSupply,
} from '../model/types'

const startDate = '2026-09-30'
const cornStarch = 'RM-CORN-STARCH'

function dailyDemand(values: number[]): RequisitionMaterial['dailyDemand'] {
  const start = new Date(`${startDate}T00:00:00Z`)
  return Object.fromEntries(
    values.map((value, index) => {
      const date = new Date(start)
      date.setUTCDate(date.getUTCDate() + index)
      return [date.toISOString().slice(0, 10), value]
    }),
  )
}

const releasedDemand = 'APS已发布日度原材料需求'

// 沿用业务蓝图 DEMO 的 2026-09-29 快照、可用库存与日需求。
const materials: Omit<RequisitionMaterial, 'onHandStock'>[] = [
  {
    code: cornStarch,
    name: '玉米淀粉',
    category: '原料',
    unit: '吨',
    availableStock: 1950,
    // WMS 仓库上限演示值。
    warehouseCapacity: 2600,
    receivingCapacity: 1200,
    safetyBuffer: 20,
    demandSource: releasedDemand,
    dailyDemand: dailyDemand([
      390, 420, 405, 440, 460, 430, 400, 395, 425, 410, 445, 455, 420, 390, 400, 435, 450, 430, 415,
      405, 440, 455, 425, 395, 410, 445, 460, 430,
    ]),
  },
  {
    code: 'RM-ENZ-101',
    name: '液化酶',
    category: '辅料',
    unit: '吨',
    availableStock: 31,
    warehouseCapacity: null,
    receivingCapacity: 20,
    demandSource: releasedDemand,
    dailyDemand: dailyDemand([
      1, 1.1, 1, 1.2, 1.3, 1.1, 0.9, 1, 1.1, 1, 1.2, 1.3, 1.1, 0.9, 1, 1.1, 1.2, 1.1, 1, 1, 1.2,
      1.3, 1.1, 0.9, 1, 1.1, 1.2, 1.1,
    ]),
  },
  {
    code: 'RM-ENZ-102',
    name: '糖化酶',
    category: '辅料',
    unit: '吨',
    availableStock: 26,
    warehouseCapacity: null,
    receivingCapacity: 20,
    demandSource: releasedDemand,
    dailyDemand: dailyDemand([
      0.8, 0.9, 0.8, 1, 1.1, 0.9, 0.7, 0.8, 0.9, 0.8, 1, 1.1, 0.9, 0.7, 0.8, 0.9, 1, 0.9, 0.8, 0.8,
      1, 1.1, 0.9, 0.7, 0.8, 0.9, 1, 0.9,
    ]),
  },
  {
    code: 'RM-AC-201',
    name: '活性炭',
    category: '辅料',
    unit: '吨',
    availableStock: 38,
    warehouseCapacity: null,
    receivingCapacity: 30,
    demandSource: releasedDemand,
    dailyDemand: dailyDemand([
      1.8, 2, 1.9, 2.1, 2.2, 2, 1.7, 1.8, 2, 1.9, 2.1, 2.2, 2, 1.7, 1.8, 2, 2.1, 1.9, 1.8, 2, 2.1,
      2.2, 2, 1.7, 1.8, 2, 2.1, 2,
    ]),
  },
  {
    code: 'PK-WB-301',
    name: '聚丙烯编织袋',
    category: '包材',
    unit: '万条',
    availableStock: 18.5,
    warehouseCapacity: null,
    receivingCapacity: 15,
    demandSource: '成品计划按有效BOM换算',
    dailyDemand: dailyDemand([
      0.55, 0.6, 0.58, 0.62, 0.65, 0.6, 0.5, 0.54, 0.61, 0.58, 0.63, 0.66, 0.6, 0.5, 0.55, 0.61,
      0.64, 0.6, 0.57, 0.55, 0.63, 0.66, 0.61, 0.51, 0.55, 0.62, 0.65, 0.6,
    ]),
  },
]

const supplyBase = { materialCode: cornStarch, status: '有效', embargoed: false }
// 合同供货量和已执行量沿用要货 DEMO 的 contractQty、executedQty。
const supplies: RequisitionSupply[] = [
  {
    ...supplyBase,
    id: 'HT-YM-260801',
    orderId: 'PO-202609-001',
    supplierId: 'SUP-001',
    supplierName: '京粮龙江生物工程有限公司',
    signedAt: '2026-08-01',
    validTo: '2026-11-30',
    earliestArrival: '2026-10-01',
    latestArrival: '2026-10-31',
    contractQuantity: 4200,
    executedQuantity: 600,
    remainingQuantity: 3000,
    dailyCapacity: 800,
    minimumQuantity: 300,
    priority: 1,
  },
  {
    ...supplyBase,
    id: 'HT-YM-260806',
    orderId: 'PO-202609-002',
    supplierId: 'SUP-002',
    supplierName: '黑龙江龙凤玉米开发有限公司',
    signedAt: '2026-08-06',
    validTo: '2026-10-31',
    earliestArrival: '2026-10-02',
    latestArrival: '2026-10-28',
    contractQuantity: 3800,
    executedQuantity: 600,
    remainingQuantity: 2700,
    dailyCapacity: 700,
    minimumQuantity: 300,
    priority: 2,
  },
  {
    ...supplyBase,
    id: 'HT-YM-260812',
    orderId: 'PO-202609-003',
    supplierId: 'SUP-003',
    supplierName: '黑龙江昊天玉米开发有限公司',
    signedAt: '2026-08-12',
    validTo: '2026-10-31',
    earliestArrival: '2026-10-04',
    latestArrival: '2026-10-25',
    contractQuantity: 3100,
    executedQuantity: 500,
    remainingQuantity: 2200,
    dailyCapacity: 650,
    minimumQuantity: 250,
    priority: 3,
  },
  {
    ...supplyBase,
    id: 'HT-YM-260818',
    orderId: 'PO-202609-004',
    supplierId: 'SUP-004',
    supplierName: '内蒙古玉王生物科技有限公司',
    signedAt: '2026-08-18',
    validTo: '2026-12-31',
    earliestArrival: '2026-10-01',
    latestArrival: '2026-11-30',
    contractQuantity: 2500,
    executedQuantity: 300,
    remainingQuantity: 1900,
    dailyCapacity: 600,
    minimumQuantity: 200,
    priority: 4,
  },
  {
    ...supplyBase,
    id: 'HT-YM-260822',
    orderId: 'PO-202609-005',
    supplierId: 'SUP-005',
    supplierName: '山东大泽成生物科技有限公司',
    signedAt: '2026-08-22',
    validTo: '2026-11-30',
    earliestArrival: '2026-10-05',
    latestArrival: '2026-11-15',
    contractQuantity: 2000,
    executedQuantity: 100,
    remainingQuantity: 1600,
    dailyCapacity: 500,
    minimumQuantity: 300,
    priority: 5,
    embargoed: true,
  },
]

// 沿用 DEMO 的 FIX 明细编号和执行反馈日期。样例没有订单行号或到厂时分。
const fixedArrivals: RequisitionArrival[] = [
  {
    id: 'FIX-001',
    supply: supplies[0]!,
    plannedArrivalDate: '2026-09-30',
    estimatedArrivalTime: '2026-09-30',
    quantity: 600,
    status: '已下达',
  },
  {
    id: 'FIX-002',
    supply: supplies[1]!,
    plannedArrivalDate: '2026-10-02',
    estimatedArrivalTime: '2026-10-02',
    quantity: 500,
    status: '运输中',
  },
  {
    id: 'FIX-003',
    supply: supplies[2]!,
    plannedArrivalDate: '2026-10-05',
    estimatedArrivalTime: '2026-10-06',
    quantity: 400,
    status: '已确认',
  },
  {
    id: 'FIX-004',
    supply: supplies[4]!,
    plannedArrivalDate: '2026-10-07',
    estimatedArrivalTime: '2026-10-08',
    quantity: 300,
    status: '运输中',
  },
].map(({ supply, ...arrival }) => ({
  ...arrival,
  arrivalPlanNumber: arrival.id,
  date: arrival.estimatedArrivalTime,
  status: arrival.status as RequisitionArrival['status'],
  materialCode: supply.materialCode,
  supplierName: supply.supplierName,
  contractId: supply.id,
  orderId: supply.orderId,
  locked: true,
}))

export function getMockRequisitionSnapshot(): RequisitionSnapshot {
  return structuredClone({
    plant: '中粮太仓工厂',
    snapshotTime: '2026-09-29T08:30:00+08:00',
    startDate,
    demandVersion: 'MATREQ-20260929-V3',
    inventoryVersion: 'WMS-20260929-0800',
    // WMS 库存时点取自 DEMO 版本号中的日期和时分。
    inventorySnapshotTime: '2026-09-29T08:00:00+08:00',
    conditionVersion: 'REQCOND-20260929-V1',
    // 演示快照的期初在库量均可用。
    materials: materials.map((material) => ({ ...material, onHandStock: material.availableStock })),
    fixedArrivals,
    supplies,
  })
}
