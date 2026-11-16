<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElEmpty } from 'element-plus'
import ProcurementPlanEditor from '../components/ProcurementPlanEditor.vue'
import { readDrafts, saveDraft } from '../api/procurement-drafts.local'
import type { ProcurementDraftInput } from '../model/types'

const props = defineProps<{ draftId: string }>()
const router = useRouter()
const draft = computed(() => readDrafts().find((item) => item.id === props.draftId))

function backToPlans() {
  void router.push({ name: 'procurement-plans' })
}

function save(input: ProcurementDraftInput, returnToList: boolean) {
  saveDraft({ ...input, id: props.draftId })
  if (returnToList) backToPlans()
}
</script>

<template>
  <ProcurementPlanEditor
    v-if="draft"
    :key="draftId"
    :initial="draft"
    @cancel="backToPlans"
    @save="save"
  />
  <ElEmpty v-else class="surface" description="当前标签页找不到这份采购草稿。">
    <ElButton @click="backToPlans">返回采购方案</ElButton>
  </ElEmpty>
</template>
