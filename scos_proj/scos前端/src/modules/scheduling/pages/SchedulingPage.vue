<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElEmpty, ElTag } from 'element-plus'
import { readFinishedProductDemands } from '@/shared/api/finished-product-demands'
import PageHeader from '@/shared/components/PageHeader.vue'

const route = useRoute()
const demands = ref<Awaited<ReturnType<typeof readFinishedProductDemands>>>([])
const error = ref('')
const loading = ref(true)
const rows = computed(() =>
  demands.value.flatMap(({ lines, ...demand }) => lines.map((line) => ({ ...demand, ...line }))),
)
const showBusinessDate = computed(() => rows.value.some((row) => row.businessDate))
onMounted(async () => {
  try {
    demands.value = await readFinishedProductDemands()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '成品需求读取失败。'
  } finally {
    loading.value = false
  }
})
const formatQuantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format
const formatPublishedAt = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Shanghai',
}).format
</script>

<template>
  <PageHeader title="精益排程" />

  <section class="surface scheduling-demands" aria-labelledby="finished-product-demands-heading">
    <header class="demands-heading">
      <h2 id="finished-product-demands-heading">成品需求</h2>
      <p>接收库存优化发布的补产需求。</p>
      <p v-if="showBusinessDate">演示需求的开产和可用日期按业务基准日推算。</p>
    </header>

    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="loading">正在读取成品需求…</p>
    <div v-else-if="rows.length" class="demands-table">
      <table aria-labelledby="finished-product-demands-heading">
        <thead>
          <tr>
            <th scope="col">成品</th>
            <th scope="col">工厂</th>
            <th scope="col">建议开产日</th>
            <th scope="col">要求成品可用日</th>
            <th scope="col" class="quantity">补产需求量</th>
            <th v-if="showBusinessDate" scope="col">业务基准日</th>
            <th scope="col">{{ showBusinessDate ? '发布操作时间' : '发布时间' }}</th>
            <th scope="col">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="`${row.id}-${row.requestedStartDate}-${row.requiredAvailableDate}`"
            :class="{ 'linked-demand': row.id === route.query.demand }"
          >
            <th scope="row">
              {{ row.productName }}
              <small>{{ row.productCode }}</small>
            </th>
            <td>{{ row.plant }}</td>
            <td>{{ row.requestedStartDate }}</td>
            <td>{{ row.requiredAvailableDate }}</td>
            <td class="quantity">{{ formatQuantity(row.quantity) }} {{ row.unit }}</td>
            <td v-if="showBusinessDate">{{ row.businessDate ?? '—' }}</td>
            <td>{{ formatPublishedAt(new Date(row.publishedAt)) }}</td>
            <td><ElTag size="small" type="warning" effect="plain">待排产</ElTag></td>
          </tr>
        </tbody>
      </table>
    </div>
    <ElEmpty v-else description="暂无待排产的成品需求" :image-size="80" />
  </section>
</template>

<style scoped>
.scheduling-demands {
  padding: 24px;
}

.demands-heading {
  margin-bottom: 16px;
}

.demands-heading h2 {
  font-size: 18px;
}

.demands-heading p {
  margin-top: 6px;
  color: var(--scos-muted);
  font-size: 13px;
}

.demands-table {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

th,
td {
  border-bottom: 1px solid var(--scos-border);
  padding: 9px 12px;
  text-align: left;
  white-space: nowrap;
}

thead th {
  color: var(--scos-muted);
  font-size: 13px;
  font-weight: 500;
}

tbody th {
  font-weight: 600;
}

.quantity {
  text-align: right;
}

small {
  display: block;
  margin-top: 3px;
  color: var(--scos-muted);
  font-weight: 400;
}

.linked-demand > * {
  background: var(--scos-primary-soft);
}

@media (max-width: 800px) {
  .scheduling-demands {
    padding: 16px;
  }
}
</style>
