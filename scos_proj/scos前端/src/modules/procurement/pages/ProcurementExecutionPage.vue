<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElEmpty,
  ElInput,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import { procurementRepository } from '../api/procurement.repository'
import ProcurementExecutionDetail from '../components/ProcurementExecutionDetail.vue'
import ProcurementRollingDialog from '../components/ProcurementRollingDialog.vue'
import { emptyDraft } from '../model/drafts'
import { saveDraft } from '../api/procurement-drafts.local'
import {
  executionOrderKey,
  type ProcurementExecutionOrder,
  type ProcurementRollingAssessment,
} from '../model/execution'
import type { ProcurementHistoryRow } from '../model/history'

const route = useRoute()
const router = useRouter()
const plans = ref<ProcurementHistoryRow[]>([])
const planNumber = ref('')
const orders = ref<ProcurementExecutionOrder[]>([])
const keyword = ref('')
const status = ref('')
const riskOnly = ref(false)
const loading = ref(true)
const loadError = ref('')
const detail = ref<ProcurementExecutionOrder>()
const assessing = ref(false)
const assessmentError = ref(false)
const assessment = ref<ProcurementRollingAssessment | null>()
const assessmentOpen = ref(false)

const plan = computed(() => plans.value.find((item) => item.planNumber === planNumber.value))
const statuses = computed(() => [
  ...new Set(
    orders.value.flatMap((order) => (order.executionStatus ? [order.executionStatus] : [])),
  ),
])
const visibleOrders = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return orders.value.filter(
    (order) =>
      (!status.value || order.executionStatus === status.value) &&
      (!riskOnly.value || order.risk) &&
      (!query ||
        [
          executionOrderKey(order),
          order.supplierName,
          order.supplierCode,
          order.materialCode,
          order.materialName,
        ].some((value) => value?.toLowerCase().includes(query))),
  )
})
const warnings = computed(() => visibleOrders.value.filter((order) => order.risk))
const eligible = computed(() =>
  orders.value.filter((order) => (order.risk?.affectedQuantity ?? 0) > 0),
)
const formatQuantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format

function quantity(value?: number | null, unit?: string | null) {
  return value == null ? '—' : [formatQuantity(value), unit].filter(Boolean).join(' ')
}

function total(
  rows: ProcurementExecutionOrder[],
  getQuantity: (order: ProcurementExecutionOrder) => number | null | undefined,
) {
  const units = new Set(rows.map((row) => row.unit))
  const unit = rows[0]?.unit
  if (units.size !== 1 || !unit) return '—'
  let sum = 0
  for (const row of rows) {
    const value = getQuantity(row)
    if (value == null) return '—'
    sum += value
  }
  return quantity(sum, unit)
}

const metrics = computed(() => [
  {
    label: '采购订单',
    value: `${new Set(visibleOrders.value.map((row) => row.purchaseOrderNumber)).size} 笔`,
  },
  { label: '订单总量', value: total(visibleOrders.value, (row) => row.purchaseQuantity) },
  { label: '已收货量', value: total(visibleOrders.value, (row) => row.receivedQuantity) },
  {
    label: '异常订单',
    value: `${new Set(warnings.value.map((row) => row.purchaseOrderNumber)).size} 笔`,
  },
  {
    label: '供应异常缺口',
    value: warnings.value.length
      ? total(warnings.value, (row) => row.risk?.affectedQuantity)
      : quantity(visibleOrders.value.length ? 0 : null, plan.value?.unit),
  },
])

async function loadExecution(refreshPlans = false) {
  loading.value = true
  loadError.value = ''
  orders.value = []
  try {
    if (refreshPlans) {
      plans.value = (await procurementRepository.listHistory())
        .filter((item) => item.status === '已发布' || item.status === '已归档')
        .sort((a, b) =>
          (b.publishedAt ?? b.month ?? '').localeCompare(a.publishedAt ?? a.month ?? ''),
        )
      const preferred = planNumber.value || route.query.plan
      planNumber.value =
        plans.value.find((item) => item.planNumber === preferred)?.planNumber ??
        plans.value.find((item) => item.status === '已发布')?.planNumber ??
        plans.value[0]?.planNumber ??
        ''
    }
    if (planNumber.value) orders.value = await procurementRepository.listExecution(planNumber.value)
    if (!statuses.value.includes(status.value)) status.value = ''
  } catch {
    loadError.value = '采购执行数据加载失败，请刷新重试。'
  } finally {
    loading.value = false
  }
}

function changePlan() {
  status.value = ''
  void router.replace({ query: { ...route.query, plan: planNumber.value } })
  void loadExecution()
}

async function assess(rows = eligible.value) {
  detail.value = undefined
  assessment.value = undefined
  assessmentError.value = false
  assessmentOpen.value = true
  assessing.value = true
  try {
    assessment.value = await procurementRepository.getRollingAssessment(
      planNumber.value,
      rows.map(executionOrderKey),
    )
  } catch {
    assessmentError.value = true
  } finally {
    assessing.value = false
  }
}

function createRollingDraft(rollingAssessment: ProcurementRollingAssessment, amount: number) {
  const source = plan.value
  if (!source?.month || !source.plant || !source.materialCode) return
  const id = crypto.randomUUID()
  saveDraft({
    ...emptyDraft(),
    id,
    month: source.month,
    plant: source.plant,
    materialCode: source.materialCode,
    unit: rollingAssessment.unit,
    demandQuantity: amount,
    confirmedQuantity: amount,
    rollingAssessment,
  })
  assessmentOpen.value = false
  void router.push({ name: 'procurement-draft', params: { draftId: id } })
}

onMounted(() => loadExecution(true))
</script>

<template>
  <PageHeader
    title="执行情况"
    description="按已发布采购方案追踪订单履约，识别供应异常造成的需求缺口。"
  >
    <template #actions>
      <ElButton :loading="loading" :disabled="assessmentOpen" @click="loadExecution(true)"
        >刷新执行状态</ElButton
      >
      <ElButton type="primary" :disabled="loading || !plan || !!loadError" @click="assess()"
        >评估需求缺口</ElButton
      >
    </template>
  </PageHeader>

  <section class="surface execution-panel" aria-label="采购方案与筛选" :aria-busy="loading">
    <div class="execution-filters">
      <div>
        <label for="execution-plan">采购方案</label>
        <ElSelect
          id="execution-plan"
          v-model="planNumber"
          :disabled="loading || !plans.length"
          placeholder="选择已发布方案"
          @change="changePlan"
        >
          <ElOption
            v-for="item in plans"
            :key="item.planNumber"
            :value="item.planNumber"
            :label="
              [item.planNumber, item.month, item.materialName || item.materialCode]
                .filter(Boolean)
                .join(' · ')
            "
          />
        </ElSelect>
      </div>
      <div>
        <label for="execution-keyword">搜索订单</label>
        <ElInput
          id="execution-keyword"
          v-model="keyword"
          placeholder="订单号、供应商或物料"
          clearable
        />
      </div>
      <div>
        <label for="execution-status">执行状态</label>
        <ElSelect
          id="execution-status"
          v-model="status"
          clearable
          placeholder="全部状态"
          :disabled="!statuses.length"
        >
          <ElOption v-for="item in statuses" :key="item" :label="item" :value="item" />
        </ElSelect>
      </div>
      <ElCheckbox v-model="riskOnly">仅看异常</ElCheckbox>
    </div>
  </section>

  <ElAlert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon />
  <p v-else-if="loading" class="surface execution-panel" role="status">正在读取采购执行数据…</p>
  <ElEmpty v-else-if="!plan" class="surface" description="暂无已发布的采购方案" />
  <ElEmpty v-else-if="!orders.length" class="surface" description="待回传采购订单" />
  <template v-else>
    <dl class="execution-metrics" aria-label="执行概况">
      <div v-for="metric in metrics" :key="metric.label" class="surface">
        <dt>{{ metric.label }}</dt>
        <dd>{{ metric.value }}</dd>
      </div>
    </dl>

    <section
      v-if="warnings.length"
      class="surface execution-panel"
      aria-labelledby="execution-warning-title"
    >
      <h2 id="execution-warning-title">执行预警</h2>
      <ul class="execution-warnings">
        <li v-for="row in warnings" :key="executionOrderKey(row)">
          <div>
            <ElTag type="danger" effect="plain">{{ row.risk?.type }}</ElTag>
            <strong
              >{{ row.purchaseOrderNumber }} · {{ row.supplierName || row.supplierCode }}</strong
            >
            <p>{{ row.risk?.reason }}</p>
          </div>
          <div class="warning-actions">
            <span>供应异常缺口 {{ quantity(row.risk?.affectedQuantity, row.unit) }}</span>
            <ElButton link type="primary" @click="detail = row">查看详情</ElButton>
            <ElButton
              v-if="(row.risk?.affectedQuantity ?? 0) > 0"
              link
              type="primary"
              @click="assess([row])"
              >纳入需求缺口</ElButton
            >
          </div>
        </li>
      </ul>
    </section>

    <section class="surface execution-panel" aria-labelledby="execution-table-title">
      <h2 id="execution-table-title">采购订单明细</h2>
      <ElTable :data="visibleOrders" :row-key="executionOrderKey" empty-text="没有匹配的采购订单">
        <ElTableColumn label="采购订单 / 行号" min-width="182">
          <template #default="{ row }">
            {{ row.purchaseOrderNumber }} / {{ row.purchaseOrderLineNumber }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="供应商" min-width="175">
          <template #default="{ row }">{{ row.supplierName || row.supplierCode || '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="物料" min-width="110">
          <template #default="{ row }">{{ row.materialName || row.materialCode || '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="采购量" min-width="92" align="right">
          <template #default="{ row }">{{ quantity(row.purchaseQuantity, row.unit) }}</template>
        </ElTableColumn>
        <ElTableColumn label="已收货量" min-width="92" align="right">
          <template #default="{ row }">{{ quantity(row.receivedQuantity, row.unit) }}</template>
        </ElTableColumn>
        <ElTableColumn label="预计到厂" min-width="122">
          <template #default="{ row }">{{ row.estimatedArrivalTime || '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="执行状态" min-width="108">
          <template #default="{ row }"
            ><ElTag v-if="row.executionStatus" effect="plain">{{ row.executionStatus }}</ElTag
            ><span v-else>—</span></template
          >
        </ElTableColumn>
        <ElTableColumn label="风险" min-width="108">
          <template #default="{ row }"
            ><ElTag v-if="row.risk" type="danger" effect="plain">{{ row.risk.type }}</ElTag
            ><span v-else>—</span></template
          >
        </ElTableColumn>
        <ElTableColumn label="操作" width="96" fixed="right">
          <template #default="{ row }">
            <ElButton link type="primary" @click="detail = row as ProcurementExecutionOrder">
              查看详情
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </section>
  </template>

  <ProcurementExecutionDetail
    :order="detail"
    @close="detail = undefined"
    @assess="assess([$event])"
  />
  <ProcurementRollingDialog
    v-model="assessmentOpen"
    :assessment="assessment"
    :loading="assessing"
    :failed="assessmentError"
    :can-create="Boolean(plan?.month && plan.plant && plan.materialCode)"
    @create="createRollingDraft"
  />
</template>

<style scoped>
.execution-panel {
  margin-bottom: 16px;
  padding: 18px 20px;
  min-width: 0;
}
.execution-panel h2 {
  margin: 0 0 12px;
  font-size: 16px;
}
.execution-filters {
  display: grid;
  grid-template-columns: minmax(220px, 1.4fr) minmax(165px, 1fr) minmax(135px, 0.75fr) auto;
  align-items: end;
  gap: 12px;
}
.execution-filters > div {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.execution-filters label,
.execution-metrics dt {
  color: var(--scos-muted);
  font-size: 13px;
}
.execution-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin: 0 0 16px;
}
.execution-metrics > div {
  padding: 14px 16px;
}
.execution-metrics dd {
  margin: 6px 0 0;
  font-size: 22px;
  font-weight: 650;
}
.execution-warnings {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.execution-warnings li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--scos-border);
  border-radius: 7px;
  padding: 10px 12px;
}
.execution-warnings strong {
  margin-left: 8px;
  font-size: 14px;
}
.execution-warnings p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--scos-muted);
}
.warning-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 13px;
}
.warning-actions > span {
  color: var(--el-color-danger);
  font-weight: 600;
}
.warning-actions .el-button {
  margin-left: 0;
}
@media (max-width: 800px) {
  .execution-filters {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
  }
}
</style>
