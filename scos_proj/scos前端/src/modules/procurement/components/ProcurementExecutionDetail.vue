<script setup lang="ts">
import { computed } from 'vue'
import {
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
  ElDrawer,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTimeline,
  ElTimelineItem,
} from 'element-plus'
import { executionOrderKey, type ProcurementExecutionOrder } from '../model/execution'

const props = defineProps<{ order?: ProcurementExecutionOrder }>()
const emit = defineEmits<{ close: []; assess: [order: ProcurementExecutionOrder] }>()
const format = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 })
const amount = (value?: number | null, unit?: string | null) =>
  value == null ? '—' : [format.format(value), unit].filter(Boolean).join(' ')

const fields = computed<[string, string | null | undefined][]>(() => {
  const row = props.order
  if (!row) return []
  return [
    ['供应商', row.supplierName || row.supplierCode],
    ['物料', row.materialName || row.materialCode],
    ['合同号', row.contractNumber],
    ['执行状态', row.executionStatus],
    ['采购量', amount(row.purchaseQuantity, row.unit)],
    ['已发货量', amount(row.shippedQuantity, row.unit)],
    ['已收货量', amount(row.receivedQuantity, row.unit)],
    ['未交货量', amount(row.openDeliveryQuantity, row.unit)],
    ['计划到货日期', row.plannedArrivalDate],
    ['预计到厂时间', row.estimatedArrivalTime],
    ['实际到厂时间', row.actualArrivalTime],
    ['检验状态', row.inspectionStatus],
    ['质检合格量', amount(row.qualifiedQuantity, row.unit)],
    ['最新回传时间', row.updatedAt],
  ]
})
</script>

<template>
  <ElDrawer
    :model-value="!!order"
    :title="order ? '采购订单详情 · ' + executionOrderKey(order) : '采购订单详情'"
    size="min(100%, 660px)"
    @update:model-value="!$event && emit('close')"
  >
    <template v-if="order">
      <ElDescriptions :column="2" border>
        <ElDescriptionsItem v-for="[label, value] in fields" :key="label" :label="label">{{
          value || '—'
        }}</ElDescriptionsItem>
      </ElDescriptions>
      <p v-if="order.inspectionStatus === 'IQC中'" class="detail-section">
        到厂待检量仍计入未完成采购承诺。
      </p>
      <section v-if="order.risk" class="detail-section">
        <h3>
          执行预警 <ElTag type="danger" effect="plain">{{ order.risk.type }}</ElTag>
        </h3>
        <p>{{ order.risk.reason }}</p>
        <p v-if="order.risk.affectedQuantity != null">
          供应异常缺口
          <strong>{{ format.format(order.risk.affectedQuantity) }} {{ order.unit }}</strong>
        </p>
        <p v-if="order.risk.owner">责任人 {{ order.risk.owner }}</p>
        <p v-if="order.risk.dueAt">处理时限 {{ order.risk.dueAt }}</p>
        <ElButton
          v-if="(order.risk.affectedQuantity ?? 0) > 0"
          type="primary"
          @click="emit('assess', order)"
          >纳入需求缺口</ElButton
        >
      </section>
      <section class="detail-section">
        <h3>TMS 发运与到厂</h3>
        <ElTable v-if="order.arrivals?.length" :data="order.arrivals" size="small">
          <ElTableColumn label="运输单号 / 车次" min-width="130">
            <template #default="{ row }">{{
              [row.transportNumber, row.tripNumber].filter(Boolean).join(' / ')
            }}</template>
          </ElTableColumn>
          <ElTableColumn label="承诺到厂量" min-width="98" align="right">
            <template #default="{ row }">{{ amount(row.committedQuantity, row.unit) }}</template>
          </ElTableColumn>
          <ElTableColumn prop="shippedOn" label="发货日期" min-width="100" />
          <ElTableColumn prop="estimatedArrivalTime" label="预计到厂" min-width="106" />
          <ElTableColumn prop="actualArrivalTime" label="实际到厂" min-width="106" />
          <ElTableColumn prop="status" label="状态" min-width="86" />
        </ElTable>
        <p v-else>暂无 TMS 到货计划明细回传。</p>
      </section>
      <section class="detail-section">
        <h3>执行时间线</h3>
        <ElTimeline v-if="order.events?.length">
          <ElTimelineItem
            v-for="(event, index) in order.events"
            :key="index"
            :timestamp="event.occurredAt ?? undefined"
          >
            <ElTag size="small" effect="plain">{{ event.source }}</ElTag>
            {{ event.description }}
            <small v-if="event.reference">{{ event.reference }}</small>
          </ElTimelineItem>
        </ElTimeline>
        <p v-else>暂无执行事件回传。</p>
      </section>
    </template>
  </ElDrawer>
</template>

<style scoped>
.detail-section {
  margin-top: 20px;
}
.detail-section h3 {
  font-size: 15px;
  margin: 0 0 10px;
}
.detail-section p {
  margin: 8px 0;
}
.detail-section small {
  margin-left: 6px;
  color: var(--scos-muted);
}
</style>
