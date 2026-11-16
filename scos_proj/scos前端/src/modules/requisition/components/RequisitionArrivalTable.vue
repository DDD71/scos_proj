<script setup lang="ts">
import { computed } from 'vue'
import { ElTable, ElTableColumn, ElTag } from 'element-plus'
import type { RequisitionArrival } from '../model/types'

const props = defineProps<{
  rows: readonly RequisitionArrival[]
  unit: string
  emptyText: string
  hideSupplier?: boolean
}>()

defineSlots<{
  actions?(props: { row: RequisitionArrival }): unknown
}>()

const tableRows = computed(() => [...props.rows])
const formatQuantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format
</script>

<template>
  <ElTable :data="tableRows" row-key="id" size="small" :empty-text="emptyText">
    <ElTableColumn prop="date" label="到货日期" min-width="108" />
    <ElTableColumn v-if="!hideSupplier" prop="supplierName" label="供应商" min-width="145" />
    <ElTableColumn label="到货量" min-width="94" align="right">
      <template #default="{ row }">{{ formatQuantity(row.quantity) }} {{ unit }}</template>
    </ElTableColumn>
    <ElTableColumn prop="contractId" label="合同号" min-width="116" />
    <ElTableColumn prop="orderId" label="采购订单" min-width="116" />
    <ElTableColumn label="状态" min-width="85">
      <template #default="{ row }">
        <ElTag size="small" effect="plain" :type="row.locked ? 'info' : 'success'">
          {{ row.status === '建议' && row.locked ? '已锁定' : row.status }}
        </ElTag>
      </template>
    </ElTableColumn>
    <ElTableColumn v-if="$slots.actions" label="操作" min-width="130">
      <template #default="{ row }"
        ><slot name="actions" :row="row as RequisitionArrival"
      /></template>
    </ElTableColumn>
  </ElTable>
</template>
