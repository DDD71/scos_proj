<script setup lang="ts">
defineProps<{ metrics: { label: string; value: string | number }[] }>()
</script>

<template>
  <dl class="costing-metrics">
    <div v-for="metric in metrics" :key="metric.label" class="surface">
      <dt>{{ metric.label }}</dt>
      <dd>{{ metric.value }}</dd>
    </div>
  </dl>
</template>
