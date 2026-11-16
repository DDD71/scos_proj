<script setup lang="ts">
import { computed } from 'vue'
import { ElAlert, ElButton, ElDialog, ElTable, ElTableColumn } from 'element-plus'
import type { ProcurementRollingAssessment } from '../model/execution'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  assessment?: ProcurementRollingAssessment | null
  loading: boolean
  failed: boolean
  canCreate: boolean
}>()
const emit = defineEmits<{ create: [assessment: ProcurementRollingAssessment, amount: number] }>()
const affected = computed(
  () => props.assessment?.affectedOrders.reduce((sum, row) => sum + row.quantity, 0) ?? 0,
)
const amount = computed(() => (props.assessment?.demandIncrease ?? 0) + affected.value)
const format = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 })
function quantity(value: number) {
  return [format.format(value), props.assessment?.unit].filter(Boolean).join(' ')
}
</script>

<template>
  <ElDialog
    v-model="open"
    title="需求缺口评估"
    width="min(calc(100vw - 32px), 760px)"
    :show-close="!loading"
    :close-on-click-modal="false"
    :close-on-press-escape="!loading"
  >
    <p v-if="loading" role="status">正在读取最新需求与执行偏差…</p>
    <ElAlert
      v-else-if="failed"
      title="未能完成需求缺口评估，请返回执行情况页面刷新后重试。"
      type="error"
      :closable="false"
    />
    <ElAlert
      v-else-if="!assessment"
      title="当前方案暂无可用的需求缺口数据。"
      type="info"
      :closable="false"
    />
    <template v-else>
      <p>
        基准方案 {{ assessment.basePlanNumber }} · 最新需求版本 {{ assessment.latestDemandVersion }}
      </p>
      <p>
        基准需求 {{ quantity(assessment.baselineDemand) }} · 最新需求
        {{ quantity(assessment.latestDemand) }} · 保留原方案量
        {{ quantity(assessment.protectedQuantity) }}
      </p>
      <p class="adjustment-scope">
        需求增量 {{ quantity(assessment.demandIncrease) }} ＋ 供应异常未执行量
        {{ quantity(affected) }} ＝ 本次需求缺口 <strong>{{ quantity(amount) }}</strong>
      </p>
      <ElTable
        v-if="assessment.affectedOrders.length"
        :data="assessment.affectedOrders"
        row-key="orderKey"
        size="small"
        aria-label="纳入需求缺口的订单"
      >
        <ElTableColumn prop="orderKey" label="采购订单 / 行号" min-width="170" />
        <ElTableColumn prop="supplierName" label="供应商" min-width="145" />
        <ElTableColumn prop="riskType" label="异常" min-width="95" />
        <ElTableColumn prop="reason" label="原因" min-width="145" />
        <ElTableColumn label="缺口量" min-width="100" align="right">
          <template #default="{ row }">{{ quantity(row.quantity) }}</template>
        </ElTableColumn>
      </ElTable>
      <p v-if="!canCreate && amount > 0">基准方案缺少工厂、月份或物料信息，暂无法创建草稿。</p>
    </template>
    <template #footer>
      <ElButton :disabled="loading" @click="open = false">返回执行情况</ElButton>
      <ElButton
        v-if="assessment && amount > 0"
        type="primary"
        :disabled="!canCreate"
        @click="emit('create', assessment, amount)"
        >创建补采草稿</ElButton
      >
    </template>
  </ElDialog>
</template>

<style scoped>
.adjustment-scope {
  padding: 12px;
  border-radius: 6px;
  background: var(--scos-primary-soft);
  color: var(--scos-ink);
}
</style>
