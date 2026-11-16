<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, reactive, ref, watch } from 'vue'
import { ElAlert, ElButton, ElDialog, ElInputNumber, ElPopconfirm, ElTag } from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import { env } from '@/shared/config/env'
import { procurementRepository } from '../api/procurement.repository'
import { summarizeWeeklyProductionDemand } from '../model/demand'
import {
  defaultProcurementOptimizationParameters,
  type ProcurementOptimizationInput,
  type ProcurementOptimizationOffer,
  type ProcurementOptimizationParameters,
} from '../model/optimization'
import type { ProcurementDraftInput, ProcurementSupplier } from '../model/types'
import type { ProcurementForecastSnapshot } from '../model/price-forecast'
import ProcurementCandidateCards from './ProcurementCandidateCards.vue'
import ProcurementOptimizationResult from './ProcurementOptimizationResult.vue'
import ProcurementSavedPlans from './ProcurementSavedPlans.vue'

const props = defineProps<{ initial: ProcurementDraftInput }>()
const emit = defineEmits<{
  cancel: []
  save: [draft: ProcurementDraftInput, returnToList: boolean]
}>()
const ProcurementFuturesPanel = defineAsyncComponent(() => import('./ProcurementFuturesPanel.vue'))
const ProcurementPriceDecisionPanel = defineAsyncComponent(
  () => import('./ProcurementPriceDecisionPanel.vue'),
)
const futuresOpen = ref(false)
const demandSnapshot = props.initial.demandSnapshot
const weeklyDemand = summarizeWeeklyProductionDemand(demandSnapshot?.lines ?? [])
const demandTotals = (demandSnapshot?.lines ?? []).reduce(
  (total, line) => ({
    gross: total.gross + line.grossQuantity,
    stock: total.stock + line.availableStockQuantity,
    inbound: total.inbound + line.effectiveInboundQuantity,
  }),
  { gross: 0, stock: 0, inbound: 0 },
)
const formatQuantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format

const demandQuantity = props.initial.demandQuantity ?? props.initial.confirmedQuantity
const confirmedDemandQuantity = props.initial.confirmedQuantity ?? demandQuantity
const draft = reactive({
  ...props.initial,
  demandQuantity,
  confirmedQuantity: confirmedDemandQuantity,
  savedPlans: [...(props.initial.savedPlans ?? [])],
})
const selectedPlan = computed(() =>
  draft.savedPlans.find(({ version }) => version === draft.selectedPlanVersion),
)
const visibleResult = computed(() => selectedPlan.value?.result ?? draft.optimizationResult)
const canDispatch = computed(() => {
  const plan = selectedPlan.value
  return (
    env.dataSource === 'mock' &&
    plan != null &&
    !plan.dispatch &&
    !plan.result.infeasibleReason &&
    plan.result.shortageQuantity === 0
  )
})
const parameterFields = [
  { key: 'minSupplierCount', label: '最少供应商家数', min: 1, step: 1 },
  { key: 'maxSupplierShare', label: '单家最高采购占比（%）', min: 0.1, max: 100, step: 1 },
  { key: 'minSelectedSupplierShare', label: '入选供应商最低占比（%）', min: 0, max: 100, step: 1 },
  { key: 'annualFundingRate', label: '年化资金成本率（%）', min: 0, max: 100, step: 0.1 },
] as const satisfies readonly {
  key: keyof ProcurementOptimizationParameters
  label: string
  min: number
  max?: number
  step: number
}[]
const defaultParameters = defaultProcurementOptimizationParameters
const parameters = reactive({
  minSupplierCount: draft.minSupplierCount ?? defaultParameters.minSupplierCount,
  maxSupplierShare: draft.maxSupplierShare || defaultParameters.maxSupplierShare,
  minSelectedSupplierShare:
    draft.minSelectedSupplierShare ?? defaultParameters.minSelectedSupplierShare,
  annualFundingRate: draft.annualFundingRate ?? defaultParameters.annualFundingRate,
})
const suppliers = ref<ProcurementSupplier[]>([])
const offers = ref<ProcurementOptimizationOffer[]>()
const excludedCodes = ref([...(props.initial.excludedSupplierCodes ?? [])])
const suppliersLoading = ref(true)
const sourceError = ref('')
const offerError = ref('')
const optimizing = ref(false)
const optimizationError = ref('')
const activeSupplierCodes = computed(() =>
  suppliers.value
    .filter(
      (supplier) =>
        supplier.enabledStatus !== '停用' && !excludedCodes.value.includes(supplier.supplierCode),
    )
    .map((supplier) => supplier.supplierCode)
    .sort(),
)
const canOptimize = computed(
  () =>
    !suppliersLoading.value &&
    !sourceError.value &&
    !offerError.value &&
    activeSupplierCodes.value.length > 0 &&
    parameterFields.every(({ key }) => Number.isFinite(parameters[key])) &&
    parameters.minSelectedSupplierShare <= parameters.maxSupplierShare &&
    (confirmedDemandQuantity ?? 0) > 0 &&
    (confirmedDemandQuantity ?? 0) >= (demandQuantity ?? 0),
)

onMounted(async () => {
  const [supplierResult, offerResult] = await Promise.allSettled([
    procurementRepository.listSuppliers(),
    procurementRepository.listOptimizationOffers(draft.materialCode, draft.unit, draft.month),
  ])
  if (offerResult.status === 'fulfilled') {
    offers.value = offerResult.value
  } else {
    offerError.value = '供应商报价与可供量读取失败。'
  }
  try {
    if (supplierResult.status === 'rejected') throw supplierResult.reason
    suppliers.value = supplierResult.value
    // 旧草稿记录的是勾选名单，新草稿记录本方案主动禁用的供应商。
    if (!props.initial.excludedSupplierCodes && props.initial.supplierCodes.length) {
      excludedCodes.value = suppliers.value
        .filter((supplier) => !props.initial.supplierCodes.includes(supplier.supplierCode))
        .map((supplier) => supplier.supplierCode)
    }
    const result = draft.optimizationResult
    if (
      result &&
      ((result.source === 'mock' &&
        result.estimatedCost === undefined &&
        !result.infeasibleReason) ||
        activeSupplierCodes.value.join() !== [...props.initial.supplierCodes].sort().join())
    ) {
      draft.optimizationInput = undefined
      draft.optimizationResult = undefined
    }
  } catch (error) {
    sourceError.value = error instanceof Error ? error.message : '供应商主数据读取失败。'
  } finally {
    suppliersLoading.value = false
  }
})

function toggleSupplier(code: string) {
  excludedCodes.value = excludedCodes.value.includes(code)
    ? excludedCodes.value.filter((value) => value !== code)
    : [...excludedCodes.value, code]
}

let inputRevision = 0
watch(
  [excludedCodes, parameters],
  () => {
    inputRevision++
    draft.optimizationInput = undefined
    draft.optimizationResult = undefined
    optimizationError.value = ''
  },
  { flush: 'sync' },
)

async function optimize() {
  if (!canOptimize.value || optimizing.value || confirmedDemandQuantity == null) return

  const input: ProcurementOptimizationInput = {
    month: draft.month,
    plant: draft.plant,
    materialCode: draft.materialCode,
    unit: draft.unit,
    requestedQuantity: confirmedDemandQuantity,
    supplierCodes: activeSupplierCodes.value,
    parameters: { ...parameters },
  }
  const revision = inputRevision
  optimizing.value = true
  optimizationError.value = ''
  try {
    const result = await procurementRepository.optimizePlan(input)
    if (revision === inputRevision) {
      draft.optimizationInput = input
      draft.optimizationResult = result
      draft.selectedPlanVersion = undefined
    }
  } catch (error) {
    if (revision === inputRevision) {
      optimizationError.value = error instanceof Error ? error.message : '采购优化失败，请重试。'
    }
  } finally {
    optimizing.value = false
  }
}

function save(returnToList = true) {
  const candidateSelection =
    suppliersLoading.value || sourceError.value
      ? {}
      : {
          supplierCodes: activeSupplierCodes.value,
          excludedSupplierCodes: [...excludedCodes.value],
        }
  emit('save', { ...draft, ...parameters, ...candidateSelection }, returnToList)
}

function savePlan() {
  const { optimizationInput, optimizationResult, savedPlans } = draft
  if (!optimizationInput || !optimizationResult) return

  const version = (savedPlans.at(-1)?.version ?? 0) + 1
  savedPlans.push({
    version,
    savedAt: new Date().toISOString(),
    input: optimizationInput,
    result: optimizationResult,
  })
  draft.optimizationInput = undefined
  draft.optimizationResult = undefined
  selectPlan(version)
}

function selectPlan(version?: number) {
  draft.selectedPlanVersion = version
  save(false)
}

function dispatchPlan() {
  const plan = selectedPlan.value
  if (!plan || !canDispatch.value) return

  plan.dispatch = { target: 'E采', sentAt: new Date().toISOString() }
  save(false)
}

function freezeForecastReference() {
  const snapshot = draft.forecastSnapshot
  if (!snapshot || snapshot.frozenAt) return
  draft.forecastSnapshot = { ...snapshot, frozenAt: new Date().toISOString() }
  save()
}

function updateForecastReference(snapshot: ProcurementForecastSnapshot) {
  if (!draft.forecastSnapshot?.frozenAt) draft.forecastSnapshot = snapshot
}
</script>

<template>
  <PageHeader :title="draft.rollingAssessment ? '制定补采方案' : '制定采购方案'">
    <template #actions><ElButton @click="emit('cancel')">返回列表</ElButton></template>
  </PageHeader>

  <div class="procurement-plan-workspace">
    <section class="surface panel demand-panel" aria-labelledby="demand-title">
      <header class="demand-heading">
        <h2 id="demand-title">采购需求</h2>
        <p class="field-note">
          {{ draft.month }} · {{ draft.plant }} ·
          {{ demandSnapshot?.materialName || draft.materialCode }}
        </p>
      </header>
      <dl class="demand-summary">
        <div class="confirmed-demand">
          <dt>预期采购需求量</dt>
          <dd class="demand-quantity">
            {{ confirmedDemandQuantity == null ? '—' : formatQuantity(confirmedDemandQuantity) }}
            {{ draft.unit }}
          </dd>
          <dd v-if="demandSnapshot" class="field-note">来自上一页的需求确认</dd>
        </div>
        <template v-if="demandSnapshot">
          <div>
            <dt>月生产需求总量</dt>
            <dd class="demand-quantity">
              {{ formatQuantity(demandTotals.gross) }} {{ draft.unit }}
            </dd>
          </div>
          <div>
            <dt>现有库存（库存＋在途）</dt>
            <dd class="demand-quantity">
              {{ formatQuantity(demandTotals.stock + demandTotals.inbound) }} {{ draft.unit }}
            </dd>
            <dd class="field-note">
              可用库存 {{ formatQuantity(demandTotals.stock) }} {{ draft.unit }} · 有效在途
              {{ formatQuantity(demandTotals.inbound) }} {{ draft.unit }}
            </dd>
          </div>
        </template>
        <div>
          <dt>{{ demandSnapshot ? '净待采购量' : '待采购量' }}</dt>
          <dd class="demand-quantity">
            {{ demandQuantity == null ? '—' : formatQuantity(demandQuantity) }} {{ draft.unit }}
          </dd>
        </div>
        <div v-if="demandSnapshot">
          <dt>需求版本</dt>
          <dd>{{ demandSnapshot.versionId }}</dd>
          <dd class="field-note">来源 {{ demandSnapshot.planId }}</dd>
        </div>
        <div v-if="draft.demandNote" class="demand-note">
          <dt>需求依据或调整原因</dt>
          <dd>{{ draft.demandNote }}</dd>
        </div>
        <div v-if="draft.rollingAssessment" class="demand-note">
          <dt>需求缺口依据</dt>
          <dd>
            基准方案 {{ draft.rollingAssessment.basePlanNumber }} · 需求版本
            {{ draft.rollingAssessment.latestDemandVersion }} · 来源订单
            {{
              draft.rollingAssessment.affectedOrders.map((order) => order.orderKey).join('、') ||
              '仅需求增量'
            }}
          </dd>
        </div>
      </dl>
      <div v-if="weeklyDemand.length" class="weekly-demand-block">
        <h3>每周生产需求</h3>
        <ul class="weekly-demand">
          <li v-for="week in weeklyDemand" :key="week.startDate">
            <span>{{ week.startDate.slice(5) }} 至 {{ week.endDate.slice(5) }}</span>
            <strong>{{ formatQuantity(week.grossQuantity) }} {{ draft.unit }}</strong>
          </li>
        </ul>
      </div>
    </section>

    <div class="surface panel candidates-panel">
      <ProcurementCandidateCards
        :suppliers="suppliers"
        :excluded-codes="excludedCodes"
        :offers="offers"
        :unit="draft.unit"
        :loading="suppliersLoading"
        :error="sourceError"
        @toggle="toggleSupplier"
      />
      <ElAlert v-if="offerError" :title="offerError" type="warning" :closable="false" />
    </div>

    <section class="surface panel optimization" aria-labelledby="optimization-title">
      <header class="optimization-heading">
        <h2 id="optimization-title">采购求解参数</h2>
        <ElButton @click="futuresOpen = true">{{
          draft.materialCode === 'RM-CORN-STARCH' ? '查看行情与预测' : '查看行情'
        }}</ElButton>
      </header>
      <div class="optimization-controls">
        <div v-for="field in parameterFields" :key="field.key" class="field">
          <label :for="`proc-solve-${field.key}`">{{ field.label }}</label>
          <ElInputNumber
            :id="`proc-solve-${field.key}`"
            v-model="parameters[field.key]"
            :min="field.min"
            :max="'max' in field ? field.max : undefined"
            :step="field.step"
            :precision="field.key === 'minSupplierCount' ? 0 : 2"
            :controls="false"
          />
        </div>
      </div>
      <p class="field-note">采购占比按已确认的预期采购需求量计算。</p>
      <ElAlert
        v-if="optimizationError"
        :title="optimizationError"
        type="error"
        :closable="false"
        show-icon
      />
      <p
        v-else-if="!suppliersLoading && !sourceError && !activeSupplierCodes.length"
        class="field-note"
      >
        至少保留一家供应商参与本方案。
      </p>
      <p
        v-else-if="parameters.minSelectedSupplierShare > parameters.maxSupplierShare"
        class="field-note"
      >
        入选供应商最低占比应小于或等于单家最高占比。
      </p>
      <div class="solve-actions">
        <ElButton type="primary" :disabled="!canOptimize" :loading="optimizing" @click="optimize">
          开始求解
        </ElButton>
      </div>
    </section>

    <div v-if="draft.savedPlans.length" class="surface panel result-panel">
      <ProcurementSavedPlans
        :plans="draft.savedPlans"
        :selected-version="draft.selectedPlanVersion ?? null"
        :unit="draft.unit"
        @select="selectPlan"
      />
      <ElButton
        v-if="selectedPlan && draft.optimizationResult"
        link
        type="primary"
        @click="selectPlan()"
      >
        查看本次求解结果
      </ElButton>
    </div>

    <div v-if="visibleResult" class="surface panel result-panel">
      <ProcurementOptimizationResult
        :result="visibleResult"
        :unit="draft.unit"
        :version="selectedPlan?.version"
      >
        <template #actions>
          <ElButton
            v-if="!selectedPlan && draft.optimizationInput"
            type="primary"
            @click="savePlan"
          >
            保存方案
          </ElButton>
          <ElTag v-else-if="selectedPlan?.dispatch" type="success" effect="plain">
            已模拟下发至 {{ selectedPlan.dispatch.target }}
          </ElTag>
          <ElPopconfirm
            v-else-if="canDispatch"
            :key="selectedPlan?.version"
            :title="`将采购方案 V${selectedPlan?.version} 模拟下发至 E采？`"
            confirm-button-text="确认下发"
            cancel-button-text="取消"
            width="260"
            @confirm="dispatchPlan"
          >
            <template #reference><ElButton type="primary">下发</ElButton></template>
          </ElPopconfirm>
          <ElButton v-else-if="selectedPlan && env.dataSource === 'mock'" disabled>下发</ElButton>
          <span v-else-if="!selectedPlan && !draft.optimizationInput" class="field-note">
            重新求解后可保存为方案版本。
          </span>
        </template>
      </ProcurementOptimizationResult>
    </div>

    <footer class="editor-actions">
      <ElButton @click="save()">保存本地草稿</ElButton>
    </footer>
  </div>

  <ElDialog
    v-model="futuresOpen"
    title="行情与预测参考"
    width="min(960px, 94vw)"
    top="8vh"
    destroy-on-close
    append-to-body
  >
    <ProcurementPriceDecisionPanel
      v-if="draft.materialCode === 'RM-CORN-STARCH'"
      :material-code="draft.materialCode"
      :material-name="demandSnapshot?.materialName ?? draft.materialCode"
      :month="draft.month"
      :unit="draft.unit"
      :snapshot="draft.forecastSnapshot"
      @reference="updateForecastReference"
    />
    <ProcurementFuturesPanel v-else />
    <template #footer>
      <ElButton
        v-if="draft.forecastSnapshot?.forecasts.length && !draft.forecastSnapshot.frozenAt"
        type="primary"
        @click="freezeForecastReference"
      >
        确认引用并保存草稿
      </ElButton>
      <ElButton @click="futuresOpen = false">关闭</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.procurement-plan-workspace,
.optimization {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}
.procurement-plan-workspace {
  grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  align-items: start;
}
.demand-panel,
.result-panel,
.editor-actions {
  grid-column: 1 / -1;
}
.candidates-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}
.panel {
  min-width: 0;
  padding: clamp(14px, 2.5vw, 24px);
}
.demand-panel {
  display: grid;
  gap: 10px;
}
.demand-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}
.demand-heading h2 {
  font-size: 16px;
}
.optimization-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  align-items: center;
}
.optimization-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 142px), 1fr));
  gap: 12px;
}
.optimization-controls .el-input-number {
  width: 100%;
}
.solve-actions .el-button {
  width: 100%;
}
.optimization-heading h2 {
  font-size: 16px;
}
.field-note,
.demand-summary dt {
  color: var(--scos-muted);
  font-size: 13px;
}
.field {
  display: grid;
  gap: 6px;
}
.demand-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
  gap: 8px 16px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 7px;
  background: var(--scos-background);
}
.demand-summary dd {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
}
.demand-quantity {
  font-size: 17px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.confirmed-demand .demand-quantity {
  color: var(--scos-primary);
}
.demand-note {
  grid-column: 1 / -1;
}
.weekly-demand-block {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
}
.weekly-demand-block h3 {
  font-size: 13px;
}
.weekly-demand {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.weekly-demand li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  font-size: 13px;
}
.editor-actions {
  display: flex;
  justify-content: flex-end;
}
@media (max-width: 1120px) {
  .procurement-plan-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
