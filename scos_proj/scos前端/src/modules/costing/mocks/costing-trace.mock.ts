import type { CostingQualityCase, QualityDisposition } from '../model/traceability'

// 复检时间早于最后一车的装车时间，库存样例取该车对应的待出库量。
export const mockQualityCases: CostingQualityCase[] = [
  {
    id: 'MOCK-QMS-260818-01',
    batch: '260812-Q01-01',
    reportedAt: '2026-08-18 05:00',
    finding: '果糖 F55 留样复检色值超标',
    documents: [
      {
        id: 'MOCK-WMS-260818-01',
        batch: '260813-F01-01',
        status: '在库',
        source: 'WMS',
        quantity: 7.524,
        unit: '吨',
      },
      {
        id: 'MOCK-TMS-260818-01',
        batch: '20260818-F01-033',
        status: '在途',
        source: 'TMS',
        salesOrder: 'SO-2608-001',
        quantity: 25,
        unit: '吨',
      },
      {
        id: 'MOCK-TMS-260816-01',
        batch: '20260816-F01-001',
        status: '已签收',
        source: 'TMS',
        salesOrder: 'SO-2608-001',
        quantity: 25,
        unit: '吨',
      },
    ],
  },
]

function dispositionKey(scope: string, id: string) {
  return `scos:costing:quality:${scope}:${id}`
}

export function loadMockQualityDisposition(scope: string, id: string): QualityDisposition {
  const saved = localStorage.getItem(dispositionKey(scope, id))
  return saved ? (JSON.parse(saved) as QualityDisposition) : { status: '待处置', history: [] }
}

export function saveMockQualityDisposition(scope: string, id: string, record: QualityDisposition) {
  localStorage.setItem(dispositionKey(scope, id), JSON.stringify(record))
}
