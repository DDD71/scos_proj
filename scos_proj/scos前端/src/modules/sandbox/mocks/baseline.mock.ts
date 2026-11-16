import {
  calculateInventoryPolicy,
  getInventorySnapshot,
  projectInventory,
} from '@/modules/inventory'
import { getRequisitionSnapshot, listRequisitionExecutionPlans } from '@/modules/requisition'
import type { ContractProfile, SandboxBaseline, SandboxLocation } from '../model/types'

const factory: SandboxLocation = { id: 'taicang', name: '太仓工厂', coordinates: [121.13, 31.46] }
const coordinates: Record<string, [number, number]> = {
  'SUP-001': [126.11, 46.69],
  'SUP-002': [124.88, 46.41],
  'SUP-003': [126.98, 46.63],
  'SUP-004': [122.27, 43.65],
  'SUP-005': [118.37, 34.91],
}
const exampleLines: Record<string, string> = {
  'FG-F55': '3#异构化线',
  'FG-F42': '2#糖化线',
  'FG-F60': '果糖F60产线',
  'FG-MALT-LOW': '麦芽糖低DE产线',
  'FG-MALT-HIGH': '麦芽糖高DE产线',
}
const customers = [
  { id: 'C012', name: '可口可乐' },
  { id: 'C013', name: '康师傅' },
  { id: 'C014', name: '统一集团' },
]
// DEMO v3.2 的经营模型样例，独立于正式 BOM、报价和实际费用。
const profiles: ContractProfile[] = [
  {
    id: 'FG-F55',
    name: '果糖F55',
    bomVersion: 'BOM-F55-V3',
    rawUsage: 0.8,
    auxUnit: 118,
    capacity: 350,
    load: 85,
    fixed: 42000,
    energyAtFull: 92,
    energyFactor: 0.65,
    shutdown: 45000,
    startup: 60000,
    rawPrice: 3180,
    salePrice: 3500,
    openingRaw: 480,
  },
  {
    id: 'FG-F42',
    name: '果糖F42',
    bomVersion: 'BOM-F42-V3',
    rawUsage: 0.82,
    auxUnit: 112,
    capacity: 340,
    load: 82,
    fixed: 41000,
    energyAtFull: 88,
    energyFactor: 0.65,
    shutdown: 44000,
    startup: 58000,
    rawPrice: 3170,
    salePrice: 3460,
    openingRaw: 450,
  },
  {
    id: 'M2',
    name: '麦芽糖 M2',
    bomVersion: 'BOM-MALT-M2-V2',
    rawUsage: 0.76,
    auxUnit: 105,
    capacity: 320,
    load: 80,
    fixed: 39000,
    energyAtFull: 86,
    energyFactor: 0.65,
    shutdown: 42000,
    startup: 56000,
    rawPrice: 3150,
    salePrice: 3300,
    openingRaw: 420,
  },
]

export async function loadMockBaseline(): Promise<SandboxBaseline> {
  const [raw, inventory, plans] = await Promise.all([
    getRequisitionSnapshot(),
    getInventorySnapshot(),
    listRequisitionExecutionPlans(),
  ])
  const rows = plans.flatMap((plan) =>
    plan.rows
      .filter((row) => row.releaseStatus !== '已撤回' && row.transportStatus !== '已到厂')
      .map((row) => ({ row, planId: plan.id })),
  )
  const arrivals = raw.fixedArrivals.map((item) => {
    const link =
      rows.find(({ row }) => row.id === item.id) ??
      rows.find(
        ({ row }) =>
          row.contractId === item.contractId &&
          row.orderId === item.orderId &&
          row.plannedDate === (item.plannedArrivalDate ?? item.date) &&
          (!item.orderLineNumber || row.orderLineNumber === item.orderLineNumber),
      )
    const supplier = raw.supplies.find((supply) => supply.id === item.contractId)
    const point = supplier && coordinates[supplier.supplierId]
    return {
      id: item.id,
      label: `${item.supplierName} · ${item.orderId} · ${item.arrivalPlanNumber ?? item.id}`,
      productId: item.materialCode,
      date: item.date,
      plannedDate: item.plannedArrivalDate ?? item.date,
      quantity: item.quantity,
      contractId: item.contractId,
      supplierId: supplier?.supplierId,
      availableDate: item.availableDate,
      availableQuantity: item.availableQuantity,
      sourceId: link ? `execution:${link.row.id}` : item.id,
      target: link
        ? `/requisition/execution?planId=${encodeURIComponent(link.planId)}&rowId=${encodeURIComponent(link.row.id)}`
        : '/requisition/overview',
      locked:
        item.status === '已到厂' ||
        Boolean(item.availableDate && item.availableDate < raw.startDate),
      location:
        supplier && point
          ? { id: supplier.supplierId, name: item.supplierName, coordinates: point }
          : undefined,
    }
  })
  const products = inventory.products.map((product) => {
    const opening =
      projectInventory(inventory, product).find((day) => day.date === raw.startDate)
        ?.openingStock ?? null
    return {
      id: product.code,
      name: product.name,
      unit: product.unit,
      opening,
      physical:
        opening == null
          ? null
          : Math.max(0, opening) + Math.max(0, product.physicalStock - product.availableStock),
      safety: calculateInventoryPolicy(product).safetyStock,
      capacity: product.storageType === 'dedicated' ? product.capacity : null,
      demand: product.dailyDemand,
      inventoryPolicy:
        product.policy.type === 'dynamic'
          ? {
              historyMean: product.historyMean,
              historyStdDev: product.historyStdDev,
              capacity: product.capacity,
              storageType: product.storageType,
              policy: { ...product.policy, type: 'dynamic' as const },
            }
          : undefined,
    }
  })
  const production = inventory.products.flatMap((product) =>
    product.receipts.map((receipt, index) => ({
      id: `${inventory.weeklyPlanVersion}-${product.code}-${index + 1}`,
      lineId: product.code,
      lineName: exampleLines[product.code] ?? product.name,
      productId: product.code,
      availableDate: receipt.date,
      quantity: receipt.quantity,
      confirmed: receipt.confirmed,
    })),
  )
  // 从库存样例中抽取已包含在日需求中的订单，避免重复累加基线需求。
  const orders = inventory.products
    .filter((product) => product.code === 'FG-F55' || product.code === 'FG-F42')
    .flatMap((product) => {
      const profile = profiles.find((item) => item.id === product.code)!
      return product.explicitOrderDates.map((date, index) => {
        const customer = customers[index % customers.length]!
        const id = `SO-${date.replaceAll('-', '')}-${product.code}`
        return {
          id,
          name: `${customer.name} · ${product.name} · ${id}`,
          productId: product.code,
          date,
          quantity: product.dailyDemand[date]!,
          rawUsage: profile.rawUsage,
          customerId: customer.id,
        }
      })
    })
  const baseline: Omit<SandboxBaseline, 'id'> = {
    plant: raw.plant,
    time: raw.snapshotTime,
    start: raw.startDate,
    modelVersion: 'SCOS-SANDBOX-DEMO-V1',
    versions: [
      { name: '原料库存', value: raw.inventoryVersion },
      { name: '已发布原料需求', value: raw.demandVersion },
      { name: '到货与合同条件', value: raw.conditionVersion },
      { name: '成品库存', value: inventory.snapshotId },
      { name: '成品库存策略', value: inventory.strategyVersion },
      { name: '生产补充计划', value: inventory.weeklyPlanVersion },
      { name: '合同模型样例', value: 'DEMO v3.2' },
    ],
    factoryLocation: factory,
    arrivals,
    production,
    orders,
    customers,
    profiles,
    products: [
      ...raw.materials.map((item) => ({
        id: item.code,
        name: item.name,
        unit: item.unit,
        opening: item.availableStock,
        physical: item.onHandStock,
        safety: item.safetyBuffer ?? null,
        capacity: item.warehouseCapacity,
        receivingCapacity: item.receivingCapacity,
        demand: item.dailyDemand,
      })),
      ...products,
    ],
    mitigations: raw.supplies
      .filter((item) => !item.embargoed && item.remainingQuantity > 0)
      .map((item) => ({
        id: item.id,
        supplierId: item.supplierId,
        label: item.supplierName,
        productId: item.materialCode,
        earliest: item.earliestArrival,
        latest: item.latestArrival,
        minimum: item.minimumQuantity,
        maximum: item.remainingQuantity,
        dailyMaximum: item.dailyCapacity,
        restrictions: item.restrictions
          ?.filter((restriction) => restriction.status === '已确认')
          .map(({ effectiveDate, action }) => ({ effectiveDate, blocked: action === '禁运' })),
      })),
  }
  let fingerprint = 2166136261
  for (const character of JSON.stringify(baseline))
    fingerprint = Math.imul(fingerprint ^ character.codePointAt(0)!, 16777619)
  return { ...baseline, id: `SCOS-${raw.snapshotTime}-${(fingerprint >>> 0).toString(16)}` }
}
