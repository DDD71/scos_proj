<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { CostingSnapshot } from '../model/snapshot'

const props = defineProps<{ data: CostingSnapshot }>()
const route = useRoute()
const router = useRouter()
const selected = computed(() => {
  if (typeof route.query.batch === 'string') {
    return props.data.batches.find((batch) => batch.id === route.query.batch)
  }
  return props.data.batches.find((batch) => batch.stage === '成品罐批次') ?? props.data.batches[0]
})

function selectBatch(id: string) {
  void router.replace({ query: { ...route.query, batch: id } })
}
</script>

<template>
  <nav v-if="selected" class="lineage-selection" aria-label="当前批次操作">
    <span
      >当前批次 <strong>{{ selected.id }}</strong></span
    >
    <RouterLink
      class="costing-link"
      :to="{ name: 'costing-traceability', query: { batch: selected.id } }"
    >
      查看全程追溯
    </RouterLink>
    <RouterLink
      v-if="data.costs.some((cost) => cost.batch === selected?.id)"
      class="costing-link"
      :to="{ name: 'costing-batch', query: { batch: selected.id } }"
    >
      查看批次成本
    </RouterLink>
  </nav>
  <RouterView v-slot="{ Component }">
    <KeepAlive>
      <component
        :is="Component"
        :batches="data.batches"
        :selected="selected"
        @select="selectBatch"
      />
    </KeepAlive>
  </RouterView>
</template>

<style scoped>
.lineage-selection {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-bottom: 12px;
}
</style>
