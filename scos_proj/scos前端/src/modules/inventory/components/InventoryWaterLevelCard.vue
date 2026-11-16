<script setup lang="ts">
import { computed } from 'vue'
import type {
  InventoryPolicyResult,
  InventoryProduct,
  InventoryProjectionDay,
} from '../model/types'

const props = defineProps<{
  product: InventoryProduct
  policy: InventoryPolicyResult
  otherOccupied: number
  snapshotDate: string
  actual?: boolean
  forecastDay?: Pick<
    InventoryProjectionDay,
    | 'date'
    | 'scenarioClosingStock'
    | 'scenarioShortage'
    | 'targetStock'
    | 'reorderPoint'
    | 'safetyStock'
  >
}>()

const shownDate = computed(() => props.forecastDay?.date ?? props.snapshotDate)
const occupied = computed(() => props.product.physicalStock + props.otherOccupied)
const occupancyRate = computed(() => occupied.value / props.product.capacity)
const availableFill = computed(() =>
  Math.min(props.product.availableStock, props.product.physicalStock),
)
const unavailableFill = computed(() => props.product.physicalStock - availableFill.value)
const allocatedFill = computed(() => Math.min(props.product.allocatedStock, unavailableFill.value))
const otherFill = computed(() => unavailableFill.value - allocatedFill.value)
const thresholds = computed(() => {
  const values = props.forecastDay ?? props.policy
  return [
    { key: 'target', symbol: 'S', label: '目标库存', value: values.targetStock },
    { key: 'reorder', symbol: 's', label: '补货点', value: values.reorderPoint },
    { key: 'safety', symbol: 'SS', label: '安全库存', value: values.safetyStock },
  ]
})
const quantityFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const percentFormat = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })

function level(amount: number) {
  return `${Math.min(100, (amount / props.product.capacity) * 100)}%`
}
</script>

<template>
  <section class="water-card" aria-labelledby="inventory-water-level-heading">
    <header class="water-heading">
      <h3 id="inventory-water-level-heading">
        {{ actual ? '实际期末库存水位' : forecastDay ? '预计库存水位' : '当前库存水位' }}
      </h3>
      <time :datetime="shownDate">{{ shownDate }}</time>
    </header>

    <div class="water-body">
      <div v-if="product.capacity > 0" class="tank" aria-hidden="true">
        <template v-if="forecastDay">
          <div
            v-if="forecastDay.scenarioClosingStock !== null"
            class="tank-fill forecast-fill available-fill"
            :style="{ height: level(forecastDay.scenarioClosingStock) }"
          />
          <span v-else class="tank-empty">—</span>
        </template>
        <div v-else-if="occupied > 0" class="tank-fill" :style="{ height: level(occupied) }">
          <div class="available-fill" :style="{ flex: availableFill }" />
          <div class="allocated-fill" :style="{ flex: allocatedFill }" />
          <div class="other-fill" :style="{ flex: otherFill }" />
          <div class="shared-fill" :style="{ flex: otherOccupied }" />
        </div>
        <template v-for="marker in thresholds" :key="marker.key">
          <span
            v-if="marker.value !== null && marker.value > 0 && marker.value <= product.capacity"
            class="marker-line"
            :class="marker.key"
            :style="{ bottom: level(marker.value) }"
          />
        </template>
      </div>

      <div v-if="forecastDay" class="forecast-reading">
        <p class="forecast-scenario">{{ actual ? 'WMS 日终实绩' : '按当前策略补充后' }}</p>
        <dl class="water-metrics">
          <div class="forecast-stock">
            <dt>{{ actual ? '实际期末可用库存' : '预计期末可用库存' }}</dt>
            <dd v-if="forecastDay.scenarioClosingStock !== null">
              {{ quantityFormat.format(forecastDay.scenarioClosingStock) }} {{ product.unit }}
            </dd>
            <dd v-else>暂无预测</dd>
          </div>
          <div
            v-if="forecastDay.scenarioShortage !== null && forecastDay.scenarioShortage > 0"
            class="shortage"
          >
            <dt>预计当日缺口</dt>
            <dd>{{ quantityFormat.format(forecastDay.scenarioShortage) }} {{ product.unit }}</dd>
          </div>
        </dl>
        <p v-if="product.capacity > 0" class="forecast-scale">
          {{ product.storageType === 'shared' ? '共享罐容' : '储罐容量' }}
          {{ quantityFormat.format(product.capacity) }} {{ product.unit }}
        </p>
        <p v-if="!actual && forecastDay.scenarioClosingStock !== null" class="forecast-scenario">
          水位仅表示预计可用库存。
        </p>
      </div>
      <dl v-else class="water-metrics">
        <div>
          <dt><span class="swatch available-fill" />可用库存</dt>
          <dd>{{ quantityFormat.format(product.availableStock) }} {{ product.unit }}</dd>
        </div>
        <div>
          <dt><span class="swatch allocated-fill" />已分配未出库</dt>
          <dd>{{ quantityFormat.format(allocatedFill) }} {{ product.unit }}</dd>
        </div>
        <div>
          <dt><span class="swatch other-fill" />本品其他占用</dt>
          <dd>{{ quantityFormat.format(otherFill) }} {{ product.unit }}</dd>
        </div>
        <div v-if="product.storageType === 'shared'">
          <dt><span class="swatch shared-fill" />其他成品占用</dt>
          <dd>{{ quantityFormat.format(otherOccupied) }} {{ product.unit }}</dd>
        </div>
        <div class="capacity">
          <dt>{{ product.storageType === 'shared' ? '共享罐占用率' : '储罐占用率' }}</dt>
          <dd v-if="product.capacity > 0">{{ percentFormat.format(occupancyRate) }}</dd>
          <dd v-else>罐容待确认</dd>
          <p v-if="product.capacity > 0">
            {{ quantityFormat.format(occupied) }} / {{ quantityFormat.format(product.capacity) }}
            {{ product.unit }}
          </p>
        </div>
      </dl>
    </div>

    <div class="water-thresholds">
      <p>{{ forecastDay ? '当日库存阈值' : '库存策略参考阈值' }}</p>
      <dl>
        <div v-for="marker in thresholds" :key="marker.key">
          <dt>
            <span class="marker-key" :class="marker.key" />{{ marker.label }} {{ marker.symbol }}
          </dt>
          <dd>
            {{
              marker.value === null
                ? '暂无预测'
                : `${quantityFormat.format(marker.value)} ${product.unit}`
            }}
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.water-card {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--scos-border);
  border-radius: 8px;
  background: var(--scos-background);
}

.water-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 4px 8px;
  margin-bottom: 12px;
}

.water-heading h3 {
  font-size: 15px;
}

.water-heading time,
.water-metrics dt,
.capacity p,
.forecast-scenario,
.forecast-scale,
.water-thresholds p,
.water-thresholds dt {
  color: var(--scos-muted);
  font-size: 12px;
}

.water-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.tank {
  position: relative;
  flex: 0 1 108px;
  min-width: 62px;
  height: 188px;
  overflow: hidden;
  border: 3px solid #879eaf;
  border-radius: 24% / 9%;
  background: var(--scos-surface);
}

.tank::before {
  position: absolute;
  z-index: 1;
  inset: -3px -2px auto;
  height: 13px;
  border-radius: 50%;
  border-bottom: 2px solid #879eaf;
  background: #8ab1c728;
  content: '';
}

.tank-fill {
  position: absolute;
  inset: auto 0 0;
  display: flex;
  flex-direction: column-reverse;
}

.tank-fill::after {
  position: absolute;
  inset: 0 -6% auto;
  height: 6px;
  border-radius: 0 0 50% 50%;
  background: #ffffff45;
  content: '';
}

.available-fill {
  background: linear-gradient(#4d8bf1, #2362ce);
}

.forecast-fill {
  overflow: hidden;
  transition: height 160ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .forecast-fill {
    transition: none;
  }
}

.tank-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--scos-muted);
}

.allocated-fill {
  background: #a68acb;
}

.other-fill {
  background: #96b7e0;
}

.shared-fill {
  background: #a1adb9;
}

.swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-inline-end: 5px;
  border-radius: 2px;
}

.marker-line,
.marker-key {
  border-top: 2px dashed var(--marker-color);
}

.marker-line {
  position: absolute;
  inset-inline: 0;
}

.marker-key {
  display: inline-block;
  width: 11px;
  margin-inline-end: 4px;
  vertical-align: middle;
}

.target {
  --marker-color: #159b78;
}

.reorder {
  --marker-color: var(--inventory-reorder-color);
}

.safety {
  --marker-color: var(--inventory-safety-color);
  border-top-style: dotted;
}

.water-metrics {
  display: grid;
  gap: 8px;
  min-width: 0;
  margin: 0;
}

.water-metrics dd,
.water-thresholds dd {
  margin: 2px 0 0;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.water-metrics dd {
  font-size: 15px;
}

.forecast-reading {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.forecast-stock dd {
  font-size: 19px;
}

.shortage dt,
.shortage dd {
  color: var(--el-color-danger-dark-2, #b13e2c);
}

.capacity {
  padding-top: 6px;
  border-top: 1px solid var(--scos-border);
}

.capacity dd {
  font-size: 19px;
}

.water-thresholds {
  margin-top: 12px;
  padding-top: 9px;
  border-top: 1px solid var(--scos-border);
}

.water-thresholds dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  margin: 5px 0 0;
}

.water-thresholds dd {
  font-size: 13px;
}
</style>
