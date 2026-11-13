<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { init } from '@/shared/charts/echarts'
import type { EChartsCoreOption, EChartsType } from '@/shared/charts/echarts'

const props = withDefaults(
  defineProps<{ option: EChartsCoreOption; label: string; height?: number }>(),
  { height: 320 },
)
const container = ref<HTMLDivElement>()
let chart: EChartsType | undefined
let observer: ResizeObserver | undefined

onMounted(() => {
  if (!container.value) return
  chart = init(container.value)
  chart.setOption(props.option)
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(container.value)
})
watch(
  () => props.option,
  (option) => chart?.setOption(option, { notMerge: true }),
  { deep: true },
)
onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div
    ref="container"
    role="img"
    :aria-label="label"
    :style="{ height: `${height}px`, width: '100%' }"
  />
</template>
