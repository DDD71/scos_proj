<script setup lang="ts">
import { onMounted } from 'vue'
import { ElAlert, ElButton, ElEmpty, ElSkeleton } from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import { useDashboardStore } from '../model/dashboard.store'

const store = useDashboardStore()
onMounted(() => void store.loadOverview())
const domains = [
  { title: '库存优化', description: '让库存水位与需求、产能协同', path: '/inventory/overview' },
  { title: '采购优化', description: '在供货约束下评估采购组合', path: '/procurement/overview' },
  { title: '要货计划', description: '将合同数量落实为每日到货', path: '/requisition/overview' },
  { title: '成本分析', description: '从批次成本追踪到订单盈利', path: '/costing/lineage' },
  { title: '全程追溯', description: '追溯批次关联与质量影响范围', path: '/traceability/query' },
]
</script>

<template>
  <div>
    <PageHeader
      title="供应链驾驶舱"
      description="贯通销售、库存、生产、采购与经营，查看全局态势。"
      eyebrow="SUPPLY CHAIN OVERVIEW"
    >
      <template #actions
        ><ElButton :loading="store.loading" @click="store.loadOverview"
          >刷新数据</ElButton
        ></template
      >
    </PageHeader>
    <ElAlert
      v-if="store.error"
      :title="store.error"
      type="error"
      :closable="false"
      show-icon
      class="load-error"
    />
    <ElSkeleton v-if="store.loading && !store.overview" :rows="4" animated />
    <div v-if="store.overview" class="metric-grid">
      <article
        v-for="metric in store.overview.metrics"
        :key="metric.key"
        class="surface metric-card"
      >
        <p>{{ metric.label }}</p>
        <div>
          <strong>{{ metric.value?.toLocaleString('zh-CN') ?? '—' }}</strong
          ><span>{{ metric.unit }}</span>
        </div>
        <small>{{ store.overview.snapshotAt || '暂无数据快照' }}</small>
      </article>
    </div>
    <section class="surface overview-panel">
      <div class="panel-heading">
        <h2>供应链态势</h2>
        <span>销售 · 库存 · 生产 · 采购 · 经营</span>
      </div>
      <ElEmpty description="暂无态势数据，地图、指标和预警将在功能建设后提供。" />
    </section>
    <section aria-label="业务工作台入口">
      <div class="section-heading">
        <h2>业务工作台</h2>
        <span>从全局态势进入业务决策</span>
      </div>
      <div class="workbench-grid">
        <RouterLink
          v-for="(domain, index) in domains"
          :key="domain.path"
          :to="domain.path"
          class="surface workbench-card"
        >
          <span class="workbench-number">0{{ index + 1 }}</span>
          <h3>{{ domain.title }}</h3>
          <p>{{ domain.description }}</p>
          <span class="workbench-arrow" aria-hidden="true">↗</span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
