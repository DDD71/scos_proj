import type { InventoryException } from '../model/inventory-exception'

export const inventoryExceptionMock: readonly InventoryException[] = [
  {
    id: 'INV-EXC-20261007-01',
    date: '2026-10-07',
    products: ['FG-F55'],
    reason: '生产补充周期延长',
    change: '果糖F55产线检修，预计生产补充周期由 3 天延长至 5 天。',
    risk: '原补货点可能不足以覆盖延长后的生产补充周期。',
  },
]
