<script setup lang="ts">
import { useRoute } from 'vue-router'
import CostingTraceQuery from '../components/CostingTraceQuery.vue'
import CostingQualityImpact from '../components/CostingQualityImpact.vue'
import type { CostingSnapshot } from '../model/snapshot'

defineProps<{ data: CostingSnapshot }>()
const route = useRoute()
</script>

<template>
  <nav class="section-tabs trace-tabs" aria-label="全程追溯协同视图">
    <RouterLink
      v-slot="{ href, navigate }"
      :to="{ query: { ...route.query, tab: undefined } }"
      custom
    >
      <a
        :href="href"
        :class="{ 'router-link-active': route.query.tab !== 'impact' }"
        :aria-current="route.query.tab !== 'impact' ? 'page' : undefined"
        @click="navigate"
        >追溯查询</a
      >
    </RouterLink>
    <RouterLink
      v-slot="{ href, navigate }"
      :to="{ query: { ...route.query, tab: 'impact' } }"
      custom
    >
      <a
        :href="href"
        :class="{ 'router-link-active': route.query.tab === 'impact' }"
        :aria-current="route.query.tab === 'impact' ? 'page' : undefined"
        @click="navigate"
        >质量影响与协同</a
      >
    </RouterLink>
  </nav>
  <CostingQualityImpact v-if="route.query.tab === 'impact'" :data="data" />
  <CostingTraceQuery v-else :data="data" />
</template>
