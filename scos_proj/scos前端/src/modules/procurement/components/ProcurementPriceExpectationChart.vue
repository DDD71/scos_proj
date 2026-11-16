<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsCoreOption } from '@/shared/charts/echarts'
import ScosChart from '@/shared/components/ScosChart.vue'
import { shiftForecastMonth, type ProcurementFuturesClose } from '../model/price-forecast'

const props = defineProps<{
  points: { month: string; price: number; method: 'price' | 'change' }[]
  history: ProcurementFuturesClose[]
  currency: string
  unit: string
}>()

const formatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const priceUnit = computed(
  () => `${props.currency === 'CNY' ? '元' : props.currency}/${props.unit}`,
)
const orderedPoints = computed(() =>
  [...props.points].sort((left, right) => left.month.localeCompare(right.month)),
)

const chartData = computed(() => {
  const rows: { label: string; price: number | null; method?: 'history' | 'price' | 'change' }[] =
    []
  let previousMonth: string | undefined
  for (const point of props.history) {
    rows.push({ label: point.month, price: point.price, method: 'history' })
    previousMonth = point.month
  }
  for (const point of orderedPoints.value) {
    if (previousMonth) {
      for (
        let month = shiftForecastMonth(previousMonth, 1);
        month < point.month;
        month = shiftForecastMonth(month, 1)
      ) {
        rows.push({ label: month, price: null })
      }
    }
    rows.push({ label: point.month, price: point.price, method: point.method })
    previousMonth = point.month
  }
  return rows
})

const curves = [
  { method: 'history', label: '历史期货收盘价', color: '#526778', line: 'solid' },
  { method: 'price', label: '直接预测价', color: '#6941a5', line: 'solid' },
  { method: 'change', label: '涨跌幅折算价', color: '#c05085', line: 'dashed' },
] as const

const option = computed<EChartsCoreOption>(() => ({
  animation: false,
  grid: { left: 64, right: 24, top: 35, bottom: 34 },
  legend: { top: 2 },
  xAxis: {
    type: 'category',
    data: chartData.value.map(({ label }) => label),
    axisLabel: { hideOverlap: true },
    axisLine: { lineStyle: { color: '#dbe5eb' } },
    axisTick: { show: false },
  },
  yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#e9eff2' } } },
  tooltip: {
    trigger: 'item',
    confine: true,
    renderMode: 'richText',
    formatter: ({ dataIndex }: { dataIndex: number }) => {
      const row = chartData.value[dataIndex]
      if (row?.price == null) return ''
      const label = curves.find((curve) => curve.method === row.method)?.label
      return `${row.label}\n${label} ${formatter.format(row.price)} ${priceUnit.value}`
    },
  },
  series: curves.map((curve) => ({
    type: 'line',
    name: curve.label,
    connectNulls: false,
    lineStyle: { type: curve.line, color: curve.color },
    itemStyle: { color: curve.color },
    symbolSize: 7,
    data: chartData.value.map((row, index, rows) => {
      if (row.method === curve.method) return row.price
      if (curve.method !== 'history' && rows[index + 1]?.method === curve.method) {
        return { value: row.price, symbol: 'none' }
      }
      return null
    }),
  })),
}))
</script>

<template>
  <section v-if="orderedPoints.length" class="price-expectation" aria-label="已发布价格预测">
    <p class="price-unit">单位 {{ priceUnit }}</p>
    <ScosChart :option="option" label="已发布价格预测走势，数值见下方明细" :height="240" />
    <ul class="point-summary" aria-label="价格预测明细">
      <li v-if="history.length" class="historical-point">
        <span>{{ history.at(-1)?.month }} 历史收盘</span>
        <strong>{{ formatter.format(history.at(-1)!.price) }}</strong>
      </li>
      <li v-for="point in orderedPoints" :key="point.month">
        <span>{{ point.month }} {{ point.method === 'price' ? '直接预测' : '涨跌幅折算' }}</span>
        <strong>{{ formatter.format(point.price) }}</strong>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.price-unit {
  margin: 0;
  color: var(--scos-muted);
  font-size: 12px;
}

.point-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.point-summary li {
  display: flex;
  gap: 6px;
  color: var(--scos-muted);
  font-size: 12px;
}

.point-summary strong {
  color: var(--scos-primary);
  font-variant-numeric: tabular-nums;
}

.point-summary .historical-point strong {
  color: inherit;
}
</style>
