<script setup lang="ts">
import type { SandboxBaseline } from '../model/types'

defineProps<{ baseline: SandboxBaseline; choices: SandboxBaseline[] }>()
const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <div class="sb-baseline">
    <label v-if="choices.length > 1"
      >参考哪份计划<select
        :value="baseline.id"
        @change="emit('select', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="item in choices" :key="item.id" :value="item.id">
          {{ item.plant }} · {{ item.time.slice(0, 16).replace('T', ' ') }}
        </option>
      </select></label
    >
    <p v-else class="sb-muted">
      参考计划 · {{ baseline.plant }} · {{ baseline.time.slice(0, 16).replace('T', ' ') }}
    </p>
    <details>
      <summary>数据来源</summary>
      <dl class="sb-versions">
        <div v-for="version in baseline.versions" :key="version.name">
          <dt>{{ version.name }}</dt>
          <dd>{{ version.value }}</dd>
        </div>
      </dl>
    </details>
  </div>
</template>
