<script setup lang="ts">
import { computed, onMounted, shallowRef, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElAlert, ElButton, ElSkeleton, ElTag } from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import { env } from '@/shared/config/env'
import { getCostingSnapshot } from '../api/costing.repository'
import { costingModule } from '../model/module'
import type { CostingSnapshot } from '../model/snapshot'

const route = useRoute()
const sections = costingModule.sections.filter(
  ({ key }) => key !== 'overview' && key !== 'management',
)
const currentSection = computed(() =>
  costingModule.sections.find(({ key }) => key === route.meta.sectionKey),
)
const lineageTabs = [
  { name: 'costing-lineage', label: '批次时间轴' },
  { name: 'costing-lineage-ledger', label: '批次台账' },
]
const batchContext = computed(
  () => currentSection.value?.key === 'lineage' || currentSection.value?.key === 'traceability',
)
const data = shallowRef<CostingSnapshot>()
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await getCostingSnapshot()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '成本核算数据加载失败。'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="costing-workspace">
    <nav class="section-tabs" aria-label="成本核算分析子菜单">
      <RouterLink
        v-for="section in sections"
        :key="section.key"
        :to="section.path"
        :class="{
          'router-link-active':
            section.key === currentSection?.key ||
            (section.key === 'multidim' && route.name === 'costing-management'),
        }"
      >
        {{ section.title }}
      </RouterLink>
    </nav>
    <PageHeader
      :title="currentSection?.title ?? '成本核算分析'"
      :description="currentSection?.description"
    >
      <template #actions>
        <ElTag v-if="env.dataSource === 'mock'" type="warning" effect="plain">演示数据</ElTag>
        <ElButton :loading="loading" @click="load">刷新</ElButton>
      </template>
    </PageHeader>
    <nav
      v-if="currentSection?.key === 'lineage'"
      class="section-tabs lineage-tabs"
      aria-label="批次划分子页面"
    >
      <RouterLink
        v-for="tab in lineageTabs"
        :key="tab.name"
        v-slot="{ href, navigate }"
        :to="{ name: tab.name, query: { ...route.query, tab: undefined } }"
        custom
      >
        <a
          :href="href"
          :class="{ 'router-link-active': route.name === tab.name }"
          :aria-current="route.name === tab.name ? 'page' : undefined"
          @click="navigate"
          >{{ tab.label }}</a
        >
      </RouterLink>
    </nav>
    <ElSkeleton v-if="loading" :rows="6" animated />
    <ElAlert v-else-if="error" :title="error" type="error" :closable="false" show-icon />
    <template v-else-if="data">
      <dl class="surface costing-context">
        <div>
          <dt>{{ batchContext ? '批次期间' : '成本期间' }}</dt>
          <dd>{{ data.context.period }}</dd>
        </div>
        <div>
          <dt>工厂</dt>
          <dd>{{ data.context.factory }}</dd>
        </div>
        <div v-if="currentSection?.key !== 'batch'">
          <dt>数据快照</dt>
          <dd>{{ data.context.snapshot }}</dd>
        </div>
        <div v-if="currentSection?.key !== 'batch'">
          <dt>谱系版本</dt>
          <dd>{{ data.context.lineageVersion }}</dd>
        </div>
        <div v-if="!batchContext && currentSection?.key !== 'batch'">
          <dt>成本版本</dt>
          <dd>{{ data.context.costVersion }}</dd>
        </div>
      </dl>
      <RouterView v-slot="{ Component }">
        <component :is="Component" :data="data" />
      </RouterView>
    </template>
  </div>
</template>

<style src="../components/costing.css"></style>

<style scoped>
.lineage-tabs {
  margin-bottom: 16px;
}
.lineage-tabs a {
  border: 1px solid var(--scos-border);
  background: var(--scos-surface);
  font-size: 14px;
}
.lineage-tabs a.router-link-active {
  border-color: var(--scos-primary);
  background: var(--scos-primary-soft);
}
</style>
