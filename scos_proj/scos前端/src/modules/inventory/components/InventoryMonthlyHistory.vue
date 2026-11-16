<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ElAlert, ElEmpty, ElSkeleton } from 'element-plus'
import { getInventoryHealthHistory } from '../api/inventory.repository'
import { buildInventoryHealthReport, type InventoryHealthMonth } from '../domain/inventory-health'
import InventoryHealthPanel from './InventoryHealthPanel.vue'

const props = defineProps<{ plant: string; productCode: string; unit: string }>()
const route = useRoute()
const router = useRouter()
const history = ref<readonly InventoryHealthMonth[]>([])
const loading = ref(true)
const error = ref('')

const periods = computed(() =>
  history.value
    .filter((item) => item.plant === props.plant && item.productCode === props.productCode)
    .sort((left, right) => right.period.localeCompare(left.period)),
)
const selectedPeriod = computed(
  () => periods.value.find(({ period }) => period === route.query.historyMonth) ?? periods.value[0],
)
const report = computed(
  () => selectedPeriod.value && buildInventoryHealthReport(selectedPeriod.value),
)

function selectMonth(event: Event) {
  const historyMonth = (event.target as HTMLSelectElement).value
  void router.replace({ query: { ...route.query, historyMonth } })
}

onMounted(async () => {
  try {
    history.value = await getInventoryHealthHistory()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '读取历史月度执行数据失败。'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="monthly-history">
    <ElSkeleton v-if="loading" :rows="3" animated class="surface history-panel" />
    <ElAlert v-else-if="error" type="error" :title="error" :closable="false" show-icon />
    <section
      v-else-if="report"
      class="surface history-panel"
      aria-labelledby="inventory-monthly-history"
    >
      <header class="history-header">
        <h2 id="inventory-monthly-history">历史月度执行</h2>
        <div class="history-actions">
          <label>
            执行月份
            <select :value="report.period" @change="selectMonth">
              <option v-for="item in periods" :key="item.period" :value="item.period">
                {{ item.period }}
              </option>
            </select>
          </label>
          <RouterLink
            class="history-link"
            :to="{
              name: 'inventory-health',
              query: { product: productCode, month: report.period, from: 'month-plan' },
            }"
          >
            查看月度执行复盘
          </RouterLink>
        </div>
      </header>
      <InventoryHealthPanel :analysis="report" :unit="unit" compact />
    </section>
    <ElEmpty v-else class="surface" description="暂无该成品的历史月度执行数据" :image-size="48" />
  </div>
</template>

<style scoped>
.monthly-history,
.history-panel {
  min-width: 0;
}

.history-panel {
  padding: 12px clamp(14px, 2vw, 22px);
}

.history-header,
.history-actions,
.history-actions label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.history-header {
  justify-content: space-between;
  margin-bottom: 12px;
}

.history-header h2 {
  margin: 0;
  font-size: 17px;
}

.history-actions label {
  color: var(--scos-muted);
  font-size: 13px;
}

.history-actions select {
  padding: 5px 8px;
  border: 1px solid var(--scos-border);
  border-radius: 6px;
  background: var(--scos-surface);
  color: var(--scos-ink);
  font: inherit;
}

.history-link {
  color: var(--scos-primary);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.history-link:hover {
  text-decoration: underline;
}
</style>
