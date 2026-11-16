<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ElAlert,
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus'
import { env } from '@/shared/config/env'
import { formatQuantity } from '../domain/analysis'
import { traceBatchSelection } from '../domain/batch-trace'
import { loadQualityDisposition, saveQualityDisposition } from '../api/costing.repository'
import type { CostingSnapshot } from '../model/snapshot'
import type { QualityDisposition } from '../model/traceability'
import CostingMetrics from './CostingMetrics.vue'

const props = defineProps<{ data: CostingSnapshot }>()
const isMock = env.dataSource === 'mock'
const cases = computed(() => props.data.qualityCases ?? [])
const caseId = ref('')
const current = computed(
  () => cases.value.find((item) => item.id === caseId.value) ?? cases.value[0],
)
const scope = computed(() => `${props.data.context.factory}:${props.data.context.period}`)
const result = computed(() =>
  traceBatchSelection(props.data, current.value ? [current.value.batch] : [], 'down'),
)
const finished = computed(() => {
  const ids = new Set(result.value.orders.map((order) => order.settlementBatch))
  return result.value.batches.filter((batch) => ids.has(batch.id) || batch.stage === '成品罐批次')
})
const documents = computed(() => {
  const ids = new Set(result.value.batches.map((batch) => batch.id))
  return (current.value?.documents ?? [])
    .filter((row) => ids.has(row.batch))
    .map((row) => ({
      ...row,
      customer: result.value.orders.find((order) => order.salesOrder === row.salesOrder)?.customer,
    }))
})
const metrics = computed(() => [
  { label: '涉及成品批次', value: finished.value.length },
  { label: '涉及销售订单', value: new Set(result.value.orders.map((row) => row.salesOrder)).size },
  { label: '涉及客户', value: new Set(result.value.orders.map((row) => row.customer)).size },
  {
    label: '关联车次批次',
    value: result.value.batches.filter((row) => row.stage === '车次批次').length,
  },
])
const owner = ref('')
const action = ref('')
const note = ref('')
const error = ref('')
const disposition = ref<QualityDisposition>({ status: '待处置', history: [] })
const canSubmit = computed(() => Boolean(owner.value.trim() && note.value.trim()))

watch(
  [current, scope],
  async ([item, key], _, onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    caseId.value = item?.id ?? ''
    owner.value = ''
    action.value = ''
    note.value = ''
    error.value = ''
    disposition.value = { status: '待处置', history: [] }
    if (!isMock || !item) return
    try {
      const record = await loadQualityDisposition(key, item.id)
      if (active) disposition.value = record
    } catch {
      if (active) error.value = '读取处置记录失败。'
    }
  },
  { immediate: true },
)

async function record(status: QualityDisposition['status'], decision: string) {
  if (!isMock || !current.value || !canSubmit.value) return
  const next: QualityDisposition = {
    status,
    history: [
      ...disposition.value.history,
      {
        at: new Date().toISOString(),
        owner: owner.value.trim(),
        action: decision,
        note: note.value.trim(),
      },
    ],
  }
  try {
    await saveQualityDisposition(scope.value, current.value.id, next)
    disposition.value = next
    owner.value = ''
    action.value = ''
    note.value = ''
    error.value = ''
  } catch {
    error.value = '保存本地处置记录失败。'
  }
}
</script>

<template>
  <section class="surface costing-panel">
    <h2>质量异常</h2>
    <template v-if="current">
      <div class="costing-toolbar">
        <label>
          质量事件
          <select v-model="caseId">
            <option v-for="item in cases" :key="item.id" :value="item.id">{{ item.id }}</option>
          </select>
        </label>
        <ElTag v-if="isMock" type="warning" effect="plain">Mock QMS 记录</ElTag>
      </div>
      <ElDescriptions :column="1" border>
        <ElDescriptionsItem label="异常发现">{{ current.finding }}</ElDescriptionsItem>
        <ElDescriptionsItem label="报告时间">{{ current.reportedAt }}</ElDescriptionsItem>
        <ElDescriptionsItem label="异常批次">
          <RouterLink
            class="costing-link"
            :to="{ query: { batch: current.batch, direction: 'down' } }"
            >{{ current.batch }}</RouterLink
          >
        </ElDescriptionsItem>
      </ElDescriptions>
    </template>
    <p v-else class="costing-muted">当前快照没有质量异常记录。</p>
  </section>
  <template v-if="current">
    <CostingMetrics :metrics="metrics" />
    <section class="surface costing-panel">
      <h2>潜在受影响成品</h2>
      <p class="costing-muted">按异常批次的下游谱系圈定待核查范围。表中数量为成品批次量。</p>
      <ElTable :data="finished" row-key="id" max-height="280" empty-text="当前谱系未关联到成品批次">
        <ElTableColumn label="成品批次" min-width="150">
          <template #default="{ row }">
            <RouterLink
              class="costing-link"
              :to="{ query: { batch: row.id, direction: 'down' } }"
              >{{ row.id }}</RouterLink
            >
          </template>
        </ElTableColumn>
        <ElTableColumn prop="material" label="物料" min-width="100" />
        <ElTableColumn label="批次量" min-width="100" align="right">
          <template #default="{ row }">{{ formatQuantity(row.qty) }} {{ row.unit }}</template>
        </ElTableColumn>
        <ElTableColumn prop="source" label="谱系来源" min-width="155" />
      </ElTable>
    </section>
    <section class="surface costing-panel">
      <h2>库存、运输与客户影响</h2>
      <p v-if="isMock" class="costing-muted">
        以下为部分 Mock 单据。单据数量仅代表对应的库存或发运记录。
      </p>
      <ElTable :data="documents" row-key="id" max-height="300" empty-text="暂无对应库存或发运单据">
        <ElTableColumn prop="status" label="状态" width="80" />
        <ElTableColumn prop="source" label="来源系统" width="105" />
        <ElTableColumn prop="id" label="单据号" min-width="185" />
        <ElTableColumn label="关联批次或车次" min-width="165">
          <template #default="{ row }">
            <RouterLink class="costing-link" :to="{ query: { batch: row.batch } }">{{
              row.batch
            }}</RouterLink>
          </template>
        </ElTableColumn>
        <ElTableColumn label="单据数量" min-width="95" align="right">
          <template #default="{ row }">{{ formatQuantity(row.quantity) }} {{ row.unit }}</template>
        </ElTableColumn>
        <ElTableColumn label="销售订单" min-width="135">
          <template #default="{ row }">
            <RouterLink
              v-if="row.salesOrder"
              class="costing-link"
              :to="{ query: { order: row.salesOrder } }"
              >{{ row.salesOrder }}</RouterLink
            >
            <span v-else>—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="customer" label="客户" min-width="115">
          <template #default="{ row }">{{ row.customer || '—' }}</template>
        </ElTableColumn>
      </ElTable>
    </section>
    <section class="surface costing-panel">
      <h2>协同处置</h2>
      <template v-if="isMock">
        <p class="costing-muted">演示处置记录保存在当前浏览器。</p>
        <ElTag role="status" effect="plain">{{ disposition.status }}</ElTag>
        <ElAlert v-if="error" :title="error" type="error" :closable="false" />
        <form
          v-if="disposition.status !== '已关闭'"
          class="costing-toolbar disposition-form"
          @submit.prevent
        >
          <label>
            {{ disposition.status === '待处置' ? '处置人' : '复核人' }}
            <input v-model="owner" required />
          </label>
          <label v-if="disposition.status === '待处置'">
            处置措施
            <select v-model="action" required>
              <option value="">请选择</option>
              <option>库存隔离</option>
              <option>在途拦截</option>
              <option>通知客户</option>
              <option>复检确认</option>
            </select>
          </label>
          <label>
            {{ disposition.status === '待处置' ? '处置说明' : '复核意见' }}
            <input v-model="note" required />
          </label>
          <ElButton
            v-if="disposition.status === '待处置'"
            type="primary"
            :disabled="!canSubmit || !action"
            @click="record('待复核', action)"
          >
            提交复核
          </ElButton>
          <template v-else>
            <ElButton :disabled="!canSubmit" @click="record('待处置', '复核退回')"
              >退回处置</ElButton
            >
            <ElButton type="primary" :disabled="!canSubmit" @click="record('已关闭', '复核通过')"
              >关闭事件</ElButton
            >
          </template>
        </form>
        <ElTable :data="disposition.history" max-height="280" empty-text="暂无处置记录">
          <ElTableColumn label="记录时间" min-width="180">
            <template #default="{ row }">{{ new Date(row.at).toLocaleString('zh-CN') }}</template>
          </ElTableColumn>
          <ElTableColumn prop="owner" label="经办人" min-width="100" />
          <ElTableColumn prop="action" label="措施或复核结果" min-width="130" />
          <ElTableColumn prop="note" label="说明" min-width="180" />
        </ElTable>
      </template>
      <p v-else class="costing-muted">协同处置记录待接入质量事件接口。</p>
    </section>
  </template>
</template>

<style scoped>
.disposition-form {
  margin-top: 12px;
}
</style>
