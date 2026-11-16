<script setup lang="ts">
import { computed } from 'vue'
import { ElAlert, ElTable, ElTableColumn, ElTag } from 'element-plus'
import type { ProcurementOptimizationResult } from '../model/optimization'

const props = defineProps<{
  result: ProcurementOptimizationResult
  unit: string
  version?: number
}>()

const formatQuantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format
const formatPrice = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format
const formatAmount = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format

const weightedEstimatedPrice = computed(() => {
  const { estimatedCost, allocatedQuantity } = props.result
  return estimatedCost != null && allocatedQuantity > 0 ? estimatedCost / allocatedQuantity : null
})
const supplierCount = computed(
  () => new Set(props.result.allocations.map((allocation) => allocation.supplierCode)).size,
)
const showPackageCredit = computed(() =>
  props.result.allocations.some((allocation) => allocation.packagingCredit != null),
)
const showEstimatedPrice = computed(() =>
  props.result.allocations.some((allocation) => allocation.effectiveUnitCost != null),
)
const showEstimatedCost = computed(() =>
  props.result.allocations.some((allocation) => allocation.estimatedCost != null),
)
</script>

<template>
  <section class="optimization-result" aria-label="采购优化结果">
    <header class="result-heading">
      <h2>{{ version ? `采购方案 V${version}` : '建议采购方案' }}</h2>
      <ElTag v-if="result.source === 'mock'" size="small" type="warning" effect="plain">
        模拟结果
      </ElTag>
      <div v-if="$slots.actions" class="result-actions"><slot name="actions" /></div>
    </header>

    <dl class="result-metrics">
      <div>
        <dt>预期采购需求量</dt>
        <dd>{{ formatQuantity(result.requestedQuantity) }} {{ unit }}</dd>
      </div>
      <div>
        <dt>已分配采购量</dt>
        <dd>{{ formatQuantity(result.allocatedQuantity) }} {{ unit }}</dd>
      </div>
      <div>
        <dt>未分配采购量</dt>
        <dd>{{ formatQuantity(result.shortageQuantity) }} {{ unit }}</dd>
      </div>
      <div>
        <dt>建议供应商</dt>
        <dd>{{ supplierCount }} 家</dd>
      </div>
      <div>
        <dt>报价总金额</dt>
        <dd>
          <template v-if="result.totalCost != null">
            {{ formatAmount(result.totalCost) }} {{ result.currency }}
          </template>
          <template v-else>—</template>
        </dd>
      </div>
      <div v-if="result.packagingCredit != null">
        <dt>包装抵扣总额</dt>
        <dd>{{ formatAmount(result.packagingCredit) }} {{ result.currency }}</dd>
      </div>
      <div v-if="result.estimatedCost != null">
        <dt>估算比较总成本</dt>
        <dd>{{ formatAmount(result.estimatedCost) }} {{ result.currency }}</dd>
      </div>
      <div v-if="weightedEstimatedPrice != null">
        <dt>加权估算单价</dt>
        <dd>{{ formatPrice(weightedEstimatedPrice) }} {{ result.currency }}/{{ unit }}</dd>
      </div>
    </dl>

    <ElAlert
      v-if="result.infeasibleReason"
      :title="result.infeasibleReason"
      type="warning"
      :closable="false"
      show-icon
    />
    <ElAlert
      v-if="result.shortageQuantity > 0"
      :title="`按当前报价和约束仍有 ${formatQuantity(result.shortageQuantity)} ${unit} 未能分配。`"
      type="warning"
      :closable="false"
      show-icon
    />
    <ElTable
      :data="result.allocations"
      row-key="supplierCode"
      empty-text="暂无可分配采购量的供应商"
      size="small"
    >
      <ElTableColumn prop="supplierCode" label="供应商编码" min-width="110" />
      <ElTableColumn prop="supplierName" label="供应商名称" min-width="160" />
      <ElTableColumn label="建议采购量" min-width="105" align="right">
        <template #default="{ row }">{{ formatQuantity(row.quantity) }} {{ unit }}</template>
      </ElTableColumn>
      <ElTableColumn label="报价单价" min-width="130" align="right">
        <template #default="{ row }">
          {{ formatPrice(row.unitPrice) }} {{ row.currency }}/{{ unit }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="报价金额" min-width="125" align="right">
        <template #default="{ row }">{{ formatAmount(row.amount) }} {{ row.currency }}</template>
      </ElTableColumn>
      <ElTableColumn v-if="showPackageCredit" label="包装抵扣额" min-width="125" align="right">
        <template #default="{ row }">
          <template v-if="row.packagingCredit != null">
            {{ formatAmount(row.packagingCredit) }} {{ row.currency }}
          </template>
          <template v-else>—</template>
        </template>
      </ElTableColumn>
      <ElTableColumn v-if="showEstimatedPrice" label="估算比较单价" min-width="145" align="right">
        <template #default="{ row }">
          <template v-if="row.effectiveUnitCost != null">
            {{ formatPrice(row.effectiveUnitCost) }} {{ row.currency }}/{{ unit }}
          </template>
          <template v-else>—</template>
        </template>
      </ElTableColumn>
      <ElTableColumn v-if="showEstimatedCost" label="估算比较金额" min-width="135" align="right">
        <template #default="{ row }">
          <template v-if="row.estimatedCost != null">
            {{ formatAmount(row.estimatedCost) }} {{ row.currency }}
          </template>
          <template v-else>—</template>
        </template>
      </ElTableColumn>
    </ElTable>
    <p v-if="result.source === 'mock' && result.estimatedCost != null" class="result-note">
      估算比较成本按报价加运费、扣除包装抵扣和账期资金收益。
    </p>
  </section>
</template>

<style scoped>
.optimization-result {
  display: grid;
  min-width: 0;
  gap: 14px;
}

.result-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.result-heading h2 {
  font-size: 16px;
}

.result-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.result-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
  gap: 12px 16px;
  margin: 0;
  padding: 14px 16px;
  border-radius: 7px;
  background: var(--scos-background);
}

.result-metrics dt,
.result-note {
  color: var(--scos-muted);
  font-size: 12px;
}

.result-metrics dd {
  margin: 5px 0 0;
  font-size: 16px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
</style>
