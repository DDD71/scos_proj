<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ElButton, ElTag } from 'element-plus'
import type { InventoryHealthReport } from '../domain/inventory-health'

const props = defineProps<{
  analysis: InventoryHealthReport
  unit: string
  compact?: boolean
}>()

const metrics = [
  { key: 'production', label: '车间产出' },
  { key: 'availableReceipt', label: '可用入库' },
  { key: 'outbound', label: '出货' },
  { key: 'closingStock', label: '期末可用库存' },
] as const
const healthGrades = {
  green: { label: '绿色 · 正常', tone: 'success' },
  yellow: { label: '黄色 · 需关注', tone: 'warning' },
  red: { label: '红色 · 预警', tone: 'danger' },
  insufficient: { label: '数据不足', tone: 'info' },
} as const
const strategyGrades = {
  effective: { label: '有效', tone: 'success' },
  attention: { label: '需关注', tone: 'warning' },
  improve: { label: '需改进', tone: 'warning' },
  insufficient: { label: '待评估', tone: 'info' },
} as const
const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 })
const dailyDetails = ref<HTMLDetailsElement>()
const highlightedDates = ref<string[]>([])
const summaryId = computed(() =>
  props.compact ? 'inventory-monthly-execution' : 'inventory-health-monthly-execution',
)
const monthlyRows = computed(() =>
  metrics.flatMap(({ key, label }) => {
    const result = props.analysis.metrics.find((item) => item.key === key)
    if (!result) return []
    return [{ ...result, label: key === 'closingStock' ? '月末可用库存' : label }]
  }),
)
const alerts = computed(() => props.analysis.alerts)
const verdict = computed(() => props.analysis.verdict)
const healthGrade = computed(() => healthGrades[verdict.value.level])
const strategyGrade = computed(() => strategyGrades[verdict.value.strategyEffectiveness])
const alertTone = computed(() => {
  if (verdict.value.level === 'red') return 'danger'
  if (verdict.value.level !== 'green' || alerts.value.length) return 'warning'
  return 'success'
})
const alertLabel = computed(() => {
  if (verdict.value.level === 'insufficient') return '数据不足，待评估'
  if (verdict.value.level !== 'green') return '已触发预警'
  return alerts.value.length ? '执行数据待补齐' : '本月无预警'
})

watch(
  () => [props.analysis.period, props.analysis.productCode],
  () => {
    highlightedDates.value = []
    if (dailyDetails.value) dailyDetails.value.open = false
  },
)

function amount(value: number | null | undefined, missing = '—') {
  return value == null ? missing : `${numberFormat.format(value)} ${props.unit}`
}

function deviation(value: number | null) {
  if (value == null || value === 0) return amount(value)
  return `${value < 0 ? '−' : '+'}${amount(Math.abs(value))}`
}

function datesLabel(dates: readonly string[]) {
  return dates.length > 3
    ? `${dates.slice(0, 3).join('、')} 等 ${dates.length} 天`
    : dates.join('、')
}

async function showDates(dates: string[]) {
  if (!dailyDetails.value) return
  highlightedDates.value = dates
  dailyDetails.value.open = true
  await nextTick()
  dailyDetails.value?.querySelector<HTMLElement>(`#inventory-health-day-${dates[0]}`)?.focus()
}
</script>

<template>
  <div class="health-report">
    <section
      v-if="!compact"
      class="surface health-block"
      aria-labelledby="inventory-health-verdict"
    >
      <header class="block-heading">
        <h2 id="inventory-health-verdict">月度总评</h2>
        <span class="coverage">
          风险评估数据齐全 {{ analysis.totalDays - verdict.missingRiskDates.length }} /
          {{ analysis.totalDays }} 天
        </span>
      </header>
      <dl class="verdict-dimensions">
        <div>
          <dt>健康等级</dt>
          <dd>
            <ElTag :type="healthGrade.tone" effect="plain">{{ healthGrade.label }}</ElTag>
            <p>{{ verdict.healthReason }}</p>
          </dd>
        </div>
        <div>
          <dt>策略有效性</dt>
          <dd>
            <ElTag :type="strategyGrade.tone" effect="plain">{{ strategyGrade.label }}</ElTag>
            <p>{{ verdict.strategyReason }}</p>
          </dd>
        </div>
      </dl>
      <div v-if="verdict.evidenceDates.length" class="verdict-actions">
        <p class="evidence-dates">{{ datesLabel(verdict.evidenceDates) }}</p>
        <ElButton link type="primary" @click="showDates(verdict.evidenceDates)"
          >查看总评依据</ElButton
        >
      </div>
    </section>

    <div v-if="!compact" class="decision-grid">
      <section class="surface health-block" aria-labelledby="inventory-health-alerts">
        <header class="block-heading">
          <h2 id="inventory-health-alerts">预警结论</h2>
          <ElTag :type="alertTone" effect="plain">{{ alertLabel }}</ElTag>
        </header>
        <ul v-if="alerts.length" class="findings">
          <li v-for="alert in alerts" :key="alert.id">
            <h3>{{ alert.title }}</h3>
            <p>{{ alert.detail }}</p>
            <p v-if="alert.dates.length" class="evidence-dates">{{ datesLabel(alert.dates) }}</p>
          </li>
        </ul>
        <p v-else-if="verdict.missingRiskDates.length" class="block-note">
          部分日期的库存风险数据待补齐，补齐后重新评估。
        </p>
        <p v-else class="block-note">本月实绩已完整回传，系统未检测到库存预警。</p>
      </section>

      <section class="surface health-block" aria-labelledby="inventory-health-recommendation">
        <header class="block-heading">
          <h2 id="inventory-health-recommendation">策略建议</h2>
        </header>
        <h3>{{ analysis.recommendation.title }}</h3>
        <p class="block-note">{{ analysis.recommendation.detail }}</p>
        <p v-if="analysis.recommendation.dates.length" class="evidence-dates">
          {{ datesLabel(analysis.recommendation.dates) }}
        </p>
        <RouterLink
          v-if="analysis.recommendation.status === 'review'"
          class="text-link"
          :to="{
            name: 'inventory-overview',
            query: {
              product: analysis.productCode,
              adjust: '1',
              reason: analysis.recommendation.reason,
            },
          }"
        >
          查看策略改进
        </RouterLink>
      </section>
    </div>

    <section
      class="execution-summary"
      :class="{ 'surface health-block': !compact }"
      :aria-labelledby="summaryId"
    >
      <header class="block-heading">
        <h2 :id="summaryId">月度执行汇总</h2>
        <span class="coverage"
          >执行数据完整回传 {{ analysis.reportedDays }} / {{ analysis.totalDays }} 天</span
        >
      </header>
      <p class="block-note">
        计划 {{ analysis.planVersion }} · 策略 {{ analysis.strategyVersion }}
      </p>
      <div class="table-wrap">
        <table class="health-table monthly-table" aria-label="月度计划与实际">
          <thead>
            <tr>
              <th scope="col">指标</th>
              <th scope="col">计划</th>
              <th scope="col">实际</th>
              <th scope="col">偏差</th>
              <th scope="col">对比范围</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="metric in monthlyRows" :key="metric.key">
              <th scope="row">{{ metric.label }}</th>
              <td>{{ amount(metric.planned) }}</td>
              <td>{{ amount(metric.actual, '待回传') }}</td>
              <td :class="{ 'has-deviation': Boolean(metric.variance) }">
                {{ deviation(metric.variance) }}
              </td>
              <td class="coverage">
                {{ metric.basis === 'monthEnd' ? '月末当日' : `${metric.comparedDays} 天` }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="block-note summary-note">
        产出、可用入库和出货按同一批有计划和实际的日期累计。月末库存对比月末当天的期末值。
      </p>
    </section>

    <template v-if="!compact">
      <section class="surface health-block" aria-labelledby="inventory-health-tasks">
        <header class="block-heading">
          <h2 id="inventory-health-tasks">跟踪任务</h2>
          <span class="coverage">系统根据本月结果生成</span>
        </header>
        <ul v-if="analysis.trackingTasks.length" class="task-list">
          <li v-for="task in analysis.trackingTasks" :key="task.id">
            <div>
              <h3>{{ task.title }}</h3>
              <p>{{ task.detail }}</p>
              <p v-if="task.dates.length" class="evidence-dates">{{ datesLabel(task.dates) }}</p>
            </div>
            <ElButton v-if="task.dates.length" link type="primary" @click="showDates(task.dates)">
              查看涉及日期
            </ElButton>
          </li>
        </ul>
        <p v-else class="block-note">本月暂无需要跟踪的事项。</p>
      </section>

      <details ref="dailyDetails" class="surface health-block daily-details">
        <summary>每日执行明细</summary>
        <p class="block-note daily-context">
          {{ analysis.source }} · 偏差为实际减计划，单位 {{ unit }}。
        </p>
        <div class="table-wrap">
          <table class="health-table daily-table" aria-label="每日计划与实际">
            <colgroup span="1" />
            <colgroup v-for="{ key } in metrics" :key="key" span="3" />
            <colgroup span="1" />
            <thead>
              <tr>
                <th scope="col" rowspan="2" class="day-date">日期</th>
                <th
                  v-for="{ key, label } in metrics"
                  :key="key"
                  scope="colgroup"
                  colspan="3"
                  class="metric-group"
                >
                  {{ label }}
                </th>
                <th scope="col" rowspan="2">风险依据</th>
              </tr>
              <tr>
                <template v-for="{ key, label } in metrics" :key="key">
                  <th scope="col" :aria-label="`${label}计划`">计划</th>
                  <th scope="col" :aria-label="`${label}实际`">实际</th>
                  <th scope="col" :aria-label="`${label}偏差`" class="metric-group-end">偏差</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="day in analysis.days"
                :id="`inventory-health-day-${day.date}`"
                :key="day.date"
                tabindex="-1"
                :class="{ 'highlighted-day': highlightedDates.includes(day.date) }"
              >
                <th scope="row" class="day-date">{{ day.date }}</th>
                <template v-for="{ key } in metrics" :key="key">
                  <td>{{ amount(day.planned[key]) }}</td>
                  <td>{{ amount(day.actual?.[key], '待回传') }}</td>
                  <td
                    class="metric-group-end"
                    :class="{ 'has-deviation': Boolean(day.variance[key]) }"
                  >
                    {{ deviation(day.variance[key]) }}
                  </td>
                </template>
                <td class="risk-evidence">
                  <span>安全库存 {{ amount(day.safetyStock, '待补齐') }}</span>
                  <span :class="{ 'has-deviation': (day.stockoutQty ?? 0) > 0 }">
                    实际缺货 {{ amount(day.stockoutQty, '待回传') }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
.health-report {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.decision-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
  gap: 16px;
}

.health-block {
  min-width: 0;
  padding: clamp(14px, 2vw, 22px);
}

.execution-summary {
  min-width: 0;
}

.verdict-dimensions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 10px;
  margin: 0;
}

.verdict-dimensions > div {
  padding: 10px 12px;
  border: 1px solid var(--scos-border);
  border-radius: 6px;
  background: var(--scos-background);
}

.verdict-dimensions dt {
  color: var(--scos-muted);
  font-size: 13px;
}

.verdict-dimensions dd {
  margin: 4px 0 0;
}

.verdict-dimensions p {
  margin-top: 6px;
}

.verdict-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
  margin-top: 8px;
}

.block-heading,
.task-list li {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px 12px;
}

h2,
.daily-details summary {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}

h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
}

.block-heading {
  margin-bottom: 8px;
}

p,
.coverage {
  margin: 0;
  color: var(--scos-muted);
  font-size: 13px;
}

.findings,
.task-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.findings li + li,
.task-list li + li {
  padding-top: 9px;
  border-top: 1px solid var(--scos-border);
}

.findings p,
.task-list p,
h3 + .block-note {
  margin-top: 3px;
}

.evidence-dates {
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.text-link {
  display: inline-block;
  margin-top: 10px;
  color: var(--scos-primary);
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
}

.text-link:hover {
  text-decoration: underline;
}

.table-wrap {
  margin-top: 10px;
  overflow-x: auto;
}

.health-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.health-table th,
.health-table td {
  padding: 7px 9px;
  border-bottom: 1px solid var(--scos-border);
  text-align: right;
  white-space: nowrap;
}

.health-table thead {
  background: var(--scos-background);
}

.health-table th:first-child {
  text-align: left;
}

.health-table .has-deviation {
  color: var(--el-color-warning-dark-2, #8a5007);
  font-weight: 650;
}

.monthly-table {
  min-width: 400px;
}

.summary-note,
.daily-context {
  margin-top: 8px;
}

.daily-details summary {
  cursor: pointer;
}

.daily-table {
  min-width: 935px;
}

.daily-table .metric-group {
  text-align: center;
}

.risk-evidence span {
  display: block;
}

.metric-group,
.metric-group-end {
  border-inline-end: 1px solid var(--scos-border);
}

.daily-table .day-date {
  position: sticky;
  inset-inline-start: 0;
  z-index: 1;
  border-inline-end: 1px solid var(--scos-border);
  background: var(--scos-surface);
}

.daily-table thead .day-date {
  background: var(--scos-background);
}

.highlighted-day > td,
.highlighted-day > .day-date {
  background: var(--scos-primary-soft);
}

@media (max-width: 480px) {
  .health-table th,
  .health-table td {
    padding-inline: 6px;
  }

  .monthly-table {
    min-width: 360px;
  }
}
</style>
