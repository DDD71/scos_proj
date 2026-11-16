<script setup lang="ts">
import { computed, useId } from 'vue'
import { ElTable, ElTableColumn, ElTag } from 'element-plus'
import {
  defaultProcurementOptimizationParameters,
  type ProcurementPlanVersion,
} from '../model/optimization'

const props = defineProps<{
  plans: readonly ProcurementPlanVersion[]
  selectedVersion: number | null
  unit: string
}>()

const emit = defineEmits<{ select: [version: number] }>()
const selectionName = useId()
const rows = computed(() => [...props.plans])
const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 })
const costFormat = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const parameterColumns = [
  { field: 'minSupplierCount', label: '最少家数', suffix: ' 家', width: 82 },
  { field: 'maxSupplierShare', label: '单家最高占比', suffix: '%', width: 104 },
  { field: 'minSelectedSupplierShare', label: '入选最低占比', suffix: '%', width: 104 },
  { field: 'annualFundingRate', label: '年化资金成本率', suffix: '%', width: 116 },
] as const

function formatCost(cost: number | null | undefined, currency: string | null) {
  if (cost == null) return '—'
  return [costFormat.format(cost), currency].filter(Boolean).join(' ')
}
</script>

<template>
  <section class="saved-plans" aria-labelledby="procurement-saved-plans-title">
    <h2 id="procurement-saved-plans-title">已保存方案</h2>
    <ElTable
      :data="rows"
      row-key="version"
      class="saved-plans-table"
      aria-label="已保存方案比较"
      empty-text="暂无已保存方案"
      size="small"
    >
      <ElTableColumn label="选择方案" min-width="100">
        <template #default="{ row }">
          <label class="plan-selection">
            <input
              type="radio"
              :name="selectionName"
              :aria-label="`选择方案 V${row.version}`"
              :checked="selectedVersion === row.version"
              @change="emit('select', row.version)"
            />
            <span>V{{ row.version }}</span>
          </label>
        </template>
      </ElTableColumn>
      <ElTableColumn
        v-for="{ field, label, suffix, width } in parameterColumns"
        :key="field"
        :label="label"
        :min-width="width"
        align="right"
      >
        <template #default="{ row }">
          {{
            numberFormat.format(
              row.input.parameters?.[field] ?? defaultProcurementOptimizationParameters[field],
            )
          }}{{ suffix }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="已分配采购量" min-width="116" align="right">
        <template #default="{ row }">
          {{ numberFormat.format(row.result.allocatedQuantity) }} {{ unit }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="估算总成本" min-width="132" align="right">
        <template #default="{ row }">
          {{ formatCost(row.result.estimatedCost ?? row.result.totalCost, row.result.currency) }}
          <p
            v-if="row.result.estimatedCost == null && row.result.totalCost != null"
            class="cost-note"
          >
            报价总金额
          </p>
        </template>
      </ElTableColumn>
      <ElTableColumn label="状态" min-width="110">
        <template #default="{ row }">
          <ElTag v-if="row.dispatch" type="success" size="small" effect="plain">已模拟下发</ElTag>
          <ElTag
            v-else-if="row.result.shortageQuantity > 0"
            type="warning"
            size="small"
            effect="plain"
          >
            未足量
          </ElTag>
          <ElTag v-else type="info" size="small" effect="plain">待下发</ElTag>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>

<style scoped>
.saved-plans {
  min-width: 0;
}

.saved-plans h2 {
  margin-bottom: 10px;
  font-size: 16px;
}

.saved-plans-table {
  font-variant-numeric: tabular-nums;
}

.plan-selection {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
}

.plan-selection input {
  accent-color: var(--scos-primary);
  margin: 0;
}

.cost-note {
  color: var(--scos-muted);
  font-size: 12px;
}
</style>
