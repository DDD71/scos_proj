<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, shallowRef } from 'vue'
import { ElAlert, ElButton, ElDialog, ElDrawer } from 'element-plus'
import { env } from '@/shared/config/env'
import { procurementRepository } from '../api/procurement.repository'
import type { ProcurementFuturesContract, ProcurementFuturesMarket } from '../model/futures'
import {
  forecastPeriodMonths,
  forecastsForPlan,
  formatForecastRange,
  getPublishedPriceForecastPoints,
  priceForecastDirectionLabels,
  priceForecastMethodLabels,
  shiftForecastMonth,
  type ProcurementForecastSnapshot,
  type ProcurementFuturesClose,
  type ProcurementPriceForecast,
} from '../model/price-forecast'
import { formatSupplierSyncTime } from '../model/supplier-sync'
import ProcurementFuturesChart from './ProcurementFuturesChart.vue'
import ProcurementPriceExpectationChart from './ProcurementPriceExpectationChart.vue'
import ProcurementPriceForecastRecord from './ProcurementPriceForecastRecord.vue'

const props = defineProps<{
  materialCode: string
  materialName: string
  month: string
  unit: string
  allowForecastMaintenance?: boolean
  snapshot?: ProcurementForecastSnapshot
}>()
const emit = defineEmits<{ reference: [snapshot: ProcurementForecastSnapshot] }>()
const ProcurementPriceForecastMaintenance = defineAsyncComponent(
  () => import('./ProcurementPriceForecastMaintenance.vue'),
)
const maintenanceOpen = ref(false)
const contracts = ref<ProcurementFuturesContract[]>([])
const deliveryMonth = ref('')
const contractCode = ref('')
const comparisonCode = ref('')
const startDate = ref('')
const endDate = ref('')
const market = shallowRef<ProcurementFuturesMarket | null>(null)
const comparisonMarket = shallowRef<ProcurementFuturesMarket | null>(null)
const marketLoading = ref(false)
const marketFailed = ref(false)
const forecastLoading = ref(false)
const forecastError = ref('')
const detail = shallowRef<ProcurementPriceForecast>()
const forecastEndMonth = computed(() => shiftForecastMonth(props.month, 6))
const deliveryMonths = computed(() =>
  [
    ...new Set(
      contracts.value.flatMap((contract) =>
        contract.deliveryMonth ? [contract.deliveryMonth] : [],
      ),
    ),
  ].sort(),
)
const visibleContracts = computed(() =>
  contracts.value.filter(
    (contract) => !deliveryMonth.value || contract.deliveryMonth === deliveryMonth.value,
  ),
)
const comparisonContracts = computed(() =>
  contracts.value.filter(
    (contract) =>
      contract.contractCode !== contractCode.value &&
      contract.unit === market.value?.unit &&
      contract.currency === market.value?.currency,
  ),
)
const invalidDates = computed(() =>
  Boolean(startDate.value && endDate.value && startDate.value > endDate.value),
)

function filterMarket(source: ProcurementFuturesMarket | null) {
  if (!source) return null
  return {
    ...source,
    candles: source.candles.filter(
      ({ tradeDate }) =>
        (!startDate.value || tradeDate >= startDate.value) &&
        (!endDate.value || tradeDate <= endDate.value),
    ),
  }
}

const filteredMarket = computed(() => filterMarket(market.value))
const filteredComparison = computed(() => filterMarket(comparisonMarket.value))
const latestTradeDate = computed(() =>
  market.value?.candles.reduce(
    (latest, candle) => (candle.tradeDate > latest ? candle.tradeDate : latest),
    '',
  ),
)
const points = computed(() =>
  getPublishedPriceForecastPoints(props.snapshot?.forecasts ?? [], props.snapshot?.history).filter(
    ({ month }) => month >= props.month && month <= forecastEndMonth.value,
  ),
)
const trends = computed(() =>
  (props.snapshot?.forecasts ?? [])
    .filter((forecast) => forecast.method === 'trend')
    .flatMap((forecast) =>
      forecast.periods.flatMap((period) =>
        forecastPeriodMonths(period)
          .filter((month) => month >= props.month && month <= forecastEndMonth.value)
          .map((month) => ({ month, period, forecast })),
      ),
    )
    .sort((a, b) => a.month.localeCompare(b.month)),
)

function monthlyHistory(source: ProcurementFuturesMarket | null) {
  const prices = new Map<string, ProcurementFuturesClose>()
  for (const candle of [...(source?.candles ?? [])].sort((a, b) =>
    a.tradeDate.localeCompare(b.tradeDate),
  )) {
    const month = candle.tradeDate.slice(0, 7)
    if (month < props.month) prices.set(month, { month, price: candle.close })
  }
  return [...prices.values()]
}

async function loadMarkets() {
  marketLoading.value = true
  marketFailed.value = false
  try {
    const [primary, comparison] = await Promise.all([
      procurementRepository.getCornStarchFutures(contractCode.value || undefined),
      comparisonCode.value
        ? procurementRepository.getCornStarchFutures(comparisonCode.value)
        : null,
    ])
    market.value = primary
    comparisonMarket.value = comparison
  } catch {
    market.value = null
    comparisonMarket.value = null
    marketFailed.value = true
  } finally {
    marketLoading.value = false
  }
}

function changeDeliveryMonth() {
  contractCode.value = visibleContracts.value[0]?.contractCode ?? ''
  changeContract()
}

function changeContract() {
  comparisonCode.value = ''
  void loadMarkets()
}

async function refreshForecasts() {
  if (props.snapshot?.frozenAt) return
  forecastLoading.value = true
  forecastError.value = ''
  try {
    const forecasts = await procurementRepository.listPriceForecasts(props.materialCode)
    const currency = market.value?.currency ?? 'CNY'
    emit('reference', {
      forecasts: forecastsForPlan(forecasts, props.month, currency, props.unit),
      history: monthlyHistory(market.value),
      referenceContract: market.value?.contractCode,
      capturedAt: new Date().toISOString(),
    })
  } catch (error) {
    forecastError.value = error instanceof Error ? error.message : '预测引用读取失败。'
  } finally {
    forecastLoading.value = false
  }
}

onMounted(async () => {
  marketLoading.value = true
  try {
    contracts.value = await procurementRepository.listCornStarchFuturesContracts()
    contractCode.value = contracts.value[0]?.contractCode ?? ''
  } catch {
    // 兼容仅提供默认合约行情的服务。
  }
  await loadMarkets()
  if (!props.snapshot) await refreshForecasts()
})
</script>

<template>
  <section class="price-decision" :aria-label="materialName + '价格走势与采购参考'">
    <div class="price-block">
      <div class="market-filters">
        <label
          >交割月份
          <select
            v-model="deliveryMonth"
            aria-label="交割月份"
            :disabled="marketLoading"
            @change="changeDeliveryMonth"
          >
            <option value="">全部月份</option>
            <option v-for="delivery in deliveryMonths" :key="delivery">{{ delivery }}</option>
          </select>
        </label>
        <label
          >合约
          <select
            v-model="contractCode"
            aria-label="合约"
            :disabled="marketLoading"
            @change="changeContract"
          >
            <option v-if="!visibleContracts.length" value="">默认合约</option>
            <option v-for="contract in visibleContracts" :key="contract.contractCode">
              {{ contract.contractCode }}
            </option>
          </select>
        </label>
        <label
          >对比合约
          <select
            v-model="comparisonCode"
            aria-label="对比合约"
            :disabled="marketLoading || !comparisonContracts.length"
            @change="loadMarkets"
          >
            <option value="">请选择</option>
            <option v-for="contract in comparisonContracts" :key="contract.contractCode">
              {{ contract.contractCode }}
            </option>
          </select>
        </label>
        <label>起始交易日 <input v-model="startDate" type="date" /></label>
        <label>截止交易日 <input v-model="endDate" type="date" /></label>
      </div>
      <p v-if="latestTradeDate" class="muted">行情截至 {{ latestTradeDate }}</p>
      <ElAlert
        v-if="invalidDates"
        title="截止交易日须晚于或等于起始交易日。"
        type="warning"
        :closable="false"
      />
      <template v-else>
        <ProcurementFuturesChart
          :market="filteredMarket"
          :loading="marketLoading"
          :error="marketFailed"
          :is-mock="env.dataSource === 'mock'"
        />
        <ProcurementFuturesChart
          v-if="filteredComparison && !marketLoading"
          :market="filteredComparison"
          :is-mock="env.dataSource === 'mock'"
        />
      </template>
    </div>

    <section class="price-block" aria-label="方案引用的价格预测">
      <header class="forecast-heading">
        <div>
          <h3>方案引用的价格预测</h3>
          <p class="muted">{{ month }} 至 {{ forecastEndMonth }}</p>
          <p v-if="snapshot?.frozenAt" class="muted">
            引用已冻结 · {{ formatSupplierSyncTime(snapshot.frozenAt) }}
          </p>
          <p v-else-if="snapshot" class="muted">
            引用读取于 {{ formatSupplierSyncTime(snapshot.capturedAt) }}
          </p>
          <p v-if="snapshot?.referenceContract" class="muted">
            历史行情参考合约 {{ snapshot.referenceContract }}
          </p>
        </div>
        <div class="reference-actions">
          <ElButton
            v-if="!snapshot?.frozenAt"
            :loading="forecastLoading"
            :disabled="marketLoading"
            @click="refreshForecasts"
            >刷新预测引用</ElButton
          >
          <ElButton v-if="allowForecastMaintenance" @click="maintenanceOpen = true"
            >维护价格预测</ElButton
          >
        </div>
      </header>
      <ElAlert v-if="forecastError" :title="forecastError" type="warning" :closable="false" />
      <p v-else-if="forecastLoading">正在读取价格预测…</p>
      <p v-else-if="!snapshot?.forecasts.length">本方案期间暂无已发布预测。</p>
      <ProcurementPriceExpectationChart
        v-if="points.length"
        :points="points"
        :history="snapshot?.history ?? []"
        :currency="snapshot?.forecasts[0]?.currency ?? 'CNY'"
        :unit="unit"
      />
      <div v-if="trends.length" class="forecasts">
        <h4>定性趋势</h4>
        <ul>
          <li v-for="{ month: trendMonth, period, forecast } in trends" :key="trendMonth">
            <ElButton link type="primary" @click="detail = forecast"
              >{{ trendMonth }}
              {{
                period.direction ? priceForecastDirectionLabels[period.direction] : '—'
              }}</ElButton
            >
            <span v-if="period.strength || period.confidence || period.basis">{{
              [period.strength, period.confidence && '把握' + period.confidence, period.basis]
                .filter(Boolean)
                .join(' · ')
            }}</span>
          </li>
        </ul>
      </div>
      <div v-if="snapshot?.forecasts.length" class="forecasts">
        <h4>已引用版本</h4>
        <ul>
          <li v-for="forecast in snapshot.forecasts" :key="forecast.id">
            <ElButton link type="primary" @click="detail = forecast"
              >查看 {{ forecast.id }}</ElButton
            >
            <span
              >{{ formatForecastRange(forecast) }} ·
              {{ priceForecastMethodLabels[forecast.method] }} ·
              {{ forecast.submittedBy || '提报人未记录' }}</span
            >
            <span v-if="forecast.publishedAt">{{
              formatSupplierSyncTime(forecast.publishedAt)
            }}</span>
            <span class="reference-basis">{{ forecast.basis }}</span>
          </li>
        </ul>
      </div>
    </section>
    <ElDrawer
      v-if="allowForecastMaintenance"
      v-model="maintenanceOpen"
      :title="materialName + '价格预测维护'"
      size="min(1080px, 100%)"
      append-to-body
      destroy-on-close
    >
      <ProcurementPriceForecastMaintenance
        :material-code="materialCode"
        :material-name="materialName"
        :month="month"
        :currency="market?.currency ?? 'CNY'"
        :unit="unit"
        @published="refreshForecasts"
      />
    </ElDrawer>
    <ElDialog
      :model-value="!!detail"
      title="原始价格预测提报"
      append-to-body
      width="min(840px, 94vw)"
      @update:model-value="detail = undefined"
    >
      <ProcurementPriceForecastRecord v-if="detail" :forecast="detail" />
    </ElDialog>
  </section>
</template>

<style scoped>
.price-decision {
  display: grid;
  gap: 16px;
}
.price-block {
  border: 1px solid var(--scos-border);
  border-radius: 8px;
  padding: 16px;
  min-width: 0;
}
.market-filters,
.reference-actions,
.forecast-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.market-filters {
  margin-bottom: 12px;
  align-items: end;
}
.market-filters label {
  display: grid;
  gap: 5px;
}
.market-filters input,
.market-filters select {
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--scos-border);
  border-radius: 5px;
  color: inherit;
  background: #fff;
}
.forecast-heading {
  justify-content: space-between;
  margin-bottom: 12px;
}
.muted {
  margin: 4px 0;
  font-size: 12px;
  color: var(--scos-muted);
}
.forecasts h4 {
  margin: 12px 0 6px;
}
.forecasts ul {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.forecasts li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 10px;
}

.reference-basis {
  flex-basis: 100%;
  color: var(--scos-muted);
}
</style>
