<script setup lang="ts">
import { computed } from 'vue'
import ScosChart from '@/shared/components/ScosChart.vue'
import type { EChartsCoreOption } from '@/shared/charts/echarts'
import { inWan } from '../model/result-presentation'
import { addDays, formatValue, round } from '../model/scenarios'
import type { ContractLoadAdjustment, ContractResult } from '../model/types'

const { result, adjustments = [] } = defineProps<{
  result: ContractResult
  adjustments?: ContractLoadAdjustment[]
}>()
const days = computed(() => result.forecast ?? [])
const first = computed(() => days.value[0])
const last = computed(() => days.value.at(-1))
const chart = computed<EChartsCoreOption>(() => {
  const dates = days.value.map(({ date }) => date)
  const ranges = adjustments.map(({ startWeek, endWeek, load }) => {
    const end = addDays(endWeek, 6)
    return [
      { name: `负荷 ${load}%`, xAxis: startWeek < dates[0]! ? dates[0] : startWeek },
      { xAxis: end > dates.at(-1)! ? dates.at(-1) : end },
    ]
  })
  const baseline = round(
    result.baselineMonths.reduce((sum, month) => sum + month.profit, 0) / 10000,
    2,
  )
  const categoryAxis = { type: 'category', boundaryGap: false, data: dates } as const
  function line(name: string, data: number[], color: string, yAxisIndex: number, dashed = false) {
    return {
      name,
      data,
      type: 'line',
      xAxisIndex: yAxisIndex === 2 ? 1 : 0,
      yAxisIndex,
      showSymbol: false,
      lineStyle: { width: dashed ? 1.5 : 2.5, type: dashed ? 'dashed' : 'solid' },
      itemStyle: { color },
      tooltip: {
        valueFormatter: (value: unknown) =>
          formatValue(Number(value), yAxisIndex === 1 ? '元/吨' : '万元'),
      },
    }
  }
  return {
    animation: false,
    tooltip: { trigger: 'axis', confine: true },
    axisPointer: { link: [{ xAxisIndex: [0, 1] }] },
    legend: { top: 0, left: 'center', type: 'scroll', textStyle: { fontSize: 11 } },
    grid: [
      { left: 53, right: 52, top: 52, height: 113 },
      { left: 53, right: 52, top: 215, bottom: 28 },
    ],
    xAxis: [
      { ...categoryAxis, gridIndex: 0, axisTick: { show: false }, axisLabel: { show: false } },
      {
        ...categoryAxis,
        gridIndex: 1,
        axisLabel: { hideOverlap: true, formatter: (date: string) => date.slice(5) },
      },
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        name: '成本（万元）',
        scale: true,
        splitLine: { lineStyle: { color: '#e4ebec' } },
      },
      {
        type: 'value',
        gridIndex: 0,
        position: 'right',
        name: '采购价（元/吨）',
        scale: true,
        splitLine: { show: false },
      },
      {
        type: 'value',
        gridIndex: 1,
        name: '利润（万元）',
        scale: true,
        splitLine: { lineStyle: { color: '#e4ebec' } },
      },
    ],
    series: [
      {
        ...line(
          '当日玉米淀粉采购价',
          days.value.map(({ purchasePrice }) => purchasePrice),
          '#a46128',
          1,
        ),
        markArea: { silent: true, itemStyle: { color: 'rgba(66,107,155,0.10)' }, data: ranges },
      },
      line(
        '预计合同总生产成本',
        days.value.map(({ productionCost }) => round(productionCost / 10000, 2)),
        '#426b9b',
        0,
      ),
      line(
        '预计合同总利润',
        days.value.map(({ profit }) => round(profit / 10000, 2)),
        '#087f8c',
        2,
      ),
      line(
        '基准合同总利润',
        dates.map(() => baseline),
        '#64748b',
        2,
        true,
      ),
    ],
  }
})
</script>

<template>
  <section v-if="first && last" class="sb-trend sb-stack" aria-label="合同期价格与利润走势">
    <div class="sb-row">
      <h3>合同期价格与利润走势</h3>
      <span class="sb-muted">{{ first.date }} 至 {{ last.date }}</span>
    </div>
    <p class="sb-muted">
      生产按所设周次计算。已过日期采用设定的采购价，后续采购按当日价估算。每个点都是当天对整份合同成本和利润的预估。
    </p>
    <ScosChart :option="chart" label="合同期原料价格、生产成本和利润折线图" :height="370" />
    <p class="sb-muted">
      首日预计合同总利润 {{ inWan(first.profit) }} · 到期日预计合同总利润 {{ inWan(last.profit) }}
    </p>
  </section>
</template>
