<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElEmpty, ElPopconfirm, ElTable, ElTableColumn } from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import { env } from '@/shared/config/env'
import { procurementRepository } from '../api/procurement.repository'
import ProcurementFuturesPanel from '../components/ProcurementFuturesPanel.vue'
import ProcurementSalesDemandTable from '../components/ProcurementSalesDemandTable.vue'
import { calculateProcurementNeed, type ProcurementDemandVersion } from '../model/demand'
import { deleteDraft, readDrafts } from '../api/procurement-drafts.local'
import type { ProcurementHistoryRow } from '../model/history'
import type { ProcurementOverview } from '../model/overview'
import type { ProcurementMaterial } from '../model/types'

const cornStarchCode = 'RM-CORN-STARCH'
const drafts = ref(readDrafts())
const materials = ref<ProcurementMaterial[]>([])
const materialCode = ref(cornStarchCode)
const history = ref<ProcurementHistoryRow[]>()
const loading = ref(false)
const loadFailed = ref(false)
const isMock = env.dataSource === 'mock'
const overview = ref<ProcurementOverview>()
const overviewLoading = ref(true)
const overviewFailed = ref(false)
const demandVersions = ref<ProcurementDemandVersion[]>([])
const demandLoading = ref(true)
const demandFailed = ref(false)
const filterMode = ref<'month' | 'range'>('month')
const filterMonth = ref('')
const startDate = ref('')
const endDate = ref('')
const invalidRange = computed(() =>
  Boolean(startDate.value && endDate.value && startDate.value > endDate.value),
)
const hasDateFilter = computed(() =>
  filterMode.value === 'month'
    ? Boolean(filterMonth.value)
    : !invalidRange.value && Boolean(startDate.value || endDate.value),
)
const filteredDrafts = computed(() =>
  drafts.value.filter(
    (row) => matchesMaterial(row.materialCode) && matchesDate(row.month, row.createdOn),
  ),
)
const filteredHistory = computed(() =>
  (history.value ?? []).filter(
    (row) =>
      matchesMaterial(row.materialCode) && matchesDate(row.month, publicationDate(row.publishedAt)),
  ),
)
const materialOptions = computed(() => {
  const options = new Map([[cornStarchCode, '玉米淀粉']])
  for (const material of [
    ...(history.value ?? []),
    ...drafts.value.map((draft) => ({
      materialCode: draft.materialCode,
      materialName: draft.demandSnapshot?.materialName,
    })),
    ...demandVersions.value,
    ...materials.value.map((item) => ({
      materialCode: item.materialCode,
      materialName: item.materialDescription,
    })),
  ]) {
    if (material.materialCode) {
      const code = material.materialCode
      options.set(code, material.materialName || options.get(code) || code)
    }
  }
  return options
})
const shanghaiDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' })
const month = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
}).format(new Date())

function publicationDate(value?: string | null) {
  if (value && /T.+(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const instant = Date.parse(value)
    if (Number.isFinite(instant)) return shanghaiDate.format(instant)
  }
  return value?.match(/^\d{4}-\d{2}-\d{2}(?:$|(?=[T ]))/)?.[0]
}

function matchesDate(planMonth?: string | null, date?: string) {
  if (!hasDateFilter.value) return true
  if (filterMode.value === 'month') return planMonth === filterMonth.value
  return (
    !!date &&
    (!startDate.value || date >= startDate.value) &&
    (!endDate.value || date <= endDate.value)
  )
}

function matchesMaterial(code?: string | null) {
  return !materialCode.value || code === materialCode.value
}

function clearDateFilter() {
  filterMonth.value = ''
  startDate.value = ''
  endDate.value = ''
}

function formatMonth(period: string) {
  const [year, monthNumber] = period.split('-')
  return `${year}年${Number(monthNumber)}月`
}
const monthLabel = formatMonth(month)
const salesMonthLabel = computed(() => formatMonth(overview.value?.demandMonth ?? month))
const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 })
const overviewMaterialCode = computed(() => materialCode.value || cornStarchCode)
const showCornStarchOverview = computed(() => overviewMaterialCode.value === cornStarchCode)
const demandVersion = computed(() =>
  demandVersions.value.find((version) => version.materialCode === overviewMaterialCode.value),
)
const materialLabel = computed(() => materialOptions.value.get(overviewMaterialCode.value))
const grossDemand = computed(() =>
  demandVersion.value?.lines.reduce((total, line) => total + line.grossQuantity, 0),
)
const demandGap = computed(() =>
  demandVersion.value ? calculateProcurementNeed(demandVersion.value).netQuantity : undefined,
)
const createPlanQuery = computed(() => ({
  month,
  plant: demandVersion.value?.plant,
  materialCode: demandVersion.value?.materialCode,
  versionId: demandVersion.value?.versionId,
}))
const demandStatus = computed(() => {
  if (demandLoading.value) return '正在读取已发布需求计划…'
  return demandFailed.value ? '已发布需求计划暂不可用' : '本月暂无已发布需求计划'
})

async function loadDemandVersions() {
  try {
    const published = await procurementRepository.listPublishedDemandVersions(month)
    demandVersions.value = published
      .filter((version) => version.month === month)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  } catch {
    demandFailed.value = true
  } finally {
    demandLoading.value = false
  }
}

async function loadMaterials() {
  materials.value = await procurementRepository.listMaterials().catch(() => [])
}

async function loadOverview() {
  try {
    overview.value = await procurementRepository.getOverview(month)
  } catch {
    overviewFailed.value = true
  } finally {
    overviewLoading.value = false
  }
}

async function loadHistory() {
  loading.value = true
  loadFailed.value = false
  try {
    history.value = await procurementRepository.listHistory()
  } catch {
    history.value = undefined
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

function removeDraft(id: string) {
  drafts.value = deleteDraft(id)
}

onMounted(loadHistory)
onMounted(loadOverview)
onMounted(loadDemandVersions)
onMounted(loadMaterials)
</script>

<template>
  <PageHeader
    class="plans-heading"
    title="采购方案"
    description="查看采购概况、新建采购方案或继续制定草稿。"
  >
    <template #actions>
      <RouterLink :to="{ name: 'procurement-plan-new', query: createPlanQuery }" class="new-plan">
        新建采购方案
      </RouterLink>
    </template>
  </PageHeader>

  <section class="surface date-filter" aria-label="采购方案筛选">
    <div class="date-filter-controls">
      <div class="date-filter-field">
        <label for="procurement-filter-material">原料</label>
        <select id="procurement-filter-material" v-model="materialCode">
          <option v-for="[code, name] in materialOptions" :key="code" :value="code">
            {{ name }}
          </option>
          <option value="">全部原料</option>
        </select>
      </div>
      <fieldset class="date-filter-mode">
        <legend>筛选方式</legend>
        <label
          ><input
            v-model="filterMode"
            name="plan-date-filter"
            type="radio"
            value="month"
          />按月</label
        >
        <label
          ><input
            v-model="filterMode"
            name="plan-date-filter"
            type="radio"
            value="range"
          />日期范围</label
        >
      </fieldset>
      <label v-if="filterMode === 'month'" class="date-filter-field">
        方案月份
        <input v-model="filterMonth" type="month" />
      </label>
      <template v-else>
        <label class="date-filter-field">
          开始日期
          <input v-model="startDate" type="date" :max="endDate || undefined" />
        </label>
        <label class="date-filter-field">
          结束日期
          <input v-model="endDate" type="date" :min="startDate || undefined" />
        </label>
      </template>
      <ElButton :disabled="!filterMonth && !startDate && !endDate" @click="clearDateFilter">
        清除日期
      </ElButton>
    </div>
    <p v-if="filterMode === 'range' && invalidRange" class="date-filter-error" role="alert">
      结束日期不能早于开始日期。
    </p>
    <p v-else-if="filterMode === 'range'" class="date-filter-note">
      本地草稿按创建日期筛选，历史采购方案按发布日期筛选。无日期的记录仅在未限定日期时显示。
    </p>
  </section>

  <section
    v-if="drafts.length || hasDateFilter"
    class="surface plan-panel"
    aria-labelledby="procurement-drafts-title"
  >
    <header class="panel-heading">
      <h2 id="procurement-drafts-title">本地草稿</h2>
    </header>
    <ElTable :data="filteredDrafts" row-key="id" empty-text="没有符合筛选条件的本地草稿">
      <ElTableColumn prop="month" label="方案月份" min-width="105" />
      <ElTableColumn label="创建日期" min-width="115">
        <template #default="{ row }">{{ row.createdOn || '—' }}</template>
      </ElTableColumn>
      <ElTableColumn prop="plant" label="工厂" min-width="100" />
      <ElTableColumn prop="materialCode" label="物料编码" min-width="130" />
      <ElTableColumn prop="demandSnapshot.versionId" label="需求版本" min-width="160" />
      <ElTableColumn prop="demandQuantity" label="待采购量" min-width="105" />
      <ElTableColumn prop="confirmedQuantity" label="预期采购需求量" min-width="125" />
      <ElTableColumn prop="unit" label="计量单位" min-width="90" />
      <ElTableColumn label="操作" width="148">
        <template #default="{ row }">
          <div class="draft-actions">
            <RouterLink class="draft-link" :to="`/procurement/plans/${row.id}`">
              继续制定
            </RouterLink>
            <ElPopconfirm
              title="删除这份草稿？"
              confirm-button-text="删除"
              cancel-button-text="取消"
              confirm-button-type="danger"
              @confirm="removeDraft(row.id)"
            >
              <template #reference><ElButton link type="danger">删除</ElButton></template>
            </ElPopconfirm>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>

  <section class="overview" aria-labelledby="procurement-overview-title">
    <header class="overview-heading">
      <h2 id="procurement-overview-title">采购概况</h2>
    </header>
    <dl class="plans-summary">
      <div class="surface summary-card">
        <dt>本月{{ materialLabel }}采购需求</dt>
        <dd>
          <template v-if="grossDemand != null">
            {{ numberFormat.format(grossDemand) }}
            <span class="metric-unit">{{ demandVersion?.unit }}</span>
          </template>
          <template v-else>—</template>
        </dd>
        <dd class="metric-detail">
          {{ monthLabel }} ·
          {{ demandVersion ? `毛需求 · ${demandVersion.versionId}` : demandStatus }}
        </dd>
      </div>
      <div class="surface summary-card" :class="{ 'gap-card': demandGap != null && demandGap > 0 }">
        <dt>本月{{ materialLabel }}需求缺口</dt>
        <dd>
          <template v-if="demandGap != null">
            {{ numberFormat.format(demandGap) }}
            <span class="metric-unit">{{ demandVersion?.unit }}</span>
          </template>
          <template v-else>—</template>
        </dd>
        <dd class="metric-detail">
          {{ monthLabel }} ·
          {{ demandVersion ? `分期净需求 · ${demandVersion.versionId}` : demandStatus }}
        </dd>
      </div>
      <div v-if="showCornStarchOverview" class="surface summary-card">
        <dt>待排产销售订单</dt>
        <dd>
          <template v-if="overview?.pendingProductionSalesOrderCount != null">
            {{ numberFormat.format(overview.pendingProductionSalesOrderCount) }}
            <span class="metric-unit">单</span>
          </template>
          <template v-else>—</template>
        </dd>
        <dd class="metric-detail">{{ salesMonthLabel }} · SAP 销售订单</dd>
      </div>
      <div v-if="showCornStarchOverview" class="surface summary-card">
        <dt>最新玉米淀粉价格</dt>
        <dd>
          <template v-if="overview?.latestCornStarchPurchasePrice">
            {{ numberFormat.format(overview.latestCornStarchPurchasePrice.unitPrice) }}
            <span class="metric-unit">
              {{
                overview.latestCornStarchPurchasePrice.currency === 'CNY'
                  ? '元'
                  : overview.latestCornStarchPurchasePrice.currency
              }}/{{ overview.latestCornStarchPurchasePrice.unit }}
            </span>
          </template>
          <template v-else>—</template>
        </dd>
        <dd class="metric-detail">
          最近采购订单净价
          <template v-if="overview?.latestCornStarchPurchasePrice">
            · {{ overview.latestCornStarchPurchasePrice.purchaseDate }}
          </template>
        </dd>
      </div>
    </dl>
    <ElAlert
      v-if="showCornStarchOverview && overviewFailed"
      title="采购概况数据暂不可用。"
      type="info"
      :closable="false"
    />
  </section>

  <div v-if="showCornStarchOverview" class="surface futures-panel">
    <ProcurementFuturesPanel />
  </div>

  <ProcurementSalesDemandTable
    v-if="showCornStarchOverview"
    :rows="overview?.salesDemandRows"
    :loading="overviewLoading"
    :error="overviewFailed"
  />
  <section
    class="surface plan-panel"
    aria-labelledby="procurement-history-title"
    :aria-busy="loading"
  >
    <header class="panel-heading">
      <h2 id="procurement-history-title">历史采购方案</h2>
      <ElButton v-if="!isMock" :loading="loading" @click="loadHistory">刷新历史</ElButton>
    </header>
    <ElAlert
      v-if="loadFailed"
      title="历史采购方案加载失败，请刷新重试。"
      type="error"
      :closable="false"
      show-icon
    />
    <ElTable v-else :data="filteredHistory" row-key="planNumber">
      <ElTableColumn prop="planNumber" label="方案编号" min-width="130" />
      <ElTableColumn prop="month" label="方案月份" min-width="105" />
      <ElTableColumn label="发布日期" min-width="115">
        <template #default="{ row }">{{ publicationDate(row.publishedAt) || '—' }}</template>
      </ElTableColumn>
      <ElTableColumn prop="plant" label="工厂" min-width="100" />
      <ElTableColumn prop="materialCode" label="物料编码" min-width="130" />
      <ElTableColumn prop="plannedQuantity" label="计划采购量" min-width="115" />
      <ElTableColumn prop="unit" label="计量单位" min-width="90" />
      <ElTableColumn prop="status" label="状态" min-width="90" />
      <ElTableColumn label="操作" min-width="108">
        <template #default="{ row }">
          <RouterLink
            v-if="row.status === '已发布' || row.status === '已归档'"
            class="draft-link"
            :to="{ name: 'procurement-execution', query: { plan: row.planNumber } }"
            >查看执行</RouterLink
          >
        </template>
      </ElTableColumn>
      <template #empty>
        <ElEmpty
          :description="
            loading
              ? '正在读取历史采购方案…'
              : hasDateFilter || materialCode
                ? '没有符合筛选条件的历史采购方案'
                : '暂无历史采购方案'
          "
          :image-size="64"
        />
      </template>
    </ElTable>
  </section>
</template>

<style scoped>
.plans-heading {
  margin-bottom: 12px;
}

.new-plan {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 15px;
  border-radius: 7px;
  color: white;
  background: var(--scos-primary);
  font-weight: 600;
}

.new-plan:hover {
  background: #096d78;
}

.date-filter {
  margin-bottom: 18px;
  padding: 14px 20px;
}

.date-filter-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 10px 16px;
}

.date-filter-mode {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.date-filter-mode legend,
.date-filter-field {
  color: var(--scos-muted);
  font-size: 13px;
}

.date-filter-mode legend {
  margin-bottom: 4px;
  padding: 0;
}

.date-filter-mode label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  cursor: pointer;
}

.date-filter-mode input {
  margin: 0;
  accent-color: var(--scos-primary);
}

.date-filter-field {
  display: grid;
  gap: 4px;
}

.date-filter-field input,
.date-filter-field select {
  width: 160px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--scos-border);
  border-radius: 6px;
  background: var(--scos-surface);
  color: var(--scos-ink);
}

.date-filter-note,
.date-filter-error {
  margin: 8px 0 0;
  font-size: 13px;
}

.date-filter-note {
  color: var(--scos-muted);
}

.date-filter-error {
  color: var(--el-color-danger);
}

.overview {
  margin-bottom: 20px;
}

.overview-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.overview-heading h2 {
  font-size: 16px;
}

.plans-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: 16px;
  margin: 0;
}

.summary-card {
  padding: 18px 20px;
}

.summary-card dt {
  color: var(--scos-muted);
}

.summary-card dd {
  margin: 6px 0 0;
  font-size: 26px;
  font-weight: 600;
}

.gap-card {
  background: #fff8ee;
  border-color: #edc693;
}

.gap-card dd:not(.metric-detail) {
  color: #9a3d14;
}

.metric-unit,
.summary-card .metric-detail {
  color: var(--scos-muted);
  font-size: 12px;
  font-weight: 400;
}

.overview .el-alert {
  margin-top: 12px;
}

.futures-panel {
  min-width: 0;
  margin-bottom: 20px;
  padding: clamp(12px, 2vw, 24px);
}

.plan-panel {
  overflow: hidden;
  margin-bottom: 18px;
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
}

.panel-heading h2 {
  font-size: 16px;
}

.draft-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.draft-link {
  color: var(--scos-primary);
}

.draft-link:hover {
  text-decoration: underline;
}
</style>
