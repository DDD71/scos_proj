import type { ProcurementOverview, ProcurementSalesDemandRow } from '../model/overview'

// 采购 DEMO procurement-v2.js 的 ORDER_PLAN_ORDERS，产品编码取自库存 DEMO。
const demoOrders = [
  {
    salesOrderNumber: 'SO-202610-01801',
    customerName: '可口可乐',
    productCode: 'FG-F55',
    productName: '果糖F55',
    deliveryDate: '2026-10-18',
    orderQuantity: 3200,
    bomUnitUsage: 0.74,
  },
  {
    salesOrderNumber: 'SO-202610-01806',
    customerName: '百事可乐',
    productCode: 'FG-F42',
    productName: '果糖F42',
    deliveryDate: '2026-10-20',
    orderQuantity: 1800,
    bomUnitUsage: 0.73,
  },
  {
    salesOrderNumber: 'SO-202610-01812',
    customerName: '康师傅',
    productCode: 'FG-F60',
    productName: '果糖F60',
    deliveryDate: '2026-10-22',
    orderQuantity: 1500,
    bomUnitUsage: 0.74,
  },
  {
    salesOrderNumber: 'SO-202610-01818',
    customerName: '不凡帝',
    productCode: 'FG-MALT-MID',
    productName: '麦芽糖中DE',
    deliveryDate: '2026-10-25',
    orderQuantity: 2100,
    bomUnitUsage: 0.71,
  },
  {
    salesOrderNumber: 'SO-202610-01825',
    customerName: '联合利华',
    productCode: 'FG-MALT-HIGH',
    productName: '麦芽糖高DE',
    deliveryDate: '2026-10-28',
    orderQuantity: 1400,
    bomUnitUsage: 0.72,
  },
]

export function getMockProcurementOverview(): ProcurementOverview {
  const salesDemandRows: ProcurementSalesDemandRow[] = demoOrders.map((order) => ({
    ...order,
    orderUnit: '吨',
    cornStarchDemandQuantity: order.orderQuantity * order.bomUnitUsage,
    cornStarchUnit: '吨',
  }))

  return {
    demandMonth: '2026-10',
    pendingProductionSalesOrderCount: salesDemandRows.length,
    cornStarchPurchaseDemand: {
      quantity: salesDemandRows.reduce(
        (total, row) => total + (row.cornStarchDemandQuantity ?? 0),
        0,
      ),
      unit: '吨',
    },
    latestCornStarchPurchasePrice: {
      unitPrice: 3110,
      currency: 'CNY',
      unit: '吨',
      purchaseDate: '2026-11-13',
    },
    salesDemandRows,
    // 2026 年 10 月订单样例的供给假设，单位为吨。
    cornStarchSupply: {
      availableStockQuantity: 4150,
      effectiveInboundQuantity: 2700,
    },
  }
}
