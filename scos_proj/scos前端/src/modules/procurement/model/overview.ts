export interface ProcurementSalesDemandRow {
  salesOrderNumber: string
  salesOrderLineNumber?: string | null
  customerName?: string | null
  productCode: string
  productName?: string | null
  deliveryDate?: string | null
  orderQuantity: number
  orderUnit: string
  bomUnitUsage: number | null
  cornStarchDemandQuantity: number | null
  cornStarchUnit: string
}

export interface ProcurementOverview {
  demandMonth?: string
  pendingProductionSalesOrderCount: number | null
  salesDemandRows?: ProcurementSalesDemandRow[] | null
  cornStarchPurchaseDemand: {
    quantity: number
    unit: string
  } | null
  // 同一工厂和月份的供应量，单位与采购需求一致，有效到货已按订单行去重。
  cornStarchSupply?: {
    availableStockQuantity: number
    effectiveInboundQuantity: number
  } | null
  latestCornStarchPurchasePrice: {
    unitPrice: number
    currency: string
    unit: string
    purchaseDate: string
  } | null
}
