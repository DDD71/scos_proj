<script setup lang="ts">
import type { InventoryWeekSummary } from '../domain/overview-weeks'

defineProps<{
  weeks: readonly InventoryWeekSummary[]
  unit: string
  activeWeek?: number
}>()

defineEmits<{ select: [date: string] }>()

const quantityFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const changeFormat = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})
const stockStatusLabels = {
  adequate: '达到安全库存',
  'below-safety': '低于安全库存',
  shortage: '预计缺货',
  unknown: '数据待补充',
} satisfies Record<InventoryWeekSummary['stockStatus'], string>

function formatQuantity(amount: number | null, unit: string, signed = false) {
  if (amount === null) return '—'
  const formatter = signed ? changeFormat : quantityFormat
  return `${formatter.format(amount)} ${unit}`
}
</script>

<template>
  <section class="weekly-overview" aria-labelledby="inventory-weekly-overview-heading">
    <header class="weekly-heading">
      <h3 id="inventory-weekly-overview-heading">周维度进出汇总</h3>
      <p>已回传日期取实绩，预测日期按计划和当前策略汇总。风险按周内逐日判断。</p>
    </header>

    <div class="week-cards">
      <button
        v-for="week in weeks"
        :key="week.week"
        class="week-card"
        type="button"
        :aria-labelledby="`inventory-week-title-${week.week}`"
        :aria-describedby="`inventory-week-dates-${week.week} inventory-week-metrics-${week.week} inventory-week-stock-${week.week} inventory-week-change-${week.week}`"
        :aria-pressed="week.week === activeWeek"
        @click="$emit('select', week.firstDate)"
      >
        <span class="week-header">
          <strong :id="`inventory-week-title-${week.week}`">第 {{ week.week }} 周</strong>
          <span :id="`inventory-week-dates-${week.week}`" class="week-dates">
            <time :datetime="week.firstDate">{{ week.firstDate.slice(5) }}</time>
            至
            <time :datetime="week.lastDate">{{ week.lastDate.slice(5) }}</time>
          </span>
        </span>

        <span :id="`inventory-week-metrics-${week.week}`" class="week-metrics">
          <span class="week-metric">
            <span>出货量</span>
            <strong>{{ formatQuantity(week.demand, unit) }}</strong>
          </span>
          <span class="week-metric">
            <span>入库量</span>
            <strong>{{ formatQuantity(week.confirmedReceipt, unit) }}</strong>
          </span>
          <span class="week-metric">
            <span>预计补充</span>
            <strong>{{ formatQuantity(week.replenishmentReceipt, unit) }}</strong>
          </span>
        </span>

        <span :id="`inventory-week-stock-${week.week}`" class="week-stock">
          <span class="week-stock-values">
            <span class="week-metric">
              <span>周末可用库存</span>
              <strong>{{ formatQuantity(week.closingStock, unit) }}</strong>
            </span>
            <span class="week-metric">
              <span>安全库存</span>
              <strong>{{ formatQuantity(week.safetyStock, unit) }}</strong>
            </span>
          </span>
          <span class="week-stock-footer">
            <strong class="stock-status" :class="`stock-status--${week.stockStatus}`">
              {{ stockStatusLabels[week.stockStatus] }}
            </strong>
            <span class="week-minimum">周内最低 {{ formatQuantity(week.minimumStock, unit) }}</span>
          </span>
        </span>

        <span :id="`inventory-week-change-${week.week}`" class="week-change">
          <span>库存净变化</span>
          <strong
            :class="{
              increase: (week.stockChange ?? 0) > 0,
              decrease: (week.stockChange ?? 0) < 0,
            }"
          >
            {{ formatQuantity(week.stockChange, unit, true) }}
          </strong>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.weekly-overview {
  min-width: 0;
}

.weekly-heading,
.week-header,
.week-stock-footer,
.week-change {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 10px;
}

.weekly-heading {
  margin-bottom: 8px;
}

.weekly-heading h3 {
  font-size: 15px;
}

.weekly-heading p,
.week-dates,
.week-metric > span,
.week-minimum,
.week-change > span {
  color: var(--scos-muted);
  font-size: 12px;
}

.week-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 8px;
}

.week-card {
  display: grid;
  align-content: start;
  min-width: 0;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--scos-border);
  border-radius: 8px;
  background: var(--scos-surface);
  color: var(--scos-ink);
  text-align: start;
  cursor: pointer;
}

.week-card:hover,
.week-card[aria-pressed='true'] {
  border-color: var(--scos-primary);
}

.week-card[aria-pressed='true'] {
  background: var(--scos-primary-soft);
}

.week-header strong {
  font-size: 13px;
}

.week-dates,
.week-metrics,
.week-stock,
.week-change {
  font-variant-numeric: tabular-nums;
}

.week-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.week-stock {
  display: grid;
  gap: 6px;
}

.week-stock-values {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
}

.week-metric {
  display: grid;
  align-content: space-between;
  gap: 3px;
  padding: 4px;
  border-radius: 5px;
  background: var(--scos-background);
}

.week-metric strong,
.week-change strong {
  font-size: 13px;
  white-space: nowrap;
}

.stock-status {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
}

.stock-status--adequate {
  background: #e8f6ee;
  color: #186642;
}

.stock-status--below-safety {
  background: #fff1de;
  color: #854500;
}

.stock-status--shortage {
  background: #fcebed;
  color: #9d2530;
}

.stock-status--unknown {
  background: #eef2f5;
  color: #475d6e;
}

.week-change {
  border-top: 1px dashed var(--scos-border);
  padding-top: 6px;
}

.week-change .increase {
  color: var(--scos-primary);
}

.week-change .decrease {
  color: var(--el-color-warning-dark-2, #9b5700);
}
</style>
