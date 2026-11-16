<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElAlert, ElEmpty, ElPagination, ElSkeleton, ElTable, ElTableColumn } from 'element-plus'
import type { ProcurementSalesDemandRow } from '../model/overview'

const props = defineProps<{
  rows?: ProcurementSalesDemandRow[] | null
  loading?: boolean
  error?: boolean
}>()

const pageSize = 5
const page = ref(1)
const orderCount = computed(() => props.rows?.length ?? 0)
const visibleOrders = computed(() => {
  const start = (page.value - 1) * pageSize
  return props.rows?.slice(start, start + pageSize) ?? []
})

watch(orderCount, (count) => {
  page.value = Math.min(page.value, Math.max(1, Math.ceil(count / pageSize)))
})

const quantityFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 })
const usageFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 })

function rowKey(row: ProcurementSalesDemandRow) {
  return `${row.salesOrderNumber}/${row.salesOrderLineNumber}`
}
</script>

<template>
  <section class="surface sales-demand" aria-labelledby="sales-demand-title" :aria-busy="loading">
    <header class="demand-heading">
      <div>
        <h2 id="sales-demand-title">SAP 待排产销售订单与 BOM 需求</h2>
        <p>按订单数量和产品 BOM 单耗折算各订单行的玉米淀粉需求。</p>
      </div>
    </header>

    <ElSkeleton v-if="loading" :rows="3" animated />
    <ElAlert
      v-else-if="error"
      title="待排产销售订单加载失败。"
      type="error"
      :closable="false"
      show-icon
    />
    <template v-else>
      <ElTable :data="visibleOrders" :row-key="rowKey" size="small">
        <ElTableColumn label="销售订单号" min-width="165">
          <template #default="{ row }">
            {{ row.salesOrderNumber }}
            <div v-if="row.salesOrderLineNumber" class="product-code">
              行号 {{ row.salesOrderLineNumber }}
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="客户" min-width="100">
          <template #default="{ row }">{{ row.customerName || '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="产品" min-width="152">
          <template #default="{ row }">
            {{ row.productName || row.productCode }}
            <div v-if="row.productName" class="product-code">{{ row.productCode }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="交付日期" min-width="110">
          <template #default="{ row }">{{ row.deliveryDate || '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="订单数量" min-width="105" align="right">
          <template #default="{ row }">
            {{ quantityFormat.format(row.orderQuantity) }} {{ row.orderUnit }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="BOM 单耗" min-width="114" align="right">
          <template #default="{ row }">
            <template v-if="row.bomUnitUsage != null">
              {{ usageFormat.format(row.bomUnitUsage) }} {{ row.cornStarchUnit }}/{{
                row.orderUnit
              }}
            </template>
            <template v-else>—</template>
          </template>
        </ElTableColumn>
        <ElTableColumn label="玉米淀粉需求" min-width="125" align="right">
          <template #default="{ row }">
            <template v-if="row.cornStarchDemandQuantity != null">
              {{ quantityFormat.format(row.cornStarchDemandQuantity) }} {{ row.cornStarchUnit }}
            </template>
            <template v-else>—</template>
          </template>
        </ElTableColumn>
        <template #empty>
          <ElEmpty description="暂无待排产销售订单" :image-size="56" />
        </template>
      </ElTable>
      <div v-if="orderCount > pageSize" class="demand-pagination">
        <span>共 {{ orderCount }} 行</span>
        <ElPagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="orderCount"
          :pager-count="5"
          layout="prev, pager, next"
          size="small"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.sales-demand {
  padding: 16px 20px;
  overflow: hidden;
  margin-bottom: 20px;
}

.demand-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 12px;
}

.demand-heading h2 {
  font-size: 16px;
}

.demand-heading p,
.product-code,
.demand-pagination {
  color: var(--scos-muted);
  font-size: 12px;
}

.demand-heading p {
  margin-top: 5px;
  line-height: 1.6;
}

.demand-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 4px 12px;
  padding-top: 12px;
}
</style>
