<script setup lang="ts">
import ModulePlaceholder from '@/shared/components/ModulePlaceholder.vue'
import { inventoryModule } from '../model/module'
</script>

<template>
  <ModulePlaceholder :module="inventoryModule" />
</template>
