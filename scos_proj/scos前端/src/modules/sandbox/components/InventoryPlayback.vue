<script setup lang="ts">
import { computed } from 'vue'
import { formatValue } from '../model/scenarios'
import { inventoryState, stockOnHand, usableReceipt } from '../model/result-presentation'
import type { DailyResult, SandboxPoint } from '../model/types'

const { result, point, raw } = defineProps<{
  result: DailyResult
  point: SandboxPoint
  raw: boolean
}>()

const state = computed(() => inventoryState(point.simulated, result.safety, raw))
const warehouse = computed(() => (raw ? '原料库' : '成品库'))
const current = computed(() => stockOnHand(point.simulated.closing))
const availableReceipt = computed(() => usableReceipt(point.simulated))
const scale = computed(() =>
  Math.max(0, result.capacity ?? 0, ...result.days.map((day) => day.simulated.closing ?? 0)),
)
const fill = computed(() => (scale.value ? ((current.value ?? 0) / scale.value) * 100 : 0))
</script>

<template>
  <section class="sb-flow-shell" aria-label="当日库存流向" :data-tone="state.tone">
    <h4>当日库存流向</h4>
    <div class="sb-flow-movement">
      <span>{{ raw ? '采购到货' : '生产入库' }}</span>
      <strong>{{ formatValue(point.simulated.receipt, result.unit) }}</strong>
    </div>
    <small v-if="availableReceipt != null && availableReceipt !== point.simulated.receipt"
      >当天可用入库 {{ formatValue(availableReceipt, result.unit) }}</small
    >
    <span class="sb-flow-arrow" aria-hidden="true">↓</span>
    <div class="sb-flow-center">
      <span>{{ warehouse }}期末可用库存</span>
      <div class="sb-vessel">
        <div class="sb-vessel-fill" :style="{ height: fill + '%' }" aria-hidden="true"></div>
        <strong class="sb-vessel-value">{{ formatValue(current, result.unit) }}</strong>
      </div>
      <span class="sb-day-state">{{ state.text }}</span>
    </div>
    <span class="sb-flow-arrow" aria-hidden="true">↓</span>
    <div class="sb-flow-movement">
      <span>{{ raw ? '生产耗用需求' : '出库需求' }}</span>
      <strong>{{ formatValue(point.simulated.demand, result.unit) }}</strong>
    </div>
  </section>
</template>
