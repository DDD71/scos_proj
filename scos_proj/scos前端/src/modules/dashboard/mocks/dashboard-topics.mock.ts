import type {
  DashboardChart,
  DashboardMetric,
  DashboardPeriod,
  DashboardTopic,
} from '../model/types'

const months = ['4月', '5月', '6月', '7月', '8月', '9月']
const sales = [10340, 10910, 11840, 11420, 12270, 12860]
const revenue = [3538, 3723, 4061, 3919, 4274, 4501]
const costs = [3216, 3380, 3525, 3501, 3635, 3722]
const profits = revenue.map((value, index) => value - costs[index]!)
const productionPlan = [10400, 11100, 12000, 11900, 12500, 13000]
const productionActual = [10160, 10590, 11200, 11150, 11550, 12246]
const onTime = [92.5, 93.2, 94.8, 95.1, 94.8, 96.4]
const purchase = [8600, 9200, 9500, 9760, 9940, 10300]
const purchaseCost = [2580, 2797, 2898, 3006, 3235, 3296]
const purchasePrice = purchaseCost.map((value, index) =>
  Math.round((value * 1e4) / purchase[index]!),
)
const cycle = [53, 51, 50, 49, 48, 45]
const supplierRate = [92.5, 93.1, 94.5, 95.4, 97, 95.8]
const finishedDays = [9.8, 9.5, 9.1, 8.9, 8.7, 8.2]
const materialDays = [1.6, 1.5, 1.4, 1.4, 1.4, 1.3]
const productionCost = [2702, 2866, 2953, 3008, 3233, 3146]
const unitProductionCost = productionCost.map((cost, index) =>
  Math.round((cost * 1e4) / productionActual[index]!),
)

type PeriodInput = {
  id: string
  label: string
  asOf: string
  end: number
  inventory?: Pick<DashboardTopic, 'rows' | 'charts'>
  procurement?: Pick<DashboardTopic, 'rows' | 'charts'>
  materialsStock?: number | null
  finishedStock?: number | null
  customerFulfillment?: { name: string; contract: number; remaining: number }[]
}

export function buildDemoPeriod(input: PeriodInput): DashboardPeriod {
  const { id, label, asOf, end } = input
  const customerFulfillment = input.customerFulfillment
  const window = <T>(values: T[]) => values.slice(0, end + 1)
  function metric(
    domain: DashboardMetric['domain'],
    key: string,
    label: string,
    unit: string,
    values: (number | null)[],
    extras: Partial<DashboardMetric> = {},
  ): DashboardMetric {
    const source = {
      sales: '销售合同、订单与交付记录',
      inventory: 'WMS、成品库存优化与要货计划',
      production: '已发布生产计划、MES 与成本核算',
      procurement: 'SAP/E采、采购优化及到货执行',
      operation: 'SAP 财务与成本核算分析',
    }[domain]
    return {
      domain,
      key,
      label,
      unit,
      value: values[end] ?? null,
      previous: values[end - 1] ?? null,
      trend: window(values),
      direction: 'neutral',
      comparison: '较上月',
      source,
      asOf,
      basis: '所选统计期内同口径汇总，示例数据。',
      ...extras,
    }
  }
  const chart = (title: string, series: DashboardChart['series']): DashboardChart => ({
    title,
    categories: window(months),
    series: series.map((item) => ({ ...item, values: window(item.values) })),
  })
  const s = (
    name: string,
    kind: 'bar' | 'line',
    unit: string,
    values: (number | null)[],
    stack?: string,
  ) => ({ name, kind, unit, values, stack })
  const monthlyRows = (...data: Array<[string, number[]]>) =>
    window(months)
      .map((name, index) => ({
        id: `${id}-${index}`,
        name,
        values: Object.fromEntries(data.map(([key, values]) => [key, values[index] ?? null])),
      }))
      .reverse()
  const inventoryCurrent = [3440, 3650, 3800, 3620, 3710, input.finishedStock ?? null]
  const materialCurrent = [2120, 1890, 1980, 1880, 2040, input.materialsStock ?? null]
  const productionRate = productionActual.map((value, index) =>
    Number(((value / productionPlan[index]!) * 100).toFixed(1)),
  )

  return {
    id,
    label,
    asOf,
    metrics: [
      metric('production', 'todays-plan', '今日产销达成率', '%', [90, 92, 96.8, 93.5, 94.2, 96.1], {
        comparison: '较上日',
        previous: end === 5 ? 94.3 : 93,
        trend:
          end === 5 ? [92.5, 93.6, 93.1, 95.4, 94.3, 96.1] : [90.6, 92.2, 91.6, 94.6, 93, 94.2],
        direction: 'higher',
        target: '目标 ≥ 95%',
        basis: '所选数据截止日的产销计划达成结果。',
      }),
      metric('inventory', 'finished-days', '成品库存周转天数', '天', finishedDays, {
        target: '目标 7–9 天',
        basis: '平均可用库存按同期成品需求折算为天数。',
      }),
      metric('sales', 'order-otd', '订单准时交付率', '%', onTime, {
        direction: 'higher',
        target: '目标 ≥ 97%',
        basis: '统计期内按期交付订单行占同期到期订单行的比例。',
      }),
      metric('operation', 'supply-cost', '供应链总运营成本', '万元', costs, {
        direction: 'lower',
        target: '月度目标 ≤ 3,800 万元',
        basis: '采用已发布的运营成本汇总，同一成本项按财务归集口径计入。',
      }),
      metric('operation', 'cash-cycle', '现金循环周期', '天', cycle, {
        direction: 'lower',
        target: '目标 ≤ 45 天',
        basis: '库存周转天数加应收周转天数，再减应付周转天数。',
      }),
    ],
    topics: [
      {
        key: 'sales',
        title: '销售',
        metrics: [
          metric('sales', 'sales-qty', '销量', '吨', sales),
          metric('sales', 'sales-value', '销售金额', '万元', revenue),
          metric(
            'sales',
            'open-sales-qty',
            '在手销售合同量',
            '吨',
            [24160, 25350, 24700, 26600, 27810, 28400],
          ),
          metric(
            'sales',
            'open-sales-value',
            '在手销售合同金额',
            '万元',
            [8650, 8976, 8710, 9260, 9688, 9940],
          ),
        ],
        charts: [
          chart('销量与销售金额趋势', [
            s('销量', 'bar', '吨', sales),
            s('销售金额', 'line', '万元', revenue),
          ]),
          customerFulfillment
            ? {
                title: '重点客户合同履约',
                categories: customerFulfillment.map(({ name }) => name),
                series: [
                  s(
                    '已履约',
                    'bar',
                    '吨',
                    customerFulfillment.map(({ contract, remaining }) => contract - remaining),
                    '合同',
                  ),
                  s(
                    '未履约',
                    'bar',
                    '吨',
                    customerFulfillment.map(({ remaining }) => remaining),
                    '合同',
                  ),
                ],
              }
            : chart('订单准时交付趋势', [s('订单准时交付率', 'line', '%', onTime)]),
        ],
        detailTitle: customerFulfillment ? '重点客户合同履约明细' : '销售履约月度明细',
        columns: customerFulfillment
          ? [
              { key: 'contract', label: '合同量', unit: '吨' },
              { key: 'fulfilled', label: '已履约', unit: '吨' },
              { key: 'remaining', label: '未履约', unit: '吨' },
            ]
          : [
              { key: 'qty', label: '销量', unit: '吨' },
              { key: 'amount', label: '销售金额', unit: '万元' },
              { key: 'otd', label: '订单准时交付率', unit: '%' },
            ],
        rows:
          customerFulfillment?.map(({ name, contract, remaining }) => ({
            id: name,
            name,
            values: { contract, fulfilled: contract - remaining, remaining },
          })) ?? monthlyRows(['qty', sales], ['amount', revenue], ['otd', onTime]),
      },
      {
        key: 'inventory',
        title: '库存',
        metrics: [
          metric('inventory', 'finished-qty', '成品可用库存', '吨', inventoryCurrent, {
            comparison: '较上次快照',
          }),
          metric('inventory', 'finished-doi', '成品周转天数', '天', finishedDays),
          metric('inventory', 'material-qty', '原料可用库存', '吨', materialCurrent, {
            comparison: '较上次快照',
            basis: '原料口径为玉米淀粉可用量。',
          }),
          metric('inventory', 'material-doi', '原料周转天数', '天', materialDays),
        ],
        charts: input.inventory?.charts ?? [
          chart('成品可用库存趋势', [s('成品可用库存', 'line', '吨', inventoryCurrent)]),
          chart('原料可用库存趋势', [s('玉米淀粉可用库存', 'line', '吨', materialCurrent)]),
        ],
        detailTitle: input.inventory ? '成品库存与安全水位' : '库存月度快照',
        columns: input.inventory
          ? [
              { key: 'available', label: '可用库存', unit: '吨' },
              { key: 'safety', label: '安全库存', unit: '吨' },
              { key: 'capacity', label: '仓容上限', unit: '吨' },
              { key: 'risk', label: '最早风险日期' },
            ]
          : [
              { key: 'finished', label: '成品可用库存', unit: '吨' },
              { key: 'material', label: '玉米淀粉可用库存', unit: '吨' },
            ],
        rows:
          input.inventory?.rows ??
          window(months)
            .map((name, index) => ({
              id: name,
              name,
              values: {
                finished: inventoryCurrent[index] ?? null,
                material: materialCurrent[index] ?? null,
              },
            }))
            .reverse(),
        target: { label: '查看成品库存', to: '/inventory/overview' },
      },
      {
        key: 'production',
        title: '生产',
        metrics: [
          metric('production', 'production-rate', '生产计划达成率', '%', productionRate),
          metric(
            'production',
            'first-pass',
            '生产一次合格率',
            '%',
            [97.7, 97.9, 98.1, 97.9, 98.3, 98.7],
          ),
          metric('production', 'production-cost', '生产成本', '万元', productionCost),
        ],
        charts: [
          chart('计划与实际产量', [
            s('计划产量', 'bar', '吨', productionPlan),
            s('实际产量', 'bar', '吨', productionActual),
          ]),
          chart('单位生产成本构成', [
            s(
              '原辅料',
              'bar',
              '元/吨',
              unitProductionCost.map((value) => Math.round(value * 0.71)),
              '成本',
            ),
            s(
              '能源',
              'bar',
              '元/吨',
              unitProductionCost.map((value) => Math.round(value * 0.14)),
              '成本',
            ),
            s(
              '人工及制造费用',
              'bar',
              '元/吨',
              unitProductionCost.map((value) => Math.round(value * 0.15)),
              '成本',
            ),
          ]),
        ],
        detailTitle: '生产计划与达成明细',
        columns: [
          { key: 'plan', label: '计划产量', unit: '吨' },
          { key: 'actual', label: '实际产量', unit: '吨' },
          { key: 'rate', label: '达成率', unit: '%' },
        ],
        rows: monthlyRows(
          ['plan', productionPlan],
          ['actual', productionActual],
          ['rate', productionRate],
        ),
        target: { label: '查看精益排程', to: '/scheduling' },
      },
      {
        key: 'procurement',
        title: '采购',
        metrics: [
          metric('procurement', 'purchase-qty', '采购量', '吨', purchase),
          metric('procurement', 'purchase-cost', '采购成本', '万元', purchaseCost),
          metric(
            'procurement',
            'open-purchase-qty',
            '在手采购合同量',
            '吨',
            [6720, 7040, 7260, 7600, 7660, 7340],
          ),
          metric(
            'procurement',
            'open-purchase-value',
            '在手采购合同金额',
            '万元',
            [2010, 2107, 2214, 2320, 2440, 2351],
          ),
          metric('procurement', 'supplier-otd', '原料准时交货率', '%', supplierRate),
        ],
        charts: [
          chart('采购量与加权采购价', [
            s('采购量', 'bar', '吨', purchase),
            s('加权采购价', 'line', '元/吨', purchasePrice),
          ]),
          ...(input.procurement?.charts ?? [
            chart('原料准时交货趋势', [s('原料准时交货率', 'line', '%', supplierRate)]),
          ]),
        ],
        detailTitle: input.procurement ? '采购履约与待到货' : '采购月度明细',
        columns: input.procurement
          ? [
              { key: 'date', label: '计划到货日期' },
              { key: 'qty', label: '计划量', unit: '吨' },
              { key: 'eta', label: '预计到厂' },
              { key: 'status', label: '下达状态' },
            ]
          : [
              { key: 'qty', label: '采购量', unit: '吨' },
              { key: 'amount', label: '采购成本', unit: '万元' },
              { key: 'price', label: '加权采购价', unit: '元/吨' },
            ],
        rows:
          input.procurement?.rows ??
          monthlyRows(['qty', purchase], ['amount', purchaseCost], ['price', purchasePrice]),
        target: { label: '查看采购执行', to: '/procurement/execution' },
      },
      {
        key: 'operation',
        title: '经营',
        metrics: [
          metric('operation', 'revenue', '营收', '万元', revenue),
          metric('operation', 'ops-cost', '成本', '万元', costs),
          metric('operation', 'profit', '利润', '万元', profits),
          metric('operation', 'ccc', '现金循环周期', '天', cycle),
        ],
        charts: [
          chart('营收、成本与利润趋势', [
            s('营收', 'bar', '万元', revenue),
            s('成本', 'bar', '万元', costs),
            s('利润', 'line', '万元', profits),
          ]),
          chart('现金循环周期与构成', [
            s('库存周转', 'bar', '天', [21, 20, 20, 19, 19, 18]),
            s('应收周转', 'bar', '天', [57, 56, 55, 54, 54, 52]),
            s('应付周转', 'bar', '天', [25, 25, 25, 24, 25, 25]),
            s('现金循环周期', 'line', '天', cycle),
          ]),
        ],
        detailTitle: '经营月度明细',
        columns: [
          { key: 'revenue', label: '营收', unit: '万元' },
          { key: 'cost', label: '成本', unit: '万元' },
          { key: 'profit', label: '利润', unit: '万元' },
          { key: 'cycle', label: '现金循环周期', unit: '天' },
        ],
        rows: monthlyRows(
          ['revenue', revenue],
          ['cost', costs],
          ['profit', profits],
          ['cycle', cycle],
        ),
        target: { label: '查看经营分析', to: '/costing/multidim' },
      },
    ],
  }
}
