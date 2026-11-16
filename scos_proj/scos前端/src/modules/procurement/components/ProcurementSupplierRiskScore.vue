<script setup lang="ts">
import { isRiskSupplier } from '../model/supplier-risk'

defineProps<{ score?: number | null }>()
</script>

<template>
  <span :class="{ 'risk-score-low': isRiskSupplier(score) }">{{ score ?? '待维护' }}</span>
</template>

<style scoped>
.risk-score-low {
  color: #9a3d14;
}
</style>
