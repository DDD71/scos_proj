<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElEmpty } from 'element-plus'
import PageHeader from './PageHeader.vue'
import type { BusinessModule } from '@/shared/types/navigation'

const props = defineProps<{ module: BusinessModule }>()
const route = useRoute()
const current = computed(() => props.module.sections.find((item) => item.path === route.path))
</script>

<template>
  <div>
    <PageHeader
      :title="current?.title || module.title"
      :description="current?.description || module.description"
    />
    <nav
      v-if="module.sections.length > 1 && current?.key !== 'overview'"
      class="section-tabs"
      :aria-label="`${module.title}子页面`"
    >
      <RouterLink v-for="section in module.sections" :key="section.key" :to="section.path">
        {{ section.title }}
      </RouterLink>
    </nav>
    <section class="surface empty-workspace">
      <ElEmpty description="功能待建设" />
    </section>
  </div>
</template>
