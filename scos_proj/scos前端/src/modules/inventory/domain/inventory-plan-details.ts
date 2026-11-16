import type { InventoryProduct, InventoryProjectionDay } from '../model/types'

interface ProductionTransfer {
  quantity: number
  workshopAt: string
  warehouseAt: string
  status: '计划入库' | '在途' | '已入库'
}

export function buildInventoryPlanDetails(
  rows: readonly InventoryProjectionDay[],
  product: InventoryProduct,
  snapshotTime: string,
) {
  const snapshotTimestamp = Date.parse(snapshotTime)
  const workshopByDate = new Map<string, number>()
  const transfersByDate = new Map<string, ProductionTransfer[]>()
  const missingTimingDates = new Set<string>()

  for (const receipt of product.receipts) {
    if (!receipt.confirmed || receipt.quantity <= 0) continue
    const timing = receipt.production
    if (!timing) {
      missingTimingDates.add(receipt.date)
      continue
    }

    const receivedAt =
      timing.receivedAt && Date.parse(timing.receivedAt) <= snapshotTimestamp
        ? timing.receivedAt
        : undefined
    const hasStartedTransfer =
      timing.transferStartedAt && Date.parse(timing.transferStartedAt) <= snapshotTimestamp
    const warehouseAt = receivedAt ?? timing.warehouseAt
    const warehouseDate = warehouseAt.slice(0, 10)
    const workshopDate = timing.workshopAt.slice(0, 10)
    const transfer: ProductionTransfer = {
      quantity: receipt.quantity,
      workshopAt: timing.workshopAt,
      warehouseAt,
      status: receivedAt ? '已入库' : hasStartedTransfer ? '在途' : '计划入库',
    }
    workshopByDate.set(workshopDate, (workshopByDate.get(workshopDate) ?? 0) + receipt.quantity)
    const transfers = transfersByDate.get(warehouseDate) ?? []
    transfers.push(transfer)
    transfersByDate.set(warehouseDate, transfers)
  }

  return rows.map((row) => {
    const productionTransfers = transfersByDate.get(row.date) ?? []
    const canUseZero = workshopByDate.size > 0 && row.confirmedReceipt !== null
    const missingTiming = missingTimingDates.has(row.date)
    const workshopOutput = workshopByDate.get(row.date) ?? (canUseZero ? 0 : null)
    const warehouseReceipt = productionTransfers.reduce(
      (sum, transfer) => sum + transfer.quantity,
      0,
    )

    return {
      ...row,
      workshopOutput: missingTiming ? null : workshopOutput,
      warehouseReceipt:
        !missingTiming && (productionTransfers.length > 0 || canUseZero) ? warehouseReceipt : null,
      productionTransfers,
    }
  })
}
