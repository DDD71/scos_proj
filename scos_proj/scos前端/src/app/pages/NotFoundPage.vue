<script setup lang="ts">
import { ElButton, ElResult } from 'element-plus'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <section class="surface">
    <ElResult icon="info" title="页面不存在" sub-title="该地址可能已变更，请从导航进入。">
      <template #extra
        ><ElButton type="primary" @click="router.push('/dashboard')">返回驾驶舱</ElButton></template
      >
    </ElResult>
  </section>
</template>
