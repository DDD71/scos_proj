<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElButton, ElDescriptions, ElDescriptionsItem, ElTable, ElTableColumn } from 'element-plus'
import CostingMetrics from './CostingMetrics.vue'
import { formatQuantity } from '../domain/analysis'
import type { CostingBatch } from '../model/snapshot'

const props = defineProps<{ batches: readonly CostingBatch[]; selected?: CostingBatch }>()
const emit = defineEmits<{ select: [id: string] }>()
const keyword = ref('')
const line = ref('')
const lines = computed(() => [...new Set(props.batches.map((batch) => batch.line))])
const filtered = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  return props.batches.filter(
    (batch) =>
      (!line.value || line.value === batch.line) &&
      [batch.id, batch.material, batch.stage, batch.device].some((value) =>
        value.toLowerCase().includes(search),
      ),
  )
})
const metrics = computed(() => [
  { label: '批次', value: props.batches.length },
  { label: '产线', value: lines.value.length },
  { label: '工序', value: new Set(props.batches.map((batch) => batch.stage)).size },
])

function rowClass({ row }: { row: CostingBatch }) {
  return row.id === props.selected?.id ? 'current-row' : ''
}
</script>

<template>
  <CostingMetrics :metrics="metrics" />
  <div class="costing-split">
    <section class="surface costing-panel">
      <h2>批次台账</h2>
      <div class="costing-toolbar">
        <label>批次、物料或工序 <input v-model="keyword" type="search" /></label>
        <label>
          产线
          <select v-model="line">
            <option value="">全部产线</option>
            <option v-for="value in lines" :key="value">{{ value }}</option>
          </select>
        </label>
      </div>
      <ElTable
        :data="filtered"
        :row-class-name="rowClass"
        row-key="id"
        height="420"
        empty-text="没有匹配的批次"
      >
        <ElTableColumn label="批次" min-width="165">
          <template #default="{ row }">
            <ElButton link type="primary" @click="emit('select', row.id)">{{ row.id }}</ElButton>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="stage" label="工序" min-width="108" />
        <ElTableColumn prop="material" label="物料" min-width="88" />
        <ElTableColumn label="数量" min-width="85" align="right">
          <template #default="{ row }">{{ formatQuantity(row.qty) }} {{ row.unit }}</template>
        </ElTableColumn>
      </ElTable>
    </section>
    <section class="surface costing-panel">
      <h2>批次划分详情</h2>
      <p v-if="!selected">当前快照找不到所选批次。</p>
      <ElDescriptions v-else :column="1" border>
        <ElDescriptionsItem label="当前批次">
          {{ selected.id }} · {{ selected.stage }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="数量与状态">
          {{ formatQuantity(selected.qty) }} {{ selected.unit }} · {{ selected.status }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="设备与时间">
          {{ selected.device }} · {{ selected.start }} 至 {{ selected.end }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="划分规则">{{ selected.rule }}</ElDescriptionsItem>
        <ElDescriptionsItem label="来源">{{ selected.source }}</ElDescriptionsItem>
      </ElDescriptions>
    </section>
  </div>
</template>
