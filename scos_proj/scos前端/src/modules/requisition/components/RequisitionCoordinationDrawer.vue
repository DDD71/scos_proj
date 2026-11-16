<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElAlert, ElButton, ElDrawer } from 'element-plus'
import {
  listRequisitionCoordination,
  saveRequisitionCoordination,
} from '../api/requisition-operations'
import {
  coordinationDirections,
  type CoordinationDirection,
  type RequisitionCoordination,
  type RequisitionIssueContext,
} from '../model/operations'

const props = defineProps<{
  context?: RequisitionIssueContext
  canClose?: boolean
}>()
const emit = defineEmits<{
  close: []
  saved: [item: RequisitionCoordination]
}>()

const direction = ref<CoordinationDirection>('供应商协调')
const owner = ref('')
const result = ref('')
const saved = ref<RequisitionCoordination>()
const feedback = ref('')
const canSave = computed(() => Boolean(owner.value.trim() && result.value.trim()))

watch(
  () => props.context,
  async (context, _, onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    feedback.value = ''
    try {
      const record = context
        ? (await listRequisitionCoordination()).find(({ id }) => id === context.id)
        : undefined
      if (!active) return
      saved.value = record
      owner.value = saved.value?.owner ?? ''
      result.value = saved.value?.result ?? ''
      direction.value = saved.value?.direction ?? '供应商协调'
    } catch (error) {
      if (active) feedback.value = error instanceof Error ? error.message : '协调记录读取失败。'
    }
  },
  { immediate: true },
)

async function save(status: RequisitionCoordination['status']) {
  if (!props.context || !canSave.value || (status === '已关闭' && !props.canClose)) return
  const item: RequisitionCoordination = {
    ...props.context,
    direction: direction.value,
    owner: owner.value.trim(),
    result: result.value.trim(),
    status,
    updatedAt: new Date().toISOString(),
  }
  try {
    await saveRequisitionCoordination(item)
    saved.value = item
    feedback.value = status === '已关闭' ? '风险已复核关闭。' : '已保存协调记录，待继续评估。'
    emit('saved', item)
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '协调记录保存失败。'
  }
}
</script>

<template>
  <ElDrawer
    :model-value="Boolean(context)"
    title="要货异常协调"
    size="min(575px, 100%)"
    append-to-body
    @update:model-value="!$event && emit('close')"
  >
    <div v-if="context" class="coordination-form">
      <section class="coordination-context" aria-label="风险信息">
        <strong>{{ context.materialName }} · {{ saved?.status ?? '待登记' }}</strong>
        <p>{{ context.cause }}</p>
        <p v-if="context.riskDate">
          {{ context.riskDate }} · 预计缺料 {{ context.shortage }} {{ context.unit }}
        </p>
      </section>
      <form class="coordination-form" @submit.prevent="save('协调中')">
        <label>
          协调方向
          <select v-model="direction">
            <option v-for="item in coordinationDirections" :key="item">{{ item }}</option>
          </select>
        </label>
        <label>
          责任人
          <input v-model="owner" required placeholder="填写负责跟进的人员" />
        </label>
        <label>
          处理意见或结果
          <textarea
            v-model="result"
            rows="4"
            required
            placeholder="记录已确认的措施或正在协调的事项"
          />
        </label>
        <ElAlert
          v-if="!canClose"
          title="待复核或仍有生产缺口，协调事项保持开放。"
          type="warning"
          :closable="false"
        />
        <div class="coordination-actions">
          <ElButton type="primary" native-type="submit" :disabled="!canSave">保存协调记录</ElButton>
          <ElButton v-if="saved" :disabled="!canClose || !canSave" @click="save('已关闭')"
            >复核关闭</ElButton
          >
          <RouterLink
            v-if="saved && saved.status !== '已关闭' && $route.name !== 'requisition-planning'"
            :to="{
              name: 'requisition-planning',
              query: {
                week: context.weekStart,
                materialCode: context.materialCode,
                coordination: context.id,
              },
            }"
            @click="emit('close')"
            >进入周计划重新评估</RouterLink
          >
        </div>
      </form>
      <p v-if="feedback" role="status">{{ feedback }}</p>
    </div>
  </ElDrawer>
</template>

<style scoped>
.coordination-form,
label {
  display: grid;
  gap: 10px;
}
.coordination-form {
  gap: 16px;
}
.coordination-context {
  display: grid;
  gap: 5px;
  padding: 12px;
  border-radius: 8px;
  background: var(--scos-background);
}
label {
  font-weight: 600;
}
input,
select,
textarea {
  padding: 8px 10px;
  border: 1px solid var(--scos-border);
  border-radius: 6px;
  background: var(--el-bg-color);
  color: var(--scos-ink);
  font: inherit;
}
.coordination-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.coordination-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.coordination-actions a {
  color: var(--scos-primary);
}
</style>
