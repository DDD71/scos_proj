import type { ScenarioKind } from './types'

export const businessLogic = {
  supply: '把这批货放到新的到厂日，逐天用可用到货抵扣生产耗用，找出哪天原料不够。',
  demand: '把这笔订单移到新的交付日，用届时可交付的成品库存核对能否覆盖需求。',
  production: '按减产起止日扣减受影响的计划入库，再逐天核对成品库存与交付需求。',
  contract:
    '采购价影响原料成本，生产负荷影响产量和加工成本，成品售价影响交付收入。用同一份合同计划比较利润。',
} as const satisfies Record<ScenarioKind, string>

export const calendarDaysBetween = (first: string, second: string) =>
  (Date.parse(second) - Date.parse(first)) / 86_400_000
