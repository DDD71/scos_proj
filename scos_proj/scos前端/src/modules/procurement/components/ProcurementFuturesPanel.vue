<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { env } from '@/shared/config/env'
import { procurementRepository } from '../api/procurement.repository'
import type { ProcurementFuturesMarket } from '../model/futures'
import ProcurementFuturesChart from './ProcurementFuturesChart.vue'

const market = ref<ProcurementFuturesMarket | null>(null)
const loading = ref(true)
const error = ref(false)

onMounted(async () => {
  try {
    market.value = await procurementRepository.getCornStarchFutures()
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <ProcurementFuturesChart
    :market="market"
    :loading="loading"
    :error="error"
    :is-mock="env.dataSource === 'mock'"
  />
</template>
