<script setup lang="ts">
import { computed } from 'vue'
import { ElAlert, ElButton, ElSkeleton, ElTable, ElTableColumn } from 'element-plus'
import type { ProcurementQuote } from '../model/types'

const props = defineProps<{
  quotes: readonly ProcurementQuote[]
  supplierCodes: readonly string[]
  materialCode: string
  loading: boolean
  error: string
}>()

defineEmits<{ refresh: [] }>()

const matchingQuotes = computed(() => {
  const suppliers = new Set(props.supplierCodes)
  return props.quotes.filter(
    (quote) => quote.materialCode === props.materialCode && suppliers.has(quote.supplierCode),
  )
})

const emptyText = computed(() => {
  if (!props.materialCode) return '请先选择物料'
  if (!props.supplierCodes.length) return '请先选择候选供应商'
  return '当前物料与所选供应商暂无 E采报价'
})

const detailFields = [
  ['物料编码', 'materialCode'],
  ['报价日期', 'quoteDate'],
  ['含税标识', 'taxIncluded'],
  ['税率', 'taxRate'],
  ['计价单位', 'pricingUnit'],
  ['有效期开始', 'validFrom'],
  ['可供日期', 'availableDate'],
  ['日可供能力', 'dailySupplyCapacity'],
  ['最小订货量（MOQ）', 'minimumOrderQuantity'],
  ['采购步长', 'purchaseIncrement'],
] as const satisfies readonly (readonly [string, keyof ProcurementQuote])[]

function displayValue(value: ProcurementQuote[keyof ProcurementQuote]) {
  if (typeof value === 'boolean') return value ? '是' : '否'
  return value === '' || value == null ? '—' : value
}
</script>

<template>
  <section aria-labelledby="procurement-quote-title">
    <header class="quote-heading">
      <div>
        <h2 id="procurement-quote-title">当期供应商报价</h2>
        <p>按方案物料和候选供应商查看 E采报价与供货能力。</p>
      </div>
      <ElButton :loading="loading" @click="$emit('refresh')">刷新报价</ElButton>
    </header>
    <ElSkeleton v-if="loading" :rows="3" animated />
    <ElAlert v-else-if="error" :title="error" type="error" :closable="false" show-icon />
    <ElTable v-else :data="matchingQuotes" :empty-text="emptyText">
      <ElTableColumn type="expand">
        <template #default="{ row }">
          <dl class="quote-detail">
            <div v-for="[label, field] in detailFields" :key="field">
              <dt>{{ label }}</dt>
              <dd>{{ displayValue(row[field]) }}</dd>
            </div>
          </dl>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="supplierCode" label="供应商编码" min-width="115" />
      <ElTableColumn prop="quoteNumber" label="报价单号" min-width="110" />
      <ElTableColumn prop="quoteLineNumber" label="报价行号" min-width="85" />
      <ElTableColumn label="报价单价" min-width="95" align="right">
        <template #default="{ row }">{{ displayValue(row.unitPrice) }}</template>
      </ElTableColumn>
      <ElTableColumn label="币种" min-width="75">
        <template #default="{ row }">{{ displayValue(row.currency) }}</template>
      </ElTableColumn>
      <ElTableColumn label="有效期结束" min-width="110">
        <template #default="{ row }">{{ displayValue(row.validTo) }}</template>
      </ElTableColumn>
      <ElTableColumn label="可供数量" min-width="95" align="right">
        <template #default="{ row }">{{ displayValue(row.availableQuantity) }}</template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>

<style scoped>
.quote-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.quote-heading h2 {
  font-size: 17px;
  font-weight: 600;
}

.quote-heading p {
  margin-top: 6px;
  color: var(--scos-muted);
  font-size: 13px;
}

.quote-detail {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 14px 20px;
  margin: 0;
  padding: 16px;
  background: var(--scos-background);
}

.quote-detail dt {
  color: var(--scos-muted);
  font-size: 12px;
}

.quote-detail dd {
  margin: 4px 0 0;
  color: var(--scos-ink);
  overflow-wrap: anywhere;
}
</style>
