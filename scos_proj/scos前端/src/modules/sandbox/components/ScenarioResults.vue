<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import ScosChart from '@/shared/components/ScosChart.vue'
import type { EChartsCoreOption } from '@/shared/charts/echarts'
import BusinessCalculation from './BusinessCalculation.vue'
import ContractPlayback from './ContractPlayback.vue'
import ContractTrend from './ContractTrend.vue'
import InventoryPlayback from './InventoryPlayback.vue'
import { costLabels, formatValue, round } from '../model/scenarios'
import { inventoryState, shortageTiming, usableReceipt } from '../model/result-presentation'
import type { SandboxMetric, SandboxRun } from '../model/types'
import '../sandbox-results.css'

const props = defineProps<{ run: SandboxRun }>()
const emit = defineEmits<{ adjust: [] }>()
const day = ref(0)
const playing = ref(false)
const replayOpen = ref(false)
const timelineRail = ref<HTMLElement>()
let timer: ReturnType<typeof setInterval> | undefined
const daily = computed(() => (props.run.result.kind === 'daily' ? props.run.result : undefined))
const contract = computed(() =>
  props.run.result.kind === 'contract' ? props.run.result : undefined,
)
const timeline = computed(
  () =>
    daily.value?.days.map((row) => row.date) ??
    contract.value?.months.map((row) => row.month) ??
    [],
)
const point = computed(() => daily.value?.days[day.value])
const month = computed(() => contract.value?.months[day.value])
const hasAlternative = computed(() => daily.value?.days.some((row) => row.alternative))
const raw = computed(() => props.run.input.kind === 'supply')
const warehouse = computed(() => (raw.value ? '原料库' : '成品库'))
const shortageLabel = computed(() => (raw.value ? '缺料' : '缺货'))
const contractComparisonKeys = [
  'profit',
  'revenue',
  'cost',
  'production',
  'fulfilled',
  'backlog',
  'penalty',
]
const comparisonMetrics = computed(() => {
  const metrics = props.run.metrics
  if (contract.value)
    return contractComparisonKeys.flatMap((key) => metrics.filter((item) => item.key === key))
  return metrics.filter((item) => !['closing', 'supplier-share'].includes(item.key))
})
const blockingIssues = computed(() =>
  props.run.diagnostics.filter((item) => item.status === '不可行'),
)
const unevaluated = computed(() =>
  props.run.diagnostics
    .filter((item) => item.status === '未评估')
    .map((item) => item.area)
    .join('、'),
)
const appliedChange = computed(() => {
  if (!daily.value || props.run.input.kind === 'inventory') return undefined
  const change = props.run.changes[0]
  return change && change.base !== change.simulated ? change : undefined
})
const dailyProof = computed(() => {
  const selected = point.value?.simulated
  const result = daily.value
  if (
    !selected ||
    !result ||
    selected.opening == null ||
    selected.demand == null ||
    selected.closing == null
  )
    return undefined
  const { opening, demand, closing } = selected
  const unit = result.unit
  return [
    { label: opening < 0 ? '上日结转缺口' : '当天开始时有', value: formatValue(opening, unit) },
    {
      sign: '+',
      label: raw.value ? '当天可用到货' : '当天可用入库',
      value: formatValue(usableReceipt(selected), unit),
    },
    { sign: '−', label: raw.value ? '生产需要' : '交付需要', value: formatValue(demand, unit) },
    {
      sign: closing < 0 ? '→' : '=',
      label: closing < 0 ? '当天还缺' : '当天结束时剩',
      value: formatValue(Math.abs(closing), unit),
    },
  ]
})
const initialDay = computed(() => {
  const current = daily.value
  const date = current?.firstShortage ?? current?.firstBreach ?? current?.firstCapacity
  return date ? Math.max(0, timeline.value.indexOf(date)) : 0
})
const daysWithState = computed(
  () =>
    daily.value?.days.map((row) => ({
      date: row.date,
      ...inventoryState(row.simulated, daily.value!.safety, raw.value),
    })) ??
    contract.value?.months.map((row) => ({
      date: row.month,
      tone: row.backlog > 0 || row.profit < 0 ? 'risk' : 'normal',
      text: row.backlog > 0 ? '有欠交' : row.profit < 0 ? '当月亏损' : '已覆盖',
    })) ??
    [],
)
const dailySummary = computed(() => {
  const current = daily.value
  if (!current) return
  const firstShortage = current.days.find((row) => (row.simulated.shortage ?? 0) > 0)
  const firstBaseline = current.days.find((row) => (row.baseline.shortage ?? 0) > 0)
  const firstCapacity = current.days.find((row) => row.simulated.capacityExceeded)
  const complete = current.days.every((row) => row.simulated.shortage != null)
  const alternative = current.days.find((row) => (row.alternative?.shortage ?? 0) > 0)
  const alternativeCapacity = current.days.find((row) => row.alternative?.capacityExceeded)
  const measures = [
    {
      label: '首次跌破安全线',
      date: current.firstBreach,
      tone: 'warning',
    },
    {
      label: `首次预计${shortageLabel.value}`,
      date: firstShortage?.date,
      tone: 'risk',
    },
    {
      label: '首次预计超仓容',
      date: firstCapacity?.date,
      tone: 'risk',
    },
  ]
  const description = firstShortage
    ? `当日累计缺口 ${formatValue(firstShortage.simulated.shortage, current.unit)} · ${shortageTiming(
        firstBaseline?.date,
        firstShortage.date,
        current.days.every((row) => row.baseline.shortage != null),
      )}`
    : firstCapacity
      ? '入库后预计超出有效仓容。'
      : current.firstBreach
        ? '预计库存低于安全线。'
        : complete
          ? '所选时段内可用库存覆盖需求。'
          : '部分日期缺少库存或需求数据。'
  const alternativeNote = !hasAlternative.value
    ? ''
    : alternative
      ? `应对后首次${shortageLabel.value} ${alternative.date}，累计缺口 ${formatValue(alternative.alternative?.shortage, current.unit)}。`
      : current.days.every((row) => row.alternative?.shortage != null)
        ? `应对后时段内未出现${shortageLabel.value}。`
        : '应对后缺口未评估。'
  return {
    title: firstShortage
      ? `${current.itemName}预计于 ${firstShortage.date.slice(5)} ${shortageLabel.value}`
      : firstCapacity
        ? `${current.itemName}预计于 ${firstCapacity.date.slice(5)} 超仓容`
        : current.firstBreach
          ? `${current.itemName}预计于 ${current.firstBreach.slice(5)} 跌破安全线`
          : complete
            ? `时段内未出现${shortageLabel.value}`
            : '当前结果有未评估日期',
    tone:
      firstShortage || firstCapacity
        ? 'risk'
        : current.firstBreach
          ? 'warning'
          : complete
            ? 'normal'
            : 'unknown',
    description,
    alternativeNote: alternativeCapacity
      ? `${alternativeNote} 应对方案预计于 ${alternativeCapacity.date} 超仓容。`
      : alternativeNote,
    measures: measures.flatMap((item) => (item.date ? [{ ...item, date: item.date }] : [])),
  }
})

const chart = computed<EChartsCoreOption>(() => {
  const dailyData = daily.value
  if (!dailyData) return {}
  const marker = {
    silent: true,
    symbol: ['none', 'none'],
    label: { show: false },
    lineStyle: { color: '#607f96', type: 'dashed' },
    data: [
      { xAxis: timeline.value[day.value] },
      { yAxis: 0, lineStyle: { color: '#a36b65', type: 'solid' } },
    ],
  }
  const line = (
    name: string,
    data: (number | null | undefined)[],
    color: string,
    dashed = false,
  ) => ({
    name,
    data,
    type: 'line',
    showSymbol: false,
    symbolSize: 7,
    lineStyle: { width: dashed ? 1.5 : 2.5, type: dashed ? 'dashed' : 'solid' },
    itemStyle: { color },
    connectNulls: false,
  })
  return {
    animation: false,
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'line' },
    },
    legend: { top: 0, left: 'center', type: 'scroll', textStyle: { fontSize: 11 } },
    grid: { left: 12, right: 14, top: 49, bottom: 34, containLabel: true },
    xAxis: {
      type: 'category',
      data: timeline.value,
      axisLabel: {
        hideOverlap: true,
        formatter: (value: string) => value.slice(5),
      },
    },
    yAxis: {
      type: 'value',
      name: dailyData.unit,
      splitLine: { lineStyle: { color: '#e4ebec' } },
    },
    series: [
      {
        ...line(
          '原计划库存',
          dailyData.days.map((row) => row.baseline.closing),
          '#57809a',
        ),
        markLine: marker,
      },
      {
        ...line(
          '推演后库存',
          dailyData.days.map((row) => row.simulated.closing),
          '#087f8c',
        ),
        showSymbol: true,
        symbolSize: 5,
        areaStyle: { color: 'rgba(8,127,140,.07)' },
      },
      {
        name: '出现缺口',
        type: 'line',
        showSymbol: true,
        symbolSize: 7,
        lineStyle: { opacity: 0 },
        itemStyle: { color: '#ba4f43' },
        data: dailyData.days.map((row) =>
          (row.simulated.shortage ?? 0) > 0 ? row.simulated.closing : null,
        ),
        tooltip: { show: false },
      },
      ...(hasAlternative.value
        ? [
            line(
              '应对方案',
              dailyData.days.map((row) => row.alternative?.closing),
              '#596bc9',
            ),
          ]
        : []),
      ...(dailyData.safety == null
        ? []
        : [
            line(
              dailyData.baselineSafety === undefined ? '安全库存' : '情景安全库存',
              dailyData.days.map(() => dailyData.safety),
              '#bf7952',
              true,
            ),
          ]),
      ...(dailyData.baselineSafety == null
        ? []
        : [
            line(
              '基线安全库存',
              dailyData.days.map(() => dailyData.baselineSafety),
              '#967347',
              true,
            ),
          ]),
    ],
  }
})

function pause() {
  clearInterval(timer)
  timer = undefined
  playing.value = false
}

function play() {
  if (playing.value) return pause()
  if (day.value >= timeline.value.length - 1) day.value = 0
  playing.value = true
  timer = setInterval(() => {
    if (day.value >= timeline.value.length - 1) return pause()
    day.value += 1
  }, 1100)
}

function selectPoint(date: string) {
  const index = timeline.value.indexOf(date)
  if (index >= 0) seek(index)
}

function seek(index: number) {
  pause()
  day.value = index
}

function toggleReplay() {
  if (replayOpen.value) pause()
  replayOpen.value = !replayOpen.value
}

function difference(item: SandboxMetric) {
  return item.base == null || item.simulated == null ? null : round(item.simulated - item.base)
}

function perTon(cost: number, output: number) {
  return output > 0 ? formatValue(round(cost / output, 2), '元/吨') : '—'
}

watch(
  () => props.run.id,
  () => seek(initialDay.value),
  { immediate: true },
)
function revealSelectedDate() {
  const rail = timelineRail.value
  const active = rail?.querySelector<HTMLButtonElement>('[aria-current]')
  if (!rail || !active || rail.scrollWidth <= rail.clientWidth) return
  const railRect = rail.getBoundingClientRect()
  const activeRect = active.getBoundingClientRect()
  if (activeRect.left < railRect.left || activeRect.right > railRect.right)
    rail.scrollLeft += activeRect.left - railRect.left - (rail.clientWidth - activeRect.width) / 2
}

watch(day, () => void nextTick(revealSelectedDate))
watch(timelineRail, (rail, _, onCleanup) => {
  if (!rail) return
  const observer = new ResizeObserver(revealSelectedDate)
  observer.observe(rail)
  onCleanup(() => observer.disconnect())
})
onBeforeUnmount(pause)
</script>

<template>
  <section class="surface sb-panel sb-stack sb-results" aria-label="推演结果">
    <header class="sb-row">
      <h2>推演结果</h2>
      <div class="sb-actions">
        <span v-if="run.status === '不可行'" class="sb-badge" :data-status="run.status"
          >方案不可行</span
        >
        <button type="button" class="sb-secondary" @click="emit('adjust')">调整条件</button>
      </div>
    </header>

    <div v-if="dailySummary" class="sb-outcome" :data-tone="dailySummary.tone">
      <div>
        <h3>{{ dailySummary.title }}</h3>
        <p>{{ dailySummary.description }}</p>
        <p v-if="dailySummary.alternativeNote">{{ dailySummary.alternativeNote }}</p>
      </div>
    </div>
    <ul v-if="blockingIssues.length" class="sb-result-issues" data-tone="risk">
      <li v-for="issue in blockingIssues" :key="issue.area">{{ issue.detail }}</li>
    </ul>
    <p v-if="unevaluated" class="sb-muted">本次未评估 {{ unevaluated }}</p>

    <p v-if="appliedChange" class="sb-applied-change">
      <strong>原安排</strong> {{ appliedChange.base }} <span aria-hidden="true">→</span>
      <strong>按本次条件</strong> {{ appliedChange.simulated }}
    </p>
    <BusinessCalculation
      v-if="dailyProof && point"
      :title="point.date.slice(5) + ' 的结果怎么算'"
      :parts="dailyProof"
    />

    <section class="sb-playback sb-stack" :aria-label="daily ? '库存走势与逐日回放' : '推演回放'">
      <div v-if="daily || replayOpen" class="sb-row">
        <h3>{{ daily ? warehouse + '库存走势与逐日回放' : '合同经营回放' }}</h3>
        <strong class="sb-playback-date"
          >{{ timeline[day] }}
          <small>{{ day + 1 }} / {{ timeline.length }} {{ daily ? '天' : '个月' }}</small></strong
        >
      </div>
      <div v-if="daily && point" class="sb-daily-visuals">
        <ScosChart
          :option="chart"
          label="原计划和推演后库存走势"
          :height="278"
          @point-click="selectPoint"
        />
        <InventoryPlayback :result="daily" :point="point" :raw="raw" />
      </div>
      <ContractPlayback
        v-if="contract && month"
        :result="contract"
        :month="month"
        :metrics="run.metrics"
        :changes="run.changes"
        :show-month="replayOpen"
      />
      <ContractTrend
        v-if="contract"
        :result="contract"
        :adjustments="run.input.kind === 'contract' ? run.input.productionAdjustments : undefined"
      />
      <div v-if="contract && timeline.length" class="sb-actions">
        <button
          type="button"
          class="sb-secondary"
          :aria-expanded="replayOpen"
          aria-controls="sandbox-replay-controls"
          @click="toggleReplay"
        >
          {{ replayOpen ? '收起回放' : '查看逐月回放' }}
        </button>
      </div>
      <div
        v-if="timeline.length && (daily || replayOpen)"
        id="sandbox-replay-controls"
        class="sb-timeline-controls sb-stack"
      >
        <div class="sb-row">
          <div class="sb-actions">
            <button
              class="sb-primary sb-play-button"
              type="button"
              :aria-pressed="playing"
              :disabled="timeline.length <= 1"
              @click="play"
            >
              <span aria-hidden="true">{{ playing ? 'Ⅱ' : '▶' }}</span
              >{{ playing ? '暂停' : '播放' }}
            </button>
          </div>
          <span v-if="daily" class="sb-muted">曲线低于零表示累计缺口</span>
        </div>
        <input
          class="sb-timeline-range"
          type="range"
          min="0"
          :max="timeline.length - 1"
          :value="day"
          :aria-valuetext="timeline[day]"
          :disabled="timeline.length <= 1"
          aria-label="推演日期滑块"
          :style="{
            '--sb-progress': (timeline.length > 1 ? (day / (timeline.length - 1)) * 100 : 0) + '%',
          }"
          @input="seek(Number(($event.target as HTMLInputElement).value))"
        />
        <div ref="timelineRail" class="sb-timeline-rail" aria-label="推演时间轴">
          <button
            v-for="(item, index) in daysWithState"
            :key="item.date"
            type="button"
            :data-tone="item.tone"
            :aria-current="day === index ? 'date' : undefined"
            :aria-label="item.date + ' ' + item.text"
            @click="seek(index)"
          >
            <strong>{{ daily ? item.date.slice(5) : item.date }}</strong
            ><span><i aria-hidden="true"></i>{{ item.text }}</span>
          </button>
        </div>
      </div>
      <dl v-if="dailySummary?.measures.length" class="sb-outcome-dates">
        <div v-for="item in dailySummary.measures" :key="item.label">
          <dt>{{ item.label }}</dt>
          <dd>
            <button type="button" :data-tone="item.tone" @click="selectPoint(item.date)">
              {{ item.date }}
            </button>
          </dd>
        </div>
      </dl>
      <details v-if="daily" class="sb-disclosure">
        <summary>查看逐日供需表</summary>
        <div class="sb-table">
          <table aria-label="逐日供需明细">
            <thead>
              <tr>
                <th>日期</th>
                <th>原计划入库</th>
                <th>推演后入库</th>
                <th>原计划需求</th>
                <th>推演后需求</th>
                <th>原计划净库存</th>
                <th>推演后净库存</th>
                <th>累计缺口</th>
                <th v-if="hasAlternative">应对后净库存</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in daily.days" :key="row.date">
                <th scope="row">{{ row.date }}</th>
                <td>{{ formatValue(row.baseline.receipt, daily.unit) }}</td>
                <td>{{ formatValue(row.simulated.receipt, daily.unit) }}</td>
                <td>{{ formatValue(row.baseline.demand, daily.unit) }}</td>
                <td>{{ formatValue(row.simulated.demand, daily.unit) }}</td>
                <td>{{ formatValue(row.baseline.closing, daily.unit) }}</td>
                <td>{{ formatValue(row.simulated.closing, daily.unit) }}</td>
                <td>{{ formatValue(row.simulated.shortage, daily.unit) }}</td>
                <td v-if="hasAlternative">
                  {{ formatValue(row.alternative?.closing, daily.unit) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </section>

    <details v-if="daily?.impacts.length" class="sb-disclosure">
      <summary>受影响单据和计划</summary>
      <div class="sb-table">
        <table>
          <thead>
            <tr>
              <th>单据或计划</th>
              <th>原安排</th>
              <th>推演后</th>
              <th>日期</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in daily.impacts" :key="index">
              <th scope="row">
                <RouterLink v-if="item.to" :to="item.to">{{ item.object }}</RouterLink
                ><template v-else>{{ item.object }}</template>
              </th>
              <td>{{ item.base }}</td>
              <td>{{ item.simulated }}</td>
              <td>{{ item.date ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>

    <details class="sb-disclosure">
      <summary>查看关键指标对比</summary>
      <div class="sb-table">
        <table>
          <thead>
            <tr>
              <th>指标</th>
              <th>原计划</th>
              <th>推演后</th>
              <th>变化量</th>
              <th v-if="hasAlternative">应对后</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in comparisonMetrics" :key="item.key">
              <th scope="row">
                {{ item.label }}<small v-if="item.reason">{{ item.reason }}</small>
              </th>
              <td>{{ formatValue(item.base, item.unit) }}</td>
              <td>{{ formatValue(item.simulated, item.unit) }}</td>
              <td>
                {{ formatValue(difference(item), item.unit === '%' ? '百分点' : item.unit) }}
              </td>
              <td v-if="hasAlternative">
                {{
                  item.alternative === undefined ? '—' : formatValue(item.alternative, item.unit)
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>

    <details v-if="contract" class="sb-disclosure sb-result-detail">
      <summary>查看生产成本明细</summary>
      <div class="sb-table">
        <table aria-label="生产成本构成">
          <thead>
            <tr>
              <th>成本项</th>
              <th>合同期总额</th>
              <th>单位产量成本</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(label, key) in costLabels" :key="key">
              <th scope="row">{{ label }}</th>
              <td>{{ formatValue(contract.costs[key], '元') }}</td>
              <td>{{ perTon(contract.costs[key], contract.output) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>
