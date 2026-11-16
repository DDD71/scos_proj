<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { use, registerMap } from 'echarts/core'
import { LinesChart, ScatterChart } from 'echarts/charts'
import { GeoComponent } from 'echarts/components'
import { init, type EChartsCoreOption, type EChartsType } from '@/shared/charts/echarts'
import china from '../assets/china.geo.json'
import type { DashboardMapNode, DashboardMapRoute } from '../model/types'

const props = defineProps<{ nodes: DashboardMapNode[]; routes: DashboardMapRoute[] }>()
const emit = defineEmits<{
  node: [node: DashboardMapNode]
  route: [route: DashboardMapRoute]
}>()

use([GeoComponent, LinesChart, ScatterChart])
registerMap('scos-demo-china', china as Parameters<typeof registerMap>[1])

const container = ref<HTMLDivElement>()
const layer = ref<'all' | DashboardMapRoute['kind']>('all')
const zoom = ref(1)
const scaleLimit = { min: 0.8, max: 3 }
const location = ref('')
let chart: EChartsType | undefined
let observer: ResizeObserver | undefined
let resizeFrame = 0

const layerNodes = computed(() =>
  props.nodes.filter(
    ({ kind }) =>
      layer.value === 'all' ||
      kind === 'factory' ||
      (layer.value === 'inbound' ? kind === 'supplier' : kind === 'customer'),
  ),
)
const nodeById = computed(() => new Map(props.nodes.map((node) => [node.id, node])))

const option = computed<EChartsCoreOption>(() => ({
  animation: false,
  tooltip: { trigger: 'item', formatter: '{b}', appendToBody: true },
  geo: {
    map: 'scos-demo-china',
    roam: true,
    silent: true,
    scaleLimit,
    aspectScale: 1,
    layoutCenter: ['49%', '51%'],
    layoutSize: '115%',
    itemStyle: { areaColor: '#e7f1f8', borderColor: '#bad0e1', borderWidth: 0.75 },
    emphasis: { disabled: true },
  },
  series: [
    {
      type: 'lines',
      cursor: 'pointer',
      coordinateSystem: 'geo',
      symbol: ['none', 'arrow'],
      symbolSize: [0, 6],
      z: 2,
      lineStyle: { opacity: 0.7, width: 1.35, curveness: 0.16 },
      emphasis: { lineStyle: { opacity: 1, width: 3 } },
      data: props.routes
        .filter(({ kind }) => layer.value === 'all' || kind === layer.value)
        .flatMap((route) => {
          const from = nodeById.value.get(route.from)
          const to = nodeById.value.get(route.to)
          if (!from || !to) return []
          return [
            {
              name: route.name,
              key: route.id,
              coords: [from.coordinates, to.coordinates],
              lineStyle: {
                color: route.alertId ? '#d56542' : route.kind === 'inbound' ? '#ce923f' : '#138992',
                type: route.kind === 'inbound' ? 'dashed' : 'solid',
              },
            },
          ]
        }),
    },
    {
      type: 'scatter',
      cursor: 'pointer',
      coordinateSystem: 'geo',
      z: 5,
      symbolSize: 10,
      emphasis: { scale: 1.25 },
      data: [...layerNodes.value]
        .sort((left, right) => Number(left.kind === 'factory') - Number(right.kind === 'factory'))
        .map((node) => ({
          name: node.name,
          value: node.coordinates,
          key: node.id,
          symbolSize: node.kind === 'factory' ? 19 : node.alertId ? 12 : 9,
          symbol: node.kind === 'supplier' ? 'diamond' : 'circle',
          itemStyle: {
            color:
              node.kind === 'factory'
                ? '#087f8c'
                : node.alertId
                  ? '#d45b43'
                  : node.kind === 'supplier'
                    ? '#d99942'
                    : '#189da0',
            borderColor: '#fff',
            borderWidth: node.kind === 'factory' ? 3 : 1.5,
            shadowBlur: node.kind === 'factory' ? 5 : 0,
            shadowColor: '#548c98',
          },
          label:
            node.kind === 'factory' || node.mapLabel
              ? {
                  show: true,
                  position:
                    node.kind === 'factory' || node.id === 'SUP-005'
                      ? 'right'
                      : node.kind === 'supplier'
                        ? 'top'
                        : node.id === 'customer-3'
                          ? 'bottom'
                          : 'left',
                  distance: 7,
                  formatter: node.mapLabel ?? '{b}',
                  color: '#183649',
                  fontWeight: node.kind === 'factory' ? 650 : 450,
                  fontSize: node.kind === 'factory' ? 12 : 10,
                  backgroundColor: '#fff',
                  borderColor: '#c4dce3',
                  borderWidth: 1,
                  borderRadius: 4,
                  padding: [3, 5],
                }
              : { show: false },
        })),
    },
  ],
}))

function pickLocation(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  const node = nodeById.value.get(id)
  if (node) emit('node', node)
  location.value = ''
}

function stepZoom(factor: number) {
  if (!chart) return
  const next = Math.min(scaleLimit.max, Math.max(scaleLimit.min, zoom.value * factor))
  chart.dispatchAction({
    type: 'geoRoam',
    geoIndex: 0,
    zoom: next / zoom.value,
    originX: chart.getWidth() / 2,
    originY: chart.getHeight() / 2,
  })
}

function syncZoom() {
  const options = chart?.getOption() as { geo?: { zoom?: number }[] } | undefined
  zoom.value = options?.geo?.[0]?.zoom ?? 1
}

function reset() {
  chart?.setOption(option.value, { notMerge: true })
  syncZoom()
}

onMounted(() => {
  if (!container.value) return
  chart = init(container.value)
  chart.setOption(option.value)
  chart.on('georoam', syncZoom)
  chart.on('click', (event) => {
    const key = (event.data as { key?: string } | undefined)?.key
    if (event.seriesType === 'lines') {
      const route = props.routes.find(({ id }) => id === key)
      if (route) emit('route', route)
    } else {
      const node = key ? nodeById.value.get(key) : undefined
      if (node) emit('node', node)
    }
  })
  observer = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(() => chart?.resize())
  })
  observer.observe(container.value)
})
watch(option, (current) => chart?.setOption(current), { deep: true })
onBeforeUnmount(() => {
  cancelAnimationFrame(resizeFrame)
  observer?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <section class="surface map-panel" aria-labelledby="dashboard-map-title">
    <div class="map-head">
      <h2 id="dashboard-map-title">供应链地图</h2>
      <select v-model="layer" aria-label="地图线路">
        <option value="all">全部线路</option>
        <option value="inbound">原料入厂</option>
        <option value="outbound">成品交付</option>
      </select>
    </div>
    <div class="map-body">
      <div
        ref="container"
        class="map-canvas"
        role="img"
        aria-label="以太仓工厂为中心的供应链线路图"
      />
      <div class="map-tools">
        <button
          type="button"
          :disabled="zoom <= scaleLimit.min"
          aria-label="缩小地图"
          @click="stepZoom(1 / 1.25)"
        >
          −
        </button>
        <span>{{ Math.round(zoom * 100) }}%</span>
        <button
          type="button"
          :disabled="zoom >= scaleLimit.max"
          aria-label="放大地图"
          @click="stepZoom(1.25)"
        >
          +
        </button>
        <button type="button" @click="reset">复位</button>
      </div>
    </div>
    <p class="map-hint">滚轮缩放 · 拖动平移 · 点击节点或线路查看详情</p>
    <div class="map-footer">
      <ul aria-label="地图图例">
        <li><i class="factory" />工厂</li>
        <li><i class="supplier" />供应商</li>
        <li><i class="customer" />客户</li>
        <li><i class="alert" />异常节点</li>
      </ul>
      <select :value="location" aria-label="查看地图节点" @change="pickLocation">
        <option value="">查看节点</option>
        <option v-for="node in layerNodes" :key="node.id" :value="node.id">{{ node.name }}</option>
      </select>
    </div>
  </section>
</template>

<style scoped>
.map-panel {
  min-width: 0;
  padding: 15px 17px 12px;
  display: grid;
  grid-template-rows: auto 1fr auto auto;
}
.map-hint {
  margin-bottom: 6px;
  color: var(--scos-muted);
  font-size: 11px;
}
.map-head,
.map-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px 12px;
}
.map-head h2 {
  font-size: 16px;
}
.map-head h2::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 15px;
  margin-right: 8px;
  vertical-align: -2px;
  border-radius: 2px;
  background: var(--scos-primary);
}
.map-head select,
.map-footer select {
  max-width: min(100%, 170px);
  min-height: 29px;
  padding: 3px 7px;
  border: 1px solid #dce6eb;
  border-radius: 6px;
  color: var(--scos-ink);
  background: #fff;
  font-size: 12px;
}
.map-body {
  position: relative;
  min-width: 0;
}
.map-canvas {
  width: 100%;
  height: 304px;
}
.map-tools {
  position: absolute;
  top: 8px;
  right: 3px;
  display: flex;
  align-items: center;
  overflow: hidden;
  border: 1px solid #dce6eb;
  border-radius: 6px;
  color: #537285;
  background: #fff;
  font-size: 11px;
}
.map-tools span {
  min-width: 37px;
  text-align: center;
}
.map-tools button {
  padding: 4px 6px;
  border: 0;
  background: #fff;
  cursor: pointer;
  color: var(--scos-ink);
}
.map-tools button:hover {
  background: #e8f6f5;
}
.map-tools button:disabled {
  color: #a1aeb6;
  cursor: default;
}
.map-footer ul {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 13px;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 11px;
  color: var(--scos-muted);
}
.map-footer li {
  display: flex;
  align-items: center;
  gap: 5px;
}
.map-footer i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.map-footer .factory {
  background: #087f8c;
}
.map-footer .supplier {
  background: #d99942;
  transform: rotate(45deg);
  border-radius: 1px;
}
.map-footer .customer {
  background: #189da0;
}
.map-footer .alert {
  background: #d45b43;
}
@media (max-width: 600px) {
  .map-canvas {
    height: 248px;
  }
}
</style>
