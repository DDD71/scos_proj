import type { ScenarioKind } from './types'

export const scenarios = [
  { id: 'supply', title: '供应商到货延迟', description: '原料晚到，库存能撑到哪天？' },
  {
    id: 'demand',
    title: '客户增单与交期变化',
    description: '订单加量或提前，还能按时交吗？',
  },
  { id: 'production', title: '生产能力下降', description: '产线减产后，成品库存够用吗？' },
  {
    id: 'contract',
    title: '销售、生产和采购决策博弈',
    description: '改采购价、生产负荷或售价，合同利润差多少？',
  },
] as const satisfies readonly { id: ScenarioKind; title: string; description: string }[]

export const scenarioTitle = (kind: ScenarioKind) => scenarios.find(({ id }) => id === kind)!.title

export const costLabels = {
  fixed: '固定成本',
  raw: '玉米淀粉',
  aux: '辅料及包材',
  energy: '能源',
  startStop: '启停成本',
} as const

export const departments = [
  { name: '要货计划', to: '/requisition/execution' },
  { name: '采购优化', to: '/procurement/execution' },
  { name: '成品库存优化', to: '/inventory/overview' },
  { name: '精益排程', to: '/scheduling' },
  { name: '成本核算分析', to: '/costing/multidim' },
]

export function addDays(date: string, days: number) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}

export const round = (value: number, digits = 3) => Number(value.toFixed(digits))
const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 })
export const formatValue = (value: number | null | undefined, unit = '') =>
  value == null
    ? '未评估'
    : `${numberFormat.format(value)}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`
