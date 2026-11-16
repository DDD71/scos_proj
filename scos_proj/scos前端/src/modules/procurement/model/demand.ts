export interface ProcurementDemandLine {
  demandDate: string
  grossQuantity: number
  approvedBufferQuantity: number
  availableStockQuantity: number
  effectiveInboundQuantity: number
  openOrderQuantity: number
}

export interface ProcurementDemandVersion {
  planId: string
  versionId: string
  month: string
  plant: string
  materialCode: string
  materialName: string
  unit: string
  publishedAt: string
  lines: ProcurementDemandLine[]
}

export interface ProcurementNetDemandLine extends ProcurementDemandLine {
  netQuantity: number
}

export interface ProcurementNeed {
  lines: ProcurementNetDemandLine[]
  netQuantity: number
}

export function summarizeWeeklyProductionDemand(lines: readonly ProcurementDemandLine[]) {
  const weeks = new Map<string, { startDate: string; endDate: string; grossQuantity: number }>()
  for (const { demandDate, grossQuantity } of lines) {
    const start = new Date(`${demandDate}T00:00:00Z`)
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
    const startDate = start.toISOString().slice(0, 10)
    const week = weeks.get(startDate)
    if (week) {
      week.grossQuantity += grossQuantity
    } else {
      const end = new Date(start)
      end.setUTCDate(end.getUTCDate() + 6)
      weeks.set(startDate, { startDate, endDate: end.toISOString().slice(0, 10), grossQuantity })
    }
  }
  return [...weeks.values()].sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export function calculateProcurementNeed(version: ProcurementDemandVersion): ProcurementNeed {
  // 供应量由快照按期分配，且有效在途与未清订单的剩余供应互不重叠。
  const lines: ProcurementNetDemandLine[] = version.lines.map((line) => {
    const { grossQuantity, approvedBufferQuantity, availableStockQuantity } = line
    const { effectiveInboundQuantity, openOrderQuantity } = line
    const netQuantity = Math.max(
      0,
      grossQuantity +
        approvedBufferQuantity -
        availableStockQuantity -
        effectiveInboundQuantity -
        openOrderQuantity,
    )
    return { ...line, netQuantity: Number(netQuantity.toFixed(3)) }
  })

  const total = lines.reduce((sum, line) => sum + line.netQuantity, 0)
  return { lines, netQuantity: Number(total.toFixed(3)) }
}
