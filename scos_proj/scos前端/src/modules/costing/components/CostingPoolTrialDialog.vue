<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElAlert, ElButton, ElDialog, ElTable, ElTableColumn } from 'element-plus'
import { money } from '../domain/analysis'
import type { summarizePoolTrial } from '../domain/pool-trial'
import type { CostingPoolTrial } from '../model/pool-trial'

const props = defineProps<{
  trial: CostingPoolTrial
  summary: ReturnType<typeof summarizePoolTrial>
  currentAmount: number
  adopted: boolean
  busy: boolean
  error: string
}>()
const emit = defineEmits<{ close: []; confirm: []; viewBatch: [batch: string] }>()
const search = ref('')
const rows = computed(() => {
  const query = search.value.trim().toLowerCase()
  return props.summary.affected.filter((row) => row.batch.toLowerCase().includes(query))
})

function signedMoney(value: number) {
  return value > 0 ? '+' + money(value) : money(value)
}
</script>

<template>
  <ElDialog
    :model-value="true"
    title="费用池试算（Mock）"
    width="min(850px, 96vw)"
    append-to-body
    :close-on-click-modal="false"
    @close="emit('close')"
  >
    <h3 class="trial-pool-name">{{ trial.draft.poolName }}</h3>
    <p class="trial-muted">
      受益范围 {{ trial.draft.benefitScope }} · 分摊动因 {{ trial.draft.primaryDriver }}
    </p>
    <dl class="trial-metrics">
      <div>
        <dt>当前金额</dt>
        <dd>{{ money(currentAmount) }}</dd>
      </div>
      <div>
        <dt>试算金额</dt>
        <dd>{{ money(trial.draft.periodAmount) }}</dd>
      </div>
      <div>
        <dt>试算分摊金额</dt>
        <dd>{{ money(summary.allocated) }}</dd>
      </div>
      <div>
        <dt>未分摊金额</dt>
        <dd>{{ money(trial.unallocated) }}</dd>
      </div>
    </dl>
    <ElAlert v-if="trial.reason" :title="trial.reason" type="warning" :closable="false" show-icon />
    <template v-else>
      <ElAlert
        v-if="adopted"
        class="trial-result"
        title="已采用本次 Mock 试算。点击批次号查看更新后的成本。"
        type="success"
        :closable="false"
        show-icon
      />
      <div class="trial-list-heading">
        <h3>受影响批次（{{ summary.affected.length }}）</h3>
        <label v-if="summary.affected.length">
          批次号
          <input v-model="search" type="search" placeholder="搜索受影响批次" />
        </label>
      </div>
      <p class="trial-muted">分摊差额只计本费用池。批次总成本变化包含上游传入的费用变化。</p>
      <ElTable
        :data="rows"
        row-key="batch"
        max-height="310"
        :empty-text="search ? '未找到该批次' : '各批次成本金额无变化'"
      >
        <ElTableColumn label="批次" min-width="155" fixed="left">
          <template #default="{ row }">
            <ElButton v-if="adopted" link type="primary" @click="emit('viewBatch', row.batch)">{{
              row.batch
            }}</ElButton>
            <span v-else>{{ row.batch }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="分摊前" min-width="103" align="right">
          <template #default="{ row }">{{ money(row.oldAmount) }}</template>
        </ElTableColumn>
        <ElTableColumn label="分摊后" min-width="103" align="right">
          <template #default="{ row }">{{ money(row.newAmount) }}</template>
        </ElTableColumn>
        <ElTableColumn label="分摊差额" min-width="108" align="right">
          <template #default="{ row }">{{ signedMoney(row.change) }}</template>
        </ElTableColumn>
        <ElTableColumn label="批次总成本变化" min-width="142" align="right">
          <template #default="{ row }">{{ signedMoney(row.totalChange) }}</template>
        </ElTableColumn>
      </ElTable>
    </template>
    <ElAlert
      v-if="error"
      class="trial-result"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    />
    <template #footer>
      <ElButton :disabled="busy" @click="emit('close')">关闭</ElButton>
      <ElButton
        v-if="!adopted"
        type="primary"
        :disabled="Boolean(trial.reason) || trial.unallocated !== 0"
        :loading="busy"
        @click="emit('confirm')"
      >
        确认采用
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.trial-pool-name {
  margin: 0 0 6px;
}
.trial-muted {
  color: var(--scos-muted);
  margin: 6px 0 12px;
}
.trial-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 135px), 1fr));
  gap: 8px;
  margin: 0 0 14px;
}
.trial-metrics > div {
  padding: 10px;
  background: var(--scos-background);
  border-radius: 6px;
}
.trial-metrics dt {
  color: var(--scos-muted);
}
.trial-metrics dd {
  margin: 4px 0 0;
  font-weight: 700;
}
.trial-list-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.trial-list-heading h3 {
  margin: 0;
}
.trial-list-heading input {
  height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--scos-border);
  border-radius: 5px;
}
.trial-result {
  margin: 8px 0;
}
</style>
