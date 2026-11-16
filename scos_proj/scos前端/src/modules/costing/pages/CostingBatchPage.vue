<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElAlert, ElButton, ElDrawer, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { listCostingPoolAdoptions } from '../api/costing.repository'
import CostingBatchDetail from '../components/CostingBatchDetail.vue'
import CostingPoolDrafts from '../components/CostingPoolDrafts.vue'
import { formatQuantity, money } from '../domain/analysis'
import { applyPoolAdoptions } from '../domain/pool-trial'
import type { CostingPoolAdoption } from '../model/pool-trial'
import type { CostingBatchResult, CostingSnapshot } from '../model/snapshot'

const props = defineProps<{ data: CostingSnapshot }>()
const route = useRoute()
const router = useRouter()
const search = ref('')
const adoptions = shallowRef<CostingPoolAdoption[]>([])
const trialLoadError = ref(false)
const snapshot = computed(() => applyPoolAdoptions(props.data, adoptions.value))
const adopted = computed(() => snapshot.value !== props.data)
const managingPools = computed(() => route.query.tab === 'pools')
const requestedBatch = computed(() =>
  typeof route.query.batch === 'string' ? route.query.batch : undefined,
)
const selected = computed(() =>
  managingPools.value
    ? undefined
    : snapshot.value.costs.find((row) => row.batch === requestedBatch.value),
)
const costRows = computed(() => {
  const query = search.value.trim().toLowerCase()
  return snapshot.value.costs.filter((row) =>
    [row.batch, row.material, row.stage].some((value) => value.toLowerCase().includes(query)),
  )
})

function setView(tab?: 'pools', batch?: string) {
  void router.replace({ query: { ...route.query, tab, batch } })
}

function viewBatch(batch: string) {
  setView(undefined, batch)
}

function rowClass({ row }: { row: CostingBatchResult }) {
  return row.batch === selected.value?.batch ? 'current-row' : ''
}

onMounted(async () => {
  try {
    adoptions.value = await listCostingPoolAdoptions(props.data.context)
  } catch {
    trialLoadError.value = true
  }
})
</script>

<template>
  <ElAlert
    v-if="trialLoadError"
    class="batch-alert"
    title="读取已采用的 Mock 试算失败，当前显示原始演示结果。"
    type="warning"
    :closable="false"
  />
  <section v-if="managingPools" class="surface costing-panel">
    <ElButton text type="primary" class="pool-back" @click="setView()">返回批次列表</ElButton>
    <CostingPoolDrafts
      :data="snapshot"
      :base-data="data"
      :adoptions="adoptions"
      @view-batch="viewBatch"
      @applied="adoptions = $event"
    />
  </section>
  <section v-else class="surface costing-panel">
    <div class="batch-list-toolbar">
      <div class="costing-toolbar">
        <label>
          批次号或物料
          <input v-model="search" type="search" placeholder="例如 260813-F01-01" />
        </label>
        <span class="costing-muted">{{ costRows.length }} 个批次</span>
        <ElTag v-if="adopted" type="info" effect="plain">已采用 Mock 试算</ElTag>
      </div>
      <ElButton @click="setView('pools')">管理费用池</ElButton>
    </div>
    <ElAlert
      v-if="requestedBatch && !selected"
      class="batch-alert"
      :title="`当前成本期间找不到批次 ${requestedBatch}`"
      type="info"
      :closable="false"
      show-icon
    />
    <ElTable
      :data="costRows"
      row-key="batch"
      :row-class-name="rowClass"
      max-height="560"
      empty-text="没有找到符合条件的批次"
    >
      <ElTableColumn prop="batch" label="批次" min-width="171" />
      <ElTableColumn prop="material" label="物料" min-width="115" />
      <ElTableColumn label="数量" min-width="108" align="right">
        <template #default="{ row }">{{ formatQuantity(row.quantity) }} {{ row.unit }}</template>
      </ElTableColumn>
      <ElTableColumn label="总成本" min-width="132" align="right">
        <template #default="{ row }">{{ money(row.totalCost) }}</template>
      </ElTableColumn>
      <ElTableColumn label="单位成本" min-width="125" align="right">
        <template #default="{ row }">
          {{ money(row.unitCost) }}{{ row.unitCost == null ? '' : '/' + row.unit }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="104" fixed="right">
        <template #default="{ row }">
          <ElButton link type="primary" @click="viewBatch(row.batch)">查看成本</ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>

  <ElDrawer
    :model-value="Boolean(selected)"
    title="批次成本明细"
    size="min(700px, 100vw)"
    append-to-body
    @close="setView()"
  >
    <CostingBatchDetail
      v-if="selected"
      :key="selected.batch"
      :batch="selected"
      :data="snapshot"
      @view-batch="viewBatch"
    />
  </ElDrawer>
</template>

<style scoped>
.batch-list-toolbar {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px 16px;
  margin-bottom: 14px;
}
.batch-list-toolbar .costing-toolbar {
  align-items: end;
  margin: 0;
}
.batch-list-toolbar .costing-muted {
  padding-bottom: 7px;
}
.batch-alert {
  margin-bottom: 12px;
}
.pool-back {
  margin: 0 0 12px;
}
</style>
