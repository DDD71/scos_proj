<script setup lang="ts">
import { computed } from 'vue'
import { ElAlert, ElButton, ElEmpty, ElSkeleton, ElTable, ElTableColumn, ElTag } from 'element-plus'
import type { ProcurementOptimizationOffer } from '../model/optimization'
import { getSupplierRegion } from '../model/supplier-region'
import type { ProcurementSupplier } from '../model/types'

const props = defineProps<{
  suppliers: ProcurementSupplier[]
  excludedCodes: string[]
  offers?: ProcurementOptimizationOffer[]
  unit?: string
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{ toggle: [code: string] }>()

const candidates = computed(() => {
  const excluded = new Set(props.excludedCodes)
  const offers = new Map(props.offers?.map((offer) => [offer.supplierCode, offer]))
  return props.suppliers.map((supplier) => ({
    supplier,
    region: getSupplierRegion(supplier),
    stopped: supplier.enabledStatus === '停用',
    excluded: excluded.has(supplier.supplierCode),
    offer: offers.get(supplier.supplierCode),
  }))
})

const activeCount = computed(
  () => candidates.value.filter(({ stopped, excluded }) => !stopped && !excluded).length,
)
const quotedCount = computed(
  () =>
    candidates.value.filter(({ stopped, excluded, offer }) => !stopped && !excluded && offer)
      .length,
)
const formatNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format

function displayQuantity(quantity: number) {
  return [formatNumber(quantity), props.unit].filter(Boolean).join(' ')
}

function displayPrice(price: number, currency: string) {
  const priceUnit = [currency === 'CNY' ? '元' : currency, props.unit].filter(Boolean).join('/')
  return [formatNumber(price), priceUnit].filter(Boolean).join(' ')
}

function displayPaymentTerms(supplier: ProcurementSupplier, offer?: ProcurementOptimizationOffer) {
  const masterTerms = supplier.paymentTerms?.trim()
  const quoteTerms = offer?.paymentDays == null ? undefined : `${offer.paymentDays} 天`
  const differs =
    masterTerms && quoteTerms && masterTerms.replace(/\s/g, '') !== quoteTerms.replace(/\s/g, '')
  return {
    terms: quoteTerms || masterTerms || '—',
    masterTerms: differs ? masterTerms : undefined,
  }
}
</script>

<template>
  <section aria-labelledby="procurement-candidates-title" :aria-busy="loading">
    <header class="candidate-heading">
      <div>
        <h2 id="procurement-candidates-title">候选供应商</h2>
        <p>本方案的禁用操作仅影响本次采购。</p>
      </div>
      <span v-if="!loading && !error && candidates.length" class="candidate-count">
        参与本方案 {{ activeCount }} 家
        <template v-if="offers"> · 有可用报价 {{ quotedCount }} 家</template>
      </span>
    </header>

    <ElSkeleton v-if="loading" :rows="2" animated />
    <ElAlert v-else-if="error" :title="error" type="error" :closable="false" show-icon />
    <ElEmpty v-else-if="!candidates.length" description="暂无候选供应商" :image-size="56" />
    <ElTable
      v-else
      :data="candidates"
      row-key="supplier.supplierCode"
      size="small"
      class="candidate-table"
      aria-label="候选供应商清单"
    >
      <ElTableColumn label="供应商" min-width="145">
        <template #default="{ row }">
          <strong class="supplier-name">{{
            row.supplier.supplierName || row.supplier.supplierCode
          }}</strong>
          <p class="secondary">
            {{
              [
                row.supplier.supplierName ? row.supplier.supplierCode : '',
                row.region,
                row.supplier.currency && row.supplier.currency !== row.offer?.currency
                  ? row.supplier.currency
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')
            }}
          </p>
        </template>
      </ElTableColumn>
      <ElTableColumn label="报价单价" width="99" align="right">
        <template #default="{ row }">
          <span v-if="row.offer">{{ displayPrice(row.offer.unitPrice, row.offer.currency) }}</span>
          <span v-else class="secondary">{{ offers && !row.stopped ? '暂无可用报价' : '—' }}</span>
        </template>
      </ElTableColumn>
      <ElTableColumn label="可供量" width="72" align="right">
        <template #default="{ row }">{{
          row.offer ? displayQuantity(row.offer.capacity) : '—'
        }}</template>
      </ElTableColumn>
      <ElTableColumn label="起订量" width="72" align="right">
        <template #default="{ row }">{{
          row.offer ? displayQuantity(row.offer.minimumQuantity) : '—'
        }}</template>
      </ElTableColumn>
      <ElTableColumn label="单位运费" width="77" align="right">
        <template #default="{ row }">
          {{
            row.offer?.freightPerUnit != null
              ? displayPrice(row.offer.freightPerUnit, row.offer.currency)
              : '—'
          }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="包材抵扣" width="77" align="right">
        <template #default="{ row }">
          {{
            row.offer?.packagingCreditPerUnit != null
              ? displayPrice(row.offer.packagingCreditPerUnit, row.offer.currency)
              : '—'
          }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="付款账期" width="86">
        <template #default="{ row }">
          {{ displayPaymentTerms(row.supplier, row.offer).terms }}
          <p v-if="displayPaymentTerms(row.supplier, row.offer).masterTerms" class="secondary">
            档案 {{ displayPaymentTerms(row.supplier, row.offer).masterTerms }}
          </p>
        </template>
      </ElTableColumn>
      <ElTableColumn label="状态与操作" width="96" align="center">
        <template #default="{ row }">
          <div class="candidate-actions">
            <ElTag
              :type="row.stopped ? 'info' : row.excluded ? 'warning' : 'success'"
              effect="plain"
              size="small"
            >
              {{ row.stopped ? '主数据停用' : row.excluded ? '本方案禁用' : '参与本方案' }}
            </ElTag>
            <ElButton
              v-if="!row.stopped"
              link
              type="primary"
              size="small"
              :aria-label="`${row.excluded ? '恢复' : '禁用'} ${row.supplier.supplierName || row.supplier.supplierCode}`"
              @click="emit('toggle', row.supplier.supplierCode)"
            >
              {{ row.excluded ? '恢复参与' : '禁用' }}
            </ElButton>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>

<style scoped>
.candidate-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 14px;
}

.candidate-heading h2 {
  font-size: 17px;
}

.candidate-heading p,
.candidate-count,
.secondary {
  color: var(--scos-muted);
  font-size: 12px;
}

.candidate-heading p {
  margin-top: 5px;
}

.candidate-table {
  font-variant-numeric: tabular-nums;
}

.candidate-table :deep(.cell) {
  padding-inline: 6px;
  line-height: 1.5;
}

.supplier-name {
  font-weight: 600;
}

.candidate-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
</style>
