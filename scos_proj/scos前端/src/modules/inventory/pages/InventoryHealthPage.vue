<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ElAlert, ElButton, ElEmpty, ElSkeleton, ElTag } from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import { env } from '@/shared/config/env'
import { getInventoryHealthHistory, getInventorySnapshot } from '../api/inventory.repository'
import InventoryHealthPanel from '../components/InventoryHealthPanel.vue'
import { buildInventoryHealthReport, type InventoryHealthMonth } from '../domain/inventory-health'
import type { InventorySnapshot } from '../model/types'

const route = useRoute()
const router = useRouter()
const snapshot = ref<InventorySnapshot>()
const history = ref<readonly InventoryHealthMonth[]>([])
const loading = ref(true)
const error = ref('')
const demo = env.dataSource === 'mock'

const products = computed(() => snapshot.value?.products ?? [])
const product = computed(
  () =>
    products.value.find((item) => item.code === route.query.product) ??
    products.value.find((item) => item.code === 'FG-F55') ??
    products.value[0],
)
const fromStrategy = computed(() => route.query.from === 'strategy')
const fromMonthPlan = computed(() => route.query.from === 'month-plan')
const periods = computed(() =>
  history.value
    .filter(
      (item) => item.plant === snapshot.value?.plant && item.productCode === product.value?.code,
    )
    .sort((left, right) => right.period.localeCompare(left.period)),
)
const selectedPeriod = computed(
  () => periods.value.find(({ period }) => period === route.query.month) ?? periods.value[0],
)
const report = computed(
  () => selectedPeriod.value && buildInventoryHealthReport(selectedPeriod.value),
)
const backLink = computed(() =>
  fromMonthPlan.value
    ? {
        name: 'inventory-plans',
        query: {
          mode: 'month',
          product: product.value?.code,
          historyMonth: selectedPeriod.value?.period,
        },
      }
    : {
        name: 'inventory-overview',
        query: { product: product.value?.code, adjust: fromStrategy.value ? '1' : undefined },
      },
)

function selectProduct(event: Event) {
  const code = (event.target as HTMLSelectElement).value
  void router.replace({ name: 'inventory-health', query: { ...route.query, product: code } })
}

function selectMonth(event: Event) {
  const month = (event.target as HTMLSelectElement).value
  void router.replace({ query: { ...route.query, month } })
}

async function loadHealth() {
  loading.value = true
  error.value = ''
  try {
    const [inventory, execution] = await Promise.all([
      getInventorySnapshot(),
      getInventoryHealthHistory(),
    ])
    snapshot.value = inventory
    history.value = execution
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '读取库存健康度失败，请重试。'
  } finally {
    loading.value = false
  }
}

onMounted(loadHealth)
</script>

<template>
  <div>
    <PageHeader
      title="库存健康度"
      eyebrow="成品库存优化"
      description="按月分析计划与实际偏差，查看系统给出的预警、策略建议和跟进事项。"
    >
      <template #actions>
        <RouterLink
          class="back-link"
          :to="{ name: 'inventory-plans', query: { mode: 'day', product: product?.code } }"
        >
          查看日度执行偏差
        </RouterLink>
        <RouterLink class="back-link" :to="backLink">
          {{ fromMonthPlan ? '返回月度计划' : fromStrategy ? '返回库存策略调整' : '返回库存优化' }}
        </RouterLink>
      </template>
    </PageHeader>

    <ElSkeleton v-if="loading" :rows="5" animated class="surface health-section" />
    <section v-else-if="error" class="surface health-section" aria-label="库存健康度加载失败">
      <ElAlert :title="error" type="error" show-icon :closable="false" />
      <ElButton class="retry-button" @click="loadHealth">重试</ElButton>
    </section>
    <ElEmpty
      v-else-if="!snapshot || !product"
      class="surface health-section"
      description="暂无成品库存数据"
    />
    <template v-else>
      <section class="surface health-section health-filters" aria-label="评价筛选">
        <label class="filter">
          成品
          <select :value="product.code" @change="selectProduct">
            <option v-for="item in products" :key="item.code" :value="item.code">
              {{ item.name }} · {{ item.code }}
            </option>
          </select>
        </label>
        <label v-if="periods.length" class="filter">
          评价月份
          <select :value="selectedPeriod?.period" @change="selectMonth">
            <option v-for="item in periods" :key="item.period" :value="item.period">
              {{ item.period }}
            </option>
          </select>
        </label>
        <span class="filter"
          >工厂 <strong>{{ snapshot.plant }}</strong></span
        >
        <ElTag v-if="demo" type="info" effect="plain">演示数据</ElTag>
      </section>

      <InventoryHealthPanel v-if="report" :analysis="report" :unit="product.unit" />
      <ElEmpty v-else class="surface health-section" description="暂无该成品的月度执行历史" />
    </template>
  </div>
</template>

<style scoped>
.health-section {
  margin-bottom: 16px;
  padding: clamp(14px, 2vw, 22px);
}

.health-filters,
.filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.filter {
  gap: 8px;
  min-width: 0;
  color: var(--scos-muted);
  font-size: 13px;
}

.filter strong {
  color: var(--scos-ink);
}

.filter select {
  max-width: 100%;
  min-height: 34px;
  padding: 4px 8px;
  border: 1px solid var(--scos-border);
  border-radius: 6px;
  background: var(--scos-surface);
  color: var(--scos-ink);
  font: inherit;
}

.retry-button {
  margin-top: 12px;
}

.back-link {
  color: var(--scos-primary);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}
</style>
