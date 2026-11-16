<script setup lang="ts">
defineProps<{
  title: string
  parts: { sign?: string; label: string; value: string }[]
  detail?: string
}>()
</script>

<template>
  <section class="sb-business-proof" aria-label="本次结果怎么算">
    <h3>{{ title }}</h3>
    <ol>
      <li
        v-for="(item, index) in parts"
        :key="item.label"
        :class="{ 'sb-proof-total': index === parts.length - 1 }"
      >
        <span v-if="item.sign" class="sb-proof-sign">{{ item.sign }}</span>
        <div>
          <span class="sb-proof-label">{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </li>
    </ol>
    <p v-if="detail" class="sb-muted">{{ detail }}</p>
  </section>
</template>
