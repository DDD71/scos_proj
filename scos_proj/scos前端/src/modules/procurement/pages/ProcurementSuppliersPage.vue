<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  ElAlert,
  ElButton,
  ElDialog,
  ElInput,
  ElInputNumber,
  ElOption,
  ElPopover,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import { env } from '@/shared/config/env'
import { procurementRepository } from '../api/procurement.repository'
import ProcurementSupplierProfile from '../components/ProcurementSupplierProfile.vue'
import ProcurementSupplierRiskScore from '../components/ProcurementSupplierRiskScore.vue'
import { getSupplierRegion } from '../model/supplier-region'
import { isRiskSupplier, supplierRiskThreshold } from '../model/supplier-risk'
import { formatSupplierSyncTime } from '../model/supplier-sync'
import type { ProcurementMaterial, ProcurementQuote, ProcurementSupplier } from '../model/types'

const suppliers = ref<ProcurementSupplier[]>([])
const materials = ref<ProcurementMaterial[]>([])
const materialCode = ref('')
const materialsLoading = ref(false)
const materialsLoadFailed = ref(false)
const quotes = ref<ProcurementQuote[]>([])
const quotesLoading = ref(false)
const quotesLoadFailed = ref(false)
const quoteRefresh = ref(0)
const formatNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format
const shanghaiDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' })
const keyword = ref('')
const statusFilter = ref('')
const currencyFilter = ref('')
const regionFilter = ref('')
const minRiskScore = ref<number | null>()
const maxRiskScore = ref<number | null>()
const loading = ref(false)
const loadFailed = ref(false)
const updatingCode = ref<string>()
const updateError = ref('')
const canManageStatus = env.dataSource === 'mock'
const riskEditorOpen = ref(false)
const riskSupplier = ref<ProcurementSupplier>()
const riskScoreDraft = ref<number | null>()
const savingRiskScore = ref(false)
const riskScoreError = ref('')
const profileOpen = ref(false)
const profileSupplierCode = ref<string>()
const profileSupplier = computed(() =>
  suppliers.value.find((supplier) => supplier.supplierCode === profileSupplierCode.value),
)

const materialOptions = computed(() => {
  const byCode = new Map<string, string>()
  for (const material of materials.value) {
    if (!byCode.has(material.materialCode)) {
      byCode.set(material.materialCode, material.materialDescription || material.materialCode)
    }
  }
  return byCode
})

const latestQuotesBySupplier = computed(() => {
  const today = shanghaiDate.format()
  const validQuotes = quotes.value.filter(
    (quote) =>
      quote.materialCode === materialCode.value &&
      quote.validFrom &&
      quote.validTo &&
      quote.validFrom <= today &&
      today <= quote.validTo,
  )
  validQuotes.sort(
    (a, b) =>
      (b.quoteDate ?? '').localeCompare(a.quoteDate ?? '') ||
      (Date.parse(b.syncedAt ?? '') || 0) - (Date.parse(a.syncedAt ?? '') || 0),
  )
  const bySupplier = new Map<string, ProcurementQuote>()
  for (const quote of validQuotes) {
    if (!bySupplier.has(quote.supplierCode)) bySupplier.set(quote.supplierCode, quote)
  }
  return bySupplier
})

const summaryCards = computed(() => [
  { label: '供应商总数', count: suppliers.value.length },
  {
    label: '已启用',
    count: suppliers.value.filter((supplier) => supplier.enabledStatus === '启用').length,
  },
  {
    label: '已停用',
    count: suppliers.value.filter((supplier) => supplier.enabledStatus === '停用').length,
  },
  {
    label: '风险供应商',
    count: suppliers.value.filter((supplier) => isRiskSupplier(supplier.riskScore)).length,
    detail: `综合风险分 < ${supplierRiskThreshold}`,
  },
])

const sortFields = [
  'supplierCode',
  'supplierName',
  'region',
  'enabledStatus',
  'riskScore',
  'paymentTerms',
  'currency',
  'syncedAt',
] as const
type SortField = (typeof sortFields)[number]
type SortOrder = 'ascending' | 'descending'
const sort = ref<{ field: SortField; order: SortOrder }>()
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })
const statuses = computed(() => filterOptions('enabledStatus'))
const currencies = computed(() => filterOptions('currency'))
const regions = computed(() =>
  [...new Set(suppliers.value.map(getSupplierRegion).filter(Boolean))].sort(collator.compare),
)
const invalidRiskRange = computed(
  () =>
    minRiskScore.value != null &&
    maxRiskScore.value != null &&
    minRiskScore.value > maxRiskScore.value,
)

function filterOptions(field: 'enabledStatus' | 'currency') {
  const values = suppliers.value
    .map((supplier) => supplier[field])
    .filter((value): value is string => Boolean(value))
  return [...new Set(values)].sort(collator.compare)
}

const filteredSuppliers = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  const min = minRiskScore.value
  const max = maxRiskScore.value
  return suppliers.value.filter((supplier) => {
    if (
      query &&
      ![supplier.supplierCode, supplier.supplierName].some((value) =>
        value?.toLowerCase().includes(query),
      )
    ) {
      return false
    }
    if (statusFilter.value && supplier.enabledStatus !== statusFilter.value) return false
    if (currencyFilter.value && supplier.currency !== currencyFilter.value) return false
    if (regionFilter.value && getSupplierRegion(supplier) !== regionFilter.value) return false

    const score = supplier.riskScore
    return (
      (min == null || (score != null && score >= min)) &&
      (max == null || (score != null && score <= max))
    )
  })
})

const displayedSuppliers = computed(() => {
  const currentSort = sort.value
  if (!currentSort) return filteredSuppliers.value

  const { field, order } = currentSort
  return [...filteredSuppliers.value].sort((a, b) => {
    const left = sortValue(a, field)
    const right = sortValue(b, field)
    if (left == null || left === '') return right == null || right === '' ? 0 : 1
    if (right == null || right === '') return -1

    const result =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : collator.compare(String(left), String(right))
    return order === 'ascending' ? result : -result
  })
})

const supplierRows = computed(() =>
  displayedSuppliers.value.map((supplier) => {
    const quote = latestQuotesBySupplier.value.get(supplier.supplierCode)
    return {
      ...supplier,
      quote,
      quotePrice: [quote?.unitPrice == null ? '' : formatNumber(quote.unitPrice), quote?.currency]
        .filter(Boolean)
        .join(' '),
      quoteQuantity: quote?.availableQuantity == null ? '—' : formatNumber(quote.availableQuantity),
    }
  }),
)

function sortValue(supplier: ProcurementSupplier, field: SortField) {
  if (field === 'region') return getSupplierRegion(supplier)
  if (field === 'syncedAt') {
    const timestamp = Date.parse(supplier.syncedAt ?? '')
    return Number.isFinite(timestamp) ? timestamp : undefined
  }
  return supplier[field]
}

function changeSort({ prop, order }: { prop: string | null; order: SortOrder | null }) {
  const field = sortFields.find((item) => item === prop)
  sort.value = field && order ? { field, order } : undefined
}

function resetFilters() {
  keyword.value = ''
  statusFilter.value = ''
  currencyFilter.value = ''
  regionFilter.value = ''
  minRiskScore.value = undefined
  maxRiskScore.value = undefined
  materialCode.value = defaultMaterialCode()
}

function defaultMaterialCode() {
  return materialOptions.value.size === 1 ? (materialOptions.value.keys().next().value ?? '') : ''
}

function viewProfile(supplierCode: string) {
  profileSupplierCode.value = supplierCode
  profileOpen.value = true
}

async function loadSuppliers() {
  loading.value = true
  loadFailed.value = false
  updateError.value = ''
  try {
    suppliers.value = await procurementRepository.listSuppliers()
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

async function loadMaterials() {
  materialsLoading.value = true
  materialsLoadFailed.value = false
  try {
    materials.value = await procurementRepository.listMaterials()
    if (!materialOptions.value.has(materialCode.value)) materialCode.value = defaultMaterialCode()
  } catch {
    materialsLoadFailed.value = true
  } finally {
    materialsLoading.value = false
  }
}

function refreshData() {
  void loadSuppliers()
  void loadMaterials()
  quoteRefresh.value++
}

watch([materialCode, quoteRefresh], async ([code], _, onCleanup) => {
  quotes.value = []
  quotesLoadFailed.value = false
  quotesLoading.value = Boolean(code)
  if (!code) return

  let current = true
  onCleanup(() => {
    current = false
  })
  try {
    const result = await procurementRepository.listQuotes(code)
    if (current) quotes.value = result
  } catch {
    if (current) quotesLoadFailed.value = true
  } finally {
    if (current) quotesLoading.value = false
  }
})

async function toggleSupplierStatus(supplierCode: string) {
  const supplier = suppliers.value.find((item) => item.supplierCode === supplierCode)
  if (!supplier) return

  const nextStatus = supplier.enabledStatus === '停用' ? '启用' : '停用'
  updatingCode.value = supplierCode
  updateError.value = ''
  try {
    await procurementRepository.setSupplierStatus(supplierCode, nextStatus)
    supplier.enabledStatus = nextStatus
  } catch {
    updateError.value = '供应商状态更新失败，请重试。'
  } finally {
    updatingCode.value = undefined
  }
}

function editRiskScore(supplierCode: string) {
  const supplier = suppliers.value.find((item) => item.supplierCode === supplierCode)
  if (!supplier) return

  riskSupplier.value = supplier
  riskScoreDraft.value = supplier.riskScore ?? undefined
  riskScoreError.value = ''
  riskEditorOpen.value = true
}

async function saveRiskScore() {
  const supplier = riskSupplier.value
  if (!supplier) return

  const score = riskScoreDraft.value ?? null
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
    riskScoreError.value = '请输入 0 至 100 分。'
    return
  }

  savingRiskScore.value = true
  riskScoreError.value = ''
  try {
    await procurementRepository.setSupplierRiskScore(supplier.supplierCode, score)
    supplier.riskScore = score
    riskEditorOpen.value = false
  } catch {
    riskScoreError.value = '综合风险分保存失败，请重试。'
  } finally {
    savingRiskScore.value = false
  }
}

onMounted(refreshData)
</script>

<template>
  <PageHeader
    title="供应商资料"
    :description="
      env.dataSource === 'mock'
        ? '当前展示 Mock 供应商资料，仅用于演示。'
        : '查看供应商主数据、准入资质、报价与历史供货。'
    "
  >
    <template #actions>
      <ElButton
        :loading="loading || materialsLoading || quotesLoading"
        :disabled="!!updatingCode"
        @click="refreshData"
      >
        刷新数据
      </ElButton>
    </template>
  </PageHeader>

  <dl class="supplier-summary" aria-label="供应商统计" :aria-busy="loading">
    <div v-for="card in summaryCards" :key="card.label" class="surface summary-card">
      <dt>{{ card.label }}</dt>
      <dd>{{ loading || loadFailed ? '—' : card.count }}</dd>
      <dd v-if="card.detail" class="summary-detail">{{ card.detail }}</dd>
    </div>
  </dl>

  <section class="surface supplier-panel" aria-label="供应商清单" :aria-busy="loading">
    <div class="supplier-filters" role="group" aria-label="供应商筛选">
      <div class="supplier-filter supplier-search">
        <label for="supplier-keyword">搜索供应商</label>
        <ElInput id="supplier-keyword" v-model="keyword" placeholder="供应商编码或名称" clearable />
      </div>
      <div class="supplier-filter supplier-material">
        <label for="supplier-material-filter">报价物料</label>
        <ElSelect
          id="supplier-material-filter"
          v-model="materialCode"
          :loading="materialsLoading"
          placeholder="选择物料查看报价"
          filterable
          clearable
        >
          <ElOption
            v-for="[code, name] in materialOptions"
            :key="code"
            :label="name === code ? code : `${name} · ${code}`"
            :value="code"
          />
        </ElSelect>
      </div>
      <div class="supplier-filter">
        <label for="supplier-status-filter">启用状态</label>
        <ElSelect
          id="supplier-status-filter"
          v-model="statusFilter"
          placeholder="全部状态"
          clearable
        >
          <ElOption v-for="status in statuses" :key="status" :label="status" :value="status" />
        </ElSelect>
      </div>
      <div class="supplier-filter">
        <label for="supplier-region-filter">区域</label>
        <ElSelect
          id="supplier-region-filter"
          v-model="regionFilter"
          placeholder="全部区域"
          clearable
        >
          <ElOption v-for="region in regions" :key="region" :label="region" :value="region" />
        </ElSelect>
      </div>
      <div class="supplier-filter">
        <label for="supplier-currency-filter">币种</label>
        <ElSelect
          id="supplier-currency-filter"
          v-model="currencyFilter"
          placeholder="全部币种"
          clearable
        >
          <ElOption
            v-for="currency in currencies"
            :key="currency"
            :label="currency"
            :value="currency"
          />
        </ElSelect>
      </div>
      <div class="supplier-filter">
        <span id="supplier-risk-range-label">综合风险分</span>
        <div class="supplier-risk-range" role="group" aria-labelledby="supplier-risk-range-label">
          <ElInputNumber
            v-model="minRiskScore"
            aria-label="最低风险分"
            placeholder="最低"
            :min="0"
            :max="100"
            :controls="false"
          />
          <span aria-hidden="true">至</span>
          <ElInputNumber
            v-model="maxRiskScore"
            aria-label="最高风险分"
            placeholder="最高"
            :min="0"
            :max="100"
            :controls="false"
          />
        </div>
      </div>
      <ElButton @click="resetFilters">重置筛选</ElButton>
    </div>
    <p v-if="invalidRiskRange" class="risk-filter-error" role="status">
      最低风险分不能高于最高风险分。
    </p>
    <p v-if="!loading && !loadFailed" class="supplier-result-count" aria-live="polite">
      当前显示 {{ filteredSuppliers.length }} 家供应商
    </p>

    <ElAlert v-if="updateError" :title="updateError" type="error" :closable="false" show-icon />
    <ElAlert
      v-if="materialsLoadFailed || quotesLoadFailed"
      :title="materialsLoadFailed ? '报价物料加载失败，请刷新数据。' : '报价加载失败，请刷新数据。'"
      type="warning"
      :closable="false"
      show-icon
    />
    <ElAlert
      v-if="loadFailed"
      title="供应商资料加载失败，请刷新重试。"
      type="error"
      :closable="false"
      show-icon
    />
    <ElTable
      v-else
      :data="supplierRows"
      row-key="supplierCode"
      :empty-text="
        loading ? '正在读取供应商资料…' : suppliers.length ? '没有匹配的供应商' : '暂无供应商资料'
      "
      @sort-change="changeSort"
    >
      <ElTableColumn prop="supplierCode" label="供应商编码" min-width="130" sortable="custom" />
      <ElTableColumn prop="supplierName" label="供应商名称" min-width="220" sortable="custom" />
      <ElTableColumn v-if="materialCode" label="有效报价" min-width="145" align="right">
        <template #default="{ row }">
          <span v-if="quotesLoading" class="supplier-muted">读取中…</span>
          <span v-else-if="row.quote?.unitPrice != null">
            {{ row.quotePrice }}{{ row.quote.pricingUnit ? ' / ' + row.quote.pricingUnit : '' }}
          </span>
          <span v-else class="supplier-muted">
            {{ quotesLoadFailed || row.quote ? '—' : '暂无有效报价' }}
          </span>
        </template>
      </ElTableColumn>
      <ElTableColumn v-if="materialCode" label="可供量" min-width="100" align="right">
        <template #default="{ row }">
          <span v-if="quotesLoading" class="supplier-muted">读取中…</span>
          <span v-else-if="row.quote?.availableQuantity != null">{{ row.quoteQuantity }}</span>
          <span v-else class="supplier-muted">—</span>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="syncedAt" label="主数据最近同步" min-width="166" sortable="custom">
        <template #default="{ row }">{{ formatSupplierSyncTime(row.syncedAt) }}</template>
      </ElTableColumn>
      <ElTableColumn prop="region" label="区域" min-width="110" sortable="custom">
        <template #default="{ row }">{{ getSupplierRegion(row) || '—' }}</template>
      </ElTableColumn>
      <ElTableColumn prop="enabledStatus" label="启用状态" min-width="126" sortable="custom">
        <template #default="{ row }">
          <ElTag :type="row.enabledStatus === '启用' ? 'success' : 'info'" effect="plain">
            {{ row.enabledStatus || '—' }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="riskScore" label="综合风险分" min-width="150" sortable="custom">
        <template #header>
          <span class="risk-score-header">
            综合风险分
            <ElPopover placement="bottom" trigger="click" :width="320">
              <template #reference>
                <button type="button" class="risk-help" aria-label="综合风险分说明" @click.stop>
                  ?
                </button>
              </template>
              <div class="risk-help-content">
                <strong>综合风险分（人工维护）</strong>
                <p>
                  满分 100 分。质量不合格、交付逾期、供货不足或违规时扣分，最低 0 分。 低于
                  {{ supplierRiskThreshold }} 分触发预警。
                </p>
                <p>参考公式＝100 − 质量扣分 − 交付扣分 − 供货扣分 − 违规扣分。</p>
                <ul>
                  <li>质量扣分＝40% ×（100 − 质量合格率）。</li>
                  <li>交付扣分＝40% ×（100 − 准时交付率）。</li>
                  <li>供货扣分＝20% ×（100 − 供货达成率）。</li>
                  <li>违规扣分由采购人员按同一评价周期内已确认的违规事项评定。</li>
                </ul>
                <p>
                  各率按 0–100 代入。例如三项分别为 98、90、95，无违规扣分时得 94.2
                  分。最终得分由采购人员录入，数据不足可留空。
                </p>
              </div>
            </ElPopover>
          </span>
        </template>
        <template #default="{ row }">
          <span class="supplier-cell-actions">
            <ProcurementSupplierRiskScore :score="row.riskScore" />
            <ElButton
              v-if="canManageStatus"
              class="supplier-edit-score"
              link
              type="primary"
              title="编辑风险分"
              aria-label="编辑风险分"
              :disabled="loading"
              @click="editRiskScore(row.supplierCode)"
            >
              <span aria-hidden="true">✎</span>
            </ElButton>
          </span>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="paymentTerms" label="付款账期" min-width="110" sortable="custom" />
      <ElTableColumn prop="currency" label="币种" min-width="90" sortable="custom" />
      <ElTableColumn label="操作" :width="canManageStatus ? 142 : 100" fixed="right">
        <template #default="{ row }">
          <span class="supplier-cell-actions">
            <ElButton link type="primary" @click="viewProfile(row.supplierCode)">查看详情</ElButton>
            <ElButton
              v-if="canManageStatus"
              link
              :type="row.enabledStatus === '停用' ? 'primary' : 'danger'"
              :loading="updatingCode === row.supplierCode"
              :disabled="loading || !!updatingCode"
              @click="toggleSupplierStatus(row.supplierCode)"
            >
              {{ row.enabledStatus === '停用' ? '启用' : '停用' }}
            </ElButton>
          </span>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>

  <ElDialog
    v-model="profileOpen"
    :title="`供应商详情 · ${profileSupplier?.supplierName || profileSupplier?.supplierCode || ''}`"
    width="min(1120px, 94vw)"
    destroy-on-close
  >
    <ProcurementSupplierProfile
      v-if="profileSupplier"
      :key="profileSupplier.supplierCode"
      :supplier="profileSupplier"
      @qualification-saved="profileSupplier.qualificationExpiry = $event"
    />
  </ElDialog>

  <ElDialog v-model="riskEditorOpen" title="编辑综合风险分" width="min(420px, 90vw)">
    <form class="risk-editor" @submit.prevent="saveRiskScore">
      <p>{{ riskSupplier?.supplierName || riskSupplier?.supplierCode }}</p>
      <label for="supplier-risk-score">综合风险分（0–100）</label>
      <ElInputNumber
        id="supplier-risk-score"
        v-model="riskScoreDraft"
        :controls="false"
        placeholder="留空表示待维护"
      />
      <ElAlert
        v-if="riskScoreError"
        :title="riskScoreError"
        type="error"
        :closable="false"
        show-icon
      />
      <div class="risk-editor-actions">
        <ElButton native-type="button" @click="riskEditorOpen = false">取消</ElButton>
        <ElButton type="primary" native-type="submit" :loading="savingRiskScore">保存</ElButton>
      </div>
    </form>
  </ElDialog>
</template>

<style scoped>
.supplier-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: 12px;
  margin: 0 0 16px;
}

.summary-card {
  padding: 16px 20px;
}

.summary-card dt,
.summary-detail,
.supplier-result-count {
  color: var(--scos-muted);
}

.summary-card dd {
  margin: 6px 0 0;
  font-size: 26px;
  font-weight: 600;
}

.summary-card .summary-detail,
.supplier-result-count {
  font-size: 12px;
}

.summary-card .summary-detail {
  font-weight: 400;
}

.supplier-result-count {
  margin-bottom: 8px;
}

.supplier-panel {
  padding: 20px;
}

.supplier-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
  margin-bottom: 16px;
}

.supplier-filter {
  display: grid;
  gap: 8px;
  min-width: 108px;
}

.supplier-search {
  flex: 1 1 200px;
  max-width: 320px;
}

.supplier-material {
  width: 216px;
}

.supplier-muted {
  color: var(--scos-muted);
}

.supplier-risk-range {
  display: flex;
  align-items: center;
  gap: 6px;
}

.supplier-risk-range .el-input-number {
  width: 72px;
}

.risk-filter-error {
  margin-bottom: 12px;
  color: var(--el-color-danger);
}

.risk-score-header {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.supplier-cell-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.supplier-edit-score {
  min-width: 24px;
  min-height: 24px;
  font-size: 17px;
}

.risk-help {
  width: 17px;
  height: 17px;
  padding: 0;
  border: 1px solid currentColor;
  border-radius: 50%;
  background: transparent;
  color: var(--scos-primary);
  cursor: pointer;
  line-height: 1;
}

.risk-help-content {
  line-height: 1.65;
}

.risk-help-content p,
.risk-help-content ul {
  margin: 6px 0 0;
}

.risk-help-content ul {
  padding-left: 18px;
}

.risk-editor {
  display: grid;
  gap: 10px;
}

.risk-editor-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
</style>
