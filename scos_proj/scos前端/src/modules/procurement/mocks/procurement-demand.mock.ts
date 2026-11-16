import type { ProcurementDemandLine, ProcurementDemandVersion } from '../model/demand'

const scope = {
  plant: '中粮太仓工厂',
  materialCode: 'RM-CORN-STARCH',
  materialName: '玉米淀粉',
  unit: '吨',
}

// 版本、月毛需求量和发布时间沿用采购 DEMO 的 demandVersions。
// 生产需求周次和分期分配为演示假设，未清订单只计入未计作在途的供应。
function octoberLines(days: string[], quantities: number[]): ProcurementDemandLine[] {
  const allocatedStock = [2000, 1000, 700, 450]
  const allocatedInbound = [900, 1400, 1300, 1100]
  return days.map((day, index) => ({
    demandDate: `2026-10-${day}`,
    grossQuantity: quantities[index]!,
    approvedBufferQuantity: 0,
    availableStockQuantity: allocatedStock[index]!,
    effectiveInboundQuantity: allocatedInbound[index]!,
    openOrderQuantity: 0,
  }))
}

const versions: ProcurementDemandVersion[] = [
  {
    ...scope,
    planId: 'MATDEM-202610',
    versionId: 'MATDEM-202610-V3',
    month: '2026-10',
    publishedAt: '2026-09-28 17:00',
    lines: octoberLines(['07', '14', '21', '28'], [3000, 2700, 2500, 2100]),
  },
  {
    ...scope,
    planId: 'MATDEM-202610',
    versionId: 'MATDEM-202610-V4',
    month: '2026-10',
    publishedAt: '2026-10-09 08:05',
    lines: octoberLines(['14', '21', '28', '31'], [3300, 3200, 3250, 3050]),
  },
  {
    ...scope,
    planId: 'MATDEM-202611',
    versionId: 'MATDEM-202611-V1',
    month: '2026-11',
    publishedAt: '2026-10-12 09:00',
    lines: [
      {
        demandDate: '2026-11-07',
        grossQuantity: 2800,
        approvedBufferQuantity: 50,
        availableStockQuantity: 1700,
        effectiveInboundQuantity: 750,
        openOrderQuantity: 100,
      },
      {
        demandDate: '2026-11-14',
        grossQuantity: 2600,
        approvedBufferQuantity: 50,
        availableStockQuantity: 650,
        effectiveInboundQuantity: 850,
        openOrderQuantity: 350,
      },
      {
        demandDate: '2026-11-21',
        grossQuantity: 2600,
        approvedBufferQuantity: 50,
        availableStockQuantity: 400,
        effectiveInboundQuantity: 600,
        openOrderQuantity: 200,
      },
      {
        demandDate: '2026-11-28',
        grossQuantity: 2600,
        approvedBufferQuantity: 50,
        availableStockQuantity: 250,
        effectiveInboundQuantity: 600,
        openOrderQuantity: 350,
      },
    ],
  },
]

export function listMockPublishedDemandVersions(month: string): ProcurementDemandVersion[] {
  return versions.filter((version) => version.month === month)
}
