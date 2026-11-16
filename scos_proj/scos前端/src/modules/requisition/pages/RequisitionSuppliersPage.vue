<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElDrawer, ElTable, ElTableColumn, ElTag } from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import {
  listRequisitionRestrictions,
  saveRequisitionRestriction,
} from '../api/requisition-operations'
import {
  getRequisitionSnapshot,
  listRequisitionExecutionPlans,
} from '../api/requisition.repository'
import {
  firstCompleteRequisitionWeek,
  isRequisitionSupplyEmbargoed,
  requisitionWeekOf,
} from '../domain/plan'
import type { RequisitionExecutionPlan } from '../model/execution'
import type { RequisitionRestriction } from '../model/operations'
import type { RequisitionSnapshot, RequisitionSupply } from '../model/types'

defineProps<{ title: string; description: string }>()

const snapshot = ref<RequisitionSnapshot>()
const loading = ref(true)
const loadError = ref('')
const plans = ref<RequisitionExecutionPlan[]>([])
const restrictions = ref<RequisitionRestriction[]>([])
const selectedSupply = ref<RequisitionSupply>()
const selectedAction = ref<RequisitionRestriction['action']>('禁运')
const effectiveDate = ref('')
const scope = ref('contract')
const restrictionReason = ref('')
const feedback = ref('')
const formatQuantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format

const rows = computed(() => {
  const materials = new Map(snapshot.value?.materials.map((material) => [material.code, material]))
  return (snapshot.value?.supplies ?? [])
    .filter((supply) => supply.signedAt)
    .map((supply) => {
      const { contractQuantity, executedQuantity } = supply
      return {
        ...supply,
        material: materials.get(supply.materialCode),
        remainingSupplyQuantity:
          contractQuantity == null || executedQuantity == null
            ? null
            : contractQuantity - executedQuantity,
      }
    })
})
const businessDate = computed(() => snapshot.value?.snapshotTime.slice(0, 10) ?? '')
const currentRecords = computed(() =>
  restrictions.value.filter(
    (item) =>
      item.supplierId === selectedSupply.value?.supplierId &&
      item.materialCode === selectedSupply.value?.materialCode &&
      (!item.contractId || item.contractId === selectedSupply.value?.id),
  ),
)
const impactedOrderIds = computed(() =>
  scope.value === 'contract'
    ? [selectedSupply.value?.id]
    : (snapshot.value?.supplies ?? [])
        .filter(
          (item) =>
            item.supplierId === selectedSupply.value?.supplierId &&
            item.materialCode === selectedSupply.value?.materialCode,
        )
        .map(({ id }) => id),
)
const pendingAffectedRows = computed(() =>
  plans.value.flatMap(({ id: planId, rows }) =>
    rows
      .filter(
        (row) =>
          impactedOrderIds.value.includes(row.contractId) &&
          row.plannedDate >= effectiveDate.value &&
          (row.releaseStatus === '待下达' || row.releaseStatus === '下达失败'),
      )
      .map((row) => ({ planId, row })),
  ),
)
const alreadyInTransit = computed(() =>
  (snapshot.value?.fixedArrivals ?? []).filter(
    (arrival) => impactedOrderIds.value.includes(arrival.contractId) && arrival.status === '运输中',
  ),
)
const restrictionPlanningWeek = computed(() => {
  const firstWeek = snapshot.value ? firstCompleteRequisitionWeek(snapshot.value.startDate) : ''
  const date = pendingAffectedRows.value[0]?.row.plannedDate ?? effectiveDate.value
  const week = date ? requisitionWeekOf(date) : firstWeek
  return week < firstWeek ? firstWeek : week
})

function openRestriction(supply: RequisitionSupply) {
  selectedSupply.value = supply
  selectedAction.value = isRequisitionSupplyEmbargoed(supply, businessDate.value) ? '解除' : '禁运'
  effectiveDate.value = businessDate.value
  scope.value = 'contract'
  restrictionReason.value = ''
  feedback.value = ''
}

async function submitRestriction() {
  const supply = selectedSupply.value
  if (!supply || !restrictionReason.value.trim() || !effectiveDate.value) return
  try {
    await saveRequisitionRestriction({
      id: crypto.randomUUID(),
      supplierId: supply.supplierId,
      materialCode: supply.materialCode,
      ...(scope.value === 'contract' ? { contractId: supply.id } : {}),
      action: selectedAction.value,
      reason: restrictionReason.value.trim(),
      status: '待复核',
      effectiveDate: effectiveDate.value,
    })
    restrictions.value = await listRequisitionRestrictions()
    restrictionReason.value = ''
    feedback.value = '申请已保存，待复核。'
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '禁运申请保存失败。'
  }
}

async function confirmRestriction(record: RequisitionRestriction) {
  try {
    await saveRequisitionRestriction({ ...record, status: '已确认' })
    restrictions.value = await listRequisitionRestrictions()
    await load()
    feedback.value = `${record.action}已确认，按 ${record.effectiveDate} 生效。`
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '禁运确认失败。'
  }
}

const totals = computed(() => {
  const byMaterial = new Map<string, typeof rows.value>()
  for (const row of rows.value) {
    const contracts = byMaterial.get(row.materialCode)
    if (contracts) contracts.push(row)
    else byMaterial.set(row.materialCode, [row])
  }
  return [...byMaterial].map(([code, contracts]) => {
    const material = contracts[0]?.material
    const sum = (field: 'contractQuantity' | 'executedQuantity' | 'remainingSupplyQuantity') =>
      contracts.every((row) => row[field] != null)
        ? contracts.reduce((total, row) => total + (row[field] ?? 0), 0)
        : null

    return {
      code,
      name: material?.name || code,
      unit: material?.unit,
      contracted: sum('contractQuantity'),
      executed: sum('executedQuantity'),
      remaining: sum('remainingSupplyQuantity'),
    }
  })
})

function quantity(value?: number | null, unit?: string) {
  return value == null ? '—' : [formatQuantity(value), unit].filter(Boolean).join(' ')
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [data, execution] = await Promise.all([
      getRequisitionSnapshot(),
      listRequisitionExecutionPlans(),
    ])
    snapshot.value = data
    plans.value = execution
    restrictions.value = await listRequisitionRestrictions()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '无法读取已签约供应商。'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <PageHeader :title="title" :description="description">
    <template #actions><ElButton :loading="loading" @click="load">刷新</ElButton></template>
  </PageHeader>

  <section
    v-if="!loading && !loadError && totals.length"
    class="surface suppliers-panel summary"
    aria-labelledby="contracted-summary"
  >
    <h2 id="contracted-summary">已签约采购汇总</h2>
    <div v-for="total in totals" :key="total.code" class="material-total">
      <h3>{{ total.name }}</h3>
      <dl>
        <div>
          <dt>已签约采购总量</dt>
          <dd>{{ quantity(total.contracted, total.unit) }}</dd>
        </div>
        <div>
          <dt>合同已执行量</dt>
          <dd>{{ quantity(total.executed, total.unit) }}</dd>
        </div>
        <div>
          <dt>剩余可用供货量</dt>
          <dd>{{ quantity(total.remaining, total.unit) }}</dd>
        </div>
      </dl>
    </div>
    <p class="summary-note">
      剩余可用供货量 = 合同供货量 − 合同已执行量。可安排余量还会扣除已安排到货的占用。
    </p>
  </section>

  <section class="surface suppliers-panel" aria-label="已签约供应商" :aria-busy="loading">
    <ElAlert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon />
    <ElTable
      v-else
      :data="rows"
      :default-sort="{ prop: 'earliestArrival', order: 'ascending' }"
      :empty-text="loading ? '正在读取已签约供应商…' : '暂无已签约供应商'"
    >
      <ElTableColumn prop="supplierId" label="供应商编码" min-width="112" />
      <ElTableColumn prop="supplierName" label="供应商名称" min-width="184" />
      <ElTableColumn prop="id" label="合同号" min-width="130" />
      <ElTableColumn prop="orderId" label="采购订单" min-width="142" />
      <ElTableColumn label="供货物料" min-width="100">
        <template #default="{ row }">{{ row.material?.name || row.materialCode }}</template>
      </ElTableColumn>
      <ElTableColumn prop="earliestArrival" label="最早到货日" min-width="126" sortable>
        <template #default="{ row }">{{ row.earliestArrival || '—' }}</template>
      </ElTableColumn>
      <ElTableColumn label="合同供货量" min-width="108" align="right">
        <template #default="{ row }">{{
          quantity(row.contractQuantity, row.material?.unit)
        }}</template>
      </ElTableColumn>
      <ElTableColumn label="合同已执行量" min-width="112" align="right">
        <template #default="{ row }">{{
          quantity(row.executedQuantity, row.material?.unit)
        }}</template>
      </ElTableColumn>
      <ElTableColumn label="剩余可用供货量" min-width="128" align="right">
        <template #default="{ row }">{{
          quantity(row.remainingSupplyQuantity, row.material?.unit)
        }}</template>
      </ElTableColumn>
      <ElTableColumn label="可安排余量" min-width="108" align="right">
        <template #default="{ row }">{{
          quantity(row.remainingQuantity, row.material?.unit)
        }}</template>
      </ElTableColumn>
      <ElTableColumn prop="signedAt" label="签订日期" min-width="108" />
      <ElTableColumn prop="validTo" label="合同有效期至" min-width="112" />
      <ElTableColumn label="合同状态" min-width="105">
        <template #default="{ row }">
          <ElTag size="small" effect="plain" :type="row.status === '有效' ? 'success' : 'info'">
            {{ row.status }}
          </ElTag>
          <span
            v-if="isRequisitionSupplyEmbargoed(row as RequisitionSupply, businessDate)"
            class="restriction"
            >暂停安排</span
          >
        </template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="108" fixed="right">
        <template #default="{ row }">
          <ElButton link type="primary" @click="openRestriction(row as RequisitionSupply)"
            >禁运管理</ElButton
          >
        </template>
      </ElTableColumn>
    </ElTable>
  </section>

  <ElDrawer
    :model-value="Boolean(selectedSupply)"
    title="供应商禁运与解除"
    size="min(625px, 100%)"
    append-to-body
    @update:model-value="!$event && (selectedSupply = undefined)"
  >
    <div v-if="selectedSupply" class="restriction-drawer">
      <p>
        <strong>{{ selectedSupply.supplierName }}</strong> · {{ selectedSupply.orderId }}
      </p>
      <form class="restriction-form" @submit.prevent="submitRestriction">
        <label
          >申请类型
          <select v-model="selectedAction">
            <option>禁运</option>
            <option>解除</option>
          </select>
        </label>
        <label
          >适用范围
          <select v-model="scope">
            <option value="contract">当前合同</option>
            <option value="material">该供应商的当前物料</option>
          </select>
        </label>
        <label>生效日期<input v-model="effectiveDate" type="date" required /></label>
        <label>申请原因<textarea v-model="restrictionReason" rows="2" required /></label>
        <ElButton
          type="primary"
          native-type="submit"
          :disabled="!restrictionReason.trim() || !effectiveDate"
          >提交申请</ElButton
        >
      </form>
      <section class="restriction-impact" aria-label="禁运影响">
        <h3>待下达影响</h3>
        <p v-if="!pendingAffectedRows.length">当前范围内无待下达批次。</p>
        <p v-for="{ planId, row } in pendingAffectedRows" :key="row.id">
          <RouterLink :to="{ name: 'requisition-execution', query: { planId, rowId: row.id } }">
            {{ row.plannedDate }} · {{ row.materialName }} ·
            {{ quantity(row.plannedQuantity, row.unit) }}
          </RouterLink>
        </p>
        <h3>已有在途保留</h3>
        <p v-if="!alreadyInTransit.length">当前范围内无在途批次。</p>
        <p v-for="arrival in alreadyInTransit" :key="arrival.id">
          {{ arrival.date }} · {{ arrival.orderId }} ·
          {{
            quantity(
              arrival.quantity,
              rows.find(({ id }) => id === arrival.contractId)?.material?.unit,
            )
          }}
        </p>
        <RouterLink
          :to="{
            name: 'requisition-planning',
            query: {
              materialCode: selectedSupply.materialCode,
              week: restrictionPlanningWeek,
              restriction: selectedSupply.id,
            },
          }"
          >进入周计划评估补位</RouterLink
        >
      </section>
      <section v-if="currentRecords.length" class="restriction-impact" aria-label="禁运申请记录">
        <h3>申请记录</h3>
        <div v-for="item in currentRecords" :key="item.id" class="restriction-record">
          <p>
            {{ item.action }} · {{ item.contractId || '该供应商的当前物料' }} ·
            {{ item.effectiveDate }} · {{ item.status }}
          </p>
          <p>{{ item.reason }}</p>
          <ElButton v-if="item.status === '待复核'" @click="confirmRestriction(item)"
            >复核确认{{ item.action }}</ElButton
          >
        </div>
      </section>
      <p v-if="feedback" role="status">{{ feedback }}</p>
    </div>
  </ElDrawer>
</template>

<style scoped>
.restriction-drawer,
.restriction-form,
.restriction-form label,
.restriction-impact {
  display: grid;
  gap: 9px;
}
.restriction-drawer {
  gap: 18px;
}
.restriction-form label {
  font-weight: 600;
}
.restriction-form input,
.restriction-form select,
.restriction-form textarea {
  padding: 7px 9px;
  border: 1px solid var(--scos-border);
  border-radius: 6px;
  background: var(--el-bg-color);
  color: var(--scos-ink);
  font: inherit;
}
.restriction-form :deep(.el-button) {
  justify-self: start;
}
.restriction-impact {
  padding: 12px;
  border-radius: 7px;
  background: var(--scos-background);
}
.restriction-impact h3 {
  font-size: 14px;
}
.restriction-impact a {
  color: var(--scos-primary);
}
.restriction-record {
  border-top: 1px solid var(--scos-border);
  padding-top: 7px;
}
.restriction-record :deep(.el-button) {
  margin-top: 5px;
}
.suppliers-panel {
  min-width: 0;
  padding: 16px;
}
.summary {
  margin-bottom: 16px;
}
.summary h2 {
  margin: 0 0 12px;
  font-size: 16px;
}
.summary-note {
  margin: 4px 0 0;
  color: var(--scos-muted);
  font-size: 13px;
}
.material-total {
  padding: 10px 0;
  border-top: 1px solid var(--scos-border);
}
.material-total h3 {
  margin: 0 0 6px;
  font-size: 14px;
}
.material-total dl {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 32px;
  margin: 0;
}
.material-total dt {
  color: var(--scos-muted);
  font-size: 13px;
}
.material-total dd {
  margin: 3px 0 0;
  font-size: 20px;
  font-weight: 600;
}
.restriction {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--scos-muted);
}
</style>
