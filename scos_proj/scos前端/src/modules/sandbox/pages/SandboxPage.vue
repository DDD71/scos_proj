<script setup lang="ts">
import ModulePlaceholder from '@/shared/components/ModulePlaceholder.vue'
import { sandboxModule } from '../model/module'
</script>

<template>
  <ModulePlaceholder :module="sandboxModule" />
</template>
