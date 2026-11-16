<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ScosChart from '@/shared/components/ScosChart.vue'
import type { EChartsCoreOption } from '@/shared/charts/echarts'
import type {
  DashboardChart,
  DashboardDomain,
  DashboardMetric,
  DashboardTopic,
} from '../model/types'
import { displayValue } from '../model/presentation'
import DashboardMetricCard from './DashboardMetricCard.vue'

const props = defineProps<{ topics: DashboardTopic[]; active: DashboardDomain }>()
const emit = defineEmits<{ change: [domain: DashboardDomain]; metric: [metric: DashboardMetric] }>()
const topic = computed(
  () => props.topics.find(({ key }) => key === props.active) ?? props.topics[0],
)
const point = ref('')
const pickedRowIds = ref<string[]>([])
const rows = computed(() =>
  pickedRowIds.value.length
    ? (topic.value?.rows.filter(({ id }) => pickedRowIds.value.includes(id)) ?? [])
    : (topic.value?.rows ?? []),
)
const palette = ['#188993', '#568aaf', '#d69a4d', '#7968ac']

function chartOption(chart: DashboardChart): EChartsCoreOption {
  const units = [...new Set(chart.series.map(({ unit }) => unit))]
  return {
    animation: false,
    color: palette,
    tooltip: { trigger: 'axis', confine: true },
    legend: {
      bottom: 0,
      left: 'center',
      textStyle: { color: '#61788a', fontSize: 10 },
      itemWidth: 12,
    },
    grid: { top: 30, bottom: 47, left: 45, right: units.length > 1 ? 52 : 14 },
    xAxis: {
      type: 'category',
      data: chart.categories,
      boundaryGap: true,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#d2dfe6' } },
      axisLabel: { color: '#61788a', fontSize: 10, hideOverlap: true },
    },
    yAxis: units.map((unit) => ({
      type: 'value',
      name: unit,
      scale: unit === '%',
      nameTextStyle: { fontSize: 10, color: '#61788a', align: 'left' },
      axisLabel: { color: '#61788a', fontSize: 10 },
      splitLine: { lineStyle: { color: '#e5edf1', type: 'dashed' } },
    })),
    series: chart.series.map(({ kind, values, name, unit, stack }) => ({
      type: kind,
      name,
      data: values,
      yAxisIndex: units.indexOf(unit),
      ...(kind === 'bar'
        ? { barMaxWidth: 22, stack }
        : { smooth: true, symbolSize: 5, lineStyle: { width: 2 } }),
    })),
  }
}
const charts = computed(
  () => topic.value?.charts.map((chart) => ({ ...chart, option: chartOption(chart) })) ?? [],
)

function clearSelection() {
  point.value = ''
  pickedRowIds.value = []
}
watch(topic, clearSelection)

function selectPoint(chart: DashboardChart, category: string) {
  const matches =
    topic.value?.rows.filter(
      ({ name, values }) =>
        name === category || (typeof values.date === 'string' && values.date.endsWith(category)),
    ) ?? []
  if (matches.length || chart.fallbackRowId) {
    pickedRowIds.value = matches.length ? matches.map(({ id }) => id) : [chart.fallbackRowId!]
    point.value = category
    return
  }
  clearSelection()
}
</script>

<template>
  <section class="surface topic-panel" aria-labelledby="dashboard-topics-title">
    <header class="topic-header">
      <h2 id="dashboard-topics-title">多维运营分析</h2>
      <RouterLink v-if="topic?.target" class="topic-link" :to="topic.target.to"
        >{{ topic.target.label }} →</RouterLink
      >
    </header>
    <div class="topic-tabs" role="tablist" aria-label="业务专题">
      <button
        v-for="item in topics"
        :id="`dashboard-tab-${item.key}`"
        :key="item.key"
        type="button"
        role="tab"
        :aria-selected="topic?.key === item.key"
        aria-controls="dashboard-topic-content"
        @click="emit('change', item.key)"
      >
        {{ item.title }}
      </button>
    </div>
    <div
      v-if="topic"
      id="dashboard-topic-content"
      class="topic-content"
      role="tabpanel"
      :aria-labelledby="`dashboard-tab-${topic.key}`"
    >
      <div class="topic-metrics">
        <DashboardMetricCard
          v-for="metric in topic.metrics"
          :key="metric.key"
          :metric="metric"
          compact
          @select="emit('metric', $event)"
        />
      </div>
      <div class="topic-charts">
        <section v-for="chart in charts" :key="chart.title" class="topic-chart">
          <h3>{{ chart.title }}</h3>
          <ScosChart
            v-if="chart.categories.length"
            :option="chart.option"
            :label="chart.title"
            :height="222"
            @point-click="selectPoint(chart, $event)"
          />
          <p v-else class="topic-empty">该图表数据待核实。</p>
        </section>
      </div>
      <div class="topic-detail-heading">
        <h3>{{ topic.detailTitle }}</h3>
        <button v-if="point" type="button" class="topic-link" @click="clearSelection">
          图表选中 {{ point }} · 清除
        </button>
      </div>
      <div class="topic-table">
        <table>
          <thead>
            <tr>
              <th scope="col">对象</th>
              <th v-for="column in topic.columns" :key="column.key" scope="col">
                {{ column.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <th scope="row">
                <RouterLink v-if="row.target" class="topic-link" :to="row.target.to"
                  >{{ row.name }} →</RouterLink
                >
                <template v-else>{{ row.name }}</template>
              </th>
              <td v-for="column in topic.columns" :key="column.key">
                {{ displayValue(row.values[column.key], column.unit) }}
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td :colspan="topic.columns.length + 1">暂无可用明细</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.topic-panel {
  min-width: 0;
  padding: 16px 17px 18px;
}
.topic-header,
.topic-detail-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
}
.topic-header h2 {
  font-size: 16px;
}
.topic-header h2::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 15px;
  margin-right: 8px;
  vertical-align: -2px;
  border-radius: 2px;
  background: var(--scos-primary);
}
.topic-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  width: fit-content;
  margin: 11px 0 12px;
  padding: 2px;
  border: 1px solid #dce6eb;
  border-radius: 8px;
  background: #f5f9fa;
}
.topic-tabs button {
  padding: 6px 15px;
  border-radius: 5px;
  border: 0;
  background: transparent;
  color: #4f6677;
  cursor: pointer;
  font-size: 13px;
}
.topic-tabs button:hover {
  background: #e0eff0;
}
.topic-tabs button[aria-selected='true'] {
  background: #087f8c;
  color: white;
  font-weight: 650;
}
.topic-content {
  display: grid;
  gap: 15px;
}
.topic-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 145px), 1fr));
  gap: 8px;
}
.topic-charts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid #e3ebef;
  border-radius: 9px;
}
.topic-chart {
  min-width: 0;
  padding: 11px 13px 5px;
}
.topic-chart + .topic-chart {
  border-left: 1px solid #e3ebef;
}
.topic-chart h3,
.topic-detail-heading h3 {
  font-size: 13px;
}
.topic-empty {
  padding: 24px 8px;
  color: var(--scos-muted);
}
.topic-table {
  overflow-x: auto;
  border: 1px solid #e3ebef;
  border-radius: 8px;
}
.topic-table table {
  width: 100%;
  border-collapse: collapse;
  white-space: nowrap;
  font-size: 12px;
}
.topic-table th,
.topic-table td {
  padding: 9px 11px;
  text-align: left;
  border-bottom: 1px solid #e9eff2;
}
.topic-table thead {
  background: #f5f8fa;
  color: #567184;
}
.topic-table tbody th {
  font-weight: 550;
}
.topic-table tbody tr:last-child > * {
  border-bottom: 0;
}
.topic-link {
  color: var(--scos-primary);
  font-size: 12px;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.topic-link:hover {
  text-decoration: underline;
}
@media (max-width: 950px) {
  .topic-charts {
    grid-template-columns: minmax(0, 1fr);
  }
  .topic-chart + .topic-chart {
    border-left: 0;
    border-top: 1px solid #e3ebef;
  }
}
</style>
