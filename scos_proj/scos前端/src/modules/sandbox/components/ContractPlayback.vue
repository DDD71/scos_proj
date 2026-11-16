<script setup lang="ts">
import { computed } from 'vue'
import BusinessCalculation from './BusinessCalculation.vue'
import { costLabels, formatValue, round } from '../model/scenarios'
import { inWan } from '../model/result-presentation'
import type {
  ContractMonthResult,
  ContractResult,
  SandboxImpact,
  SandboxMetric,
} from '../model/types'

const { result, metrics, changes, month, showMonth } = defineProps<{
  result: ContractResult
  metrics: SandboxMetric[]
  changes: SandboxImpact[]
  month: ContractMonthResult
  showMonth: boolean
}>()

const totals = computed(() => Object.fromEntries(metrics.map((item) => [item.key, item.simulated])))
const baseProfit = computed(() => metrics.find((item) => item.key === 'profit')?.base)
const profit = computed(() => totals.value.profit)
const profitChange = computed(() => {
  const base = baseProfit.value
  return base == null || profit.value == null ? null : round(profit.value - base, 2)
})
const profitChangeText = computed(() => {
  if (profitChange.value == null) return '未评估'
  const amount = Math.abs(profitChange.value)
  return amount < 10000 ? formatValue(amount, '元') : inWan(amount)
})
const assumptions = computed(() =>
  changes.filter(({ object }) =>
    ['玉米淀粉采购价', '到期采购价', '正常生产负荷', '成品售价'].includes(object),
  ),
)
const profitParts = computed(() => {
  const operating = result.months.reduce((total, row) => total + row.cogs + row.periodExpense, 0)
  return [
    { label: '实际交付收入', value: inWan(totals.value.revenue) },
    { sign: '−', label: '销售成本及期间费用', value: inWan(operating) },
    { sign: '−', label: '期末违约成本', value: inWan(totals.value.penalty) },
    { sign: '=', label: '合同利润', value: inWan(profit.value) },
  ]
})

const colors = {
  fixed: '#6679a5',
  raw: '#087f8c',
  aux: '#3b9d89',
  energy: '#b67a34',
  startStop: '#905ba7',
}
const totalCost = computed(() => Object.values(result.costs).reduce((sum, value) => sum + value, 0))
const costShare = (amount: number) => (totalCost.value > 0 ? (amount / totalCost.value) * 100 : 0)
const finalMonth = computed(() => result.months.at(-1)?.month === month.month)
const maximum = computed(() => Math.max(0, month.delivery, month.fulfilled))
const width = (value: number) => (maximum.value ? `${(value / maximum.value) * 100}%` : '0%')
</script>

<template>
  <div class="sb-contract-playback">
    <div class="sb-contract-summary">
      <h3>合同利润对比</h3>
      <div v-if="assumptions.length" class="sb-actions sb-muted" aria-label="本次调整">
        <span v-for="item in assumptions" :key="item.object + (item.date ?? '')">
          {{ item.object }} {{ item.base }} → {{ item.simulated }}
        </span>
      </div>
      <dl class="sb-result-stats" aria-label="合同利润对比">
        <div data-tone="unknown">
          <dt>基准合同利润</dt>
          <dd>{{ inWan(baseProfit) }}</dd>
        </div>
        <div :data-tone="(profit ?? 0) < 0 ? 'risk' : 'normal'">
          <dt>推演合同利润</dt>
          <dd>{{ inWan(profit) }}</dd>
        </div>
        <div :data-tone="profitChange == null ? 'unknown' : profitChange < 0 ? 'risk' : 'normal'">
          <dt>
            {{
              profitChange == null
                ? '利润变化'
                : profitChange < 0
                  ? '利润减少'
                  : profitChange > 0
                    ? '利润增加'
                    : '利润持平'
            }}
          </dt>
          <dd>{{ profitChangeText }}</dd>
        </div>
      </dl>
    </div>
    <BusinessCalculation
      title="合同利润怎么算"
      :parts="profitParts"
      detail="收入按实际交付量和售价计算。原料按移动加权成本计价，生产负荷影响产量及加工成本。"
    />
    <div v-if="showMonth" class="sb-month-stage">
      <div class="sb-month-bars">
        <h3>{{ month.month }} · 交付进度</h3>
        <div
          v-for="item in [
            { name: '本月应交', value: month.delivery },
            { name: '本月实交（含补欠）', value: month.fulfilled },
          ]"
          :key="item.name"
          class="sb-quantity-bar"
        >
          <span>{{ item.name }}</span>
          <div class="sb-bar-track"><i :style="{ width: width(item.value) }"></i></div>
          <strong>{{ formatValue(item.value, '吨') }}</strong>
        </div>
      </div>
      <dl class="sb-month-facts" aria-live="polite">
        <div>
          <dt>累计欠交</dt>
          <dd>{{ formatValue(month.backlog, '吨') }}</dd>
        </div>
        <div>
          <dt>当月利润</dt>
          <dd>{{ inWan(month.profit) }}</dd>
        </div>
      </dl>
      <p class="sb-day-explanation">
        <strong>{{ month.month }}</strong>
        {{
          finalMonth
            ? '合同期末违约成本 ' + inWan(month.penalty) + '。'
            : month.backlog > 0
              ? '本月欠交结转到下月，违约成本按合同期末计算。'
              : '截至本月，累计交付已覆盖应交量。'
        }}
      </p>
    </div>
    <details v-if="showMonth" class="sb-advanced" aria-label="合同期生产成本构成">
      <summary>查看生产成本构成</summary>
      <section class="sb-cost-stage">
        <div class="sb-row">
          <h3>生产成本构成</h3>
          <strong>{{ inWan(totalCost) }}</strong>
        </div>
        <div v-if="totalCost > 0" class="sb-cost-stack" aria-hidden="true">
          <i
            v-for="(_, key) in costLabels"
            :key="key"
            :style="{ width: costShare(result.costs[key]) + '%', background: colors[key] }"
          ></i>
        </div>
        <ul class="sb-cost-legend">
          <li v-for="(label, key) in costLabels" :key="key">
            <span><i :style="{ background: colors[key] }"></i>{{ label }}</span>
            <strong>{{ inWan(result.costs[key]) }}</strong>
            <small>{{
              result.output > 0
                ? formatValue(round(result.costs[key] / result.output, 2), '元/吨')
                : '无产量'
            }}</small>
          </li>
        </ul>
      </section>
    </details>
  </div>
</template>
