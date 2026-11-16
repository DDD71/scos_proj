<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElAlert, ElButton, ElDrawer, ElEmpty, ElTable, ElTableColumn } from 'element-plus'
import ScosChart from '@/shared/components/ScosChart.vue'
import type { EChartsCoreOption } from '@/shared/charts/echarts'
import CostingMetrics from '../components/CostingMetrics.vue'
import {
  dimensions,
  formatRate,
  groupOrders,
  money,
  roundMoney,
  sumMoney,
  summarizeOrders,
  type CostDimension,
} from '../domain/analysis'
import type { CostingOrder, CostingSnapshot } from '../model/snapshot'

const props = defineProps<{ data: CostingSnapshot }>()
const route = useRoute()
const router = useRouter()
function setFilter(key: string, value: string) {
  void router.replace({ query: { ...route.query, [key]: value || undefined } })
}
const dimension = computed<CostDimension>(() =>
  typeof route.query.dimension === 'string' && Object.hasOwn(dimensions, route.query.dimension)
    ? (route.query.dimension as CostDimension)
    : 'customer',
)
const sku = computed(() => (typeof route.query.sku === 'string' ? route.query.sku : ''))
const start = computed(() => (typeof route.query.start === 'string' ? route.query.start : ''))
const end = computed(() => (typeof route.query.end === 'string' ? route.query.end : ''))
const skus = computed(() => [...new Set(props.data.orders.map((order) => order.sku))])
const dateIssue = computed(() => start.value && end.value && start.value > end.value)
const orders = computed(() =>
  dateIssue.value
    ? []
    : props.data.orders.filter(
        (order) =>
          (!sku.value || order.sku === sku.value) &&
          (!start.value || order.date >= start.value) &&
          (!end.value || order.date <= end.value),
      ),
)
const groups = computed(() => groupOrders(orders.value, dimension.value))
const summary = computed(() => summarizeOrders(orders.value))
const productionIds = computed(() => new Set(orders.value.map((order) => order.productionOrder)))
const batchRows = computed(() =>
  props.data.orderBatches.filter((row) => productionIds.value.has(row.productionOrder)),
)
const bottomCost = computed(() => sumMoney(batchRows.value, (row) => row.recognizedProductionCost))
const difference = computed(() => roundMoney(summary.value.productionCost - bottomCost.value))
const standardComparisonOpen = shallowRef(false)
const standardComparison = computed(() =>
  props.data.costs.flatMap((row) => {
    const standard = props.data.standardCosts?.find(
      (item) =>
        item.material === row.material && item.stage === row.stage && item.unit === row.unit,
    )
    if (!standard || row.unitCost == null) return []
    const difference = roundMoney(row.unitCost - standard.unitCost)
    return [
      {
        ...row,
        standard,
        difference,
        rate: standard.unitCost > 0 ? difference / standard.unitCost : null,
      },
    ]
  }),
)
const metrics = computed(() => [
  { label: '生产成本', value: money(summary.value.productionCost) },
  { label: '完全成本', value: money(summary.value.fullCost) },
  { label: '销售收入', value: money(summary.value.revenue) },
  { label: '贡献利润', value: money(summary.value.profit) },
  { label: '综合利润率', value: formatRate(summary.value.margin) },
  { label: '订单成本对账差额', value: money(difference.value) },
])
const chart = computed<EChartsCoreOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: { top: 0 },
  grid: { top: 44, left: 74, right: 20, bottom: groups.value.length > 4 ? 83 : 65 },
  xAxis: {
    type: 'category',
    data: groups.value.map((row) => row.label),
    axisLabel: { interval: 0, rotate: 16 },
  },
  yAxis: { type: 'value', name: '元' },
  dataZoom:
    groups.value.length > 4
      ? [{ type: 'slider', height: 15, bottom: 2, startValue: 0, endValue: 4 }]
      : [],
  series: [
    {
      type: 'bar',
      name: '生产成本',
      data: groups.value.map((row) => row.productionCost),
      itemStyle: { color: '#3787d5' },
    },
    {
      type: 'bar',
      name: '完全成本',
      data: groups.value.map((row) => row.fullCost),
      itemStyle: { color: '#8c65d3' },
    },
    {
      type: 'bar',
      name: '销售收入',
      data: groups.value.map((row) => row.revenue),
      itemStyle: { color: '#14998b' },
    },
  ],
}))
type Group = ReturnType<typeof groupOrders>[number]
const detail = shallowRef<Group>()
const detailOpened = shallowRef(false)
const reconcileOpen = shallowRef(false)
const detailBatches = computed(() => {
  const ids = new Set(detail.value?.orders.map((order) => order.productionOrder))
  return batchRows.value.filter((row) => ids.has(row.productionOrder))
})
const categories = computed(() => {
  const values = new Map<string, number>()
  for (const order of detail.value?.orders ?? []) {
    for (const [name, value] of Object.entries(order.costCategories)) {
      values.set(name, roundMoney((values.get(name) ?? 0) + value))
    }
  }
  return [...values].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
})
const categoryChart = computed<EChartsCoreOption>(() => ({
  tooltip: { trigger: 'item' },
  series: [
    {
      type: 'pie',
      radius: ['36%', '70%'],
      label: { show: false },
      data: categories.value.filter((item) => item.value > 0),
    },
  ],
}))
function showOrder(order: CostingOrder) {
  detail.value = {
    label: order.salesOrder + ' · ' + order.productionOrder,
    orders: [order],
    ...summarizeOrders([order]),
  }
}

function showGroup(label: string) {
  detail.value = groups.value.find((row) => row.label === label)
}

function closeDetail() {
  detailOpened.value = false
  detail.value = undefined
}
</script>

<template>
  <section class="surface costing-panel">
    <div class="costing-toolbar">
      <label
        >开始日期
        <input
          type="date"
          :value="start"
          @change="setFilter('start', ($event.target as HTMLInputElement).value)"
      /></label>
      <label
        >结束日期
        <input
          type="date"
          :value="end"
          @change="setFilter('end', ($event.target as HTMLInputElement).value)"
      /></label>
      <label
        >主维度
        <select
          aria-label="主维度"
          :value="dimension"
          @change="setFilter('dimension', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="(label, key) in dimensions" :key="key" :value="key">{{ label }}</option>
        </select></label
      >
      <label
        >SKU
        <select
          aria-label="SKU"
          :value="sku"
          @change="setFilter('sku', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">全部 SKU</option>
          <option v-for="item in skus" :key="item">{{ item }}</option>
        </select></label
      >
      <ElButton :disabled="!orders.length" @click="reconcileOpen = true">查看对账</ElButton>
      <RouterLink class="costing-link" :to="{ name: 'costing-management' }"
        >管理决策分析</RouterLink
      >
    </div>
    <ElAlert
      v-if="dateIssue"
      title="结束日期须晚于或等于开始日期。"
      type="warning"
      :closable="false"
    />
    <p class="costing-muted">订单分析版本 {{ data.context.analysisVersion }}</p>
  </section>
  <ElEmpty v-if="!orders.length" description="当前筛选没有已结转订单" />
  <template v-else>
    <CostingMetrics :metrics="metrics" />
    <section class="surface costing-panel">
      <h2>生产成本、完全成本与销售收入</h2>
      <ScosChart
        :option="chart"
        label="各维度生产成本、完全成本和销售收入对比"
        :height="330"
        @point-click="showGroup"
      />
    </section>
    <section class="surface costing-panel">
      <h2>盈利明细</h2>
      <ElTable :data="groups" row-key="label">
        <ElTableColumn
          :label="dimensions[dimension] + (dimension === 'sku' ? '' : ' / SKU')"
          min-width="180"
          ><template #default="{ row }"
            ><ElButton link type="primary" @click="detail = row as Group">{{
              row.label
            }}</ElButton></template
          ></ElTableColumn
        >
        <ElTableColumn label="生产成本" min-width="121" align="right"
          ><template #default="{ row }">{{ money(row.productionCost) }}</template></ElTableColumn
        >
        <ElTableColumn label="完全成本" min-width="121" align="right"
          ><template #default="{ row }">{{ money(row.fullCost) }}</template></ElTableColumn
        >
        <ElTableColumn label="销售收入" min-width="121" align="right"
          ><template #default="{ row }">{{ money(row.revenue) }}</template></ElTableColumn
        >
        <ElTableColumn label="贡献利润" min-width="121" align="right"
          ><template #default="{ row }">{{ money(row.profit) }}</template></ElTableColumn
        >
        <ElTableColumn label="利润率" min-width="95" align="right"
          ><template #default="{ row }">{{ formatRate(row.margin) }}</template></ElTableColumn
        >
      </ElTable>
    </section>
    <section class="surface costing-panel">
      <h2>订单与批次关系</h2>
      <details>
        <summary>销售订单 → 生产订单 · {{ orders.length }} 条</summary>
        <ElTable :data="orders" row-key="id" max-height="420">
          <ElTableColumn label="销售订单" min-width="145"
            ><template #default="{ row }"
              ><ElButton link type="primary" @click="showOrder(row as CostingOrder)">{{
                row.salesOrder
              }}</ElButton></template
            ></ElTableColumn
          >
          <ElTableColumn prop="productionOrder" label="生产订单" min-width="150" /><ElTableColumn
            prop="sku"
            label="SKU"
            min-width="95"
          />
          <ElTableColumn label="结转批次" min-width="145"
            ><template #default="{ row }"
              ><RouterLink
                class="costing-link"
                :to="{ name: 'costing-batch', query: { batch: row.settlementBatch } }"
                >{{ row.settlementBatch }}</RouterLink
              ></template
            ></ElTableColumn
          >
          <ElTableColumn label="生产成本" min-width="121" align="right"
            ><template #default="{ row }">{{ money(row.productionCost) }}</template></ElTableColumn
          >
        </ElTable>
      </details>
      <details>
        <summary>生产订单 → 生产批次 · {{ batchRows.length }} 条</summary>
        <ElTable :data="batchRows" row-key="id" max-height="420">
          <ElTableColumn prop="productionOrder" label="生产订单" min-width="150" />
          <ElTableColumn label="生产批次" min-width="145"
            ><template #default="{ row }"
              ><RouterLink
                class="costing-link"
                :to="{ name: 'costing-batch', query: { batch: row.batch } }"
                >{{ row.batch }}</RouterLink
              ></template
            ></ElTableColumn
          >
          <ElTableColumn label="结转成本" min-width="121" align="right"
            ><template #default="{ row }">{{
              money(row.recognizedProductionCost)
            }}</template></ElTableColumn
          >
        </ElTable>
      </details>
    </section>
  </template>
  <details
    class="surface costing-panel standard-comparison"
    @toggle="standardComparisonOpen = ($event.currentTarget as HTMLDetailsElement).open"
  >
    <summary>实际与标准成本对比</summary>
    <p class="costing-muted">按当前成本期间，匹配相同物料、工序和计量单位的标准成本。</p>
    <ElTable
      v-if="standardComparisonOpen"
      :data="standardComparison"
      row-key="batch"
      max-height="390"
      empty-text="当前快照无可比的标准成本"
    >
      <ElTableColumn label="批次" min-width="160">
        <template #default="{ row }">
          <RouterLink
            class="costing-link"
            :to="{ name: 'costing-batch', query: { batch: row.batch } }"
          >
            {{ row.batch }}
          </RouterLink>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="material" label="物料" min-width="110" />
      <ElTableColumn prop="standard.version" label="标准成本 BOM 版本" min-width="195" />
      <ElTableColumn label="标准单位成本" min-width="120" align="right">
        <template #default="{ row }">{{ money(row.standard.unitCost) }}/{{ row.unit }}</template>
      </ElTableColumn>
      <ElTableColumn label="实际单位成本" min-width="120" align="right">
        <template #default="{ row }">{{ money(row.unitCost) }}/{{ row.unit }}</template>
      </ElTableColumn>
      <ElTableColumn label="单位差异" min-width="112" align="right">
        <template #default="{ row }">{{ money(row.difference) }}/{{ row.unit }}</template>
      </ElTableColumn>
      <ElTableColumn label="差异率" min-width="100" align="right">
        <template #default="{ row }">{{ formatRate(row.rate) }}</template>
      </ElTableColumn>
    </ElTable>
  </details>
  <ElDrawer
    :model-value="Boolean(detail)"
    :title="detail?.label ?? '订单成本明细'"
    size="min(780px, 95vw)"
    append-to-body
    @opened="detailOpened = true"
    @close="closeDetail"
  >
    <template v-if="detail">
      <h3>真实成本类别</h3>
      <p>正向成本见环形图，抵减项和金额见明细。</p>
      <ScosChart
        v-if="detailOpened && categories.some((item) => item.value > 0)"
        :option="categoryChart"
        label="选中行成本构成"
        :height="220"
      />
      <ElTable :data="categories" max-height="300" row-key="name">
        <ElTableColumn prop="name" label="成本类别" min-width="165" />
        <ElTableColumn label="金额" min-width="120" align="right"
          ><template #default="{ row }">{{ money(row.value) }}</template></ElTableColumn
        >
      </ElTable>
      <p>
        分类合计 {{ money(sumMoney(categories, (item) => item.value)) }} · 与完全成本差额
        {{ money(roundMoney(detail.fullCost - sumMoney(categories, (item) => item.value))) }}
      </p>
      <h3>来源订单</h3>
      <ElTable :data="detail.orders" max-height="240" row-key="id">
        <ElTableColumn label="销售订单" min-width="125">
          <template #default="{ row }">
            <RouterLink :to="{ name: 'costing-traceability', query: { order: row.salesOrder } }">
              {{ row.salesOrder }}
            </RouterLink>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="productionOrder" label="生产订单" min-width="125" />
        <ElTableColumn label="成品结转批次" min-width="150"
          ><template #default="{ row }"
            ><RouterLink :to="{ name: 'costing-batch', query: { batch: row.settlementBatch } }">{{
              row.settlementBatch
            }}</RouterLink></template
          ></ElTableColumn
        >
      </ElTable>
      <h3>关联生产批次</h3>
      <ElTable :data="detailBatches" max-height="240" row-key="id">
        <ElTableColumn prop="productionOrder" label="生产订单" min-width="125" />
        <ElTableColumn label="生产批次" min-width="145"
          ><template #default="{ row }"
            ><RouterLink :to="{ name: 'costing-traceability', query: { batch: row.batch } }">{{
              row.batch
            }}</RouterLink></template
          ></ElTableColumn
        >
        <ElTableColumn label="结转成本" min-width="121" align="right"
          ><template #default="{ row }">{{
            money(row.recognizedProductionCost)
          }}</template></ElTableColumn
        >
      </ElTable>
    </template>
  </ElDrawer>
  <ElDrawer v-model="reconcileOpen" title="订单成本对账" size="min(520px, 95vw)" append-to-body>
    <dl>
      <dt>分析版本</dt>
      <dd>{{ data.context.analysisVersion }}</dd>
      <dt>批次结转成本</dt>
      <dd>{{ money(bottomCost) }}</dd>
      <dt>订单生产成本</dt>
      <dd>{{ money(summary.productionCost) }}</dd>
      <dt>差额</dt>
      <dd>{{ money(difference) }}</dd>
    </dl>
  </ElDrawer>
</template>

<style scoped>
details:not(.standard-comparison) {
  padding: 7px 0;
}
summary {
  cursor: pointer;
  color: var(--scos-primary);
}
.standard-comparison summary {
  font-weight: 600;
}
</style>
