<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElTag } from 'element-plus'
import type { buildInventoryDailyMonitoring } from '../domain/inventory-daily-monitoring'

const props = defineProps<{
  monitoring: ReturnType<typeof buildInventoryDailyMonitoring>
  productCode: string
  unit: string
  nextEditableWeek?: number
}>()

const metrics = [
  { key: 'production', label: '车间产出' },
  { key: 'availableReceipt', label: '可用入库' },
  { key: 'outbound', label: '出货' },
  { key: 'closingStock', label: '期末可用库存' },
] as const
const date = ref('')
const latestReported = computed(() => props.monitoring.days.filter((day) => day.actual).at(-1))
const dates = computed(() =>
  props.monitoring.days.filter(
    (day) =>
      latestReported.value &&
      day.date <= latestReported.value.date &&
      (day.actual || day.planned.outbound !== null),
  ),
)
const selected = computed(() => dates.value.find((day) => day.date === date.value))
const changes = computed(() =>
  metrics.flatMap(({ key, label }) => {
    const delta = selected.value?.variance[key]
    return delta == null || delta === 0 ? [] : [`${label} ${signed(delta)}`]
  }),
)
const actualState = computed(() => {
  const actual = selected.value?.actual
  if (!actual) return '待回传'
  if (metrics.some(({ key }) => actual[key] === null)) return '部分回传'
  return '回传完整'
})
const rollingFrom = computed(() => {
  const anchor = props.monitoring.anchor
  return anchor
    ? props.monitoring.projection.find((day) => day.date > anchor.date)?.date
    : undefined
})
const strategyReason = computed(() => `${date.value} 日度执行偏差：${changes.value.join('、')}`)
const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 })

watch(
  latestReported,
  (latest) => {
    if (!dates.value.some((day) => day.date === date.value)) date.value = latest?.date ?? ''
  },
  { immediate: true },
)

function amount(value: number | null | undefined) {
  return value == null ? '—' : `${numberFormat.format(value)} ${props.unit}`
}

function signed(value: number | null | undefined) {
  if (value == null) return '—'
  const sign = value < 0 ? '−' : value > 0 ? '+' : ''
  return `${sign}${amount(Math.abs(value))}`
}
</script>

<template>
  <section class="surface daily-variance" aria-labelledby="inventory-daily-variance-heading">
    <header class="variance-heading">
      <div>
        <h2 id="inventory-daily-variance-heading">日度执行偏差</h2>
        <p>每天核对产出、出货与库存，再滚动检查后续补充计划。</p>
      </div>
      <label v-if="dates.length" class="variance-date">
        <span>执行日期</span>
        <select v-model="date">
          <option v-for="day in dates" :key="day.date" :value="day.date">{{ day.date }}</option>
        </select>
      </label>
    </header>

    <template v-if="selected">
      <div class="variance-impact" aria-label="后续库存的起算依据">
        <div>
          <p v-if="selected.variance.closingStock !== null && selected.variance.closingStock !== 0">
            期末可用库存比计划{{ selected.variance.closingStock < 0 ? '少' : '多' }}
            <strong>{{ amount(Math.abs(selected.variance.closingStock)) }}</strong>
          </p>
          <p v-else-if="selected.variance.closingStock === 0">期末可用库存与计划一致。</p>
          <p v-else>该日的库存偏差待核对。</p>
          <p v-if="monitoring.anchor && rollingFrom" class="variance-muted">
            后续预测以 {{ monitoring.anchor.date }} 实际期末可用库存
            <strong>{{ amount(monitoring.anchor.closingStock) }}</strong> 为基准，从
            {{ rollingFrom }} 起重算。
          </p>
          <p v-else-if="!monitoring.anchor" class="variance-muted">
            收到实际期末可用库存后，系统会用它重算后续预测。
          </p>
        </div>
        <div v-if="changes.length" class="variance-actions">
          <RouterLink
            v-if="nextEditableWeek"
            class="variance-primary"
            :to="{
              name: 'inventory-plans',
              query: { mode: 'week', product: productCode, rolling: '1', week: nextEditableWeek },
            }"
          >
            调整补充计划
          </RouterLink>
          <RouterLink
            class="variance-link"
            :to="{
              name: 'inventory-overview',
              query: {
                product: productCode,
                adjust: '1',
                date: selected.date,
                reason: strategyReason,
              },
            }"
          >
            调整库存策略
          </RouterLink>
        </div>
      </div>

      <div class="variance-table-wrap">
        <table class="variance-table" aria-label="每日计划与实际">
          <thead>
            <tr>
              <th scope="col">指标</th>
              <th scope="col">计划</th>
              <th scope="col">
                实际
                <ElTag
                  size="small"
                  effect="plain"
                  :type="actualState === '回传完整' ? 'success' : 'info'"
                >
                  {{ actualState }}
                </ElTag>
              </th>
              <th scope="col">偏差</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ key, label } in metrics" :key="key">
              <th scope="row">{{ label }}</th>
              <td>{{ amount(selected.planned[key]) }}</td>
              <td>
                {{ selected.actual?.[key] == null ? '待回传' : amount(selected.actual[key]) }}
              </td>
              <td :class="{ 'variance-delta': selected.variance[key] }">
                {{ signed(selected.variance[key]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="variance-muted">车间产出按完工统计。可用入库按成品达到可销售状态的日期统计。</p>
    </template>
    <p v-else>暂无日度执行回传。收到实际期末可用库存后，系统会用它重算后续预测。</p>
  </section>
</template>

<style scoped>
.daily-variance {
  display: grid;
  gap: 12px;
  min-width: 0;
  margin-bottom: 16px;
  padding: clamp(12px, 2vw, 22px);
}

.daily-variance h2 {
  font-size: 16px;
}

.variance-heading,
.variance-impact,
.variance-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
}

.variance-heading,
.variance-impact {
  justify-content: space-between;
}

.variance-date {
  display: grid;
  gap: 4px;
  font-size: 13px;
}

.variance-date select {
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid var(--scos-border);
  border-radius: 6px;
  background: var(--scos-surface);
  color: var(--scos-ink);
  font: inherit;
}

.variance-heading p,
.variance-muted {
  color: var(--scos-muted);
  font-size: 12px;
}

.variance-impact {
  padding: 12px 14px;
  border-radius: 7px;
  background: var(--scos-background);
  font-size: 13px;
}

.variance-impact p + p {
  margin-top: 4px;
}

.variance-impact strong {
  color: var(--scos-ink);
}

.variance-primary {
  padding: 7px 12px;
  border-radius: 6px;
  background: var(--scos-primary);
  color: #fff;
}

.variance-link {
  color: var(--scos-primary);
}

.variance-primary:hover,
.variance-link:hover {
  text-decoration: underline;
}

.variance-table-wrap {
  overflow-x: auto;
}

.variance-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.variance-table th,
.variance-table td {
  padding: 8px;
  border-bottom: 1px solid var(--scos-border);
  text-align: right;
  white-space: nowrap;
}

.variance-table th:first-child {
  text-align: left;
}

.variance-table td {
  font-variant-numeric: tabular-nums;
}

.variance-table .variance-delta {
  color: var(--el-color-danger);
  font-weight: 650;
}
</style>
