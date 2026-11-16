<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ElButton, ElDialog } from 'element-plus'
import {
  matchesFinishedProductDemand,
  publishFinishedProductDemand,
  readFinishedProductDemands,
} from '@/shared/api/finished-product-demands'
import { env } from '@/shared/config/env'
import { listPlannedInventoryReplenishments } from '../domain/overview-scenario'
import type { InventoryProduct, InventoryProjectionDay, InventorySnapshot } from '../model/types'

const props = defineProps<{
  snapshot: InventorySnapshot
  product: InventoryProduct
  projection: InventoryProjectionDay[]
}>()

const open = ref(false)
const error = ref('')
const publishedDemands = ref<Awaited<ReturnType<typeof readFinishedProductDemands>>>([])
onMounted(async () => {
  try {
    publishedDemands.value = await readFinishedProductDemands()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '成品需求读取失败。'
  }
})
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format
const businessDate = computed(() => {
  if (env.dataSource !== 'mock') return undefined

  const snapshotDate = props.snapshot.snapshotTime.slice(0, 10)
  return (props.product.dailyExecution ?? []).reduce(
    (latest, day) => (day.actual?.closingStock != null && day.date > latest ? day.date : latest),
    snapshotDate,
  )
})
const release = computed(() => ({
  plant: props.snapshot.plant,
  snapshotId: props.snapshot.snapshotId,
  productCode: props.product.code,
  productName: props.product.name,
  unit: props.product.unit,
  businessDate: businessDate.value,
  lines: listPlannedInventoryReplenishments(props.projection).map(
    ({ date, availableDate, quantity }) => ({
      requestedStartDate: date,
      requiredAvailableDate: availableDate,
      quantity,
    }),
  ),
}))
const published = computed(() =>
  publishedDemands.value.find(
    (demand) =>
      demand.plant === release.value.plant && demand.productCode === release.value.productCode,
  ),
)
const unchanged = computed(() =>
  published.value ? matchesFinishedProductDemand(published.value, release.value) : false,
)
const count = computed(() => release.value.lines.length)
const total = computed(() => release.value.lines.reduce((sum, line) => sum + line.quantity, 0))
const residualShortageDate = computed(
  () => props.projection.find((day) => (day.scenarioShortage ?? 0) > 0)?.date,
)

function previewDemand() {
  error.value = ''
  open.value = true
}

async function publishDemand() {
  if (!count.value || unchanged.value) return
  try {
    await publishFinishedProductDemand(release.value)
    publishedDemands.value = await readFinishedProductDemands()
    open.value = false
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '成品需求发布失败。'
  }
}
</script>

<template>
  <section class="demand-release" aria-labelledby="finished-product-demand-heading">
    <div>
      <h3 id="finished-product-demand-heading">待补产成品需求</h3>
      <p v-if="count">
        按当前策略建议补产
        <strong>{{ number(total) }} {{ product.unit }}</strong
        >，共 {{ count }} 笔
      </p>
      <p v-else>当前预测没有可发布的补产建议。</p>
      <p v-if="residualShortageDate" class="shortage-note">
        按建议补产后，{{ residualShortageDate }} 仍预计缺货。
      </p>
    </div>
    <div class="release-actions">
      <p v-if="error" role="alert">{{ error }}</p>
      <span v-if="published" role="status">
        {{ unchanged ? '已发布至精益排程' : '精益排程已有上一版需求' }}
      </span>
      <RouterLink
        v-if="published"
        class="release-link"
        :to="{ name: 'scheduling-overview', query: { demand: published.id } }"
      >
        查看排程待办
      </RouterLink>
      <ElButton type="primary" :disabled="!count || unchanged" @click="previewDemand">
        {{ published && !unchanged ? '更新成品需求' : '发布成品需求' }}
      </ElButton>
    </div>
  </section>

  <ElDialog v-model="open" title="发布成品需求" width="min(680px, 94vw)">
    <p class="demand-context">
      {{ snapshot.plant }} · {{ product.name }}（{{ product.code }}）· {{ count }} 笔，共
      {{ number(total) }} {{ product.unit }}
    </p>
    <p v-if="businessDate" class="demand-note">演示业务基准日 {{ businessDate }}</p>
    <p v-if="published" class="demand-note">发布后，将更新此工厂和成品在精益排程的待排产需求。</p>
    <p v-else class="demand-note">确认后，精益排程可按需求日期和数量安排生产。</p>
    <div class="demand-table-wrap">
      <table class="demand-table">
        <thead>
          <tr>
            <th scope="col">建议开产日</th>
            <th scope="col">需可用日期</th>
            <th scope="col">需求量（{{ product.unit }}）</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in release.lines" :key="line.requestedStartDate">
            <td>{{ line.requestedStartDate }}</td>
            <td>{{ line.requiredAvailableDate }}</td>
            <td>{{ number(line.quantity) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="error" class="shortage-note" role="alert">{{ error }}</p>
    <template #footer>
      <ElButton @click="open = false">取消</ElButton>
      <ElButton type="primary" @click="publishDemand">确认发布</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.demand-release {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid var(--scos-border);
  border-radius: 8px;
  background: var(--scos-background);
}

.demand-release h3 {
  margin: 0 0 4px;
  font-size: 15px;
}

.demand-release p,
.demand-context,
.demand-note {
  margin: 0;
  font-size: 13px;
}

.demand-release strong {
  color: var(--scos-ink);
}

.demand-release p,
.demand-note,
.release-actions span {
  color: var(--scos-muted);
}

.demand-release .shortage-note,
.shortage-note {
  margin-top: 4px;
  color: var(--el-color-danger-dark-2);
}

.release-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  font-size: 13px;
}

.release-link {
  color: var(--scos-primary);
  font-weight: 600;
}

.demand-context {
  font-weight: 600;
}

.demand-note {
  margin: 4px 0 12px;
}

.demand-table-wrap {
  max-height: 45vh;
  overflow: auto;
}

.demand-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.demand-table :is(th, td) {
  padding: 7px 8px;
  border-bottom: 1px solid var(--scos-border);
  text-align: left;
}

.demand-table :is(th, td):last-child {
  text-align: right;
}
</style>
