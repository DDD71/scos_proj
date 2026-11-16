<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
  ElDrawer,
  ElTable,
  ElTableColumn,
} from 'element-plus'
import { formatQuantity } from '../domain/analysis'
import { findTraceRoots, traceBatchSelection, traceSearchTypes } from '../domain/batch-trace'
import type { TraceDirection, TraceSearchType } from '../domain/batch-trace'
import type { CostingRelation, CostingSnapshot } from '../model/snapshot'
import CostingMetrics from './CostingMetrics.vue'
import CostingTraceGraph from './CostingTraceGraph.vue'

const props = defineProps<{ data: CostingSnapshot }>()
const route = useRoute()
const router = useRouter()
const searchType = ref<TraceSearchType>('batch')
const keyword = ref('')
const direct = ref(false)
const evidence = ref<CostingRelation>()
const defaultBatch = computed(
  () => props.data.batches.find((batch) => batch.stage === '成品罐批次') ?? props.data.batches[0],
)
const search = computed<{ type: TraceSearchType; keyword: string }>(() => {
  if (typeof route.query.order === 'string') return { type: 'order', keyword: route.query.order }
  if (typeof route.query.customer === 'string')
    return { type: 'customer', keyword: route.query.customer }
  if (typeof route.query.batch === 'string') return { type: 'batch', keyword: route.query.batch }
  return { type: 'batch', keyword: defaultBatch.value?.id ?? '' }
})
watch(
  [() => search.value.type, () => search.value.keyword],
  ([type, value]) => {
    searchType.value = type
    keyword.value = value
  },
  { immediate: true },
)
const direction = computed<TraceDirection>({
  get: () =>
    route.query.direction === 'up' || route.query.direction === 'down'
      ? route.query.direction
      : 'both',
  set: (value) =>
    void router.replace({
      query: { ...route.query, direction: value === 'both' ? undefined : value },
    }),
})

const suggestions = computed(() => {
  if (searchType.value === 'batch') return props.data.batches.map((batch) => batch.id)
  const field = searchType.value === 'order' ? 'salesOrder' : 'customer'
  return [...new Set(props.data.orders.map((order) => order[field]))]
})
const roots = computed(() => findTraceRoots(props.data, search.value.type, search.value.keyword))
const result = computed(() => traceBatchSelection(props.data, roots.value, direction.value))
const selected = computed(() => props.data.batches.find((batch) => batch.id === roots.value[0]))
const shownRelations = computed(() => {
  if (!direct.value) return result.value.relations
  const ids = new Set(roots.value)
  return result.value.relations.filter(
    (relation) =>
      (direction.value !== 'down' && ids.has(relation.to)) ||
      (direction.value !== 'up' && ids.has(relation.from)),
  )
})
const metrics = computed(() => [
  { label: '关联批次', value: result.value.batches.length },
  { label: '谱系关系', value: result.value.relations.length },
  { label: '销售订单', value: new Set(result.value.orders.map((order) => order.salesOrder)).size },
  { label: '客户', value: new Set(result.value.orders.map((order) => order.customer)).size },
])

function submit() {
  const value = keyword.value.trim()
  if (value) {
    void router.push({
      query: {
        [searchType.value]: value,
        direction: route.query.direction,
      },
    })
  }
}

function changeType() {
  keyword.value = ''
}

function batchQuery(id: string) {
  return { batch: id, direction: route.query.direction }
}

function followBatch(id: string) {
  void router.push({ query: batchQuery(id) })
}
</script>

<template>
  <section class="surface costing-panel">
    <h2>查询条件</h2>
    <form class="costing-toolbar" @submit.prevent="submit">
      <label>
        查询类型
        <select v-model="searchType" @change="changeType">
          <option v-for="(label, value) in traceSearchTypes" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </label>
      <label>
        {{ traceSearchTypes[searchType] }}
        <input
          v-model="keyword"
          list="costing-trace-options"
          type="search"
          autocomplete="off"
          required
        />
      </label>
      <datalist id="costing-trace-options">
        <option v-for="value in suggestions" :key="value" :value="value" />
      </datalist>
      <ElButton type="primary" native-type="submit">查询</ElButton>
      <label>
        追溯方向
        <select v-model="direction">
          <option value="both">双向 · 完整链路</option>
          <option value="up">逆向追溯 · 上游来源</option>
          <option value="down">正向追溯 · 下游去向</option>
        </select>
      </label>
    </form>
    <p v-if="!roots.length" class="costing-muted" role="status">
      当前快照没有找到匹配的批次、销售订单或客户。
    </p>
    <template v-else>
      <p class="costing-muted">查询起点 {{ search.keyword }} · {{ roots.length }} 个批次</p>
      <div v-if="selected && search.type === 'batch'" class="trace-entry-links">
        <RouterLink
          class="costing-link"
          :to="{ name: 'costing-lineage', query: { batch: selected.id } }"
          >查看批次划分</RouterLink
        >
        <RouterLink
          v-if="data.costs.some((cost) => cost.batch === selected?.id)"
          class="costing-link"
          :to="{ name: 'costing-batch', query: { batch: selected.id } }"
          >查看批次成本</RouterLink
        >
      </div>
    </template>
  </section>
  <template v-if="roots.length">
    <CostingMetrics :metrics="metrics" />
    <section class="surface costing-panel">
      <h2>批次多对多谱系图</h2>
      <p class="costing-muted">
        箭头表示物料从上游批次流向下游批次。点批次查看分流与汇流，点连线查看证据。
      </p>
      <div class="costing-toolbar">
        <label>
          关系范围
          <select v-model="direct">
            <option :value="false">全部关联</option>
            <option :value="true">直接关系</option>
          </select>
        </label>
      </div>
      <CostingTraceGraph
        :batches="result.batches"
        :relations="shownRelations"
        :roots="roots"
        @follow="followBatch"
        @evidence="evidence = $event"
      />
      <p v-if="result.missingBatches.length" role="status">
        缺少批次台账记录 {{ result.missingBatches.join('、') }}
      </p>
    </section>
    <section class="surface costing-panel">
      <h2>定量谱系</h2>
      <ElTable
        :data="shownRelations"
        row-key="id"
        max-height="350"
        empty-text="当前方向没有谱系关系"
      >
        <ElTableColumn label="上游 → 下游" min-width="310">
          <template #default="{ row }">
            <RouterLink class="costing-link" :to="{ query: batchQuery(row.from) }">{{
              row.from
            }}</RouterLink>
            <span> → </span>
            <RouterLink class="costing-link" :to="{ query: batchQuery(row.to) }">{{
              row.to
            }}</RouterLink>
          </template>
        </ElTableColumn>
        <ElTableColumn label="关联数量" min-width="100" align="right">
          <template #default="{ row }">{{ formatQuantity(row.qty) }} {{ row.unit }}</template>
        </ElTableColumn>
        <ElTableColumn prop="method" label="匹配方法" min-width="130" />
        <ElTableColumn prop="confidence" label="可信度" min-width="80" />
        <ElTableColumn label="操作" width="80">
          <template #default="{ row }">
            <ElButton link type="primary" @click="evidence = row as CostingRelation">证据</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </section>
    <section class="surface costing-panel">
      <h2>关联订单与客户</h2>
      <ElTable
        :data="result.orders"
        row-key="id"
        max-height="350"
        empty-text="当前方向没有关联销售订单"
      >
        <ElTableColumn label="销售订单" min-width="135">
          <template #default="{ row }">
            <RouterLink class="costing-link" :to="{ query: { order: row.salesOrder } }">{{
              row.salesOrder
            }}</RouterLink>
          </template>
        </ElTableColumn>
        <ElTableColumn label="客户" min-width="135">
          <template #default="{ row }">
            <RouterLink class="costing-link" :to="{ query: { customer: row.customer } }">{{
              row.customer
            }}</RouterLink>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="productionOrder" label="生产订单" min-width="145" />
        <ElTableColumn prop="settlementBatch" label="结转批次" min-width="145" />
      </ElTable>
    </section>
  </template>
  <ElDrawer
    :model-value="Boolean(evidence)"
    title="谱系关系证据"
    size="min(520px, 95vw)"
    append-to-body
    @close="evidence = undefined"
  >
    <ElDescriptions v-if="evidence" :column="1" border>
      <ElDescriptionsItem label="关系编号">{{ evidence.id }}</ElDescriptionsItem>
      <ElDescriptionsItem label="上游 → 下游"
        >{{ evidence.from }} → {{ evidence.to }}</ElDescriptionsItem
      >
      <ElDescriptionsItem label="关联数量"
        >{{ formatQuantity(evidence.qty) }} {{ evidence.unit }}</ElDescriptionsItem
      >
      <ElDescriptionsItem label="去向／来源占比"
        >{{ evidence.upstreamShare }} ／ {{ evidence.downstreamShare }}</ElDescriptionsItem
      >
      <ElDescriptionsItem label="收率">{{ evidence.yield }}</ElDescriptionsItem>
      <ElDescriptionsItem label="方法">{{ evidence.method }}</ElDescriptionsItem>
      <ElDescriptionsItem label="证据">{{ evidence.evidence }}</ElDescriptionsItem>
      <ElDescriptionsItem label="来源">{{ evidence.source }}</ElDescriptionsItem>
      <ElDescriptionsItem label="可信度与状态"
        >{{ evidence.confidence }} · {{ evidence.status }}</ElDescriptionsItem
      >
    </ElDescriptions>
  </ElDrawer>
</template>

<style scoped>
.trace-entry-links {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
</style>
