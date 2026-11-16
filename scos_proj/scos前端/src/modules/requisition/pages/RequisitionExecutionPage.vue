<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElDescriptions,
  ElDescriptionsItem,
  ElDrawer,
  ElEmpty,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTimeline,
  ElTimelineItem,
} from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import { env } from '@/shared/config/env'
import {
  checkRequisitionRelease,
  getRequisitionSnapshot,
  listRequisitionExecutionPlans,
  lookupRequisitionReceipt,
  releaseRequisitionRows,
  simulateRequisitionArrivalDelay,
  simulateRequisitionInspection,
  withdrawRequisitionRow,
} from '../api/requisition.repository'
import RequisitionCoordinationDrawer from '../components/RequisitionCoordinationDrawer.vue'
import { requisitionExecutionCause, requisitionExecutionIssue } from '../domain/operations'
import type { RequisitionExecutionPlan, RequisitionExecutionRow } from '../model/execution'
import type { RequisitionIssueContext, RequisitionReleaseIssue } from '../model/operations'

defineProps<{ title: string; description: string }>()

const route = useRoute()
const router = useRouter()
const isMock = env.dataSource === 'mock'
const plans = ref<RequisitionExecutionPlan[]>([])
const status = ref('')
const exceptionsOnly = ref(false)
const detailId = ref('')
const loading = ref(true)
const sending = ref(false)
const error = ref('')
const feedback = ref('')
const assessment = ref<RequisitionIssueContext>()
const coordination = ref<RequisitionIssueContext>()
const releaseIssues = ref<RequisitionReleaseIssue[]>([])
const formatQuantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format
const formatConfirmedAt = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Shanghai',
}).format

const requestedPlanId = computed(() =>
  typeof route.query.planId === 'string' ? route.query.planId : '',
)
const planId = computed({
  get: () =>
    requestedPlanId.value
      ? (plans.value.find(({ id }) => id === requestedPlanId.value)?.id ?? '')
      : (plans.value[0]?.id ?? ''),
  set: (id) => void router.replace({ query: { ...route.query, planId: id } }),
})
const plan = computed(() => plans.value.find(({ id }) => id === planId.value))
const rows = computed(() => plan.value?.rows ?? [])
const pending = computed(() => rows.value.filter(({ releaseStatus }) => releaseStatus === '待下达'))
const detail = computed(() => rows.value.find(({ id }) => id === detailId.value))
const exceptionText = (row: RequisitionExecutionRow) =>
  releaseIssues.value.find(({ rowId }) => rowId === row.id)?.reason ||
  requisitionExecutionCause(row)
const hasException = (row: RequisitionExecutionRow) => Boolean(exceptionText(row))
const visibleRows = computed(() =>
  rows.value.filter(
    (row) =>
      (!status.value || row.releaseStatus === status.value) &&
      (!exceptionsOnly.value || hasException(row)),
  ),
)

function quantity(value: number | undefined, unit: string) {
  return value == null ? '—' : formatQuantity(value) + ' ' + unit
}

function total(field: 'plannedQuantity' | 'shippedQuantity' | 'receivedQuantity') {
  const totals = new Map<string, number>()
  for (const row of rows.value) {
    const value = row[field]
    if (value != null) totals.set(row.unit, (totals.get(row.unit) ?? 0) + value)
  }
  return [...totals].map(([unit, value]) => quantity(value, unit)).join(' / ') || '—'
}

const metrics = computed(() => [
  { label: '计划量', value: total('plannedQuantity') },
  { label: '待下达', value: pending.value.length + ' 行' },
  {
    label: '待供应商承诺',
    value:
      rows.value.filter((row) => row.releaseStatus === '已下达' && row.commitmentQuantity == null)
        .length + ' 行',
  },
  { label: '已发货', value: total('shippedQuantity') },
  { label: '已收货', value: total('receivedQuantity') },
  { label: '异常', value: rows.value.filter(hasException).length + ' 行' },
])

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    plans.value = await listRequisitionExecutionPlans()
    if (plan.value) {
      releaseIssues.value = await checkRequisitionRelease(
        plan.value.id,
        plan.value.rows
          .filter(({ releaseStatus }) => releaseStatus === '待下达' || releaseStatus === '下达失败')
          .map(({ id }) => id),
      )
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '执行状态读取失败。'
  } finally {
    loading.value = false
  }
}

watch(planId, () => {
  status.value = ''
  exceptionsOnly.value = route.query.exceptions === '1'
  detailId.value = ''
  feedback.value = ''
  releaseIssues.value = []
})

watch(
  () => route.query.exceptions,
  (value) => {
    exceptionsOnly.value = value === '1'
  },
  { immediate: true },
)

watch(
  [() => route.query.rowId, rows],
  ([id, items]) => {
    if (typeof id === 'string' && items.some((row) => row.id === id)) detailId.value = id
  },
  { immediate: true },
)

watch(detailId, () => {
  assessment.value = undefined
  if (!detailId.value && route.query.rowId)
    void router.replace({ query: { ...route.query, rowId: undefined } })
})

async function assess(row: RequisitionExecutionRow) {
  if (!plan.value) return
  const selectedPlan = plan.value
  detailId.value = row.id
  try {
    const checks =
      row.releaseStatus === '待下达' || row.releaseStatus === '下达失败'
        ? await checkRequisitionRelease(selectedPlan.id, [row.id])
        : []
    releaseIssues.value = [
      ...releaseIssues.value.filter(({ rowId }) => rowId !== row.id),
      ...checks,
    ]
    const snapshot = await getRequisitionSnapshot()
    const result = requisitionExecutionIssue(snapshot, selectedPlan, row)
    if (detailId.value === row.id && result) {
      assessment.value = { ...result, cause: exceptionText(row) || result.cause }
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法读取异常影响。'
  }
}

async function withdraw(row: RequisitionExecutionRow) {
  error.value = ''
  try {
    await withdrawRequisitionRow(planId.value, row.id)
    await refresh()
    const latest = rows.value.find(({ id }) => id === row.id)
    if (latest) await assess(latest)
    feedback.value = '待下达批次已撤回，合同占用已释放。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '撤回失败。'
  }
}

async function replayFeedback(
  row: RequisitionExecutionRow,
  type: 'delay' | 'inspection' | 'released',
) {
  if (type === 'delay') await simulateRequisitionArrivalDelay(true)
  else await simulateRequisitionInspection(type === 'released')
  await refresh()
  const latest = rows.value.find(({ id }) => id === row.id)
  if (latest) await assess(latest)
}

async function verifyReceipt(row: RequisitionExecutionRow) {
  try {
    const reference = await lookupRequisitionReceipt(planId.value, row.id)
    await refresh()
    feedback.value = reference
      ? `已核对外部回执 ${reference}，该批次已更新为已下达。`
      : '外部暂未返回回执，可继续核对或重试。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '回执核对失败。'
  }
}

function openCoordination() {
  coordination.value = assessment.value
  detailId.value = ''
}

function closeCoordination() {
  const row = rows.value.find(({ id }) => id === coordination.value?.executionRowId)
  coordination.value = undefined
  if (row) void assess(row)
}

async function send(ids: string[], retry = false) {
  if (!ids.length || sending.value) return
  const sentPlanId = planId.value
  sending.value = true
  error.value = ''
  feedback.value = ''
  try {
    releaseIssues.value = await checkRequisitionRelease(sentPlanId, ids)
    const blocked = releaseIssues.value.length
    const eligible = ids.filter((id) => !releaseIssues.value.some(({ rowId }) => rowId === id))
    if (!eligible.length) {
      feedback.value = '待下达批次需调整，见明细中的校验原因。'
      return
    }
    await releaseRequisitionRows(sentPlanId, eligible, retry)
    await refresh()
    if (!error.value && planId.value === sentPlanId) {
      const failed = rows.value.filter(
        (row) => eligible.includes(row.id) && row.releaseStatus === '下达失败',
      ).length
      feedback.value = `${isMock ? '已模拟下达' : '已下达'} ${eligible.length - failed} 行${failed ? `，失败 ${failed} 行，可单独重试` : ''}${blocked ? `，${blocked} 行需调整` : ''}。`
    }
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : `${isMock ? '模拟下达' : '要货下达'}失败。`
  } finally {
    sending.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <PageHeader :title="title" :description="description">
    <template #actions>
      <RouterLink
        class="overview-link"
        :to="{
          name: 'requisition-overview',
          query: { week: plan?.source?.weekStart, materialCode: plan?.source?.materialCode },
        }"
        >返回要货概览</RouterLink
      >
      <ElButton :loading="loading" :disabled="sending" @click="refresh">刷新执行状态</ElButton>
      <ElButton
        type="primary"
        :disabled="loading || !pending.length"
        :loading="sending"
        @click="send(pending.map(({ id }) => id))"
        >{{ isMock ? '模拟下达' : '下达已确认计划' }}</ElButton
      >
    </template>
  </PageHeader>

  <section class="surface execution-panel" aria-label="要货计划筛选">
    <div class="filters">
      <label
        >已发布计划
        <select v-model="planId" :disabled="loading || sending">
          <option v-if="!plans.length" value="">暂无计划</option>
          <option v-else-if="!planId" value="" disabled>请选择计划</option>
          <option v-for="item in plans" :key="item.id" :value="item.id">
            {{ item.id }} · {{ item.plant }}
          </option>
        </select>
      </label>
      <label
        >下达状态
        <select v-model="status">
          <option value="">全部状态</option>
          <option>待下达</option>
          <option>下达失败</option>
          <option>已下达</option>
          <option>已撤回</option>
        </select>
      </label>
      <ElCheckbox v-model="exceptionsOnly">仅看异常</ElCheckbox>
    </div>
    <p v-if="isMock" class="execution-note muted">
      <ElTag size="small" type="info" effect="plain">演示模式</ElTag>
      <span>下达结果在本地模拟，预置计划中的履约反馈为演示数据。</span>
    </p>
    <section v-if="plan?.source" class="plan-source" aria-label="已确认周计划来源">
      <p>
        <strong>本地确认计划</strong> · 周起始 {{ plan.source.weekStart }} · 物料
        {{ plan.source.materialCode }} · 确认于
        {{ formatConfirmedAt(new Date(plan.source.confirmedAt)) }}
        <template v-if="plan.source.manuallyAdjusted"> · 包含人工调整</template>
        <template v-if="plan.source.adjustmentReason">
          · 调整原因 {{ plan.source.adjustmentReason }}</template
        >
      </p>
      <p class="muted">
        需求版本 {{ plan.source.demandVersion }} · WMS 库存快照 {{ plan.source.inventoryVersion }} ·
        合同供货版本 {{ plan.source.conditionVersion }}
        <template v-if="plan.source.expectedQuantity != null">
          · 预期要货量 {{ quantity(plan.source.expectedQuantity, plan.rows[0]?.unit ?? '') }}
        </template>
        <template v-if="plan.source.warehouseCapacity != null">
          · 仓库上限 {{ quantity(plan.source.warehouseCapacity, plan.rows[0]?.unit ?? '') }}
        </template>
      </p>
    </section>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>
  </section>

  <template v-if="plan">
    <dl class="execution-metrics" aria-label="要货执行概况">
      <div v-for="metric in metrics" :key="metric.label" class="surface">
        <dt>{{ metric.label }}</dt>
        <dd>{{ metric.value }}</dd>
      </div>
    </dl>

    <section
      class="surface execution-panel"
      aria-labelledby="execution-lines-title"
      :aria-busy="loading"
    >
      <h2 id="execution-lines-title">计划执行明细</h2>
      <ElTable :data="visibleRows" row-key="id" empty-text="没有符合筛选条件的计划行">
        <ElTableColumn label="供应商 / 物料" min-width="185">
          <template #default="{ row }"
            >{{ row.supplierName }}
            <div class="muted">{{ row.materialName }}</div></template
          >
        </ElTableColumn>
        <ElTableColumn label="计划到货" min-width="108">
          <template #default="{ row }">
            {{ row.plannedDate }}
            <div class="muted">{{ quantity(row.plannedQuantity, row.unit) }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="下达状态" min-width="108">
          <template #default="{ row }">
            <ElTag
              :type="
                row.releaseStatus === '下达失败'
                  ? 'danger'
                  : row.releaseStatus === '已下达'
                    ? 'success'
                    : 'info'
              "
              effect="plain"
              >{{ row.releaseStatus }}</ElTag
            >
            <div v-if="row.dispatchReference" class="muted">{{ row.dispatchReference }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="供货承诺" min-width="114">
          <template #default="{ row }">
            {{ row.commitmentDate || '—' }}
            <div v-if="row.commitmentQuantity != null" class="muted">
              {{ quantity(row.commitmentQuantity, row.unit) }}
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="预计到厂 / 运输" min-width="125">
          <template #default="{ row }">
            {{ row.estimatedArrivalDate || '—' }}
            <div v-if="row.transportStatus" class="muted">{{ row.transportStatus }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="收货 / 质检" min-width="112">
          <template #default="{ row }">
            {{ quantity(row.receivedQuantity, row.unit) }}
            <div v-if="row.inspectionStatus" class="muted">{{ row.inspectionStatus }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="偏差" min-width="145">
          <template #default="{ row }">
            <span v-if="exceptionText(row as RequisitionExecutionRow)" class="deviation">{{
              exceptionText(row as RequisitionExecutionRow)
            }}</span>
            <span v-else>—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="176" fixed="right">
          <template #default="{ row }">
            <ElButton link type="primary" @click="detailId = row.id">详情</ElButton>
            <ElButton
              v-if="hasException(row as RequisitionExecutionRow)"
              link
              type="primary"
              @click="assess(row as RequisitionExecutionRow)"
            >
              评估影响
            </ElButton>
            <ElButton
              v-if="row.releaseStatus === '下达失败'"
              link
              type="primary"
              :disabled="sending || loading"
              @click="send([row.id], true)"
              >{{ isMock ? '模拟重试' : '重试' }}</ElButton
            >
          </template>
        </ElTableColumn>
      </ElTable>
    </section>
  </template>
  <ElEmpty
    v-else-if="!loading && !error"
    class="surface"
    :description="requestedPlanId ? '未找到指定的要货计划' : '暂无已发布的要货计划'"
  />

  <ElDrawer
    :model-value="!!detail"
    title="要货执行详情"
    size="min(620px, 100%)"
    append-to-body
    @update:model-value="!$event && (detailId = '')"
  >
    <template v-if="detail">
      <ElDescriptions :column="1" border>
        <ElDescriptionsItem label="计划版本">{{ planId }}</ElDescriptionsItem>
        <ElDescriptionsItem label="计划行">{{ detail.id }}</ElDescriptionsItem>
        <ElDescriptionsItem label="供应商">{{ detail.supplierName }}</ElDescriptionsItem>
        <ElDescriptionsItem label="物料">{{ detail.materialName }}</ElDescriptionsItem>
        <ElDescriptionsItem label="合同 / 采购订单"
          >{{ detail.contractId }} / {{ detail.orderId || '—' }}</ElDescriptionsItem
        >
        <ElDescriptionsItem v-if="detail.dispatchReference" label="下达回执">{{
          detail.dispatchReference
        }}</ElDescriptionsItem>
      </ElDescriptions>
      <ElAlert
        v-if="exceptionText(detail)"
        class="detail-alert"
        :title="exceptionText(detail)"
        type="warning"
        :closable="false"
      />
      <h3 class="detail-heading">执行节点</h3>
      <ElTimeline>
        <ElTimelineItem timestamp="SCOS · 已确认计划"
          >{{ detail.plannedDate }} · {{ quantity(detail.plannedQuantity, detail.unit) }} ·
          {{ detail.releaseStatus }}</ElTimelineItem
        >
        <ElTimelineItem v-if="detail.commitmentDate" timestamp="供应商回传 · 到货承诺"
          >{{ detail.commitmentDate }} ·
          {{ quantity(detail.commitmentQuantity, detail.unit) }}</ElTimelineItem
        >
        <ElTimelineItem v-if="detail.transportStatus" timestamp="TMS · 发运与在途">
          {{ detail.transportStatus }} · 已发货
          {{ quantity(detail.shippedQuantity, detail.unit) }} · 预计到厂
          {{ detail.estimatedArrivalDate || '—' }}
        </ElTimelineItem>
        <ElTimelineItem v-if="detail.receivedQuantity != null" timestamp="WMS / QMS · 收货与质检">
          已收货 {{ quantity(detail.receivedQuantity, detail.unit) }} · 质检合格
          {{ quantity(detail.qualifiedQuantity, detail.unit) }} ·
          {{ detail.inspectionStatus || '—' }}
          <p v-if="detail.qualifiedAvailableDate">可投料日期 {{ detail.qualifiedAvailableDate }}</p>
          <p
            v-if="
              detail.qualifiedQuantity != null && detail.receivedQuantity > detail.qualifiedQuantity
            "
          >
            暂不可投料
            {{ quantity(detail.receivedQuantity - detail.qualifiedQuantity, detail.unit) }}
          </p>
        </ElTimelineItem>
      </ElTimeline>
      <div class="review-actions">
        <ElButton v-if="hasException(detail) && !assessment" @click="assess(detail)">
          评估影响
        </ElButton>
        <ElButton
          v-if="detail.releaseStatus === '下达失败' || detail.dispatchReference"
          @click="verifyReceipt(detail)"
          >核对外部回执</ElButton
        >
        <ElButton
          v-if="isMock && detail.id === 'REQEXE-003'"
          @click="replayFeedback(detail, 'delay')"
        >
          模拟新的延期反馈
        </ElButton>
        <ElButton
          v-if="
            detail.releaseStatus === '待下达' &&
            releaseIssues.some(({ rowId }) => rowId === detail?.id)
          "
          @click="withdraw(detail)"
          >撤回待下达批次</ElButton
        >
        <ElButton
          v-if="isMock && detail.id === 'REQEXE-004' && detail.inspectionStatus !== '部分冻结'"
          @click="replayFeedback(detail, 'inspection')"
          >模拟部分质检冻结</ElButton
        >
        <ElButton
          v-if="isMock && detail.id === 'REQEXE-004' && detail.inspectionStatus === '部分冻结'"
          @click="replayFeedback(detail, 'released')"
          >模拟复检放行</ElButton
        >
      </div>
      <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>
      <section v-if="assessment" class="impact-panel" aria-label="异常影响">
        <h3>异常影响</h3>
        <p>
          {{ assessment.materialName }} · 原计划 {{ detail.plannedDate }} /
          {{ quantity(detail.plannedQuantity, detail.unit) }} · 最新预计
          {{ detail.estimatedArrivalDate || detail.commitmentDate || '待核实' }}
        </p>
        <p v-if="assessment.riskDate" class="deviation">
          {{ assessment.riskDate }} 预计缺料 {{ quantity(assessment.shortage, assessment.unit) }}
        </p>
        <p v-else class="muted">
          {{ assessment.riskKnown ? '当前未识别到生产缺口。' : '影响待核实，请核对库存和耗用。' }}
        </p>
        <div class="review-actions">
          <RouterLink
            :to="{
              name: 'requisition-planning',
              query: {
                week: assessment.weekStart,
                materialCode: assessment.materialCode,
                sourcePlan: assessment.planId,
                sourceRow: assessment.executionRowId,
              },
            }"
            >进入滚动调整</RouterLink
          >
          <ElButton type="primary" @click="openCoordination">发起协调</ElButton>
        </div>
      </section>
    </template>
  </ElDrawer>
  <RequisitionCoordinationDrawer
    :context="coordination"
    :can-close="coordination?.riskKnown && !coordination.riskDate"
    @close="closeCoordination"
  />
</template>

<style scoped>
.overview-link {
  margin-right: 10px;
  color: var(--scos-primary);
}

.review-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.review-actions :deep(.el-button + .el-button) {
  margin: 0;
}
.review-actions a {
  color: var(--scos-primary);
}
.impact-panel {
  display: grid;
  gap: 8px;
  margin-top: 15px;
  padding: 12px;
  border: 1px solid var(--scos-border);
  border-radius: 8px;
}

.execution-panel {
  min-width: 0;
  margin-bottom: 16px;
  padding: 16px 18px;
}
.execution-panel h2 {
  margin: 0 0 10px;
  font-size: 16px;
}
.filters {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: 10px 16px;
}
.filters label {
  display: grid;
  gap: 5px;
  font-size: 13px;
}
.filters select {
  max-width: 100%;
  min-height: 32px;
  padding: 3px 8px;
  border: 1px solid var(--scos-border);
  border-radius: 5px;
  color: var(--scos-ink);
  background: var(--el-bg-color);
}
.filters > label {
  min-width: 0;
  max-width: 100%;
}
.execution-panel .el-alert,
.feedback,
.execution-note,
.plan-source {
  margin-top: 12px;
}
.execution-note {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
}
.plan-source {
  display: grid;
  gap: 4px;
  overflow-wrap: anywhere;
}
.execution-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin: 0 0 16px;
}
.execution-metrics > div {
  padding: 12px 14px;
}
.execution-metrics dt,
.muted {
  font-size: 12px;
  color: var(--scos-muted);
}
.execution-metrics dd {
  margin: 5px 0 0;
  font-size: 20px;
  font-weight: 600;
}
.deviation {
  color: var(--el-color-danger);
}
.detail-alert,
.detail-heading {
  margin: 16px 0;
}
</style>
