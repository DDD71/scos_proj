<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { init } from '@/shared/charts/echarts'
import type { EChartsCoreOption, EChartsType } from '@/shared/charts/echarts'

const props = withDefaults(
  defineProps<{
    option: EChartsCoreOption
    label: string
    height?: number
    preserveZoom?: boolean
  }>(),
  { height: 320, preserveZoom: false },
)
const emit = defineEmits<{
  pointClick: [name: string]
  graphClick: [type: 'node' | 'edge', id: string]
  plotChange: [chart: EChartsType]
}>()
const container = ref<HTMLDivElement>()
let chart: EChartsType | undefined
let observer: ResizeObserver | undefined

function notifyPlotChange() {
  if (chart) emit('plotChange', chart)
}

onMounted(() => {
  if (!container.value) return
  chart = init(container.value)
  chart.setOption(props.option)
  chart.on('click', ({ name, componentType, dataType, data }) => {
    if (componentType === 'series' && name) emit('pointClick', name)
    if (dataType === 'node' || dataType === 'edge') {
      const id = (data as { id?: string } | undefined)?.id
      if (id) emit('graphClick', dataType, id)
    }
  })
  chart.on('datazoom', notifyPlotChange)
  observer = new ResizeObserver(() => {
    chart?.resize()
    notifyPlotChange()
  })
  observer.observe(container.value)
  notifyPlotChange()
})
watch(
  () => props.option,
  (option) => {
    chart?.setOption(option, { notMerge: !props.preserveZoom })
    notifyPlotChange()
  },
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
