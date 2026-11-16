import { distributeInventoryDemand } from '../domain/inventory'
import type {
  InventoryDailyExecution,
  InventoryProduct,
  InventoryReceipt,
  InventorySnapshot,
} from '../model/types'
import { inventoryHealthHistoryMock } from './inventory-health-history.mock'

const month = '2026-10'
const monthlyDemand = 12000
const stock = { qualified: 2080, allocated: 220, frozen: 40, abnormal: 20 }
const storage = { group: 'DED-F55', capacity: 6200, occupancy: 3050 }
const orders = {
  '2026-10-02': 760,
  '2026-10-06': 680,
  '2026-10-11': 820,
  '2026-10-16': 740,
  '2026-10-21': 900,
  '2026-10-27': 860,
  '2026-10-30': 720,
}

function receivedWorkshopLot(
  quantity: number,
  workshopAt: string,
  transferStartedAt: string,
  receivedAt: string,
): InventoryReceipt {
  return {
    date: receivedAt.slice(0, 10),
    quantity,
    confirmed: true,
    production: {
      workshopAt: `${workshopAt}:00+08:00`,
      transferStartedAt: `${transferStartedAt}:00+08:00`,
      warehouseAt: `${receivedAt}:00+08:00`,
      receivedAt: `${receivedAt}:00+08:00`,
    },
  }
}

const septemberExecution = inventoryHealthHistoryMock
  .find((record) => record.period === '2026-09')!
  .days.slice(-6)
const septemberCarryover = 25
const octoberCloseDate = '2026-10-12'
const finishedLots = [
  // 9 月底三批车间成品等待统一放行，仍在途时不计入 WMS 可用库存。
  ...septemberExecution
    .slice(1, 4)
    .flatMap(({ date, actual }) => [
      receivedWorkshopLot(
        actual!.availableReceipt!,
        `${date}T08:00`,
        `${date}T08:30`,
        `${date}T11:30`,
      ),
      receivedWorkshopLot(300, `${date}T22:30`, '2026-09-28T22:45', '2026-09-29T01:30'),
    ]),
  receivedWorkshopLot(
    septemberExecution.at(-1)!.actual!.availableReceipt!,
    '2026-09-30T08:00',
    '2026-09-30T08:30',
    '2026-09-30T11:30',
  ),
  receivedWorkshopLot(
    septemberCarryover,
    '2026-09-30T22:00',
    '2026-09-30T22:30',
    '2026-10-01T01:30',
  ),
  receivedWorkshopLot(250, '2026-10-02T22:00', '2026-10-02T22:30', '2026-10-03T01:30'),
  receivedWorkshopLot(500, '2026-10-03T08:00', '2026-10-03T08:30', '2026-10-03T11:30'),
  receivedWorkshopLot(300, '2026-10-06T22:00', '2026-10-06T22:30', '2026-10-07T01:30'),
  receivedWorkshopLot(500, '2026-10-07T08:00', '2026-10-07T08:30', '2026-10-07T11:30'),
  receivedWorkshopLot(450, '2026-10-08T22:00', '2026-10-08T22:30', '2026-10-09T01:30'),
  receivedWorkshopLot(400, '2026-10-09T08:00', '2026-10-09T08:30', '2026-10-09T11:30'),
  receivedWorkshopLot(350, '2026-10-09T16:00', '2026-10-09T16:30', '2026-10-09T19:30'),
  receivedWorkshopLot(119, '2026-10-11T08:00', '2026-10-11T08:30', '2026-10-11T11:30'),
  receivedWorkshopLot(80, '2026-10-12T08:00', '2026-10-12T08:30', '2026-10-12T11:30'),
]
const scheduledLots: InventoryReceipt[] = [
  {
    date: '2026-10-15',
    quantity: 350,
    confirmed: true,
    production: {
      workshopAt: '2026-10-15T08:00:00+08:00',
      warehouseAt: '2026-10-15T11:30:00+08:00',
    },
  },
]
const octoberDemand = distributeInventoryDemand(month, monthlyDemand, {
  ...orders,
  '2026-10-01': 260,
  '2026-10-03': 295,
  '2026-10-04': 240,
  '2026-10-05': 285,
  '2026-10-07': 250,
  '2026-10-08': 320,
  '2026-10-09': 240,
  '2026-10-10': 270,
  [octoberCloseDate]: 200,
})

let octoberOpeningStock = septemberExecution.at(-1)!.actual!.closingStock!
const octoberExecution: InventoryDailyExecution[] = Object.entries(octoberDemand)
  .filter(([date]) => date <= octoberCloseDate)
  .map(([date, outbound]) => {
    const production = finishedLots.reduce(
      (sum, lot) => sum + (lot.production!.workshopAt.startsWith(date) ? lot.quantity : 0),
      0,
    )
    const availableReceipt = finishedLots.reduce(
      (sum, lot) => sum + (lot.date === date ? lot.quantity : 0),
      0,
    )
    const actualOutbound = date === octoberCloseDate ? 220 : outbound
    const actual = {
      production,
      availableReceipt,
      outbound: actualOutbound,
      closingStock: octoberOpeningStock + availableReceipt - actualOutbound,
    }
    // 当天先按 100 吨产量和 200 吨出货下达计划，实际日结后保留两套数。
    const planned =
      date === octoberCloseDate
        ? {
            production: 100,
            availableReceipt: 100,
            outbound,
            closingStock: octoberOpeningStock + 100 - outbound,
          }
        : { ...actual }
    octoberOpeningStock = actual.closingStock
    return { date, planned, actual }
  })

// 物料、库存和需求沿用业务蓝图 DEMO。月度额度及生产占用为本地演示基准。
const f55: InventoryProduct = {
  code: 'FG-F55',
  name: '果糖F55',
  category: '果糖类',
  abcClass: 'A',
  unit: '吨',
  monthlyDemand,
  monthlyProduction: {
    quota: 9800,
    completed: octoberExecution.reduce((sum, day) => sum + day.actual!.production!, 0),
    scheduled: scheduledLots.reduce((sum, lot) => sum + lot.quantity, 0),
  },
  availableStock: stock.qualified - stock.allocated - stock.frozen - stock.abnormal,
  allocatedStock: stock.allocated,
  physicalStock: storage.occupancy,
  capacity: storage.capacity,
  storageType: 'dedicated',
  storageGroup: storage.group,
  historyMean: 400,
  historyStdDev: 46.8,
  policy: { type: 'dynamic', serviceLevel: 98, leadDays: 3, reviewDays: 1, staticSafetyStock: 0 },
  dailyDemand: {
    ...Object.fromEntries(septemberExecution.map(({ date, planned }) => [date, planned.outbound!])),
    ...octoberDemand,
  },
  explicitOrderDates: Object.keys(orders),
  receipts: [...finishedLots, ...scheduledLots],
  dailyExecution: [...septemberExecution, ...octoberExecution],
}

export function getMockInventorySnapshot(): InventorySnapshot {
  return structuredClone({
    plant: '中粮太仓工厂',
    snapshotId: 'STKSNP20260928002',
    snapshotTime: '2026-09-28T23:00:00+08:00',
    strategyVersion: 'STGY-V1.2',
    month,
    startDate: '2026-09-26',
    openingDate: '2026-09-29',
    days: 28,
    lockDays: 7,
    capacity: storage.capacity,
    monthlyProductionLimit: null,
    weeklyPlanVersion: 'WP-20260926-V1',
    monthlyPlanVersion: 'MP-202610-V1',
    products: [f55],
  })
}
