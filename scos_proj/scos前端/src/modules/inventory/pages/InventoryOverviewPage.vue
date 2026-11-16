<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ElAlert, ElButton, ElEmpty, ElSkeleton, ElTag } from 'element-plus'
import type { EChartsCoreOption } from '@/shared/charts/echarts'
import PageHeader from '@/shared/components/PageHeader.vue'
import ScosChart from '@/shared/components/ScosChart.vue'
import { env } from '@/shared/config/env'
import { getInventorySnapshot } from '../api/inventory.repository'
import InventoryDemandRelease from '../components/InventoryDemandRelease.vue'
import InventoryExceptionPanel from '../components/InventoryExceptionPanel.vue'
import InventoryForecastCalendar from '../components/InventoryForecastCalendar.vue'
import InventoryStrategyEditor from '../components/InventoryStrategyEditor.vue'
import InventoryWaterLevelCard from '../components/InventoryWaterLevelCard.vue'
import InventoryWeeklyOverview from '../components/InventoryWeeklyOverview.vue'
import { calculateInventoryPolicy } from '../domain/inventory'
import { buildInventoryDailyMonitoring } from '../domain/inventory-daily-monitoring'
import { buildInventoryCalendar } from '../domain/overview-calendar'
import { summarizeInventoryWeeks } from '../domain/overview-weeks'
import type { InventorySnapshot } from '../model/types'

const route = useRoute()
const router = useRouter()
const snapshot = ref<InventorySnapshot>()
const loading = ref(true)
const errorMessage = ref('')
const productCode = ref('')
const strategyReason = ref('')
const strategyHeading = ref<HTMLElement>()
const viewingDay = ref(0)
const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const safetyLineColor = '#bf4360'
const reorderLineColor = '#aa5d10'
const demo = env.dataSource === 'mock'

function quantity(value: number, unit: string) {
  return `${numberFormat.format(value)} ${unit}`
}

function signedQuantity(value: number, unit: string) {
  return `${value < 0 ? '−' : value > 0 ? '+' : ''}${quantity(Math.abs(value), unit)}`
}

const products = computed(() => snapshot.value?.products ?? [])
const selectedRow = computed(() => {
  const current = snapshot.value
  const product = current?.products.find(({ code }) => code === productCode.value)
  if (!current || !product) return

  const policy = calculateInventoryPolicy(product)
  const monitoring = buildInventoryDailyMonitoring(current, product)
  const projection = monitoring.projection.filter(({ date }) => date >= current.openingDate)
  const anchor = monitoring.anchor
  const execution = [...monitoring.days].reverse().find(({ actual }) => actual !== null)
  const future = anchor ? projection.filter(({ date }) => date > anchor.date) : projection
  const hasProjection = projection.some(({ closingStock }) => closingStock !== null)
  const plannedDemand = monitoring.days.filter(({ date }) => date >= current.openingDate)
  const periodDemand =
    plannedDemand.length && plannedDemand.every(({ planned }) => planned.outbound !== null)
      ? plannedDemand.reduce((total, { planned }) => total + (planned.outbound ?? 0), 0)
      : null
  const risks = [
    {
      label: '预计缺货',
      date: future.find((day) => (day.shortage ?? 0) > 0)?.date,
    },
    {
      label: '低于安全库存',
      date: future.find((day) => (day.safetyGap ?? 0) > 0)?.date,
    },
    {
      label: '库容风险',
      date: future.find((day) => day.closingStock !== null && day.capacityRisk)?.date,
    },
  ]
  const earliestRisk = risks
    .map(({ date }) => date)
    .filter((date): date is string => Boolean(date))
    .sort()[0]

  return {
    product,
    policy,
    projection,
    future,
    monitoring,
    execution,
    periodDemand,
    hasProjection,
    risks,
    earliestRisk,
  }
})
const otherOccupied = computed(() => {
  const product = selectedRow.value?.product
  if (product?.storageType !== 'shared') return 0
  return products.value
    .filter((item) => item.code !== product.code && item.storageGroup === product.storageGroup)
    .reduce((total, item) => total + item.physicalStock, 0)
})
const selectedQuery = computed(() => (productCode.value ? { product: productCode.value } : {}))
const dailyQuery = computed(() => ({
  ...selectedQuery.value,
  mode: 'day',
  date: selectedRow.value?.execution?.date,
}))
const snapshotDate = computed(() => snapshot.value?.snapshotTime.slice(0, 10) ?? '')
const activeProjection = computed(() => selectedRow.value?.projection ?? [])
const selectedForecastDay = computed(() => activeProjection.value[viewingDay.value - 1])
const selectedActual = computed(
  () =>
    selectedRow.value?.monitoring.days.find(({ date }) => date === selectedForecastDay.value?.date)
      ?.actual,
)
const dateType = computed(() =>
  selectedActual.value?.closingStock != null
    ? '实绩日'
    : selectedForecastDay.value
      ? '预测日'
      : '库存快照',
)
const forecastWeeks = computed(() => summarizeInventoryWeeks(activeProjection.value))
const calendarDays = computed(() =>
  buildInventoryCalendar(activeProjection.value, selectedRow.value?.monitoring.days),
)
const chartOption = computed<EChartsCoreOption>(() => {
  const row = selectedRow.value
  if (!row) return {}

  const dates = row.projection.map((day) => day.date)
  const line = (
    name: string,
    color: string,
    values: (number | null)[],
    type: 'solid' | 'dashed' | 'dotted',
    markSelectedDay = false,
  ) => ({
    name,
    type: 'line' as const,
    data: values,
    showSymbol: false,
    z: type === 'solid' ? 4 : 3,
    lineStyle: { color, type, width: type === 'solid' ? 3 : 2 },
    itemStyle: { color },
    markLine:
      markSelectedDay && selectedForecastDay.value
        ? {
            silent: true,
            symbol: 'none',
            label: { show: false },
            lineStyle: { color: '#17649d', type: 'dashed', width: 1.5 },
            data: [{ xAxis: selectedForecastDay.value.date }],
          }
        : undefined,
  })

  return {
    animation: false,
    grid: { left: 64, right: 20, top: 28, bottom: 68 },
    legend: { bottom: 4, width: '96%', itemGap: 12 },
    tooltip: {
      trigger: 'axis',
      confine: true,
      transitionDuration: 0,
      valueFormatter: (value: unknown) =>
        typeof value === 'number' ? quantity(value, row.product.unit) : '暂无预测',
    },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLabel: { formatter: (date: string) => date.slice(5), hideOverlap: true },
    },
    yAxis: { type: 'value', name: row.product.unit },
    series: [
      line(
        '预计库存（已确认入库）',
        '#617e98',
        row.projection.map((day) => day.closingStock),
        'dashed',
      ),
      line(
        '按当前策略补充后',
        '#147b69',
        row.projection.map((day) => day.scenarioClosingStock),
        'solid',
        true,
      ),
      line(
        '安全库存',
        safetyLineColor,
        row.projection.map((day) => day.safetyStock),
        'dotted',
      ),
      line(
        '补货点',
        reorderLineColor,
        row.projection.map((day) => day.reorderPoint),
        'dashed',
      ),
    ],
  }
})

function applyProduct(query: unknown) {
  if (!products.value.length) return
  const selected = products.value.find((product) => product.code === query)
  const defaultProduct = products.value.find(
    (product) => product.code === 'FG-F55' || /F55/i.test(product.name),
  )
  const code = (selected ?? defaultProduct ?? products.value[0])?.code ?? ''
  productCode.value = code
}

function selectProduct(code: string) {
  productCode.value = code
  strategyReason.value = ''
  void router.replace({ query: { ...route.query, product: code, reason: undefined } })
}

function viewForecastDate(date: string) {
  const index = activeProjection.value.findIndex((day) => day.date === date)
  if (index >= 0) viewingDay.value = index + 1
}

async function openStrategy(reason = '') {
  if (reason) strategyReason.value = reason
  await nextTick()
  strategyHeading.value?.focus()
}

async function updateConfirmedPolicy() {
  try {
    snapshot.value = await getInventorySnapshot()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '确认后刷新库存失败。'
  }
}

async function loadOverview() {
  loading.value = true
  errorMessage.value = ''
  try {
    snapshot.value = await getInventorySnapshot()
    applyProduct(route.query.product)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '读取库存优化数据失败，请重试。'
  } finally {
    loading.value = false
  }
  if (!errorMessage.value) await applyOverviewContext()
}

async function applyOverviewContext() {
  if (typeof route.query.date === 'string') viewForecastDate(route.query.date)
  if (route.query.adjust === '1') {
    await openStrategy(typeof route.query.reason === 'string' ? route.query.reason : '')
  }
}

watch(() => route.query.product, applyProduct)
watch([() => route.query.date, () => route.query.adjust, () => route.query.reason], () => {
  if (route.name === 'inventory-overview' && snapshot.value) void applyOverviewContext()
})
onMounted(loadOverview)
</script>

<template>
  <div>
    <PageHeader title="库存优化" eyebrow="成品库存优化">
      <template #actions>
        <RouterLink class="page-link" :to="{ name: 'inventory-plans', query: dailyQuery }">
          查看日度执行偏差
        </RouterLink>
        <RouterLink
          class="page-link page-link-primary"
          :to="{ name: 'inventory-plans', query: selectedQuery }"
          >查看补货计划明细</RouterLink
        >
      </template>
    </PageHeader>

    <ElSkeleton v-if="loading" :rows="5" animated class="surface overview-section" />
    <section
      v-else-if="errorMessage"
      class="surface overview-section"
      aria-label="库存数据加载失败"
    >
      <ElAlert type="error" :title="errorMessage" show-icon :closable="false" />
      <ElButton class="retry-button" @click="loadOverview">重试</ElButton>
    </section>
    <ElEmpty
      v-else-if="!snapshot || !products.length"
      class="surface overview-section"
      description="暂无成品库存数据"
    />

    <template v-else>
      <section class="surface overview-section" aria-label="销售计划与现有成品库存">
        <div class="filters">
          <p v-if="selectedRow?.projection.length" class="prediction-period">
            预测日期
            <strong
              >{{ selectedRow.projection[0]?.date }} 至
              {{ selectedRow.projection.at(-1)?.date }}</strong
            >
          </p>
          <label>
            <span>成品</span>
            <select
              :value="productCode"
              @change="selectProduct(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="product in products" :key="product.code" :value="product.code">
                {{ product.name }} · {{ product.code }}
              </option>
            </select>
          </label>
          <p>
            工厂 <strong>{{ snapshot.plant }}</strong>
          </p>
          <p class="snapshot-date">
            期初快照 {{ snapshot.snapshotTime.replace('T', ' ').slice(0, 16) }}
          </p>
          <ElTag v-if="demo" type="info" effect="plain">演示数据</ElTag>
        </div>

        <div v-if="selectedRow" class="metric-grid">
          <article class="primary-metric">
            <div class="metric-heading">
              <h2>销售计划</h2>
            </div>
            <dl class="metric-values">
              <div>
                <dt>预测期计划出货量</dt>
                <dd>
                  {{
                    selectedRow.periodDemand === null
                      ? '待补充'
                      : quantity(selectedRow.periodDemand, selectedRow.product.unit)
                  }}
                </dd>
              </div>
            </dl>
            <p>
              {{ snapshot.month }} 月度计划
              {{ quantity(selectedRow.product.monthlyDemand, selectedRow.product.unit) }}
            </p>
          </article>
          <article class="primary-metric">
            <div class="metric-heading">
              <h2>现有成品库存</h2>
            </div>
            <dl class="metric-values">
              <div>
                <dt>可用库存</dt>
                <dd>
                  {{
                    quantity(
                      selectedRow.monitoring.anchor?.closingStock ??
                        selectedRow.product.availableStock,
                      selectedRow.product.unit,
                    )
                  }}
                </dd>
              </div>
              <div>
                <dt>罐内实物库存</dt>
                <dd>{{ quantity(selectedRow.product.physicalStock, selectedRow.product.unit) }}</dd>
              </div>
            </dl>
            <p v-if="selectedRow.monitoring.anchor">
              可用库存截至 {{ selectedRow.monitoring.anchor.date }} 日终 · 罐内实物库存取
              {{ snapshotDate }} 快照
            </p>
            <p v-else>来源：WMS 库存快照与储罐占用记录</p>
          </article>
          <section class="primary-metric" aria-label="成品库存与风险">
            <div class="metric-heading">
              <h2>预测期库存风险</h2>
              <ElTag v-if="selectedRow.earliestRisk" type="danger" effect="plain">有风险</ElTag>
            </div>
            <dl v-if="selectedRow.hasProjection" class="risk-facts">
              <div v-for="risk in selectedRow.risks" :key="risk.label">
                <dt>{{ risk.label }}</dt>
                <dd :class="{ warning: risk.date }">
                  {{ risk.date ?? '暂未发现' }}
                </dd>
              </div>
            </dl>
            <p v-else>库存预测数据待补充。</p>
            <p v-if="selectedRow.earliestRisk">
              缺货和低于安全库存按已确认入库判断。日期为最早预计发生时间。
            </p>
          </section>
        </div>
        <section
          v-if="selectedRow?.execution"
          class="execution-notice"
          aria-labelledby="inventory-latest-execution"
        >
          <div>
            <h2 id="inventory-latest-execution">最新日度执行偏差</h2>
            <p>
              {{ selectedRow.execution.date }}
              <template v-if="selectedRow.execution.variance.production !== null">
                · 车间产出
                {{
                  signedQuantity(
                    selectedRow.execution.variance.production,
                    selectedRow.product.unit,
                  )
                }}
              </template>
              <template v-if="selectedRow.execution.variance.outbound !== null">
                · 出货
                {{
                  signedQuantity(selectedRow.execution.variance.outbound, selectedRow.product.unit)
                }}
              </template>
            </p>
          </div>
          <strong
            v-if="selectedRow.execution.variance.closingStock !== null"
            :class="{ warning: selectedRow.execution.variance.closingStock < 0 }"
          >
            期末可用库存偏差
            {{
              signedQuantity(selectedRow.execution.variance.closingStock, selectedRow.product.unit)
            }}
          </strong>
        </section>
      </section>

      <section
        v-if="selectedRow"
        id="inventory-strategy-adjustment"
        class="surface overview-section"
        aria-labelledby="inventory-strategy-adjustment-heading"
      >
        <header class="section-heading">
          <h2 id="inventory-strategy-adjustment-heading" ref="strategyHeading" tabindex="-1">
            库存策略调整
          </h2>
          <RouterLink
            class="text-link"
            :to="{ name: 'inventory-health', query: { ...selectedQuery, from: 'strategy' } }"
          >
            查看上期评价
          </RouterLink>
        </header>
        <InventoryStrategyEditor
          :snapshot="snapshot"
          :product="selectedRow.product"
          :initial-reason="strategyReason"
          @confirmed="updateConfirmedPolicy"
        />
      </section>

      <section
        v-if="selectedRow"
        id="inventory-projection"
        class="surface overview-section"
        aria-labelledby="inventory-projection-heading"
      >
        <div class="section-heading">
          <div>
            <h2 id="inventory-projection-heading">库存预测</h2>
            <p>已回传日期显示实际期末库存，其余日期显示预测。补货点随计划出货量逐日变化。</p>
            <p v-if="selectedRow.monitoring.anchor">
              自 {{ selectedRow.monitoring.anchor.date }} 按实际期末库存滚动 ·
              {{ quantity(selectedRow.monitoring.anchor.closingStock, selectedRow.product.unit) }}
            </p>
          </div>
          <div class="prediction-actions">
            <ElTag type="info" effect="plain" size="small">
              策略 {{ selectedRow.product.policyVersion ?? snapshot.strategyVersion }}
            </ElTag>
            <RouterLink class="text-link" :to="{ name: 'inventory-plans', query: dailyQuery }">
              查看日滚动明细
            </RouterLink>
          </div>
        </div>
        <InventoryDemandRelease
          :snapshot="snapshot"
          :product="selectedRow.product"
          :projection="selectedRow.future"
        />
        <div class="projection-layout">
          <InventoryWaterLevelCard
            id="inventory-water-level"
            class="water-panel"
            :product="selectedRow.product"
            :policy="selectedRow.policy"
            :other-occupied="otherOccupied"
            :snapshot-date="snapshotDate"
            :forecast-day="selectedForecastDay"
            :actual="selectedActual?.closingStock != null"
          />
          <div class="forecast-panel">
            <ScosChart
              v-if="selectedRow.hasProjection"
              :option="chartOption"
              :label="`${selectedRow.product.name} 每日可用库存预测`"
              aria-describedby="inventory-forecast-note"
              :height="300"
            />
            <ElEmpty v-else description="暂无可用的库存预测" :image-size="56" />
            <p
              v-if="selectedRow.hasProjection"
              id="inventory-forecast-note"
              class="forecast-chart-note"
            >
              是否补货按计入提前期内预计入库的库存判断。
            </p>
            <div v-if="selectedRow.hasProjection" class="date-slider">
              <div class="date-slider-heading">
                <label for="inventory-forecast-day">查看日期</label>
                <span>
                  <time :datetime="selectedForecastDay?.date ?? snapshotDate">
                    {{ selectedForecastDay?.date ?? snapshotDate }}
                  </time>
                  · {{ dateType }}
                </span>
              </div>
              <input
                id="inventory-forecast-day"
                v-model.number="viewingDay"
                type="range"
                min="0"
                :max="selectedRow.projection.length"
                step="1"
                aria-controls="inventory-water-level"
                :aria-valuetext="`${selectedForecastDay?.date ?? snapshotDate} ${dateType}`"
              />
              <div class="date-slider-endpoints" aria-hidden="true">
                <span>{{ snapshotDate }} 快照</span>
                <span>{{ selectedRow.projection.at(-1)?.date }}</span>
              </div>
            </div>
          </div>
        </div>
        <InventoryWeeklyOverview
          v-if="selectedRow.hasProjection"
          class="forecast-weeks"
          :weeks="forecastWeeks"
          :unit="selectedRow.product.unit"
          :active-week="selectedForecastDay?.week ?? forecastWeeks[0]?.week"
          @select="viewForecastDate"
        />
        <InventoryForecastCalendar
          class="forecast-calendar"
          :days="calendarDays"
          :unit="selectedRow.product.unit"
          :selected-date="selectedForecastDay?.date"
          @select="viewForecastDate"
        />
      </section>
      <InventoryExceptionPanel
        v-if="selectedRow"
        class="surface overview-section"
        :product="selectedRow.product"
        :products="products"
        :demo="demo"
        @adjust="openStrategy"
      />
    </template>
  </div>
</template>

<style scoped>
.overview-section {
  min-width: 0;
  margin-bottom: 16px;
  padding: clamp(14px, 2vw, 22px);
}

.filters,
.section-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 18px;
}

.filters p,
.section-heading p {
  margin: 0;
  color: var(--scos-muted);
  font-size: 13px;
}

.filters strong {
  margin-inline-start: 6px;
  color: var(--scos-ink);
}

.prediction-period strong {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.filters label {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--scos-muted);
  font-size: 13px;
}

.filters select {
  max-width: 100%;
  min-height: 34px;
  border: 1px solid var(--scos-border);
  border-radius: 6px;
  padding: 4px 8px;
  background: var(--scos-surface);
  color: var(--scos-ink);
  font: inherit;
}

.filters .snapshot-date {
  margin-inline-start: auto;
}

.projection-layout {
  --inventory-safety-color: v-bind(safetyLineColor);
  --inventory-reorder-color: v-bind(reorderLineColor);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(275px, 30%);
  grid-template-areas: 'forecast water';
  align-items: center;
  gap: 16px;
}

.water-panel {
  grid-area: water;
}

.forecast-panel {
  grid-area: forecast;
  min-width: 0;
}

.forecast-chart-note {
  margin: 0 0 8px;
  color: var(--scos-muted);
  font-size: 12px;
}

.date-slider {
  padding: 10px 12px;
  border: 1px solid var(--scos-border);
  border-radius: 7px;
  background: var(--scos-background);
}

.date-slider-heading,
.date-slider-endpoints {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
  font-variant-numeric: tabular-nums;
}

.date-slider-heading {
  align-items: baseline;
  font-size: 13px;
}

.date-slider-heading label,
.date-slider-heading time {
  font-weight: 650;
}

.date-slider-heading span,
.date-slider-endpoints {
  color: var(--scos-muted);
}

.date-slider-heading time {
  color: var(--scos-ink);
}

.date-slider input {
  display: block;
  width: 100%;
  height: 24px;
  margin: 2px 0;
  accent-color: var(--scos-primary);
}

.date-slider-endpoints {
  font-size: 12px;
}

.prediction-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
}

.forecast-weeks,
.forecast-calendar {
  margin-top: 16px;
}

.execution-notice {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px 16px;
  margin-top: 12px;
  padding: 10px 14px;
  border: 1px solid var(--scos-border);
  border-radius: 8px;
}

.execution-notice h2,
.execution-notice p {
  margin: 0;
}

.execution-notice h2 {
  font-size: 15px;
}

.execution-notice p {
  margin-top: 3px;
  color: var(--scos-muted);
  font-size: 13px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 254px), 1fr));
  gap: 12px;
  margin-top: 14px;
}

.primary-metric {
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--scos-border);
  border-radius: 8px;
  background: var(--scos-background);
}

.metric-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
}

.metric-heading h2 {
  margin: 0;
  color: var(--scos-ink);
  font-size: 17px;
}

.metric-values dt,
.primary-metric p,
.risk-facts dt {
  color: var(--scos-muted);
  font-size: 12px;
}

.metric-values {
  display: flex;
  flex-wrap: wrap;
  gap: 6px clamp(14px, 2vw, 28px);
  margin: 8px 0 6px;
}

.metric-values dd {
  margin: 1px 0 0;
  color: var(--scos-ink);
  font-size: clamp(22px, 2.3vw, 30px);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.primary-metric p {
  margin: 0;
}

.risk-facts {
  display: grid;
  gap: 3px;
  margin: 7px 0 5px;
  font-size: 13px;
}

.risk-facts > div {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0 10px;
}

.risk-facts dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.warning {
  color: var(--el-color-danger-dark-2, #b13e2c);
  font-weight: 650;
}

.section-heading {
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-heading h2 {
  margin: 0 0 4px;
  font-size: 17px;
}

.page-link {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 5px 12px;
  border: 1px solid var(--scos-border);
  border-radius: 6px;
  color: var(--scos-primary);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}

.page-link-primary {
  border-color: var(--scos-primary);
  background: var(--scos-primary);
  color: #fff;
}

.page-link:hover,
.text-link:hover {
  text-decoration: underline;
}

.text-link {
  color: var(--scos-primary);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.retry-button {
  margin-top: 12px;
}

@media (max-width: 650px) {
  .filters .snapshot-date {
    margin-inline-start: 0;
  }
}

@media (max-width: 1020px) {
  .projection-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'forecast' 'water';
  }
}
</style>
