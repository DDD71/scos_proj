<script setup lang="ts">
import { ElEmpty } from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'

defineProps<{ title: string; description: string }>()
</script>

<template>
  <PageHeader :title="title" :description="description" />
  <section class="surface empty-workspace">
    <ElEmpty description="功能待建设" />
  </section>
</template>
