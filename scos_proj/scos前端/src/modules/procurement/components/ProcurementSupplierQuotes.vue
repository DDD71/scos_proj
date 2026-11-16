<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElTable, ElTableColumn } from 'element-plus'
import { env } from '@/shared/config/env'
import { procurementRepository } from '../api/procurement.repository'
import { formatSupplierSyncTime } from '../model/supplier-sync'
import type { ProcurementQuote } from '../model/types'

const props = defineProps<{ supplierCode: string }>()
const quotes = ref<ProcurementQuote[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const formatNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format

async function loadQuotes() {
  loading.value = true
  loadFailed.value = false
  try {
    quotes.value = await procurementRepository.listSupplierQuotes(props.supplierCode)
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

function displayNumber(value?: number | null) {
  return value == null ? '—' : formatNumber(value)
}

onMounted(loadQuotes)
</script>

<template>
  <div class="supplier-quotes-toolbar">
    <p>{{ env.dataSource === 'mock' ? 'E采报价（Mock）' : '数据来源：E采' }}</p>
    <ElButton :loading="loading" @click="loadQuotes">刷新报价</ElButton>
  </div>
  <ElAlert
    v-if="loadFailed"
    title="报价加载失败，请刷新重试。"
    type="error"
    :closable="false"
    show-icon
  />
  <ElTable
    v-else
    :data="quotes"
    :empty-text="loading ? '正在读取报价…' : '暂无该供应商的报价与供货记录'"
    max-height="400"
  >
    <ElTableColumn prop="materialCode" label="物料编码" min-width="146" />
    <ElTableColumn label="报价单号／行号" min-width="150">
      <template #default="{ row }">{{ row.quoteNumber }} / {{ row.quoteLineNumber }}</template>
    </ElTableColumn>
    <ElTableColumn label="报价单价" min-width="140" align="right">
      <template #default="{ row }">
        {{ displayNumber(row.unitPrice) }}
        <template v-if="row.unitPrice != null">
          {{ row.currency }}{{ row.pricingUnit ? ' / ' + row.pricingUnit : '' }}
        </template>
      </template>
    </ElTableColumn>
    <ElTableColumn label="报价有效期" min-width="198">
      <template #default="{ row }">{{ row.validFrom || '—' }} 至 {{ row.validTo || '—' }}</template>
    </ElTableColumn>
    <ElTableColumn label="可供数量" min-width="96" align="right">
      <template #default="{ row }">{{ displayNumber(row.availableQuantity) }}</template>
    </ElTableColumn>
    <ElTableColumn label="报价日期" min-width="110">
      <template #default="{ row }">{{ row.quoteDate || '—' }}</template>
    </ElTableColumn>
    <ElTableColumn label="E采最近同步" min-width="157">
      <template #default="{ row }">{{ formatSupplierSyncTime(row.syncedAt) }}</template>
    </ElTableColumn>
    <ElTableColumn label="日可供能力" min-width="100" align="right">
      <template #default="{ row }">{{ displayNumber(row.dailySupplyCapacity) }}</template>
    </ElTableColumn>
    <ElTableColumn label="最小订货量" min-width="104" align="right">
      <template #default="{ row }">{{ displayNumber(row.minimumOrderQuantity) }}</template>
    </ElTableColumn>
    <ElTableColumn label="可供日期" min-width="110">
      <template #default="{ row }">{{ row.availableDate || '—' }}</template>
    </ElTableColumn>
  </ElTable>
</template>

<style scoped>
.supplier-quotes-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.supplier-quotes-toolbar p {
  color: var(--scos-muted);
}
</style>
