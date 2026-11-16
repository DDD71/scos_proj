<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GraphSeriesOption } from 'echarts/charts'
import type { TooltipComponentOption } from 'echarts/components'
import { ElButton } from 'element-plus'
import ScosChart from '@/shared/components/ScosChart.vue'
import { formatQuantity, traceRelations } from '../domain/analysis'
import type { CostingBatch, CostingRelation } from '../model/snapshot'

const props = defineProps<{
  batches: CostingBatch[]
  relations: CostingRelation[]
  roots: string[]
}>()
const emit = defineEmits<{ follow: [id: string]; evidence: [relation: CostingRelation] }>()
const focus = ref('')
const viewport = ref<HTMLElement>()
const headers = ref<HTMLOListElement>()
const verticalInset = 6

const ids = computed(
  () => new Set([...props.roots, ...props.relations.flatMap(({ from, to }) => [from, to])]),
)
const batches = computed(() => new Map(props.batches.map((batch) => [batch.id, batch])))
const relations = computed(
  () => new Map(props.relations.map((relation) => [relation.id, relation])),
)
const roots = computed(() => new Set(props.roots))
const upstream = computed(
  () =>
    new Set(
      props.roots.flatMap((id) =>
        traceRelations(props.relations, id, 'up').map(({ from }) => from),
      ),
    ),
)
const columns = computed(() => {
  const byStage = new Map<number, { order: number; stages: Set<string>; ids: string[] }>()
  for (const id of ids.value) {
    const batch = batches.value.get(id)
    const order = batch?.order ?? Infinity
    const group = byStage.get(order) ?? { order, stages: new Set<string>(), ids: [] }
    group.stages.add(batch?.stage ?? '批次记录缺失')
    group.ids.push(id)
    byStage.set(order, group)
  }
  return [...byStage.values()]
    .sort((a, b) => a.order - b.order)
    .map((column) => ({
      ...column,
      ids: column.ids.sort((a, b) => {
        const left = batches.value.get(a)
        const right = batches.value.get(b)
        return (left?.start ?? '').localeCompare(right?.start ?? '') || a.localeCompare(b)
      }),
    }))
})

const lanes = computed(() => Math.max(1, ...columns.value.map((column) => column.ids.length)))
const chartHeight = computed(() => Math.max(300, lanes.value * 15 + 20))
const selection = computed(() => {
  const incoming = props.relations.filter(({ to }) => to === focus.value)
  const outgoing = props.relations.filter(({ from }) => from === focus.value)
  return {
    incoming,
    outgoing,
    related: new Set([
      focus.value,
      ...incoming.map(({ from }) => from),
      ...outgoing.map(({ to }) => to),
    ]),
  }
})
const focused = computed(() => batches.value.get(focus.value))

watch(ids, (visible) => {
  if (!visible.has(focus.value)) focus.value = ''
})
watch(
  () => props.roots.join('|'),
  () => {
    focus.value = ''
  },
)

const colors = { upstream: '#2b65ad', root: '#087f8c', downstream: '#25865d', missing: '#a36925' }

const tooltip: TooltipComponentOption['formatter'] = (event) => {
  if (Array.isArray(event)) return ''
  const id = (event.data as { id: string }).id
  if (event.dataType === 'edge') {
    const edge = relations.value.get(id)
    if (!edge) return ''
    return `${edge.from} → ${edge.to}\n关联数量 ${formatQuantity(edge.qty)} ${edge.unit}\n点击查看谱系证据`
  }
  const batch = batches.value.get(id)
  if (!batch) return `${id}\n缺少批次台账记录`
  return `${id}\n${batch.stage} · ${batch.material}\n批次数量 ${formatQuantity(batch.qty)} ${batch.unit}`
}

const option = computed(() => {
  const columnCount = columns.value.length
  const nodes: GraphSeriesOption['data'] = columns.value.flatMap((column, x) =>
    column.ids.map((id, index) => {
      const nodeOffset =
        columnCount > 2 && x === columnCount - 1 ? 0.41 : columnCount > 5 ? 0.25 : 0
      const isRoot = roots.value.has(id)
      const color = !batches.value.has(id)
        ? colors.missing
        : isRoot
          ? colors.root
          : upstream.value.has(id)
            ? colors.upstream
            : colors.downstream
      const active = !focus.value || selection.value.related.has(id)
      return {
        id,
        name: id,
        value: [x - nodeOffset, index + (lanes.value - column.ids.length) / 2],
        symbolSize: focus.value === id ? 15 : isRoot ? 12 : 9,
        itemStyle: { color, opacity: active ? 1 : 0.27, borderColor: '#fff', borderWidth: 1 },
        label: {
          color: active ? '#193447' : '#8293a0',
          fontWeight: isRoot ? ('bold' as const) : ('normal' as const),
        },
      }
    }),
  )
  const parallel = new Map<string, number>()
  const links: GraphSeriesOption['links'] = props.relations.map((edge) => {
    const touches = edge.from === focus.value || edge.to === focus.value
    const key = JSON.stringify([edge.from, edge.to])
    const count = parallel.get(key) ?? 0
    parallel.set(key, count + 1)
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      lineStyle: {
        color: touches ? colors.root : '#5c809c',
        opacity: focus.value ? (touches ? 0.95 : 0.15) : 0.65,
        width: touches ? 2.5 : 1.4,
        curveness: count === 0 ? 0.06 : (count % 2 ? -1 : 1) * (0.05 + 0.03 * count),
      },
    }
  })
  const series: GraphSeriesOption = {
    type: 'graph',
    coordinateSystem: 'cartesian2d',
    data: nodes,
    links,
    edgeSymbol: ['none', 'arrow'],
    edgeSymbolSize: [0, 7],
    label: {
      show: true,
      position: 'right',
      distance: 3,
      fontSize: 10,
      textBorderColor: '#f3f6f8',
      textBorderWidth: 2,
    },
    emphasis: { lineStyle: { opacity: 1, width: 3, color: colors.root } },
  }
  return {
    animation: false,
    grid: { left: 0, right: 0, top: verticalInset, bottom: verticalInset },
    xAxis: {
      type: 'value',
      show: false,
      min: -0.5,
      max: Math.max(0.5, columns.value.length - 0.5),
    },
    yAxis: { type: 'value', show: false, inverse: true, min: -0.5, max: lanes.value - 0.5 },
    tooltip: { trigger: 'item', renderMode: 'richText', confine: true, formatter: tooltip },
    series: [series],
  }
})

function focusBatch(id: string) {
  focus.value = id
  const scroller = viewport.value
  const column = columns.value.findIndex((item) => item.ids.includes(id))
  if (!scroller || column < 0) return
  const width = scroller.scrollWidth / columns.value.length
  const left = column * width
  if (left < scroller.scrollLeft || left + width > scroller.scrollLeft + scroller.clientWidth) {
    scroller.scrollLeft = left - (scroller.clientWidth - width) / 2
  }
  const nodes = columns.value[column]!.ids
  const headerHeight = headers.value?.offsetHeight ?? 0
  const row = nodes.indexOf(id) + (lanes.value - nodes.length + 1) / 2
  const y =
    headerHeight + verticalInset + (row * (chartHeight.value - verticalInset * 2)) / lanes.value
  if (y < scroller.scrollTop + headerHeight || y > scroller.scrollTop + scroller.clientHeight) {
    scroller.scrollTop = y - (scroller.clientHeight + headerHeight) / 2
  }
}

function graphClick(type: 'node' | 'edge', id: string) {
  if (type === 'node') {
    focusBatch(id)
  } else {
    const relation = relations.value.get(id)
    if (relation) emit('evidence', relation)
  }
}
</script>

<template>
  <div class="graph-bar">
    <div class="graph-legend" aria-label="图例">
      <span><i :style="{ background: colors.upstream }" />上游批次</span>
      <span><i :style="{ background: colors.root }" />查询起点</span>
      <span><i :style="{ background: colors.downstream }" />下游批次</span>
    </div>
    <label class="graph-focus">
      聚焦批次
      <select :value="focus" @change="focusBatch(($event.target as HTMLSelectElement).value)">
        <option value="">显示完整关系</option>
        <optgroup
          v-for="column in columns"
          :key="column.order"
          :label="[...column.stages].join('、')"
        >
          <option v-for="id in column.ids" :key="id" :value="id">{{ id }}</option>
        </optgroup>
      </select>
    </label>
  </div>
  <div v-if="focus" class="graph-selection" aria-live="polite">
    <strong>{{ focus }}</strong>
    <span v-if="focused"
      >{{ focused.stage }} · {{ formatQuantity(focused.qty) }} {{ focused.unit }}</span
    >
    <span>{{ selection.incoming.length }} 条流入 · {{ selection.outgoing.length }} 条流出</span>
    <ElButton v-if="focused" link type="primary" @click="emit('follow', focus)"
      >以此批次追溯</ElButton
    >
  </div>
  <div
    ref="viewport"
    class="graph-viewport"
    role="region"
    aria-label="可滚动的批次谱系图"
    tabindex="0"
  >
    <div :style="{ minWidth: `${columns.length * 112}px` }">
      <ol
        ref="headers"
        class="graph-stages"
        :style="{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }"
      >
        <li v-for="column in columns" :key="column.order">
          <small v-if="Number.isFinite(column.order)">第 {{ column.order }} 环节</small>
          <h3>
            {{ [...column.stages].join('、') }} <span>{{ column.ids.length }}</span>
          </h3>
        </li>
      </ol>
      <ScosChart
        :option="option"
        :height="chartHeight"
        label="按工序排列的批次及多对多流向"
        @graph-click="graphClick"
      />
    </div>
  </div>
</template>

<style scoped>
.graph-bar,
.graph-legend,
.graph-selection,
.graph-focus {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
}
.graph-bar {
  justify-content: space-between;
  margin-bottom: 12px;
}
.graph-legend span {
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.graph-legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.graph-focus select {
  min-height: 34px;
  padding: 4px 8px;
  color: var(--scos-ink);
  background: var(--scos-background);
  border: 1px solid var(--scos-border);
  border-radius: 5px;
}
.graph-selection {
  padding: 8px 12px;
  margin-bottom: 12px;
  background: var(--scos-primary-soft);
  border-radius: 6px;
  font-size: 13px;
}
.graph-viewport {
  position: relative;
  max-height: min(620px, 72vh);
  overflow: auto;
  border: 1px solid var(--scos-border);
  border-radius: 8px;
  background: var(--scos-background);
}
.graph-stages {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--scos-surface);
}
.graph-stages li {
  padding: 8px 10px;
  border-bottom: 1px solid var(--scos-border);
  border-inline-end: 1px solid var(--scos-border);
}
.graph-stages li:last-child {
  border-inline-end: 0;
}
.graph-stages h3 {
  font-size: 13px;
  margin: 2px 0 0;
}
.graph-stages :is(small, span) {
  color: var(--scos-muted);
  font-weight: 400;
}
</style>
