<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  addCalendarMonths,
  buildCalendarWindow,
  type InventoryCalendarDay,
} from '../domain/overview-calendar'

const props = defineProps<{
  days: readonly InventoryCalendarDay[]
  unit: string
  selectedDate?: string
}>()
defineEmits<{ select: [date: string] }>()

const weekdays = ['周六', '周日', '周一', '周二', '周三', '周四', '周五'] as const
const stockStatus = {
  adequate: '',
  'below-safety': '低于安全库存',
  shortage: '预计缺货',
  unknown: '数据待补充',
} satisfies Record<InventoryCalendarDay['status'], string>
const quantityFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const dateRange = ref({ start: '', end: '' })
const currentPage = ref(0)
const defaultStart = computed(() => props.days[0]?.date ?? '')
const defaultEnd = computed(() =>
  defaultStart.value ? addCalendarMonths(defaultStart.value, 2) : '',
)
const startDate = computed(() => dateRange.value.start || defaultStart.value)
const endDate = computed(() => dateRange.value.end || defaultEnd.value)
const calendar = computed(() =>
  startDate.value && endDate.value
    ? buildCalendarWindow(startDate.value, endDate.value, currentPage.value, props.days)
    : { firstDate: '', lastDate: '', days: [], lastPage: 0, offset: 0 },
)
const trailingOffset = computed(() => {
  const slots = calendar.value.offset + calendar.value.days.length
  return (weekdays.length - (slots % weekdays.length)) % weekdays.length
})

function updateDate(bound: 'start' | 'end', event: Event) {
  const input = event.target as HTMLInputElement
  const fallback = bound === 'start' ? defaultStart.value : defaultEnd.value
  const date = input.value || fallback
  dateRange.value[bound] = date
  if (startDate.value > endDate.value) {
    dateRange.value[bound === 'start' ? 'end' : 'start'] = date
  }
  currentPage.value = bound === 'start' ? 0 : Math.min(currentPage.value, calendar.value.lastPage)
  input.value = date
}

function resetDateRange() {
  dateRange.value = { start: '', end: '' }
  currentPage.value = 0
}

function weekdayIndex(date: string) {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 1) % weekdays.length
}

function formatQuantity(amount: number | null) {
  return amount === null ? '—' : `${quantityFormat.format(amount)} ${props.unit}`
}
</script>

<template>
  <details class="forecast-calendar" aria-labelledby="inventory-calendar-heading">
    <summary class="calendar-summary">
      <strong id="inventory-calendar-heading">日度库存日历</strong>
      <span class="calendar-expand">展开</span>
      <span class="calendar-collapse">收起</span>
    </summary>

    <div class="calendar-body">
      <div v-if="days.length" class="calendar-filters" role="group" aria-label="日期范围">
        <label>
          <span>开始日期</span>
          <input type="date" :value="startDate" @change="updateDate('start', $event)" />
        </label>
        <label>
          <span>结束日期</span>
          <input type="date" :value="endDate" @change="updateDate('end', $event)" />
        </label>
        <button
          type="button"
          :disabled="startDate === defaultStart && endDate === defaultEnd && currentPage === 0"
          @click="resetDateRange"
        >
          重置
        </button>
      </div>
      <p class="calendar-context">
        <strong>按当前策略</strong>
        <span>已回传日期显示完工与入库实绩，预测日期显示建议生产和预计可用入库。</span>
      </p>
      <template v-if="calendar.days.length">
        <div class="calendar-pages" role="group" aria-label="日历翻页">
          <button type="button" :disabled="currentPage === 0" @click="currentPage -= 1">
            前四周
          </button>
          <strong aria-live="polite">{{ calendar.firstDate }} 至 {{ calendar.lastDate }}</strong>
          <button
            type="button"
            :disabled="currentPage >= calendar.lastPage"
            @click="currentPage += 1"
          >
            后四周
          </button>
        </div>
        <div class="calendar-weekdays" aria-hidden="true">
          <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
        </div>
        <div class="calendar-days">
          <span
            v-for="offset in calendar.offset"
            :key="`leading-${offset}`"
            class="calendar-offset"
            aria-hidden="true"
          />
          <template v-for="day in calendar.days" :key="day.date">
            <div v-if="day.status === 'unavailable'" class="calendar-day calendar-day--unavailable">
              <span class="calendar-day-heading">
                <time :datetime="day.date">{{ day.date.slice(5) }}</time>
                <span class="calendar-mobile-weekday">{{ weekdays[weekdayIndex(day.date)] }}</span>
              </span>
              <span class="calendar-stock-status">暂无预测</span>
            </div>
            <button
              v-else
              :class="['calendar-day', `calendar-day--${day.status}`]"
              type="button"
              :aria-label="day.date"
              :aria-describedby="`inventory-calendar-reading-${day.date}`"
              :aria-pressed="day.date === selectedDate"
              @click="$emit('select', day.date)"
            >
              <span class="calendar-day-heading">
                <time :datetime="day.date">{{ day.date.slice(5) }}</time>
                <span class="calendar-mobile-weekday">{{ weekdays[weekdayIndex(day.date)] }}</span>
              </span>
              <span :id="`inventory-calendar-reading-${day.date}`" class="calendar-reading">
                <span v-if="stockStatus[day.status]" class="calendar-stock-status">
                  {{ stockStatus[day.status] }}
                </span>
                <span class="calendar-metric">
                  <span>可用库存</span>
                  <strong>{{ formatQuantity(day.availableStock) }}</strong>
                </span>
                <span class="calendar-metric">
                  <span>{{ day.isActual ? '实际完工' : '建议生产' }}</span>
                  <strong>{{ formatQuantity(day.productionDemand) }}</strong>
                </span>
                <span class="calendar-metric">
                  <span>{{ day.isActual ? '实际入库' : '预计可用入库' }}</span>
                  <strong>{{ formatQuantity(day.productionOutput) }}</strong>
                </span>
              </span>
            </button>
          </template>
          <span
            v-for="offset in trailingOffset"
            :key="`trailing-${offset}`"
            class="calendar-offset"
            aria-hidden="true"
          />
        </div>
      </template>
      <p v-else class="calendar-context">暂无每日预测</p>
    </div>
  </details>
</template>

<style scoped>
.forecast-calendar {
  min-width: 0;
  border: 1px solid var(--scos-border);
  border-radius: 8px;
  background: var(--scos-background);
  container: inventory-calendar / inline-size;
}

.calendar-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  list-style: none;
  cursor: pointer;
}

.calendar-summary::-webkit-details-marker {
  display: none;
}

.calendar-summary strong {
  font-size: 15px;
}

.calendar-expand,
.calendar-collapse {
  color: var(--scos-primary);
  font-size: 13px;
  font-weight: 650;
}

.calendar-collapse,
.forecast-calendar[open] .calendar-expand {
  display: none;
}

.forecast-calendar[open] .calendar-collapse {
  display: block;
}

.calendar-body {
  display: grid;
  gap: 8px;
  padding: 0 14px 14px;
}

.calendar-filters,
.calendar-filters label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  font-size: 12px;
}

.calendar-filters label {
  min-width: 0;
  color: var(--scos-muted);
}

.calendar-filters input,
.calendar-filters button,
.calendar-pages button {
  max-width: 100%;
  min-height: 30px;
  padding: 3px 7px;
  border: 1px solid var(--scos-border);
  border-radius: 5px;
  background: var(--scos-surface);
  color: var(--scos-ink);
  font: inherit;
}

.calendar-filters button:not(:disabled),
.calendar-pages button:not(:disabled) {
  color: var(--scos-primary);
  cursor: pointer;
}

.calendar-filters button:disabled,
.calendar-pages button:disabled {
  color: var(--scos-muted);
}

.calendar-pages {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 10px;
  font-size: 12px;
}

.calendar-pages strong {
  font-size: 14px;
}

.calendar-context {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  margin: 0;
  color: var(--scos-muted);
  font-size: 12px;
}

.calendar-context strong {
  color: var(--scos-ink);
}

.calendar-weekdays,
.calendar-days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.calendar-weekdays {
  color: var(--scos-muted);
  font-size: 12px;
  text-align: center;
}

.calendar-offset {
  border: 1px dashed var(--scos-border);
  border-radius: 6px;
}

.calendar-day {
  display: grid;
  align-content: start;
  gap: 4px;
  min-width: 0;
  padding: 6px;
  border: 1px solid var(--scos-border);
  border-inline-start: 3px solid var(--calendar-accent, var(--scos-border));
  border-radius: 6px;
  background: var(--scos-surface);
  color: var(--scos-ink);
  font-variant-numeric: tabular-nums;
  text-align: start;
}

button.calendar-day {
  cursor: pointer;
}

button.calendar-day:hover,
.calendar-day[aria-pressed='true'] {
  border-block-color: var(--scos-primary);
  border-inline-end-color: var(--scos-primary);
}

.calendar-day[aria-pressed='true'] {
  background: var(--scos-primary-soft);
  box-shadow: inset 0 0 0 1px var(--scos-primary);
}

.calendar-day--adequate {
  --calendar-accent: #59a786;
}

.calendar-day--below-safety {
  --calendar-accent: #d69240;
  --calendar-status-color: #854500;
}

.calendar-day--shortage {
  --calendar-accent: #d4626c;
  --calendar-status-color: #9d2530;
}

.calendar-day--unknown {
  --calendar-status-color: var(--scos-muted);
}

.calendar-day--unavailable {
  min-height: 50px;
  background: var(--scos-background);
  color: var(--scos-muted);
}

.calendar-day-heading,
.calendar-metric {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0 4px;
}

.calendar-day-heading time {
  font-size: 13px;
  font-weight: 700;
}

.calendar-mobile-weekday {
  display: none;
}

.calendar-reading {
  display: grid;
  gap: 3px;
}

.calendar-stock-status {
  color: var(--calendar-status-color);
  font-size: 11px;
  font-weight: 650;
}

.calendar-metric,
.calendar-mobile-weekday {
  color: var(--scos-muted);
  font-size: 11px;
}

.calendar-metric strong {
  color: var(--scos-ink);
  font-size: 12px;
  white-space: nowrap;
}

@container inventory-calendar (max-width: 520px) {
  .calendar-offset,
  .calendar-weekdays {
    display: none;
  }

  .calendar-days {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .calendar-mobile-weekday {
    display: inline;
  }
}
</style>
