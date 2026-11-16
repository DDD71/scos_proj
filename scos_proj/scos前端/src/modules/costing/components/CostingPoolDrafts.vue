<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { ElAlert, ElButton, ElDialog, ElInput, ElTable, ElTableColumn } from 'element-plus'
import { env } from '@/shared/config/env'
import {
  adoptCostingPoolTrial,
  listCostingPoolDrafts,
  saveCostingPoolDraft,
} from '../api/costing.repository'
import CostingPoolTrialDialog from './CostingPoolTrialDialog.vue'
import { money, roundMoney, sumMoney } from '../domain/analysis'
import {
  applyPoolAdoptions,
  batchQuantityDriver,
  createPoolTrial,
  replacePoolAdoption,
  summarizePoolTrial,
} from '../domain/pool-trial'
import type { CostingPoolAdoption } from '../model/pool-trial'
import type {
  CostingAllocation,
  CostingPool,
  CostingPoolDraft,
  CostingPoolDraftInput,
  CostingSnapshot,
} from '../model/snapshot'

const props = defineProps<{
  data: CostingSnapshot
  baseData: CostingSnapshot
  adoptions: CostingPoolAdoption[]
}>()
const emit = defineEmits<{
  viewBatch: [batch: string]
  applied: [adoptions: CostingPoolAdoption[]]
}>()
const trialEnabled = env.dataSource === 'mock'
const drafts = ref<CostingPoolDraft[]>([])
const loading = ref(true)
const loadError = ref('')
const open = ref(false)
const saving = ref(false)
const saveError = ref('')
const draftId = ref<string>()
const poolCode = ref<string>()
const editingPool = ref<CostingPool>()
const showSettings = ref(false)
const preview = shallowRef<{
  adoption: CostingPoolAdoption
  summary: ReturnType<typeof summarizePoolTrial>
  currentAmount: number
}>()
const adoptedTrial = ref(false)
const applyingTrial = ref(false)
const trialError = ref('')
type PoolRow = { key: string; pool?: CostingPool; draft?: CostingPoolDraft }
const context = computed(() => props.data.context)
const scope = () => ({ factory: context.value.factory, period: context.value.period })
const exampleScopes = computed(() => [
  ...new Set(props.baseData.pools.map((pool) => pool.benefitScope)),
])
const rows = computed<PoolRow[]>(() => {
  const originals = new Map(props.data.pools.map((pool) => [pool.poolCode, pool]))
  const visibleCodes = new Set(props.data.poolExampleCodes ?? originals.keys())
  const linked = new Map<string, CostingPoolDraft>()
  const standalone: PoolRow[] = []
  for (const pool of originals.values()) {
    if (pool.status === '已采用') visibleCodes.add(pool.poolCode)
  }
  for (const draft of drafts.value) {
    if (draft.poolCode && originals.has(draft.poolCode)) {
      linked.set(draft.poolCode, draft)
      visibleCodes.add(draft.poolCode)
    } else {
      standalone.push({ key: draft.id, draft })
    }
  }
  return [
    ...standalone,
    ...[...visibleCodes].flatMap((code) => {
      const pool = originals.get(code)
      return pool ? [{ key: code, pool, draft: linked.get(code) }] : []
    }),
  ]
})
const allocations = computed(() => {
  const grouped = new Map<string, CostingAllocation[]>()
  for (const row of props.data.allocations) {
    const group = grouped.get(row.poolCode) ?? []
    group.push(row)
    grouped.set(row.poolCode, group)
  }
  return grouped
})
const allocated = computed(
  () =>
    new Map(
      [...allocations.value].map(([code, group]) => [code, sumMoney(group, (row) => row.amount)]),
    ),
)
const costBatchIds = computed(() => new Set(props.data.costs.map((row) => row.batch)))
const fields = [
  { key: 'poolName', label: '费用池名称', required: true, basic: true },
  { key: 'costCenter', label: '成本中心', required: 'new-pool', basic: false },
  { key: 'costElement', label: '成本要素', required: 'new-pool', basic: false },
  { key: 'benefitScope', label: '受益范围', required: true, basic: false },
  { key: 'primaryDriver', label: '分摊动因', required: true, basic: false },
  { key: 'backupDriver', label: '备选动因', required: false, basic: false },
  { key: 'sourceReference', label: '来源单据或依据', required: false, basic: false },
] as const
type PoolTextFields = Omit<CostingPoolDraftInput, 'periodAmount' | 'poolCode'>
function emptyFields(): PoolTextFields {
  return {
    poolName: '',
    costCenter: '',
    costElement: '',
    benefitScope: '',
    primaryDriver: '',
    backupDriver: '',
    sourceReference: '',
  }
}

const values = ref(emptyFields())
const amount = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    drafts.value = await listCostingPoolDrafts(scope())
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '费用池草稿加载失败。'
  } finally {
    loading.value = false
  }
}

function edit({ draft: entry, pool }: Partial<PoolRow> = {}) {
  draftId.value = entry?.id
  poolCode.value = entry?.poolCode ?? pool?.poolCode
  editingPool.value = pool
  const source = entry ?? pool
  values.value = source
    ? {
        poolName: source.poolName,
        costCenter: entry?.costCenter ?? '',
        costElement: entry?.costElement ?? '',
        benefitScope: source.benefitScope,
        primaryDriver: source.primaryDriver,
        backupDriver: source.backupDriver,
        sourceReference: entry?.sourceReference ?? '',
      }
    : emptyFields()
  amount.value = source ? String(source.periodAmount) : ''
  showSettings.value = !source
  saveError.value = ''
  open.value = true
}

function isRequired(field: (typeof fields)[number]) {
  return field.required === true || (field.required === 'new-pool' && !poolCode.value)
}

function openTrial(draft: CostingPoolDraft) {
  const trial = createPoolTrial(props.baseData, draft)
  const adoption = {
    sourceVersion: props.baseData.context.costVersion,
    adoptedAt: new Date().toISOString(),
    trial,
  }
  const after = trial.reason
    ? props.data
    : applyPoolAdoptions(props.baseData, replacePoolAdoption(props.adoptions, adoption))
  preview.value = {
    adoption,
    summary: trial.reason
      ? { affected: [], allocated: 0 }
      : summarizePoolTrial(props.data, after, trial),
    currentAmount:
      props.data.pools.find((pool) => pool.poolCode === trial.poolCode)?.periodAmount ?? 0,
  }
  adoptedTrial.value = false
  trialError.value = ''
}

async function confirmTrial() {
  const value = preview.value
  if (!value || applyingTrial.value || adoptedTrial.value) return
  applyingTrial.value = true
  trialError.value = ''
  try {
    const adoptions = await adoptCostingPoolTrial(scope(), {
      ...value.adoption,
      adoptedAt: new Date().toISOString(),
    })
    drafts.value = drafts.value.filter((row) => row.id !== value.adoption.trial.draft.id)
    emit('applied', adoptions)
    adoptedTrial.value = true
  } catch (error) {
    trialError.value = error instanceof Error ? error.message : '采用 Mock 试算失败。'
  } finally {
    applyingTrial.value = false
  }
}

async function save() {
  if (saving.value) return
  const input = emptyFields()
  for (const field of fields) {
    const { key, label } = field
    input[key] = values.value[key].trim()
    if (isRequired(field) && !input[key]) {
      if (!field.basic) showSettings.value = true
      saveError.value = `请填写${label}。`
      return
    }
  }

  const periodAmount = Number(amount.value)
  if (!amount.value.trim() || !Number.isFinite(periodAmount)) {
    saveError.value = '请输入有效的期间金额。'
    return
  }
  saving.value = true
  saveError.value = ''
  const id = draftId.value
  try {
    const saved = await saveCostingPoolDraft(
      scope(),
      { ...input, periodAmount, poolCode: poolCode.value },
      id,
    )
    const index = drafts.value.findIndex((draft) => draft.id === saved.id)
    if (index === -1) drafts.value.unshift(saved)
    else drafts.value[index] = saved
    open.value = false
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '保存费用池草稿失败。'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section aria-labelledby="costing-pool-drafts">
    <header class="pool-draft-heading">
      <div>
        <h2 id="costing-pool-drafts">费用池管理</h2>
        <p class="costing-muted">
          {{
            trialEnabled
              ? '保存草稿后可试算，确认采用后更新批次成本（Mock）。'
              : '修改后的金额以草稿保存，待分摊。'
          }}
        </p>
      </div>
      <ElButton type="primary" :disabled="saving || loading || Boolean(loadError)" @click="edit()">
        新增费用池
      </ElButton>
    </header>
    <div v-if="loadError" class="pool-draft-heading">
      <ElAlert :title="loadError" type="error" :closable="false" />
      <ElButton @click="load">重试</ElButton>
    </div>
    <ElTable
      :data="rows"
      row-key="key"
      :empty-text="loading ? '正在读取费用池…' : '当前期间暂无费用池'"
    >
      <ElTableColumn type="expand">
        <template #default="{ row }">
          <div class="pool-details">
            <dl class="pool-facts">
              <div>
                <dt>受益范围</dt>
                <dd>{{ (row.draft ?? row.pool).benefitScope || '—' }}</dd>
              </div>
              <div>
                <dt>分摊动因</dt>
                <dd>{{ (row.draft ?? row.pool).primaryDriver || '—' }}</dd>
              </div>
              <div>
                <dt>备选动因</dt>
                <dd>{{ (row.draft ?? row.pool).backupDriver || '—' }}</dd>
              </div>
              <div v-if="row.draft?.costCenter">
                <dt>成本中心</dt>
                <dd>{{ row.draft.costCenter }}</dd>
              </div>
              <div v-if="row.draft?.costElement">
                <dt>成本要素</dt>
                <dd>{{ row.draft.costElement }}</dd>
              </div>
              <div v-if="row.draft?.sourceReference">
                <dt>来源单据或依据</dt>
                <dd>{{ row.draft.sourceReference }}</dd>
              </div>
            </dl>
            <template v-if="row.pool">
              <p class="costing-muted">
                已分摊 {{ money(allocated.get(row.pool.poolCode) ?? 0) }} · 对账差额
                {{
                  money(roundMoney(row.pool.periodAmount - (allocated.get(row.pool.poolCode) ?? 0)))
                }}
                · 动因版本 {{ context.poolRuleVersion }}
              </p>
              <ElTable
                :data="allocations.get(row.pool.poolCode) ?? []"
                max-height="250"
                empty-text="暂无批次分摊记录"
              >
                <ElTableColumn label="分摊批次" min-width="145">
                  <template #default="{ row: item }">
                    <ElButton
                      v-if="costBatchIds.has(item.batch)"
                      link
                      type="primary"
                      @click="emit('viewBatch', item.batch)"
                    >
                      {{ item.batch }}
                    </ElButton>
                    <span v-else>{{ item.batch }}</span>
                  </template>
                </ElTableColumn>
                <ElTableColumn prop="driverName" label="动因" min-width="135" />
                <ElTableColumn label="分摊金额" min-width="110" align="right">
                  <template #default="{ row: item }">{{ money(item.amount) }}</template>
                </ElTableColumn>
              </ElTable>
            </template>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="费用池" min-width="160">
        <template #default="{ row }">{{ row.draft?.poolName ?? row.pool?.poolName }}</template>
      </ElTableColumn>
      <ElTableColumn label="当前金额" min-width="117" align="right">
        <template #default="{ row }">{{ money(row.pool?.periodAmount) }}</template>
      </ElTableColumn>
      <ElTableColumn label="待分摊金额" min-width="128" align="right">
        <template #default="{ row }">{{ money(row.draft?.periodAmount) }}</template>
      </ElTableColumn>
      <ElTableColumn label="状态" min-width="86">
        <template #default="{ row }">{{ row.draft ? '待分摊' : row.pool?.status }}</template>
      </ElTableColumn>
      <ElTableColumn label="操作" :width="trialEnabled ? 126 : 75" fixed="right">
        <template #default="{ row }">
          <ElButton
            link
            type="primary"
            :disabled="saving || loading || Boolean(loadError)"
            @click="edit(row as PoolRow)"
          >
            修改
          </ElButton>
          <ElButton
            v-if="trialEnabled && row.draft"
            link
            type="primary"
            :disabled="saving || loading || Boolean(loadError)"
            @click="openTrial(row.draft)"
          >
            试算
          </ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>

  <ElDialog
    v-model="open"
    :title="editingPool || draftId ? '修改费用池' : '新增费用池'"
    width="min(560px, 94vw)"
    append-to-body
  >
    <p v-if="editingPool" class="edit-source">
      {{ editingPool.poolName }} · 原金额 {{ money(editingPool.periodAmount) }}
    </p>
    <form class="pool-form" @submit.prevent="save">
      <label for="pool-draft-amount">
        期间金额（元）
        <ElInput id="pool-draft-amount" v-model="amount" type="number" step="0.01" required />
      </label>
      <label for="pool-draft-name">
        费用池名称
        <ElInput id="pool-draft-name" v-model="values.poolName" required />
      </label>
      <div class="pool-settings">
        <ElButton
          link
          type="primary"
          :aria-expanded="showSettings"
          aria-controls="pool-settings-fields"
          @click="showSettings = !showSettings"
        >
          {{ showSettings ? '收起分摊设置' : '展开分摊设置' }}
        </ElButton>
        <div v-if="showSettings" id="pool-settings-fields" class="pool-settings-fields">
          <label
            v-for="field in fields.filter((field) => !field.basic)"
            :key="field.key"
            :for="'pool-draft-' + field.key"
          >
            {{ field.label }}{{ isRequired(field) ? '' : '（选填）' }}
            <ElInput
              :id="'pool-draft-' + field.key"
              v-model="values[field.key]"
              :required="isRequired(field)"
              :list="
                trialEnabled && field.key === 'benefitScope'
                  ? 'costing-pool-scope-options'
                  : undefined
              "
            />
          </label>
          <datalist v-if="trialEnabled" id="costing-pool-scope-options">
            <option v-for="value in exampleScopes" :key="value" :value="value" />
          </datalist>
          <div v-if="trialEnabled" class="pool-settings">
            <ElButton link type="primary" @click="values.primaryDriver = batchQuantityDriver">
              用批次数量作为分摊动因
            </ElButton>
          </div>
        </div>
      </div>
      <ElAlert
        v-if="saveError"
        class="pool-form-message"
        :title="saveError"
        type="error"
        :closable="false"
      />
      <div class="pool-form-actions">
        <ElButton :disabled="saving" @click="open = false">取消</ElButton>
        <ElButton type="primary" native-type="submit" :loading="saving">保存草稿</ElButton>
      </div>
    </form>
  </ElDialog>

  <CostingPoolTrialDialog
    v-if="preview"
    :trial="preview.adoption.trial"
    :summary="preview.summary"
    :current-amount="preview.currentAmount"
    :adopted="adoptedTrial"
    :busy="applyingTrial"
    :error="trialError"
    @close="preview = undefined"
    @confirm="confirmTrial"
    @view-batch="emit('viewBatch', $event)"
  />
</template>

<style scoped>
.pool-draft-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px 16px;
  margin-bottom: 10px;
}
.pool-draft-heading p {
  margin: 0;
}
.pool-details {
  padding: 12px 16px;
}
.pool-facts,
.pool-form,
.pool-settings-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 14px;
}
.pool-form,
.pool-settings-fields {
  margin-top: 16px;
}
.edit-source {
  margin: 0;
}
.pool-form label {
  display: grid;
  gap: 5px;
}
.pool-form-message,
.pool-form-actions,
.pool-settings {
  grid-column: 1 / -1;
}
.pool-form-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
