import { formatValue, round } from './scenarios'
import type { SandboxDay } from './types'

export function inventoryState(day: SandboxDay, safety: number | null, raw: boolean) {
  if (day.shortage == null || day.closing == null) return { tone: 'unknown', text: '未评估' }
  if (day.shortage > 0) return { tone: 'risk', text: raw ? '缺料' : '缺货' }
  if (day.capacityExceeded) return { tone: 'risk', text: '超仓容' }
  if (day.closing === 0) return { tone: 'warning', text: '库存耗尽' }
  if (safety != null && day.closing < safety) return { tone: 'warning', text: '低于安全线' }
  if (safety == null) return { tone: 'unknown', text: '安全线未评估' }
  return { tone: 'normal', text: '库存充足' }
}

export function stockOnHand(closing: number | null) {
  return closing == null ? null : Math.max(0, closing)
}

export function usableReceipt({ opening, closing, demand }: SandboxDay) {
  return opening == null || closing == null || demand == null
    ? null
    : Math.max(0, round(closing - opening + demand))
}

export function shortageTiming(
  baseline: string | undefined,
  scenario: string,
  baselineKnown: boolean,
) {
  if (!baseline) return baselineKnown ? '基线时段内无缺口' : '基线缺口日期未评估'
  const shifted = (Date.parse(scenario) - Date.parse(baseline)) / 86_400_000
  if (!shifted) return `与基线同日（${baseline}）`
  return `较基线${shifted < 0 ? '提前' : '推迟'} ${Math.abs(shifted)} 天（基线 ${baseline}）`
}

export function inWan(value: number | null | undefined) {
  return value == null ? '未评估' : formatValue(round(value / 10000, 2), '万元')
}
