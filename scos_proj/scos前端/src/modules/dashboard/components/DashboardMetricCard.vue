<script setup lang="ts">
import { computed } from 'vue'
import ScosChart from '@/shared/components/ScosChart.vue'
import type { EChartsCoreOption } from '@/shared/charts/echarts'
import type { DashboardMetric } from '../model/types'
import { compareMetric, displayValue } from '../model/presentation'

const props = defineProps<{ metric: DashboardMetric; compact?: boolean }>()
defineEmits<{ select: [metric: DashboardMetric] }>()

const comparison = computed(() => compareMetric(props.metric))
const trend = computed<EChartsCoreOption>(() => ({
  animation: false,
  grid: { top: 3, left: 0, right: 0, bottom: 2 },
  xAxis: { type: 'category', boundaryGap: false, show: false },
  yAxis: { type: 'value', show: false, scale: true },
  series: [
    {
      type: 'line',
      data: props.metric.trend,
      symbol: 'none',
      smooth: true,
      lineStyle: { color: '#138b96', width: 1.6 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(12, 135, 145, 0.18)' },
            { offset: 1, color: 'rgba(12, 135, 145, 0.015)' },
          ],
        },
      },
    },
  ],
}))
</script>

<template>
  <button type="button" class="metric-card" :class="{ compact }" @click="$emit('select', metric)">
    <span class="metric-name">{{ metric.label }}</span>
    <span class="metric-current">
      <strong>{{ displayValue(metric.value, metric.unit) }}</strong>
      <span v-if="comparison" class="metric-delta" :class="comparison.tone">
        {{ comparison.label }}
        <small>{{ metric.comparison }}</small>
      </span>
    </span>
    <span v-if="metric.target" class="metric-target">{{ metric.target }}</span>
    <ScosChart
      v-if="!compact && metric.trend.some((value) => value != null)"
      :option="trend"
      :label="`${metric.label}趋势`"
      :height="30"
    />
  </button>
</template>

<style scoped>
.metric-card {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 5px;
  padding: 14px 15px 8px;
  border: 1px solid #dce6eb;
  border-radius: 10px;
  background: var(--scos-surface);
  color: var(--scos-ink);
  cursor: pointer;
  text-align: left;
}
.metric-card:hover {
  border-color: #76b7bd;
}
.metric-card.compact {
  padding: 10px 12px;
  background: #f8fafb;
}
.metric-name {
  font-size: 13px;
  font-weight: 650;
}
.metric-current {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 3px 8px;
}
.metric-current strong {
  font-size: clamp(18px, 1.72vw, 26px);
  line-height: 1.18;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.compact .metric-current strong {
  font-size: 19px;
}
.metric-delta {
  font-size: 11px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.metric-delta small {
  display: block;
  font-size: 10px;
  color: var(--scos-muted);
}
.metric-delta.good {
  color: #147354;
}
.metric-delta.bad {
  color: #ae3436;
}
.metric-delta.neutral,
.metric-target {
  color: var(--scos-muted);
}
.metric-target {
  font-size: 11px;
}
</style>
