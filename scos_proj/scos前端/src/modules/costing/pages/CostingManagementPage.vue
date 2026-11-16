<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElEmpty, ElTable, ElTableColumn } from 'element-plus'
import ScosChart from '@/shared/components/ScosChart.vue'
import type { EChartsCoreOption } from '@/shared/charts/echarts'
import CostingMetrics from '../components/CostingMetrics.vue'
import {
  formatQuantity,
  formatRate,
  groupOrders,
  money,
  roundMoney,
  summarizeOrders,
} from '../domain/analysis'
import type { CostingFinancialPeriod, CostingSnapshot } from '../model/snapshot'

const props = defineProps<{ data: CostingSnapshot }>()
const comparison = ref<'budget' | 'priorMonth' | 'priorYear'>('budget')
const orderTotals = computed(() => summarizeOrders(props.data.orders))
const financial = computed(() => props.data.financial)
const actual = computed(() =>
  financial.value?.history.find((item) => item.period === props.data.context.period),
)
const previous = computed(
  () =>
    financial.value?.history
      .filter((item) => item.period < props.data.context.period)
      .sort((a, b) => b.period.localeCompare(a.period))[0],
)
const baseline = computed(() =>
  comparison.value === 'priorMonth'
    ? previous.value
    : financial.value?.[comparison.value === 'budget' ? 'budget' : 'priorYear'],
)
const lowMargin = computed(() =>
  groupOrders(props.data.orders, 'customer').filter(
    (item) => item.margin != null && item.margin < 0.15,
  ),
)
const nwc = (row: CostingFinancialPeriod) =>
  roundMoney(row.inventory + row.receivables - row.payables)
function cycle(row: CostingFinancialPeriod) {
  return row.dio == null || row.dso == null || row.dpo == null ? null : row.dio + row.dso - row.dpo
}
function cycleLabel(row: CostingFinancialPeriod) {
  const days = cycle(row)
  return days == null ? '—' : formatQuantity(days) + ' 天'
}
const metrics = computed(() => [
  { label: '销售收入', value: money(orderTotals.value.revenue) },
  { label: '完全成本', value: money(orderTotals.value.fullCost) },
  { label: '贡献利润', value: money(orderTotals.value.profit) },
  { label: '综合利润率', value: formatRate(orderTotals.value.margin) },
  { label: '净营运资金', value: money(actual.value && nwc(actual.value)) },
  {
    label: '现金转换周期',
    value:
      actual.value && cycle(actual.value) != null
        ? formatQuantity(cycle(actual.value)!) + ' 天'
        : '—',
  },
])
const baselineRows = computed(() => {
  const current = actual.value
  const compare = baseline.value
  return [
    { label: '销售收入', actual: orderTotals.value.revenue, baseline: compare?.revenue },
    { label: '完全成本', actual: orderTotals.value.fullCost, baseline: compare?.fullCost },
    {
      label: '贡献利润',
      actual: orderTotals.value.profit,
      baseline:
        compare?.revenue != null && compare.fullCost != null
          ? roundMoney(compare.revenue - compare.fullCost)
          : undefined,
    },
    { label: '经营现金流', actual: current?.cashflow, baseline: compare?.cashflow },
  ].map((row) => ({
    ...row,
    difference:
      row.actual != null && row.baseline != null
        ? roundMoney(row.actual - row.baseline)
        : undefined,
  }))
})
const history = computed(() =>
  (financial.value?.history ?? []).map((item) =>
    item.period === props.data.context.period
      ? { ...item, revenue: orderTotals.value.revenue, fullCost: orderTotals.value.fullCost }
      : item,
  ),
)
const chart = computed<EChartsCoreOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: { top: 0 },
  grid: { top: 44, left: 62, right: 22, bottom: 33 },
  xAxis: { type: 'category', data: history.value.map((row) => row.period) },
  yAxis: { type: 'value', name: '万元' },
  series: [
    {
      type: 'line',
      name: '销售收入',
      data: history.value.map((row) => (row.revenue == null ? null : row.revenue / 10000)),
    },
    {
      type: 'line',
      name: '完全成本',
      data: history.value.map((row) => (row.fullCost == null ? null : row.fullCost / 10000)),
    },
    {
      type: 'line',
      name: '贡献利润',
      data: history.value.map((row) =>
        row.revenue == null || row.fullCost == null ? null : (row.revenue - row.fullCost) / 10000,
      ),
    },
  ],
}))
const bridge = computed(() => {
  const current = actual.value
  if (!current) return undefined
  const change =
    current.workingCapitalIncrease ??
    (previous.value ? roundMoney(nwc(current) - nwc(previous.value)) : undefined)
  const calculated =
    change == null || current.nonCash == null
      ? undefined
      : roundMoney(orderTotals.value.profit + current.nonCash - change)
  const gap =
    calculated == null || current.cashflow == null
      ? undefined
      : roundMoney(calculated - current.cashflow)
  return { change, calculated, gap }
})
</script>

<template>
  <CostingMetrics :metrics="metrics" />
  <section class="surface costing-panel">
    <div class="costing-toolbar">
      <label
        >对比基线
        <select v-model="comparison" aria-label="对比基线">
          <option value="budget">预算</option>
          <option value="priorMonth">上月</option>
          <option value="priorYear">去年同期</option>
        </select>
      </label>
      <RouterLink class="costing-link" :to="{ name: 'costing-multidim' }">查看订单盈利</RouterLink>
    </div>
    <p class="costing-muted">
      订单分析 {{ data.context.analysisVersion }} · 财务快照 {{ financial?.version ?? '暂无' }}
    </p>
    <ElTable :data="baselineRows" row-key="label">
      <ElTableColumn prop="label" label="项目" min-width="130" />
      <ElTableColumn label="本期" min-width="120" align="right"
        ><template #default="{ row }">{{ money(row.actual) }}</template></ElTableColumn
      >
      <ElTableColumn label="基线" min-width="120" align="right"
        ><template #default="{ row }">{{ money(row.baseline) }}</template></ElTableColumn
      >
      <ElTableColumn label="差额" min-width="120" align="right"
        ><template #default="{ row }">{{ money(row.difference) }}</template></ElTableColumn
      >
    </ElTable>
  </section>
  <div class="costing-split">
    <section class="surface costing-panel">
      <h2>经营结果趋势</h2>
      <ScosChart
        v-if="history.length"
        :option="chart"
        label="最近六期销售收入、完全成本与贡献利润"
        :height="260"
      />
      <ElEmpty v-else description="暂无经营历史快照" :image-size="62" />
    </section>
    <section class="surface costing-panel">
      <h2>利润到经营现金流</h2>
      <dl v-if="bridge" class="bridge">
        <dt>贡献利润</dt>
        <dd>{{ money(orderTotals.profit) }}</dd>
        <dt>加 非现金费用</dt>
        <dd>{{ money(actual?.nonCash) }}</dd>
        <dt>减 净营运资金增加</dt>
        <dd>{{ money(bridge.change) }}</dd>
        <dt>推导经营现金流</dt>
        <dd>{{ money(bridge.calculated) }}</dd>
        <dt>财务快照经营现金流</dt>
        <dd>{{ money(actual?.cashflow) }}</dd>
        <dt>待核对差额</dt>
        <dd :class="{ 'cash-gap': bridge.gap != null && bridge.gap !== 0 }">
          {{ money(bridge.gap) }}
        </dd>
      </dl>
      <ElEmpty v-else description="暂无本期财务快照" :image-size="62" />
    </section>
  </div>
  <section class="surface costing-panel">
    <h2>营运资金与周转</h2>
    <ElTable :data="history" row-key="period" empty-text="暂无营运资金明细">
      <ElTableColumn prop="period" label="期间" min-width="95" />
      <ElTableColumn label="库存资金" min-width="124" align="right"
        ><template #default="{ row }">{{ money(row.inventory) }}</template></ElTableColumn
      >
      <ElTableColumn label="应收账款" min-width="124" align="right"
        ><template #default="{ row }">{{ money(row.receivables) }}</template></ElTableColumn
      >
      <ElTableColumn label="应付账款" min-width="124" align="right"
        ><template #default="{ row }">{{ money(row.payables) }}</template></ElTableColumn
      >
      <ElTableColumn label="净营运资金" min-width="124" align="right"
        ><template #default="{ row }">{{
          money(nwc(row as CostingFinancialPeriod))
        }}</template></ElTableColumn
      >
      <ElTableColumn label="DIO／DSO／DPO（天）" min-width="165" align="right"
        ><template #default="{ row }">{{
          [row.dio, row.dso, row.dpo]
            .map((value) => (value == null ? '—' : formatQuantity(value)))
            .join(' / ')
        }}</template></ElTableColumn
      >
      <ElTableColumn label="现金转换周期" min-width="120" align="right"
        ><template #default="{ row }">{{
          cycleLabel(row as CostingFinancialPeriod)
        }}</template></ElTableColumn
      >
    </ElTable>
  </section>
  <section class="surface costing-panel">
    <h2>经营关注</h2>
    <p>按客户和 SKU 查看低于 15% 的贡献利润率（演示阈值）。</p>
    <ElTable :data="lowMargin" row-key="label" empty-text="当前订单没有触发低利润率提示">
      <ElTableColumn label="客户 / SKU" min-width="150"
        ><template #default="{ row }"
          ><RouterLink
            class="costing-link"
            :to="{
              name: 'costing-multidim',
              query: { dimension: 'customer', sku: row.orders[0]?.sku },
            }"
            >{{ row.label }}</RouterLink
          ></template
        ></ElTableColumn
      >
      <ElTableColumn label="贡献利润" min-width="120" align="right"
        ><template #default="{ row }">{{ money(row.profit) }}</template></ElTableColumn
      >
      <ElTableColumn label="利润率" min-width="100" align="right"
        ><template #default="{ row }">{{ formatRate(row.margin) }}</template></ElTableColumn
      >
    </ElTable>
  </section>
</template>

<style scoped>
.bridge {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
}
.bridge dd {
  margin: 0;
  text-align: right;
}
.bridge .cash-gap {
  color: var(--el-color-warning);
}
</style>
