<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElAlert, ElButton, ElDialog, ElInput, ElInputNumber } from 'element-plus'
import {
  forecastGranularityLabels,
  forecastGranularityMonths,
  shiftForecastMonth,
  type ProcurementPriceForecast,
  type ProcurementPriceForecastGranularity,
  type ProcurementPriceForecastInput,
  type ProcurementPriceForecastPeriod,
} from '../model/price-forecast'

const props = defineProps<{
  modelValue: boolean
  materialName: string
  initialMonth: string
  currency: string
  unit: string
  editing?: ProcurementPriceForecast
  revision?: ProcurementPriceForecast
  saveError?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [open: boolean]
  save: [input: ProcurementPriceForecastInput]
}>()

type Method = ProcurementPriceForecastInput['method']
type Direction = NonNullable<ProcurementPriceForecastPeriod['direction']>

const method = ref<Method>('price')
const granularity = ref<ProcurementPriceForecastGranularity>('month')
const startMonth = ref('')
const endMonth = ref('')
const baselinePrice = ref<number>()
const basis = ref('')
const source = ref('')
const riskNote = ref('')
const error = ref('')
const prices = reactive<Record<string, number | undefined>>({})
const changes = reactive<Record<string, number | undefined>>({})
const directions = reactive<Record<string, Direction | undefined>>({})
const strengths = reactive<Record<string, ProcurementPriceForecastPeriod['strength']>>({})
const confidences = reactive<Record<string, ProcurementPriceForecastPeriod['confidence']>>({})
const periodBases = reactive<Record<string, string>>({})

const forecast = computed(() => props.editing ?? props.revision)
const isRevision = computed(() => Boolean(props.revision || props.editing?.replacesId))
const originalMonths = computed(
  () =>
    props.revision?.periods.flatMap(({ month, endMonth }) => [month, endMonth ?? month]).sort() ??
    [],
)
const title = computed(() => {
  if (props.editing) return '编辑价格预测草稿'
  return isRevision.value ? '修订已发布预测' : '新建价格预测'
})
const priceUnit = computed(() => {
  const currency = forecast.value?.currency ?? props.currency
  return [currency === 'CNY' ? '元' : currency, forecast.value?.unit ?? props.unit]
    .filter(Boolean)
    .join('/')
})

function monthIndex(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1
}

const range = computed(() => {
  const start = monthIndex(startMonth.value)
  const end = monthIndex(endMonth.value)
  if (start == null || end == null) return { months: [], issue: '请选择开始月份和结束月份。' }
  if (end < start) return { months: [], issue: '结束月份不能早于开始月份。' }
  if (originalMonths.value.some((month) => month < startMonth.value || month > endMonth.value)) {
    return { months: [], issue: '修订范围须包含原预测的全部月份。' }
  }
  const step = forecastGranularityMonths[granularity.value]
  const months = Array.from({ length: Math.ceil((end - start + 1) / step) }, (_, index) =>
    shiftForecastMonth(startMonth.value, step * index),
  )
  return { months, issue: '' }
})

function periodEnd(month: string) {
  const end = shiftForecastMonth(month, forecastGranularityMonths[granularity.value] - 1)
  return end < endMonth.value ? end : endMonth.value
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const current = forecast.value
    const periods = [...(current?.periods ?? [])].sort((a, b) => a.month.localeCompare(b.month))
    method.value = current?.method ?? 'price'
    granularity.value = current?.granularity ?? 'month'
    startMonth.value = periods[0]?.month ?? props.initialMonth
    endMonth.value = periods.at(-1)?.endMonth ?? periods.at(-1)?.month ?? props.initialMonth
    baselinePrice.value = current?.baselinePrice
    basis.value = current?.basis ?? ''
    source.value = current?.source ?? ''
    riskNote.value = current?.riskNote ?? ''
    error.value = ''
    for (const values of [prices, changes, directions, strengths, confidences, periodBases]) {
      for (const month of Object.keys(values)) delete values[month]
    }
    for (const period of periods) {
      if (method.value === 'price') prices[period.month] = period.value
      else if (method.value === 'change') changes[period.month] = period.value
      else {
        directions[period.month] = period.direction
        strengths[period.month] = period.strength
        confidences[period.month] = period.confidence
        periodBases[period.month] = period.basis ?? ''
      }
    }
  },
  { immediate: true },
)

function save() {
  error.value = range.value.issue
  if (error.value) return

  const evidence = basis.value.trim()
  if (!evidence) {
    error.value = '请填写研判依据。'
    return
  }

  const chosen = method.value
  const baseline = baselinePrice.value
  if (chosen === 'change' && (baseline == null || !Number.isFinite(baseline) || baseline <= 0)) {
    error.value = '请录入大于 0 的基准价格。'
    return
  }

  const periods: ProcurementPriceForecastPeriod[] = []
  for (const month of range.value.months) {
    const endMonth = periodEnd(month)
    if (chosen === 'trend') {
      const direction = directions[month]
      if (!direction) {
        error.value = `请选择 ${month} 的趋势方向。`
        return
      }
      periods.push({
        month,
        endMonth,
        direction,
        strength: strengths[month],
        confidence: confidences[month],
        basis: periodBases[month]?.trim(),
      })
      continue
    }

    const value = chosen === 'price' ? prices[month] : changes[month]
    if (value == null || !Number.isFinite(value) || (chosen === 'price' && value <= 0)) {
      error.value =
        chosen === 'price' ? `请录入 ${month} 大于 0 的预测价格。` : `请录入 ${month} 的涨跌幅。`
      return
    }
    if (chosen === 'change' && value <= -100) {
      error.value = `${month} 的涨跌幅须大于 -100%。`
      return
    }
    periods.push({ month, endMonth, value })
  }

  emit('save', {
    method: chosen,
    granularity: granularity.value,
    periods,
    ...(chosen === 'change' ? { baselinePrice: baseline } : {}),
    basis: evidence,
    source: source.value.trim(),
    riskNote: riskNote.value.trim(),
  })
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    :title="title"
    width="min(calc(100vw - 32px), 680px)"
    :close-on-click-modal="false"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="forecast-form" novalidate @submit.prevent="save">
      <p class="forecast-context">{{ materialName }} · 人工提报</p>
      <p v-if="isRevision" class="forecast-note">
        修订版本发布前，原预测继续生效。
        <template v-if="originalMonths.length">
          修订须覆盖原预测期间 {{ originalMonths[0] }} 至 {{ originalMonths.at(-1) }}。
        </template>
      </p>
      <div class="forecast-fields">
        <label class="forecast-field">
          <span>颗粒度</span>
          <select v-model="granularity">
            <option v-for="(label, key) in forecastGranularityLabels" :key="key" :value="key">
              {{ label }}
            </option>
          </select>
        </label>
        <label class="forecast-field">
          <span>开始月份</span>
          <input v-model="startMonth" type="month" />
        </label>
        <label class="forecast-field">
          <span>结束月份</span>
          <input v-model="endMonth" type="month" />
        </label>
        <label class="forecast-field">
          <span>提报方式</span>
          <select v-model="method" :disabled="isRevision">
            <option value="price">直接维护价格</option>
            <option value="change">维护涨跌幅度</option>
            <option value="trend">只维护趋势</option>
          </select>
        </label>
        <div v-if="method === 'change'" class="forecast-field">
          <label for="forecast-baseline">基准价格（{{ priceUnit }}）</label>
          <ElInputNumber id="forecast-baseline" v-model="baselinePrice" :controls="false" />
        </div>
      </div>

      <p v-if="range.issue" class="forecast-note">{{ range.issue }}</p>
      <template v-else>
        <p v-if="method === 'change'" class="forecast-note">
          连续期间承接上一期预测价，首期无连续预测时使用基准价。
        </p>
        <div class="forecast-months">
          <div v-for="month in range.months" :key="month" class="forecast-row">
            <span
              >{{ month }}{{ periodEnd(month) === month ? '' : ' 至 ' + periodEnd(month) }}</span
            >
            <ElInputNumber
              v-if="method === 'price'"
              v-model="prices[month]"
              :aria-label="`${month} 预测价格（${priceUnit}）`"
              :placeholder="`预测价格（${priceUnit}）`"
              :controls="false"
            />
            <ElInputNumber
              v-else-if="method === 'change'"
              v-model="changes[month]"
              :aria-label="`${month} 涨跌幅（%）`"
              placeholder="涨跌幅（%）"
              :controls="false"
            />
            <select v-else v-model="directions[month]" :aria-label="`${month} 趋势方向`">
              <option :value="undefined" disabled>选择趋势方向</option>
              <option value="up">上升</option>
              <option value="flat">平稳</option>
              <option value="down">下降</option>
            </select>
            <div v-if="method === 'trend'" class="trend-fields">
              <label
                >趋势强度
                <select v-model="strengths[month]" :aria-label="`${month} 趋势强度`">
                  <option :value="undefined">请选择</option>
                  <option>轻微</option>
                  <option>温和</option>
                  <option>明显</option>
                </select>
              </label>
              <label
                >判断把握
                <select v-model="confidences[month]" :aria-label="`${month} 判断把握`">
                  <option :value="undefined">请选择</option>
                  <option>低</option>
                  <option>中</option>
                  <option>高</option>
                </select>
              </label>
              <label
                >本期依据
                <ElInput v-model="periodBases[month]" :aria-label="`${month} 本期依据`" />
              </label>
            </div>
          </div>
        </div>
      </template>

      <div class="forecast-field">
        <label for="forecast-basis">研判依据</label>
        <ElInput
          id="forecast-basis"
          v-model="basis"
          type="textarea"
          :rows="3"
          placeholder="请说明本次价格研判的依据"
        />
      </div>
      <label class="forecast-field">数据来源 <ElInput v-model="source" /></label>
      <label class="forecast-field"
        >风险说明 <ElInput v-model="riskNote" type="textarea" :rows="2"
      /></label>
      <ElAlert
        v-if="error || saveError"
        :title="error || saveError"
        type="error"
        :closable="false"
        show-icon
      />
      <div class="forecast-actions">
        <ElButton @click="emit('update:modelValue', false)">取消</ElButton>
        <ElButton type="primary" native-type="submit">保存草稿</ElButton>
      </div>
    </form>
  </ElDialog>
</template>

<style scoped>
.trend-fields {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.trend-fields label {
  display: grid;
  gap: 4px;
}

.forecast-form {
  display: grid;
  gap: 16px;
}

.forecast-context {
  color: var(--scos-ink);
  font-weight: 600;
}

.forecast-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 155px), 1fr));
  gap: 12px 16px;
}

.forecast-field {
  display: grid;
  align-content: start;
  gap: 6px;
}

.forecast-field :is(input[type='month'], select),
.forecast-row select {
  width: 100%;
  min-width: 0;
  height: 32px;
  padding-inline: 10px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-blank);
}

.forecast-note {
  color: var(--scos-muted);
  font-size: 12px;
}

.forecast-months {
  display: grid;
  max-height: 240px;
  overflow-y: auto;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--scos-border);
  border-radius: 6px;
}

.forecast-row {
  display: grid;
  grid-template-columns: minmax(65px, 1fr) minmax(0, 2fr);
  align-items: center;
  gap: 8px 12px;
}

.el-input-number {
  width: 100%;
}

.forecast-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
