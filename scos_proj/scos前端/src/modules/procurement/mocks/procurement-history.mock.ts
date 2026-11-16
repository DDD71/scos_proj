import type { ProcurementHistoryRow } from '../model/history'

const history: ProcurementHistoryRow[] = [
  {
    planNumber: 'PUR-202610-V1',
    month: '2026-10',
    plant: '中粮太仓工厂',
    materialCode: 'RM-CORN-STARCH',
    materialName: '玉米淀粉',
    plannedQuantity: 10300,
    publishedAt: '2026-09-29 09:28',
    unit: '吨',
    status: '已发布',
  },
  {
    planNumber: 'PUR-202609-V2',
    month: '2026-09',
    plant: '中粮太仓工厂',
    materialCode: 'RM-CORN-STARCH',
    materialName: '玉米淀粉',
    plannedQuantity: 9800,
    publishedAt: '2026-08-29 16:18',
    unit: '吨',
    status: '已发布',
  },
  {
    planNumber: 'MOCK-202609-02',
    month: '2026-09',
    plant: 'MOCK-TC',
    materialCode: 'MOCK-GL',
    plannedQuantity: 320,
    unit: '吨',
    status: '已归档',
  },
  {
    planNumber: 'MOCK-202609-01',
    month: '2026-09',
    plant: 'MOCK-TC',
    materialCode: 'MOCK-CS',
    plannedQuantity: 760,
    unit: '吨',
    status: '已归档',
  },
  {
    planNumber: 'MOCK-202608-02',
    month: '2026-08',
    plant: 'MOCK-TC',
    materialCode: 'MOCK-GL',
    plannedQuantity: 280,
    unit: '吨',
    status: '已归档',
  },
  {
    planNumber: 'MOCK-202608-01',
    month: '2026-08',
    plant: 'MOCK-TC',
    materialCode: 'MOCK-CS',
    plannedQuantity: 680,
    unit: '吨',
    status: '已归档',
  },
]

export function listMockHistory(): ProcurementHistoryRow[] {
  return history.map((plan) => ({ ...plan }))
}
