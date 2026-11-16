<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ElEmpty, ElTable, ElTableColumn } from 'element-plus'
import type { InventoryProduct } from '../model/types'
import { listInventoryExceptions } from '../api/inventory.repository'
import type { InventoryException } from '../model/inventory-exception'

const props = defineProps<{
  product: InventoryProduct
  products: readonly InventoryProduct[]
  demo: boolean
}>()
const emit = defineEmits<{ adjust: [reason: string] }>()

const records = ref<readonly InventoryException[]>([])
const loading = ref(true)
const error = ref('')
const events = computed(() =>
  records.value.filter((item) => item.products.includes(props.product.code)),
)
onMounted(async () => {
  try {
    records.value = await listInventoryExceptions()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '库存异常读取失败。'
  } finally {
    loading.value = false
  }
})

function productNames(codes: readonly string[]) {
  return codes
    .map((code) => props.products.find((product) => product.code === code)?.name ?? code)
    .join('、')
}
</script>

<template>
  <section aria-labelledby="inventory-exception-heading">
    <h2 id="inventory-exception-heading">异常与调整</h2>
    <p>{{ product.name }} · 查看影响范围与风险，按实际变化评估策略和补货安排。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="loading">正在读取异常记录…</p>
    <ElTable v-else-if="events.length" :data="events" row-key="id" size="small">
      <ElTableColumn label="异常与影响日期" min-width="150">
        <template #default="{ row }">
          <strong>{{ row.reason }}</strong>
          <span class="secondary">{{ row.date }}</span>
        </template>
      </ElTableColumn>
      <ElTableColumn label="影响成品" min-width="125">
        <template #default="{ row }">{{ productNames(row.products) }}</template>
      </ElTableColumn>
      <ElTableColumn prop="change" label="发生变化" min-width="198" />
      <ElTableColumn prop="risk" label="预计风险" min-width="218" />
      <ElTableColumn label="建议处置" min-width="125">
        <template #default="{ row }">
          <div class="actions">
            <button type="button" class="action-link" @click="emit('adjust', row.reason)">
              评估并调整策略
            </button>
            <RouterLink
              v-if="row.products.length > 1"
              class="action-link"
              :to="{ name: 'inventory-plans', query: { product: product.code, mode: 'day' } }"
            >
              查看日滚动计划
            </RouterLink>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
    <ElEmpty v-else description="当前成品暂无异常记录" :image-size="48" />
  </section>
</template>

<style scoped>
h2 {
  margin: 0 0 4px;
  font-size: 17px;
}

p {
  margin: 0 0 10px;
  color: var(--scos-muted);
  font-size: 13px;
}

.secondary {
  display: block;
  color: var(--scos-muted);
  font-size: 12px;
}

.actions {
  display: grid;
  gap: 2px;
}

.action-link {
  color: var(--scos-primary);
  font-weight: 600;
  text-decoration: none;
}

button.action-link {
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: start;
}

.action-link:hover {
  text-decoration: underline;
}
</style>
