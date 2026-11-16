import {
  calculateInventoryPolicy,
  getInventorySnapshot,
  projectInventory,
} from '@/modules/inventory'
import {
  getRequisitionSnapshot,
  listRequisitionCoordination,
  listRequisitionExecutionPlans,
  projectRequisition,
  requisitionExecutionCause,
  requisitionExecutionIssue,
  requisitionWeekDates,
} from '@/modules/requisition'
import type { DashboardRepository } from '../api/dashboard.repository'
import type {
  DashboardAlert,
  DashboardMapNode,
  DashboardMapRoute,
  DashboardTarget,
  DashboardTopic,
} from '../model/types'
import { buildDemoPeriod } from './dashboard-topics.mock'

const inventoryTarget = (code: string): DashboardTarget => ({
  label: '查看库存预测',
  to: `/inventory/overview?product=${encodeURIComponent(code)}`,
})
const executionTarget = (planId: string, rowId: string): DashboardTarget => ({
  label: '查看要货执行',
  to: `/requisition/execution?planId=${encodeURIComponent(planId)}&rowId=${encodeURIComponent(rowId)}`,
})
const format = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })
const tons = (value: number | null | undefined) =>
  value == null ? '待核实' : `${format.format(value)} 吨`
const dateLabel = (iso: string) => iso.slice(5, 10)

// 地图城市位置沿用演示布局口径。数量取所链接的业务样例。
const suppliersOnMap: Record<string, [number, number]> = {
  'SUP-001': [126.11, 46.69],
  'SUP-002': [124.88, 46.41],
  'SUP-003': [126.98, 46.63],
  'SUP-004': [122.27, 43.65],
  'SUP-005': [118.37, 34.91],
}
const supplierLabels: Record<string, string> = {
  'SUP-003': '黑龙江昊天',
  'SUP-005': '山东大泽成',
}
const customers: {
  name: string
  coordinates: [number, number]
  contract: number
  unfulfilled: number
  transit: number
  eta: string
}[] = [
  {
    name: '可口可乐',
    coordinates: [121.0, 31.38],
    contract: 4000,
    unfulfilled: 1680,
    transit: 240,
    eta: '2026-09-30',
  },
  {
    name: '康师傅',
    coordinates: [117.71, 39.01],
    contract: 3200,
    unfulfilled: 1250,
    transit: 125,
    eta: '2026-10-01',
  },
  {
    name: '冠生园',
    coordinates: [121.48, 30.92],
    contract: 1900,
    unfulfilled: 720,
    transit: 80,
    eta: '2026-09-30',
  },
]

export const mockDashboardRepository: DashboardRepository = {
  async getOverview() {
    const [stock, requisition, execution] = await Promise.all([
      getInventorySnapshot(),
      getRequisitionSnapshot(),
      listRequisitionExecutionPlans(),
    ])
    const coordination = new Map(
      (await listRequisitionCoordination()).map((item) => [item.executionRowId, item]),
    )
    const stockDetails = stock.products.map((product) => {
      const policy = calculateInventoryPolicy(product)
      const projection = projectInventory(stock, product).filter(
        ({ date }) => date >= stock.openingDate,
      )
      const risk = projection.find(
        ({ safetyGap, shortage, capacityRisk }) =>
          (safetyGap ?? 0) > 0 || (shortage ?? 0) > 0 || capacityRisk,
      )
      return { product, policy, projection, risk }
    })
    const f55 = stockDetails.find(({ product }) => product.code === 'FG-F55')
    const starch = requisition.materials.find(({ code }) => code === 'RM-CORN-STARCH')
    const snapshotAt = requisition.snapshotTime
    const asOf = snapshotAt.slice(0, 10)
    const alerts: DashboardAlert[] = execution.flatMap((plan) =>
      plan.rows.flatMap((row): DashboardAlert[] => {
        const cause = requisitionExecutionCause(row)
        const issue = cause ? requisitionExecutionIssue(requisition, plan, row) : undefined
        if (!issue) return []
        const source = coordination.get(row.id)
        const delay = Boolean(issue.feedbackDate && issue.feedbackDate > row.plannedDate)
        const impact = issue.shortage ? `${issue.riskDate} 预计缺料 ${tons(issue.shortage)}` : cause
        return [
          {
            id: issue.id,
            domain: 'procurement',
            level:
              issue.shortage &&
              issue.riskDate &&
              issue.feedbackDate &&
              issue.feedbackDate > issue.riskDate
                ? 'urgent'
                : 'warning',
            title: delay
              ? `${issue.materialName}到货延期`
              : `${issue.materialName} · ${row.releaseError ? '下达异常' : '履约偏差'}`,
            detail: `${row.supplierName} · ${impact}`,
            status: source?.status ?? '待处置',
            detectedAt: snapshotAt,
            riskDate: issue.riskDate,
            source: '要货计划 · 下达与执行',
            facts: [
              { label: '供应商', value: row.supplierName },
              { label: '采购订单', value: row.orderId ?? '待核实' },
              { label: '原计划到货', value: `${row.plannedDate} · ${tons(row.plannedQuantity)}` },
              { label: '最新预计到厂', value: issue.feedbackDate ?? '待核实' },
              { label: '执行反馈', value: cause },
              { label: '生产影响', value: issue.riskKnown ? impact : '需核对可用库存和生产耗用' },
              ...(source
                ? [
                    { label: '责任人', value: source.owner },
                    { label: '协调记录', value: source.result },
                  ]
                : []),
            ],
            target: executionTarget(plan.id, row.id),
          },
        ]
      }),
    )
    for (const { product, risk, policy } of stockDetails) {
      if (!risk) continue
      const shortage = (risk.shortage ?? 0) > 0
      const below = (risk.safetyGap ?? 0) > 0
      const reason = shortage ? '预计缺货' : below ? '低于安全库存' : '仓容风险'
      const amount = shortage ? risk.shortage : risk.safetyGap
      alerts.push({
        id: `stock:${product.code}`,
        domain: 'inventory',
        level: shortage ? 'urgent' : 'warning',
        title: `${product.name}${reason}`,
        detail: `${risk.date} · ${amount ? `预计缺口 ${tons(amount)}` : '预计占仓达到上限'}`,
        status: '待处置',
        detectedAt: snapshotAt,
        riskDate: risk.date,
        source: '成品库存优化 · 库存预测',
        facts: [
          { label: '成品', value: product.name },
          { label: '风险日期', value: risk.date },
          { label: '预计期末可用', value: tons(risk.closingStock) },
          { label: '安全库存', value: tons(policy.safetyStock) },
          { label: '风险原因', value: reason },
        ],
        target: {
          label: '查看成品库存与补货',
          to: `/inventory/plans?mode=day&product=${encodeURIComponent(product.code)}`,
        },
      })
    }
    const referenceDates = requisitionWeekDates(requisition.planningDemo?.weekStart ?? '2026-10-05')
    const rawProjection = starch
      ? projectRequisition(starch, requisition.startDate, referenceDates, requisition.fixedArrivals)
      : []
    const inTransit = requisition.fixedArrivals.filter(
      ({ status }) => status === '运输中' || status === '已下达',
    )
    const inventory: Pick<DashboardTopic, 'rows' | 'charts'> = {
      rows: stockDetails.map(({ product, policy, risk }) => ({
        id: product.code,
        name: product.name,
        values: {
          available: product.availableStock,
          safety: policy.safetyStock,
          capacity: product.capacity,
          risk: risk?.date ?? '暂无越线',
        },
        target: inventoryTarget(product.code),
      })),
      charts: [
        {
          title: '果糖F55库存预测与安全水位',
          fallbackRowId: f55?.product.code,
          categories: f55?.projection.slice(0, 14).map(({ date }) => dateLabel(date)) ?? [],
          series: [
            {
              name: '预计可用库存',
              kind: 'line',
              unit: '吨',
              values: f55?.projection.slice(0, 14).map(({ closingStock }) => closingStock) ?? [],
            },
            {
              name: '安全库存',
              kind: 'line',
              unit: '吨',
              values: f55?.projection.slice(0, 14).map(() => f55.policy.safetyStock) ?? [],
            },
            {
              name: '仓容上限',
              kind: 'line',
              unit: '吨',
              values: f55?.projection.slice(0, 14).map(() => f55.product.capacity) ?? [],
            },
          ],
        },
        {
          title: '原辅料库存与在途',
          categories: requisition.materials
            .filter(({ unit }) => unit === '吨')
            .map(({ name }) => name),
          series: [
            {
              name: '可用库存',
              kind: 'bar',
              unit: '吨',
              stack: '在库',
              values: requisition.materials
                .filter(({ unit }) => unit === '吨')
                .map(({ availableStock }) => availableStock),
            },
            {
              name: '不可用占仓',
              kind: 'bar',
              unit: '吨',
              stack: '在库',
              values: requisition.materials
                .filter(({ unit }) => unit === '吨')
                .map(({ availableStock, onHandStock }) =>
                  onHandStock == null || availableStock == null
                    ? null
                    : onHandStock - availableStock,
                ),
            },
            {
              name: '已下达及在途',
              kind: 'bar',
              unit: '吨',
              values: requisition.materials
                .filter(({ unit }) => unit === '吨')
                .map(({ code }) =>
                  inTransit
                    .filter(({ materialCode }) => materialCode === code)
                    .reduce((sum, arrival) => sum + arrival.quantity, 0),
                ),
            },
          ],
        },
      ],
    }
    const procurement: Pick<DashboardTopic, 'rows' | 'charts'> = {
      charts: [
        {
          title: '玉米淀粉逐日到货与耗用',
          categories: rawProjection.map(({ date }) => dateLabel(date)),
          series: [
            {
              name: '收货反馈',
              kind: 'bar',
              unit: '吨',
              values: rawProjection.map(({ date }) => {
                const receipts = requisition.fixedArrivals.filter(
                  (item) =>
                    item.materialCode === starch?.code &&
                    item.date === date &&
                    item.status === '已到厂',
                )
                return receipts.length
                  ? receipts.reduce((sum, item) => sum + item.quantity, 0)
                  : null
              }),
            },
            {
              name: '固定到货',
              kind: 'bar',
              unit: '吨',
              values: rawProjection.map(({ fixedArrival }) => fixedArrival),
            },
            {
              name: '生产耗用',
              kind: 'line',
              unit: '吨',
              values: rawProjection.map(({ demand }) => demand),
            },
          ],
        },
      ],
      rows: execution.flatMap((plan) =>
        plan.rows.map((row) => ({
          id: row.id,
          name: row.supplierName,
          values: {
            date: row.plannedDate,
            qty: row.plannedQuantity,
            eta: row.estimatedArrivalDate ?? null,
            status: row.releaseStatus,
          },
          target: executionTarget(plan.id, row.id),
        })),
      ),
    }

    const factory: DashboardMapNode = {
      id: 'taicang',
      name: '太仓工厂',
      coordinates: [121.13, 31.46],
      kind: 'factory',
      facts: [
        { label: '统计快照', value: asOf },
        { label: '玉米淀粉可用量', value: tons(starch?.availableStock) },
      ],
      target: { label: '查看工厂要货', to: '/requisition/overview' },
    }
    const nodes: DashboardMapNode[] = [factory]
    const routes: DashboardMapRoute[] = []
    for (const supply of requisition.supplies) {
      const coordinates = suppliersOnMap[supply.supplierId]
      if (!coordinates || nodes.some(({ id }) => id === supply.supplierId)) continue
      const latestAlert = alerts.find(
        (item) =>
          item.status !== '已关闭' &&
          item.facts.some(({ label, value }) => label === '采购订单' && value === supply.orderId),
      )
      const target = latestAlert?.target ?? {
        label: '查看已签约供应商',
        to: '/requisition/conditions',
      }
      const arrivals = requisition.fixedArrivals
        .filter(({ contractId, status }) => contractId === supply.id && status !== '已到厂')
        .sort((first, second) => first.date.localeCompare(second.date))
      const facts = [
        { label: '采购订单', value: supply.orderId },
        {
          label: '已下达及在途',
          value: tons(
            inTransit
              .filter(({ contractId }) => contractId === supply.id)
              .reduce((sum, item) => sum + item.quantity, 0),
          ),
        },
        {
          label: '已确认待下达',
          value: tons(
            arrivals
              .filter(({ status }) => status === '已确认')
              .reduce((sum, item) => sum + item.quantity, 0),
          ),
        },
        { label: '最早预计到厂', value: arrivals[0]?.date ?? '暂无安排' },
      ]
      nodes.push({
        id: supply.supplierId,
        name: supply.supplierName,
        mapLabel: supplierLabels[supply.supplierId],
        kind: 'supplier',
        coordinates,
        facts: [{ label: '合同可安排余量', value: tons(supply.remainingQuantity) }, ...facts],
        target,
        alertId: latestAlert?.id,
      })
      routes.push({
        id: `in:${supply.supplierId}`,
        name: `${supply.supplierName} → 太仓工厂`,
        kind: 'inbound',
        from: supply.supplierId,
        to: factory.id,
        facts,
        target,
        alertId: latestAlert?.id,
      })
    }
    customers.forEach((customer, index) => {
      const id = `customer-${index + 1}`
      const facts = [
        { label: '未履约量', value: tons(customer.unfulfilled) },
        { label: '在途量', value: tons(customer.transit) },
        { label: '预计到达', value: customer.eta },
      ]
      nodes.push({
        id,
        name: customer.name,
        mapLabel: customer.name,
        kind: 'customer',
        coordinates: customer.coordinates,
        facts,
      })
      routes.push({
        id: `out:${id}`,
        name: `太仓工厂 → ${customer.name}`,
        kind: 'outbound',
        from: factory.id,
        to: id,
        facts,
      })
    })
    const finishedStocks = stock.products.map(({ availableStock }) => availableStock)
    const finishedStock = finishedStocks.every((value) => value != null)
      ? finishedStocks.reduce((sum, value) => sum + value, 0)
      : null
    return {
      factory: requisition.plant,
      snapshotAt,
      periods: [
        buildDemoPeriod({
          id: '2026-09',
          label: '2026 年 9 月',
          asOf: snapshotAt,
          end: 5,
          inventory,
          procurement,
          finishedStock,
          materialsStock: starch?.availableStock,
          customerFulfillment: customers.map(({ name, contract, unfulfilled }) => ({
            name,
            contract,
            remaining: unfulfilled,
          })),
        }),
        buildDemoPeriod({ id: '2026-08', label: '2026 年 8 月', asOf: '2026-08-31', end: 4 }),
      ],
      alerts,
      nodes,
      routes,
    }
  },
}
