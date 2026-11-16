<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { env } from '@/shared/config/env'
import {
  ProcurementFuturesChart,
  procurementRepository,
  type ProcurementFuturesMarket,
} from '@/modules/procurement'
import { pricePlan, purchaseCurve } from '../domain/contract-adjustments'
import { uniformProductionLoad } from '../domain/contract'
import { formatValue, round } from '../model/scenarios'
import type {
  ContractInput,
  ContractLoadAdjustment,
  ContractPriceAdjustment,
  ContractProfile,
  SandboxBaseline,
} from '../model/types'

const input = defineModel<ContractInput>({ required: true })
const { baseline, profile } = defineProps<{ baseline: SandboxBaseline; profile: ContractProfile }>()
const emit = defineEmits<{ product: [id: string] }>()

const prices = computed(() => input.value.purchaseAdjustments ?? [])
const market = ref<ProcurementFuturesMarket | null>(null)
const loadingMarket = ref(true)
const marketError = ref(false)
onMounted(async () => {
  try {
    market.value = await procurementRepository.getCornStarchFutures()
  } catch {
    marketError.value = true
  } finally {
    loadingMarket.value = false
  }
})
const curveStart = computed(() => input.value.purchaseCurveStart ?? baseline.start)
const curveMonths = computed(() =>
  input.value.months.filter(({ month }) => month >= curveStart.value.slice(0, 7)),
)
const dailyCurve = computed(() => purchaseCurve(input.value, profile.rawPrice))
const scenarioCurve = computed(() => {
  const nodes = new Map(prices.value.map(({ month }, index) => [month, `price-node-${index}`]))
  return dailyCurve.value
    .filter(({ date, price }) => date >= curveStart.value && Number.isFinite(price))
    .map((point) => ({
      ...point,
      anchorId: point.date === curveStart.value ? 'curve-start' : nodes.get(point.month),
    }))
})
const loads = computed(() => input.value.productionAdjustments ?? [])
const customerName = computed(
  () => baseline.customers.find((item) => item.id === input.value.customer)?.name,
)
const originalLoad = computed(() => uniformProductionLoad(input.value.weeks))
const nextMonth = computed(() => {
  const used = new Set(prices.value.map(({ month }) => month))
  const free = curveMonths.value.filter(({ month }) => !used.has(month))
  return free.find(({ month }) => month > (prices.value.at(-1)?.month ?? '')) ?? free[0]
})
const nextWeek = computed(() =>
  input.value.weeks.find(
    ({ start, state }) =>
      state === '正常生产' &&
      !loads.value.some((range) => range.startWeek <= start && start <= range.endWeek),
  ),
)
const priceSegments = computed(() => {
  const segments: { start: string; end: string; price: number }[] = []
  for (const month of pricePlan(input.value, profile.rawPrice, dailyCurve.value)) {
    const previous = segments.at(-1)
    if (previous?.price === month.price) previous.end = month.month
    else segments.push({ start: month.month, end: month.month, price: month.price })
  }
  return segments
})
const weekEnd = (start: string) => input.value.weeks.find((week) => week.start === start)?.end
const adjustedPrice = (change: number) =>
  Number.isFinite(change) ? formatValue(round(profile.rawPrice + change, 2), '元/吨') : '待填写'
const numberValue = (event: Event) => (event.target as HTMLInputElement).valueAsNumber

function setPrices(next: ContractPriceAdjustment[]) {
  input.value = {
    ...input.value,
    endPurchasePrice: undefined,
    purchaseCurveStart: curveStart.value,
    purchaseAdjustments: next,
  }
}

function updatePrice(index: number, patch: Partial<ContractPriceAdjustment>) {
  setPrices(prices.value.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
}

function setCurvePrice(date: string, price: number, nextDate = date) {
  const month = date.slice(0, 7)
  const change = round(price - profile.rawPrice, 2)
  const index = prices.value.findIndex((row) => row.month === month)
  if (index < 0) setPrices([...prices.value, { month, change }])
  else updatePrice(index, { month: nextDate.slice(0, 7), change })
}

function setLoads(next: ContractLoadAdjustment[]) {
  input.value = { ...input.value, productionAdjustments: next }
}

function updateLoad(index: number, patch: Partial<ContractLoadAdjustment>) {
  setLoads(loads.value.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
}

function setStartWeek(index: number, row: ContractLoadAdjustment, startWeek: string) {
  updateLoad(index, { startWeek, endWeek: row.endWeek < startWeek ? startWeek : row.endWeek })
}
</script>

<template>
  <div class="sb-stack">
    <div class="sb-core-fields sb-contract-fields">
      <label>
        成品
        <select
          :value="input.objectId"
          @change="emit('product', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="item in baseline.profiles" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
      </label>
      <label>
        推演成品售价（元/吨）
        <input
          type="number"
          min="0.01"
          step="0.01"
          :value="Number.isFinite(input.salePrice) ? input.salePrice : ''"
          @input="input = { ...input, salePrice: numberValue($event) }"
        />
        <small>基准售价 {{ formatValue(profile.salePrice, '元/吨') }}</small>
      </label>
    </div>
    <p class="sb-contract-context">
      <strong>模拟合同</strong> {{ customerName }} · {{ formatValue(input.quantity, '吨') }} ·
      {{ input.months[0]?.month }} 至 {{ input.months.at(-1)?.month }}
    </p>

    <section class="sb-contract-adjustment sb-stack" aria-label="采购价调价节点">
      <div class="sb-row">
        <h3>未来原料采购价</h3>
        <button
          type="button"
          class="sb-secondary"
          :disabled="!nextMonth"
          @click="nextMonth && setPrices([...prices, { month: nextMonth.month, change: 0 }])"
        >
          添加价格节点
        </button>
      </div>
      <p class="sb-muted">
        合同采购基准价
        {{
          formatValue(profile.rawPrice, '元/吨')
        }}。填各节点相对基准价的涨跌金额，正数上涨，负数下降。节点之间按日期线性插值，最后一个节点后沿用该价。
      </p>
      <template v-if="input.purchaseCurveStart">
        <p class="sb-muted">
          曲线起点
          {{
            curveStart
          }}。历史期货供参考，未来采购情景线按合同基准价和节点拟合。成本按月内日均价计算。
        </p>
        <ProcurementFuturesChart
          :market="market"
          :loading="loadingMarket"
          :error="marketError"
          :is-mock="env.dataSource === 'mock'"
          :scenario-curve="scenarioCurve"
          :reference-cutoff="curveStart"
          editable-curve
          @price-change="setCurvePrice"
        />
        <p class="sb-muted">
          上下拖动圆点调价格，左右拖动切换月份。起点固定日期，也可用下方的输入项精确调整。
        </p>
      </template>
      <div v-for="(row, index) in prices" :key="index" class="sb-contract-adjustment-row">
        <label>
          节点月份
          <select
            :value="row.month"
            @change="updatePrice(index, { month: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="month in curveMonths" :key="month.month" :value="month.month">
              {{ month.month }}
            </option>
          </select>
        </label>
        <label>
          涨跌金额（元/吨）
          <input
            type="number"
            step="0.01"
            :value="Number.isFinite(row.change) ? row.change : ''"
            @input="updatePrice(index, { change: numberValue($event) })"
          />
        </label>
        <p class="sb-contract-preview">
          节点价格 <strong>{{ adjustedPrice(row.change) }}</strong>
        </p>
        <button
          type="button"
          class="sb-secondary"
          :aria-label="'移除价格节点 ' + (index + 1)"
          @click="setPrices(prices.filter((_, position) => position !== index))"
        >
          移除
        </button>
      </div>
      <p v-if="input.endPurchasePrice != null && !input.purchaseAdjustments" class="sb-muted">
        原方案采用逐日调价，到期价
        {{ formatValue(input.endPurchasePrice, '元/吨') }}。编辑价格节点后改为分段拟合。
      </p>
      <ul v-else class="sb-contract-segments" aria-label="月度采购均价预览">
        <li v-for="segment in priceSegments" :key="segment.start">
          {{ segment.start
          }}<template v-if="segment.end !== segment.start"> 至 {{ segment.end }}</template>
          {{ ' · ' }}
          <strong>{{
            Number.isFinite(segment.price) ? formatValue(segment.price, '元/吨') : '待填写'
          }}</strong>
        </li>
      </ul>
    </section>

    <section class="sb-contract-adjustment sb-stack" aria-label="生产负荷区间">
      <div class="sb-row">
        <h3>生产负荷</h3>
        <button
          type="button"
          class="sb-secondary"
          :disabled="!nextWeek"
          @click="
            nextWeek &&
            setLoads([
              ...loads,
              { startWeek: nextWeek.start, endWeek: nextWeek.start, load: nextWeek.load },
            ])
          "
        >
          添加负荷区间
        </button>
      </div>
      <p class="sb-muted">
        {{
          originalLoad == null
            ? '正常周沿用原计划负荷。'
            : '原计划负荷 ' + formatValue(originalLoad, '%') + '。'
        }}
        区间结束后恢复原计划，停车和开车周沿用排程。
      </p>
      <div v-for="(row, index) in loads" :key="index" class="sb-contract-adjustment-row">
        <label>
          起始生产周
          <select
            :value="row.startWeek"
            @change="setStartWeek(index, row, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="week in input.weeks" :key="week.start" :value="week.start">
              {{ week.start }} 至 {{ week.end.slice(5) }}
            </option>
          </select>
        </label>
        <label>
          结束生产周
          <select
            :value="row.endWeek"
            @change="updateLoad(index, { endWeek: ($event.target as HTMLSelectElement).value })"
          >
            <option
              v-for="week in input.weeks"
              :key="week.start"
              :value="week.start"
              :disabled="week.start < row.startWeek"
            >
              {{ week.start }} 至 {{ week.end.slice(5) }}
            </option>
          </select>
        </label>
        <label>
          目标负荷（%）
          <input
            type="number"
            min="50"
            max="100"
            step="1"
            :value="Number.isFinite(row.load) ? row.load : ''"
            @input="updateLoad(index, { load: numberValue($event) })"
          />
        </label>
        <button
          type="button"
          class="sb-secondary"
          :aria-label="'移除负荷区间 ' + (index + 1)"
          @click="setLoads(loads.filter((_, position) => position !== index))"
        >
          移除
        </button>
      </div>
      <ul v-if="loads.length" class="sb-contract-segments" aria-label="生产负荷预览">
        <li v-for="(row, index) in loads" :key="index">
          {{ row.startWeek }} 至 {{ weekEnd(row.endWeek) }} ·
          <strong>{{ Number.isFinite(row.load) ? formatValue(row.load, '%') : '待填写' }}</strong>
        </li>
      </ul>
    </section>
  </div>
</template>
