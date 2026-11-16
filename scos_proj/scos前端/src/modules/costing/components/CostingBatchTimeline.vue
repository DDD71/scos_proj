<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { ElButton, ElEmpty, ElTag } from 'element-plus'
import { formatQuantity } from '../domain/analysis'
import type { CostingBatch } from '../model/snapshot'

const props = defineProps<{ batches: readonly CostingBatch[]; selected?: CostingBatch }>()
const emit = defineEmits<{ select: [id: string] }>()
const dayMs = 86_400_000
const line = ref('')
const day = ref('')
const days = ref(3)
const stage = ref('')
const showEmptyStages = ref(false)
const plot = useTemplateRef<HTMLDivElement>('plot')
const lines = computed(() => [...new Set(props.batches.map((batch) => batch.line))])

function timestamp(value: string) {
  // DEMO 批次只有本地工厂时间，按太仓时区解析。
  return Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + '+08:00')
}

const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' })
const tickFormat = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Shanghai',
})
const lineBatches = computed(() => props.batches.filter((batch) => batch.line === line.value))
const stages = computed(() =>
  [...new Map(lineBatches.value.map((batch) => [batch.stage, batch.order]))]
    .map(([name, order]) => ({ name, order }))
    .sort((a, b) => a.order - b.order),
)
const records = computed(() =>
  lineBatches.value
    .flatMap((batch) => {
      const start = timestamp(batch.start)
      const end = timestamp(batch.end)
      return Number.isFinite(start) && Number.isFinite(end) && end > start
        ? [{ batch, start, end }]
        : []
    })
    .sort((a, b) => a.start - b.start),
)
const minDay = computed(() =>
  records.value.length ? dateFormat.format(records.value[0]!.start) : '',
)
const maxDay = computed(() =>
  records.value.length
    ? dateFormat.format(Math.max(...records.value.map((record) => record.end)) - 1)
    : '',
)
const rangeStart = computed(() => dateStart(day.value))
const rangeEnd = computed(() => rangeStart.value + dayMs * days.value)
const divisions = computed(() => (days.value === 1 ? 6 : days.value === 3 ? 6 : 7))

function dateStart(value: string) {
  return Date.parse(value + 'T00:00:00+08:00')
}

function ratio(time: number) {
  return ((time - rangeStart.value) / (rangeEnd.value - rangeStart.value)) * 100
}

const ticks = computed(() =>
  Number.isFinite(rangeStart.value)
    ? Array.from({ length: divisions.value + 1 }, (_, index) => {
        const time =
          rangeStart.value + ((rangeEnd.value - rangeStart.value) * index) / divisions.value
        return { time, position: (index / divisions.value) * 100, label: tickFormat.format(time) }
      })
    : [],
)
const rows = computed(() =>
  stages.value
    .filter((item) => !stage.value || item.name === stage.value)
    .map((item) => {
      const laneEnds: number[] = []
      const bars = records.value
        .filter(
          ({ batch, start, end }) =>
            batch.stage === item.name && start < rangeEnd.value && end > rangeStart.value,
        )
        .map(({ batch, start, end }) => {
          const available = laneEnds.findIndex((time) => time <= start)
          const lane = available === -1 ? laneEnds.length : available
          laneEnds[lane] = end
          const left = ratio(Math.max(start, rangeStart.value))
          const width = ratio(Math.min(end, rangeEnd.value)) - left
          const style: CSSProperties = {
            left: left + '%',
            width: width + '%',
            top: lane * 30 + 5 + 'px',
          }
          return {
            batch,
            style,
            clippedStart: start < rangeStart.value,
            clippedEnd: end > rangeEnd.value,
          }
        })
      return { ...item, bars, height: Math.max(1, laneEnds.length) * 30 + 8 }
    }),
)
const visibleCount = computed(() => rows.value.reduce((total, row) => total + row.bars.length, 0))
const shownRows = computed(() =>
  stage.value || showEmptyStages.value ? rows.value : rows.value.filter((row) => row.bars.length),
)
const selectedInLine = computed(() =>
  props.selected?.line === line.value ? props.selected : undefined,
)

function changeLine() {
  stage.value = ''
  day.value = minDay.value
}

function selectStage(name: string) {
  stage.value = stage.value === name ? '' : name
}

function moveWindow(direction: 1 | -1) {
  const next = dateFormat.format(rangeStart.value + direction * days.value * dayMs)
  day.value =
    direction > 0 && next > maxDay.value
      ? maxDay.value
      : direction < 0 && next < minDay.value
        ? minDay.value
        : next
}

async function locateSelectedBatch() {
  const batch = selectedInLine.value
  if (!batch) return
  stage.value = batch.stage
  day.value = dateFormat.format(timestamp(batch.start))
  await nextTick()
  const bar = plot.value?.querySelector<HTMLButtonElement>('.batch-bar.selected')
  bar?.scrollIntoView({ block: 'nearest', inline: 'center' })
  bar?.focus({ preventScroll: true })
}

watch(
  () => [props.selected, props.batches] as const,
  () => {
    const selection = props.selected
    if (!selection) {
      if (!line.value || !lines.value.includes(line.value)) {
        line.value = lines.value[0] ?? ''
        changeLine()
      }
      return
    }
    if (line.value !== selection.line) {
      line.value = selection.line
      changeLine()
    }
    if (stage.value && stage.value !== selection.stage) stage.value = ''
    const start = timestamp(selection.start)
    const end = timestamp(selection.end)
    if (
      Number.isFinite(start) &&
      (!day.value || start >= rangeEnd.value || end <= rangeStart.value)
    ) {
      day.value = dateFormat.format(start)
    }
  },
  { immediate: true },
)
</script>

<template>
  <section class="surface costing-panel batch-timeline" aria-labelledby="costing-timeline-heading">
    <header class="timeline-heading">
      <h2 id="costing-timeline-heading">批次划分时间轴</h2>
      <p class="costing-muted">
        按工序查看批次的起止时间。点击色条可查看该批的划分规则和数据来源。
      </p>
    </header>
    <div class="costing-toolbar">
      <label
        >时间轴产线
        <select v-model="line" aria-label="时间轴产线" @change="changeLine">
          <option v-for="item in lines" :key="item">{{ item }}</option>
        </select>
      </label>
      <label
        >起始日期
        <input v-model="day" type="date" :min="minDay || undefined" :max="maxDay || undefined" />
      </label>
      <label
        >查看范围
        <select v-model.number="days" aria-label="查看范围">
          <option :value="1">1 天</option>
          <option :value="3">3 天</option>
          <option :value="7">7 天</option>
        </select>
      </label>
      <div class="timeline-navigation">
        <ElButton :disabled="!minDay || !day || day <= minDay" @click="moveWindow(-1)"
          >上一段</ElButton
        >
        <ElButton :disabled="!maxDay || !day || day >= maxDay" @click="moveWindow(1)"
          >下一段</ElButton
        >
        <ElButton
          v-if="selectedInLine && Number.isFinite(timestamp(selectedInLine.start))"
          @click="locateSelectedBatch"
        >
          定位选中批次
        </ElButton>
      </div>
      <label class="toggle-empty"
        ><input v-model="showEmptyStages" type="checkbox" /> 显示空工序</label
      >
    </div>
    <template v-if="ticks.length && stages.length">
      <div class="stage-selector" role="group" aria-label="按工序查看">
        <button type="button" :aria-pressed="!stage" @click="stage = ''">全部工序</button>
        <button
          v-for="item in stages"
          :key="item.name"
          type="button"
          :aria-pressed="stage === item.name"
          @click="selectStage(item.name)"
        >
          {{ item.name }}
        </button>
      </div>
      <p class="time-caption" aria-live="polite">当前时段 {{ visibleCount }} 个批次 · 北京时间</p>
      <div
        v-if="shownRows.length"
        ref="plot"
        class="timeline-scroll"
        tabindex="0"
        aria-label="批次范围，支持横向滚动"
      >
        <div class="timeline-plot">
          <div class="timeline-row timeline-axis">
            <div class="stage-name">工序</div>
            <div class="axis-track">
              <time
                v-for="(tick, index) in ticks"
                :key="tick.time"
                :style="{ left: tick.position + '%' }"
                :class="{ 'first-tick': index === 0, 'last-tick': index === ticks.length - 1 }"
                >{{ tick.label }}</time
              >
            </div>
          </div>
          <div v-for="row in shownRows" :key="row.name" class="timeline-row">
            <div class="stage-name">
              <span>{{ row.name }}</span
              ><small>{{ row.bars.length }} 批</small>
            </div>
            <div
              class="batch-track"
              :style="{ height: row.height + 'px', '--tick-width': 100 / divisions + '%' }"
            >
              <span v-if="!row.bars.length" class="no-batches">本时段无批次</span>
              <button
                v-for="{ batch, style, clippedStart, clippedEnd } in row.bars"
                :key="batch.id"
                type="button"
                class="batch-bar"
                :class="{
                  selected: selected?.id === batch.id,
                  'start-clipped': clippedStart,
                  'end-clipped': clippedEnd,
                }"
                :style="style"
                :aria-label="`${batch.id}，${batch.stage}，${batch.start} 至 ${batch.end}`"
                :aria-pressed="selected?.id === batch.id"
                :title="`${batch.id} · ${batch.device}\n${batch.start} 至 ${batch.end}`"
                @click="emit('select', batch.id)"
              >
                <span aria-hidden="true">{{ batch.id }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <ElEmpty v-else description="当前时段没有批次" :image-size="58" />
      <section v-if="selectedInLine" class="batch-boundary" aria-label="选中批次的划分信息">
        <h3>
          {{ selectedInLine.id }}
          <ElTag effect="plain" size="small">{{ selectedInLine.stage }}</ElTag>
        </h3>
        <dl>
          <div>
            <dt>时间窗</dt>
            <dd>{{ selectedInLine.start }} 至 {{ selectedInLine.end }}</dd>
          </div>
          <div>
            <dt>设备／罐号</dt>
            <dd>{{ selectedInLine.device || '—' }}</dd>
          </div>
          <div>
            <dt>批量</dt>
            <dd>{{ formatQuantity(selectedInLine.qty) }} {{ selectedInLine.unit }}</dd>
          </div>
          <div>
            <dt>划分规则</dt>
            <dd>{{ selectedInLine.rule || '—' }}</dd>
          </div>
          <div>
            <dt>数据来源</dt>
            <dd>{{ selectedInLine.source || '—' }}</dd>
          </div>
        </dl>
      </section>
    </template>
    <ElEmpty v-else description="请选择有批次数据的产线与日期" :image-size="58" />
  </section>
</template>

<style scoped>
.timeline-heading {
  margin-bottom: 16px;
}
.timeline-heading h2 {
  margin-bottom: 6px;
}
.timeline-navigation {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.timeline-navigation .el-button + .el-button {
  margin-left: 0;
}
.costing-toolbar .toggle-empty {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
}
.costing-toolbar .toggle-empty input {
  min-height: auto;
  accent-color: var(--scos-primary);
}
.stage-selector {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.stage-selector button {
  border: 1px solid var(--scos-border);
  border-radius: 5px;
  background: var(--scos-surface);
  color: var(--scos-ink);
  padding: 5px 8px;
  cursor: pointer;
}
.stage-selector button[aria-pressed='true'] {
  border-color: var(--scos-primary);
  background: var(--scos-primary-soft);
  color: var(--scos-primary);
}
.time-caption {
  margin: 12px 0 6px;
  color: var(--scos-muted);
  font-size: 12px;
}
.timeline-scroll {
  overflow: auto;
  max-height: 430px;
  border: 1px solid var(--scos-border);
  border-radius: 8px;
}
.timeline-plot {
  min-width: 900px;
}
.timeline-row {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  border-bottom: 1px solid var(--scos-border);
}
.timeline-row:last-child {
  border-bottom: 0;
}
.timeline-axis {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--scos-surface);
}
.stage-name {
  position: sticky;
  z-index: 2;
  left: 0;
  display: flex;
  gap: 4px;
  flex-direction: column;
  justify-content: center;
  padding: 6px 10px;
  border-right: 1px solid var(--scos-border);
  background: var(--scos-surface);
  font-size: 12px;
}
.stage-name small {
  color: var(--scos-muted);
}
.axis-track {
  height: 32px;
  position: relative;
}
.axis-track time {
  position: absolute;
  top: 8px;
  transform: translateX(-50%);
  white-space: nowrap;
  color: var(--scos-muted);
  font-size: 11px;
}
.axis-track .first-tick {
  transform: translateX(4px);
}
.axis-track .last-tick {
  transform: translateX(calc(-100% - 4px));
}
.batch-track {
  position: relative;
  background-image: repeating-linear-gradient(
    to right,
    transparent 0 calc(var(--tick-width) - 1px),
    var(--scos-border) calc(var(--tick-width) - 1px) var(--tick-width)
  );
}
.no-batches {
  display: inline-block;
  padding: 8px;
  color: var(--scos-muted);
  font-size: 12px;
}
.batch-bar {
  position: absolute;
  min-width: 3px;
  height: 26px;
  overflow: hidden;
  border: 1px solid var(--scos-primary);
  border-radius: 4px;
  color: var(--scos-ink);
  background: var(--scos-primary-soft);
  cursor: pointer;
  white-space: nowrap;
  padding: 0;
  font-size: 11px;
  text-align: left;
}
.batch-bar span {
  display: block;
  margin: 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.batch-bar:hover,
.batch-bar.selected {
  color: #fff;
  background: var(--scos-primary);
}
.batch-bar:focus-visible {
  z-index: 1;
  outline: 2px solid var(--scos-ink);
  outline-offset: -2px;
}
.start-clipped {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
.end-clipped {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.batch-boundary {
  padding: 12px;
  margin-top: 12px;
  background: var(--scos-background);
  border-radius: 7px;
}
.batch-boundary h3 {
  font-size: 14px;
}
.batch-boundary dl {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin: 8px 0 0;
}
.batch-boundary dt {
  font-size: 12px;
}
.batch-boundary dd {
  font-weight: 400;
}
</style>
