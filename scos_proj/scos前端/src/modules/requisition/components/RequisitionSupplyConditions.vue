<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElButton, ElTable, ElTableColumn } from 'element-plus'
import type { RequisitionSupply } from '../model/types'

const props = defineProps<{
  supplies: RequisitionSupply[]
  unit: string
  editable: boolean
}>()

const emit = defineEmits<{
  move: [supplierId: string, direction: -1 | 1]
}>()

const details = ref<HTMLDetailsElement>()
const summary = ref<HTMLElement>()
const formatQuantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format

const tableRows = computed(() => {
  const supplierCount = new Set(props.supplies.map(({ supplierId }) => supplierId)).size
  const seen = new Set<string>()
  return props.supplies.map((supply) => {
    const firstForSupplier = !seen.has(supply.supplierId)
    seen.add(supply.supplierId)
    return {
      ...supply,
      rowKey: `${supply.id}/${supply.orderId}`,
      firstForSupplier,
      canMoveUp: seen.size > 1,
      canMoveDown: seen.size < supplierCount,
    }
  })
})

function show() {
  if (details.value) details.value.open = true
  summary.value?.focus({ preventScroll: true })
  summary.value?.scrollIntoView({ block: 'nearest' })
}

defineExpose({ show })
</script>

<template>
  <details ref="details" class="supply-conditions">
    <summary ref="summary">供应商供货条件</summary>
    <ElTable :data="tableRows" row-key="rowKey" size="small" empty-text="本周暂无可安排的采购订单">
      <ElTableColumn prop="priority" label="供货顺序" width="90" />
      <ElTableColumn prop="supplierName" label="供应商" min-width="145" />
      <ElTableColumn prop="orderId" label="采购订单" min-width="120" />
      <ElTableColumn prop="earliestArrival" label="最早到货日" min-width="108" />
      <ElTableColumn prop="latestArrival" label="最晚到货日" min-width="108" />
      <ElTableColumn label="可安排余量" min-width="105" align="right">
        <template #default="{ row }"
          >{{ formatQuantity(row.remainingQuantity) }} {{ unit }}</template
        >
      </ElTableColumn>
      <ElTableColumn label="日可供量" min-width="100" align="right">
        <template #default="{ row }">{{ formatQuantity(row.dailyCapacity) }} {{ unit }}</template>
      </ElTableColumn>
      <ElTableColumn label="起送量" min-width="88" align="right">
        <template #default="{ row }">{{ formatQuantity(row.minimumQuantity) }} {{ unit }}</template>
      </ElTableColumn>
      <ElTableColumn v-if="editable" label="调整顺序" width="110">
        <template #default="{ row }">
          <div v-if="row.firstForSupplier" class="supplier-order-actions">
            <ElButton
              link
              type="primary"
              :aria-label="`上移 ${row.supplierName}`"
              :disabled="!row.canMoveUp"
              @click="emit('move', row.supplierId, -1)"
            >
              上移
            </ElButton>
            <ElButton
              link
              type="primary"
              :aria-label="`下移 ${row.supplierName}`"
              :disabled="!row.canMoveDown"
              @click="emit('move', row.supplierId, 1)"
            >
              下移
            </ElButton>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
  </details>
</template>

<style scoped>
.supply-conditions {
  min-width: 0;
}

.supply-conditions summary {
  width: fit-content;
  color: var(--scos-primary);
  cursor: pointer;
  font-weight: 600;
}

.supply-conditions[open] summary {
  margin-bottom: 6px;
}

.supplier-order-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.supplier-order-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
