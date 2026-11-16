<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef } from 'vue'
import { ElAlert, ElEmpty, ElSkeleton, ElTag } from 'element-plus'
import type { EChartsCoreOption, EChartsType } from '@/shared/charts/echarts'
import ScosChart from '@/shared/components/ScosChart.vue'
import type { ProcurementFuturesMarket } from '../model/futures'
import { summarizeProcurementFutures } from '../model/futures-summary'

const props = withDefaults(
  defineProps<{
    market?: ProcurementFuturesMarket | null
    loading?: boolean
    error?: boolean
    isMock?: boolean
    scenarioCurve?: { date: string; price: number; anchor?: boolean; anchorId?: string }[]
    editableCurve?: boolean
    referenceCutoff?: string
  }>(),
  { market: null, scenarioCurve: undefined, referenceCutoff: undefined, editableCurve: false },
)
const emit = defineEmits<{ priceChange: [date: string, price: number, nextDate?: string] }>()

const candles = computed(() =>
  [...(props.market?.candles ?? [])]
    .filter((candle) => !props.referenceCutoff || candle.tradeDate < props.referenceCutoff)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate)),
)
const curveByDate = computed(
  () => new Map(props.scenarioCurve?.map(({ date, price }) => [date, price])),
)
const curveAnchors = computed(
  () =>
    new Map(
      props.scenarioCurve
        ?.filter(({ anchor }) => anchor)
        .map(({ date, anchorId }) => [date, anchorId ?? date]),
    ),
)
const plotTop = computed(() => (props.scenarioCurve ? 34 : 14))
const plotBottom = 58
const anchorsOnPlot = shallowRef<
  { id: string; date: string; price: number; x: number; y: number }[]
>([])
const dragging = shallowRef<{
  id: string
  date: string
  price: number
  pointerId: number
  startY: number
  startPrice: number
  offsetX: number
  offsetY: number
  months: { date: string; x: number }[]
}>()
const dragAxis = shallowRef<{ min: number; max: number }>()
let plot: EChartsType | undefined
let pendingPointer: { x: number; y: number } | undefined
let dragFrame: number | undefined

function syncAnchors(chart: EChartsType) {
  if (!props.editableCurve) return
  plot = chart
  anchorsOnPlot.value = [...curveAnchors.value].flatMap(([date, id]) => {
    const price = curveByDate.value.get(date)
    if (price == null) return []
    const pixel = chart.convertToPixel({ gridIndex: 0 }, [date, price])
    const [x, y] = Array.isArray(pixel) ? pixel : []
    return x != null && y != null && chart.containPixel({ gridIndex: 0 }, [x, y])
      ? [{ id, date, price, x, y }]
      : []
  })
}

function availableMonths(date: string) {
  if (date === props.referenceCutoff) return [date]
  const occupied = [...curveAnchors.value.keys()]
  const index = occupied.indexOf(date)
  const before = occupied[index - 1]
  const after = occupied[index + 1]
  return (props.scenarioCurve ?? []).flatMap((point) =>
    (point.date === date || point.date.endsWith('-01')) &&
    (!before || point.date > before) &&
    (!after || point.date < after)
      ? [point.date]
      : [],
  )
}

function startDrag(event: PointerEvent, date: string) {
  const chart = plot
  const anchor = anchorsOnPlot.value.find((item) => item.date === date)
  if (!chart || !anchor || event.button !== 0 || dragging.value) return
  const min = chart.convertFromPixel({ yAxisIndex: 0 }, chart.getHeight() - plotBottom)
  const max = chart.convertFromPixel({ yAxisIndex: 0 }, plotTop.value)
  if (typeof min !== 'number' || typeof max !== 'number' || min >= max) return
  const handle = event.currentTarget as HTMLButtonElement
  const bounds = handle.getBoundingClientRect()
  const months = availableMonths(date).flatMap((monthDate) => {
    const pixel = chart.convertToPixel({ gridIndex: 0 }, [monthDate, anchor.price])
    if (!Array.isArray(pixel) || !chart.containPixel({ gridIndex: 0 }, pixel)) return []
    return [{ date: monthDate, x: pixel[0] as number }]
  })
  dragging.value = {
    id: anchor.id,
    date,
    price: anchor.price,
    pointerId: event.pointerId,
    startY: event.clientY,
    startPrice: anchor.price,
    offsetX: event.clientX - bounds.left - bounds.width / 2,
    offsetY: event.clientY - bounds.top - bounds.height / 2,
    months,
  }
  dragAxis.value = { min, max }
  handle.setPointerCapture(event.pointerId)
}

function applyPointerMove() {
  const pointer = pendingPointer
  pendingPointer = undefined
  const drag = dragging.value
  if (!plot || !drag || !pointer) return
  const bounds = plot.getDom().getBoundingClientRect()
  const x = pointer.x - bounds.left - drag.offsetX
  const relativeY = pointer.y - bounds.top - drag.offsetY
  const y = Math.min(plot.getHeight() - plotBottom, Math.max(plotTop.value, relativeY))
  const value = plot.convertFromPixel({ yAxisIndex: 0 }, y)
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  const price =
    Math.abs(pointer.y - drag.startY) < 2 ? drag.startPrice : Math.max(1, Math.round(value))
  let nextDate = drag.date
  let distance = Infinity
  for (const month of drag.months) {
    const delta = Math.abs(month.x - x)
    if (delta >= distance) continue
    nextDate = month.date
    distance = delta
  }
  if (nextDate === drag.date && price === drag.price) return
  emit('priceChange', drag.date, price, nextDate)
  drag.date = nextDate
  drag.price = price
}

function moveDrag(event: PointerEvent) {
  if (dragging.value?.pointerId !== event.pointerId) return
  pendingPointer = { x: event.clientX, y: event.clientY }
  dragFrame ??= requestAnimationFrame(() => {
    dragFrame = undefined
    applyPointerMove()
  })
}

function stopDrag(event: PointerEvent) {
  if (dragging.value?.pointerId !== event.pointerId) return
  if (dragFrame !== undefined) cancelAnimationFrame(dragFrame)
  dragFrame = undefined
  applyPointerMove()
  dragging.value = undefined
  dragAxis.value = undefined
}

function nudgePrice(date: string, amount: number) {
  const price = curveByDate.value.get(date)
  if (price != null) emit('priceChange', date, Math.max(1, Math.round(price + amount)))
}
function nudgeMonth(date: string, direction: number) {
  const months = availableMonths(date)
  const nextDate = months[months.indexOf(date) + direction]
  const price = curveByDate.value.get(date)
  if (nextDate && price != null) emit('priceChange', date, price, nextDate)
}
onBeforeUnmount(() => {
  if (dragFrame !== undefined) cancelAnimationFrame(dragFrame)
})
const candlesByDate = computed(() => new Map(candles.value.map((item) => [item.tradeDate, item])))
const dates = computed(() =>
  [...new Set([...candlesByDate.value.keys(), ...curveByDate.value.keys()])].sort(),
)
const period = computed(() => {
  const start = candles.value[0]?.tradeDate
  const end = candles.value.at(-1)?.tradeDate
  return start === end ? start : `${start} 至 ${end}`
})
const priceUnit = computed(() => {
  const market = props.market
  if (!market) return ''
  return `${market.currency === 'CNY' ? '元' : market.currency}/${market.unit}`
})
const summary = computed(() => summarizeProcurementFutures(candles.value))
const percentFormat = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  signDisplay: 'exceptZero',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const priceFormat = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatChange(change: number | null) {
  return change == null ? '—' : percentFormat.format(change / 100)
}

function changeTone(change: number | null) {
  if (change == null || Math.abs(change) < 0.005) return undefined
  return change > 0 ? 'rise' : 'fall'
}

const weeklyTrend = computed(() => {
  const change = summary.value.weeklyChange
  if (change == null) return '—'
  const tone = changeTone(change)
  const direction = tone === 'rise' ? '上涨' : tone === 'fall' ? '下跌' : '持平'
  return `${direction} ${formatChange(change)}`
})

const option = computed<EChartsCoreOption>(() => ({
  animation: false,
  grid: { left: 55, right: 16, top: plotTop.value, bottom: plotBottom },
  legend: props.scenarioCurve ? { top: 0 } : undefined,
  xAxis: {
    type: 'category',
    data: dates.value,
    axisLabel: { hideOverlap: true, formatter: (value: string) => value.slice(5) },
    axisLine: { lineStyle: { color: '#dbe5eb' } },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    scale: true,
    splitLine: { lineStyle: { color: '#e9eff2' } },
    min: props.editableCurve
      ? (dragAxis.value?.min ??
        (({ min }: { min: number }) => Math.max(0, Math.floor((min - 300) / 100) * 100)))
      : undefined,
    max: props.editableCurve
      ? (dragAxis.value?.max ?? (({ max }: { max: number }) => Math.ceil((max + 300) / 100) * 100))
      : undefined,
  },
  tooltip: {
    show: !dragging.value,
    trigger: 'axis',
    axisPointer: { type: 'line' },
    renderMode: 'richText',
    confine: true,
    formatter: (params: { dataIndex: number } | { dataIndex: number }[]) => {
      const point = Array.isArray(params) ? params[0] : params
      const date = point && dates.value[point.dataIndex]
      if (!date) return ''
      const candle = candlesByDate.value.get(date)
      const price = curveByDate.value.get(date)
      return [
        date,
        ...(candle
          ? [
              `开盘 ${candle.open}    收盘 ${candle.close}`,
              `最低 ${candle.low}    最高 ${candle.high}`,
            ]
          : []),
        ...(price == null ? [] : [`推演采购价 ${priceFormat.format(price)} 元/吨`]),
      ].join('\n')
    },
  },
  dataZoom: [
    { type: 'inside', zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false },
    { type: 'slider', bottom: 8, height: 22, showDetail: false, brushSelect: false },
  ],
  series: [
    {
      name: '历史期货日 K 线',
      type: 'candlestick',
      data: dates.value.map((date) => {
        const candle = candlesByDate.value.get(date)
        return candle ? [candle.open, candle.close, candle.low, candle.high] : ['-', '-', '-', '-']
      }),
      itemStyle: {
        color: '#c33735',
        color0: '#18845a',
        borderColor: '#c33735',
        borderColor0: '#18845a',
      },
    },
    ...(props.scenarioCurve
      ? [
          {
            name: '未来采购情景线',
            type: 'line',
            showSymbol: !props.editableCurve,
            symbolSize: (_value: unknown, { dataIndex }: { dataIndex: number }) =>
              curveAnchors.value.has(dates.value[dataIndex]!) ? 7 : 0,
            data: dates.value.map((date) => curveByDate.value.get(date) ?? '-'),
            lineStyle: { color: '#087f8c', type: 'dashed', width: 2.5 },
            itemStyle: { color: '#087f8c' },
          },
        ]
      : []),
  ],
}))
</script>

<template>
  <section aria-label="玉米淀粉期货行情">
    <header class="market-heading">
      <h2>玉米淀粉期货行情</h2>
      <ElTag v-if="market?.source" size="small" effect="plain">历史行情快照</ElTag>
      <ElTag v-else-if="isMock" size="small" type="warning" effect="plain">演示数据</ElTag>
    </header>
    <ElSkeleton v-if="loading" :rows="5" animated />
    <ElAlert
      v-else-if="error && !scenarioCurve"
      title="期货行情加载失败"
      type="error"
      :closable="false"
      show-icon
    />
    <ElEmpty v-else-if="!dates.length" description="暂无期货行情" :image-size="72" />
    <template v-else>
      <p class="market-details">
        <span v-if="market">合约 {{ market.contractCode }}</span>
        <span v-if="candles.length">历史行情 {{ period }}</span>
        <span v-else>暂无该推演日期前的期货行情</span>
        <span v-if="priceUnit">单位 {{ priceUnit }}</span>
        <a
          v-if="market?.source"
          :href="market.source.url"
          target="_blank"
          rel="noopener noreferrer"
          >{{ market.source.label }}</a
        >
      </p>
      <div class="market-chart">
        <ScosChart
          :option="option"
          :label="
            scenarioCurve
              ? '玉米淀粉历史日 K 线与未来采购情景曲线'
              : `玉米淀粉 ${market?.contractCode} 日 K 线，${period}`
          "
          :height="300"
          :preserve-zoom="editableCurve"
          @plot-change="syncAnchors"
        />
        <button
          v-for="anchor in anchorsOnPlot"
          :key="anchor.id"
          type="button"
          class="curve-handle"
          :class="{
            'curve-handle-active': dragging?.id === anchor.id,
            'curve-handle-start': anchor.date === referenceCutoff,
          }"
          :style="{ left: anchor.x + 'px', top: anchor.y + 'px' }"
          :aria-label="`调整 ${anchor.date} 价格节点，当前 ${priceFormat.format(anchor.price)} 元/吨`"
          :title="`${anchor.date} · ${priceFormat.format(anchor.price)} 元/吨`"
          @pointerdown="startDrag($event, anchor.date)"
          @pointermove="moveDrag"
          @pointerup="stopDrag"
          @pointercancel="stopDrag"
          @lostpointercapture="stopDrag"
          @keydown.up.prevent="nudgePrice(anchor.date, 10)"
          @keydown.down.prevent="nudgePrice(anchor.date, -10)"
          @keydown.left.prevent="nudgeMonth(anchor.date, -1)"
          @keydown.right.prevent="nudgeMonth(anchor.date, 1)"
        >
          <span v-if="dragging?.id === anchor.id" class="curve-handle-label" aria-hidden="true">
            {{ anchor.date.slice(0, 7) }} · {{ priceFormat.format(anchor.price) }} 元/吨
          </span>
        </button>
      </div>
      <dl v-if="!scenarioCurve" class="market-summary" aria-label="历史行情摘要">
        <div>
          <dt>近 60 个交易日累计涨跌</dt>
          <dd :class="changeTone(summary.cumulativeChange60)">
            {{ formatChange(summary.cumulativeChange60) }}
          </dd>
          <dd class="metric-detail">
            {{ summary.cumulativeChange60 == null ? '不足 60 个交易日' : '区间首尾收盘价对比' }}
          </dd>
        </div>
        <div>
          <dt>周线趋势</dt>
          <dd :class="changeTone(summary.weeklyChange)">{{ weeklyTrend }}</dd>
          <dd class="metric-detail">
            <template v-if="summary.weeklyPreviousEndDate && summary.weeklyEndDate">
              周收盘 {{ summary.weeklyPreviousEndDate.slice(5) }} 至
              {{ summary.weeklyEndDate.slice(5) }}
            </template>
            <template v-else>有效周收盘数据不足</template>
          </dd>
        </div>
        <div>
          <dt>MA30 日均线</dt>
          <dd>
            {{ summary.ma30 == null ? '—' : priceFormat.format(summary.ma30) }}
            <span v-if="summary.ma30 != null" class="metric-unit">{{ priceUnit }}</span>
          </dd>
          <dd class="metric-detail">
            {{ summary.ma30 == null ? '不足 30 个交易日' : '近 30 个交易日平均收盘价' }}
          </dd>
        </div>
      </dl>
    </template>
  </section>
</template>

<style scoped>
.market-heading,
.market-details {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.market-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 125px), 1fr));
  gap: 8px;
  margin: 10px 0 0;
}

.market-chart {
  position: relative;
}

.curve-handle {
  position: absolute;
  z-index: 2;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  transform: translate(-50%, -50%);
  cursor: grab;
  touch-action: none;
}

.curve-handle-active {
  cursor: grabbing;
}

.curve-handle-start {
  cursor: ns-resize;
}

.curve-handle::before {
  content: '';
  position: absolute;
  inset: 8px;
  border: 2px solid #087f8c;
  border-radius: 50%;
  background: white;
}

.curve-handle:hover::before,
.curve-handle-active::before {
  box-shadow: 0 0 0 4px rgb(8 127 140 / 16%);
}

.curve-handle-label {
  position: absolute;
  top: -22px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 6px;
  border-radius: 4px;
  background: #086b73;
  color: white;
  white-space: nowrap;
  font-size: 11px;
  pointer-events: none;
}

.market-summary > div {
  padding: 10px 12px;
  border-radius: 7px;
  background: var(--scos-background);
}

.market-summary dt,
.metric-unit {
  color: var(--scos-muted);
  font-size: 12px;
  font-weight: 400;
}

.market-summary dd {
  margin: 4px 0 0;
  color: var(--scos-ink);
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.market-summary .metric-detail {
  color: var(--scos-muted);
  font-size: 12px;
  font-weight: 400;
}

.market-summary .rise {
  color: #c33735;
}

.market-summary .fall {
  color: #18845a;
}

.market-heading h2 {
  font-size: 16px;
}

.market-details {
  margin-block: 8px 4px;
  color: var(--scos-muted);
  font-size: 12px;
}
</style>
