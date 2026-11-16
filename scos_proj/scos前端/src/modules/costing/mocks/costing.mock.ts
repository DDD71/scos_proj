import demoUrl from './costing-demo.json?url'
import type { CostingFinancialSnapshot, CostingSnapshot } from '../model/snapshot'
import { mockQualityCases } from './costing-trace.mock'

// 沿用管理决策 DEMO 的财务样例，金额统一换算为元。本期收入和成本从订单明细计算。
const financial: CostingFinancialSnapshot = {
  version: 'DEMO-FIN-202608',
  history: [
    {
      period: '2026-03',
      revenue: 20350000,
      fullCost: 17640000,
      cashflow: 2750000,
      inventory: 6800000,
      receivables: 8500000,
      payables: 6200000,
      dio: 21.5,
      dso: 52,
      dpo: 30,
    },
    {
      period: '2026-04',
      revenue: 21080000,
      fullCost: 18140000,
      cashflow: 2840000,
      inventory: 6720000,
      receivables: 8720000,
      payables: 6310000,
      dio: 21,
      dso: 51.2,
      dpo: 30.2,
    },
    {
      period: '2026-05',
      revenue: 21660000,
      fullCost: 18500000,
      cashflow: 3020000,
      inventory: 6580000,
      receivables: 8950000,
      payables: 6450000,
      dio: 20.4,
      dso: 50.5,
      dpo: 30.4,
    },
    {
      period: '2026-06',
      revenue: 22390000,
      fullCost: 18850000,
      cashflow: 3180000,
      inventory: 6420000,
      receivables: 9060000,
      payables: 6600000,
      dio: 19.8,
      dso: 50,
      dpo: 30.6,
    },
    {
      period: '2026-07',
      revenue: 22780000,
      fullCost: 19160000,
      cashflow: 3560000,
      inventory: 6350000,
      receivables: 9180000,
      payables: 6720000,
      dio: 19.1,
      dso: 49.7,
      dpo: 30.8,
    },
    {
      period: '2026-08',
      cashflow: 3720000,
      inventory: 6200000,
      receivables: 9180000,
      payables: 6860000,
      nonCash: 420000,
      dio: 18.6,
      dso: 49.4,
      dpo: 31,
    },
  ],
  budget: {
    period: '2026-08',
    revenue: 24000000,
    fullCost: 19900000,
    cashflow: 3850000,
    inventory: 6000000,
    receivables: 8800000,
    payables: 7000000,
  },
  priorYear: {
    period: '2025-08',
    revenue: 21050000,
    fullCost: 18080000,
    cashflow: 3010000,
    inventory: 7050000,
    receivables: 8420000,
    payables: 6180000,
  },
}

export async function loadMockCostingSnapshot(): Promise<CostingSnapshot> {
  const response = await fetch(demoUrl)
  if (!response.ok) throw new Error('成本分析演示快照读取失败。')
  const snapshot = (await response.json()) as CostingSnapshot
  return {
    ...snapshot,
    financial,
    qualityCases: mockQualityCases,
    poolExampleCodes: [
      'POOL_PROD_LABOR',
      'POOL_ELECTRICITY',
      'POOL_STEAM',
      'POOL_DEPRECIATION',
      'POOL_LONG_CYCLE',
    ],
    // 两个独立的演示期基准，用于展示同比和环比，不归入本期订单或财务数据。
    batchCostBenchmarks: [
      {
        factory: snapshot.context.factory,
        period: '2026-07',
        line: '果葡糖浆',
        stage: '成品罐批次',
        material: '果糖F55',
        unit: '吨',
        totalCost: 3500000,
        quantity: 1000,
        version: 'DEMO-COST-202607',
        source: 'Mock 历史批次成本',
      },
      {
        factory: snapshot.context.factory,
        period: '2025-08',
        line: '果葡糖浆',
        stage: '成品罐批次',
        material: '果糖F55',
        unit: '吨',
        totalCost: 3420000,
        quantity: 1000,
        version: 'DEMO-COST-202508',
        source: 'Mock 历史批次成本',
      },
    ],
    // 原型补充的标准成本样例。正式值按 SAP 成本 BOM 的有效版本读取。
    standardCosts: [
      {
        material: '果糖F55',
        stage: '成品罐批次',
        version: 'DEMO-SAP-BOM-F55-202608',
        unitCost: 3500,
        unit: '吨',
      },
    ],
  }
}
