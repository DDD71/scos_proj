<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  ElAlert,
  ElButton,
  ElDrawer,
  ElEmpty,
  ElPopconfirm,
  ElSkeleton,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import { env } from '@/shared/config/env'
import { listRequisitionCoordination } from '../api/requisition-operations'
import {
  deleteRequisitionDraft,
  listRequisitionDrafts,
  type RequisitionDraft,
} from '../api/requisition-drafts.local'
import {
  getRequisitionSnapshot,
  listRequisitionExecutionPlans,
} from '../api/requisition.repository'
import RequisitionCoordinationDrawer from '../components/RequisitionCoordinationDrawer.vue'
import { requisitionExecutionCause } from '../domain/operations'
import {
  firstCompleteRequisitionWeek,
  projectRequisition,
  requisitionWeekDates,
} from '../domain/plan'
import type { RequisitionExecutionPlan } from '../model/execution'
import type { RequisitionIssueContext } from '../model/operations'
import type { RequisitionDailyProjection, RequisitionSnapshot } from '../model/types'

const snapshot = ref<RequisitionSnapshot>()
const loading = ref(true)
const loadError = ref('')
const arrivalDetailsOpen = ref(false)
const arrivalDate = ref('')
const inventoryPanel = ref<HTMLElement>()
const drafts = ref(listRequisitionDrafts())
const publishedPlans = ref<RequisitionExecutionPlan[]>([])
const coordinationRecords = ref<Awaited<ReturnType<typeof listRequisitionCoordination>>>([])
const coordination = ref<RequisitionIssueContext>()
const route = useRoute()
const week = ref(typeof route.query.week === 'string' ? route.query.week : '')
const materialCode = ref(
  typeof route.query.materialCode === 'string' ? route.query.materialCode : '',
)
const cornStarchCode = 'RM-CORN-STARCH'
const isMock = env.dataSource === 'mock'
const formatQuantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format
const formatSavedAt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  dateStyle: 'short',
  timeStyle: 'short',
})

function mondayOf(date: string) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day.toISOString().slice(0, 10)
}

const weeks = computed(() => {
  if (!snapshot.value) return []
  const { startDate, materials } = snapshot.value
  const dates = new Set(
    materials.flatMap((item) => Object.keys(item.dailyDemand)).filter((date) => date >= startDate),
  )
  return [...new Set([...dates].map(mondayOf))].sort().map((start) => {
    const days = requisitionWeekDates(start)
    return { start, days, full: days.every((date) => dates.has(date)) }
  })
})
const currentWeek = computed(() => weeks.value.find(({ start }) => start === week.value))
const materials = computed(() => snapshot.value?.materials ?? [])
const selectedMaterial = computed(() =>
  materials.value.find((material) => material.code === materialCode.value),
)
const publishedPlan = computed(() =>
  publishedPlans.value.find(
    ({ source }) => source?.weekStart === week.value && source.materialCode === materialCode.value,
  ),
)
const quantity = (amount: number | null | undefined, unit = '') =>
  amount == null ? '—' : [formatQuantity(amount), unit].filter(Boolean).join(' ')
const draftRows = computed(() =>
  drafts.value.map((draft) => {
    const material = materials.value.find(({ code }) => code === draft.materialCode)
    return {
      ...draft,
      id: `${draft.weekStart}.${draft.materialCode}`,
      weekEnd: requisitionWeekDates(draft.weekStart).at(-1),
      materialName: material?.name ?? draft.materialCode,
      suggestedQuantity: quantity(
        draft.suggestions.reduce((sum, row) => sum + row.quantity, 0),
        material?.unit,
      ),
      updatedAt: formatSavedAt.format(new Date(draft.savedAt)),
    }
  }),
)
const activeDraft = computed(() =>
  draftRows.value.find(
    (draft) => draft.weekStart === week.value && draft.materialCode === materialCode.value,
  ),
)

function removeDraft(draft: RequisitionDraft) {
  deleteRequisitionDraft(draft.weekStart, draft.materialCode)
  drafts.value = listRequisitionDrafts()
}

const fixedArrivals = computed(
  () => snapshot.value?.fixedArrivals.filter((row) => row.status !== '建议') ?? [],
)
const weeklyArrivalRows = computed(() => {
  const dates = new Set(currentWeek.value?.days ?? [])
  return fixedArrivals.value.filter((row) => dates.has(row.date))
})
const selectedArrivalRows = computed(() =>
  weeklyArrivalRows.value.filter((row) => row.materialCode === materialCode.value),
)
const arrivalDetails = computed(() =>
  arrivalDate.value
    ? selectedArrivalRows.value.filter((row) => row.date === arrivalDate.value)
    : selectedArrivalRows.value,
)
const projections = computed(() => {
  if (!snapshot.value || !currentWeek.value) return []
  const { materials, startDate } = snapshot.value
  const { days } = currentWeek.value
  return materials.map((material) => ({
    material,
    days: projectRequisition(material, startDate, days, fixedArrivals.value),
  }))
})
const selectedInventory = computed(
  () => projections.value.find(({ material }) => material.code === materialCode.value)?.days ?? [],
)

function weekTotal(days: RequisitionDailyProjection[], key: 'demand' | 'fixedArrival') {
  if (!days.length) return null
  let total = 0
  for (const day of days) {
    const value = day[key]
    if (value == null) return null
    total += value
  }
  return total
}

const auxiliaryInventory = computed(() =>
  projections.value
    .filter(({ material }) => material.category !== '原料')
    .map(({ material, days }) => ({
      material,
      demand: weekTotal(days, 'demand'),
      arrivals: weekTotal(days, 'fixedArrival'),
      earliestGap: days.find(({ shortage }) => (shortage ?? 0) > 0)?.date,
      hasUnknownDays: days.some(({ shortage }) => shortage == null),
    })),
)
const shortageProjections = computed(() =>
  projections.value.filter(({ days }) => days.some(({ shortage }) => (shortage ?? 0) > 0)),
)
const firstRisk = computed(
  () =>
    shortageProjections.value
      .flatMap(({ material, days }) => {
        const risk = days.find(({ shortage }) => (shortage ?? 0) > 0)
        return risk ? [{ material, risk }] : []
      })
      .sort((first, second) => first.risk.date.localeCompare(second.risk.date))[0],
)
const relatedExecution = computed(() => {
  const days = new Set(currentWeek.value?.days)
  return publishedPlans.value.flatMap((plan) =>
    plan.rows
      .filter((row) => days.has(row.plannedDate) || days.has(row.estimatedArrivalDate ?? ''))
      .map((row) => ({ planId: plan.id, row })),
  )
})
const dispatchTasks = computed(() =>
  relatedExecution.value.filter(({ row }) => row.releaseStatus === '待下达'),
)
const unresolvedExceptions = computed(() =>
  relatedExecution.value
    .map(({ planId, row }) => ({ planId, row, cause: requisitionExecutionCause(row) }))
    .filter(
      ({ row, cause }) =>
        cause &&
        !coordinationRecords.value.some(
          ({ executionRowId, status }) => executionRowId === row.id && status === '已关闭',
        ),
    ),
)
const openCoordinationRecords = computed(() =>
  coordinationRecords.value.filter(
    ({ status, weekStart }) => status !== '已关闭' && weekStart === week.value,
  ),
)
const coordinationCanClose = computed(() =>
  Boolean(coordination.value?.riskKnown && !coordination.value.riskDate),
)

function reviewCoordination(context: RequisitionIssueContext) {
  const days =
    projections.value.find(({ material }) => material.code === context.materialCode)?.days ?? []
  const firstGap = days.find(({ shortage }) => (shortage ?? 0) > 0)
  coordination.value = {
    ...context,
    riskDate: firstGap?.date,
    shortage: firstGap?.shortage ?? undefined,
    riskKnown: days.length > 0 && days.every(({ shortage }) => shortage != null),
  }
}
const inventorySnapshotTime = computed(() => displayTime(snapshot.value?.inventorySnapshotTime))

function displayTime(value?: string) {
  return value?.replace('T', ' ').slice(0, 16) ?? '—'
}

const metrics = computed(() => {
  const material = selectedMaterial.value
  const unit = material?.unit
  const days = selectedInventory.value
  const firstGap = days.find(({ shortage }) => (shortage ?? 0) > 0)
  const incomplete = !days.length || days.some(({ shortage }) => shortage == null)
  return [
    {
      label: `可用${material?.category ?? '原料'}库存`,
      value: quantity(material?.availableStock, unit),
      detail: `来源 WMS 库存查询 · ${inventorySnapshotTime.value}`,
    },
    {
      label: '本周生产耗用',
      value: quantity(weekTotal(days, 'demand'), unit),
      detail: material?.demandSource ?? '待补充需求来源',
    },
    {
      label: '在途原料',
      value: quantity(weekTotal(days, 'fixedArrival'), unit),
      detail: '本周 · 已确认、已下达和运输中',
    },
    {
      label: '生产缺口',
      value: quantity(firstGap?.shortage ?? (incomplete ? null : 0), unit),
      detail: firstGap
        ? `最早缺口日期 ${firstGap.date} · 当日缺口`
        : incomplete
          ? '日期数据待补充'
          : '本周预计无缺口',
      highlight: Boolean(firstGap),
    },
  ]
})
const inventoryColumns = [
  { key: 'openingStock', label: '期初可用' },
  { key: 'demand', label: '生产耗用' },
  { key: 'fixedArrival', label: '固定到货' },
  { key: 'closingStock', label: '预计期末可用' },
  { key: 'shortage', label: '预计缺料量' },
] as const

function showArrivals(date = '') {
  arrivalDate.value = date
  arrivalDetailsOpen.value = true
}

async function showMaterial(code: string) {
  materialCode.value = code
  await nextTick()
  inventoryPanel.value?.focus()
}

async function loadSnapshot() {
  loading.value = true
  loadError.value = ''
  try {
    const [data, plans] = await Promise.all([
      getRequisitionSnapshot(),
      listRequisitionExecutionPlans(),
    ])
    snapshot.value = data
    publishedPlans.value = plans
    coordinationRecords.value = await listRequisitionCoordination()
    if (!weeks.value.some(({ start }) => start === week.value)) {
      const firstWeek = firstCompleteRequisitionWeek(snapshot.value.startDate)
      week.value =
        weeks.value.find(({ full, start }) => full && start >= firstWeek)?.start ??
        weeks.value[0]?.start ??
        ''
    }
    if (!materials.value.some(({ code }) => code === materialCode.value)) {
      materialCode.value =
        materials.value.find(({ code }) => code === cornStarchCode)?.code ??
        materials.value[0]?.code ??
        ''
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '要货数据加载失败，请刷新重试。'
  } finally {
    loading.value = false
  }
}

onMounted(loadSnapshot)
</script>

<template>
  <PageHeader title="要货概览" description="按周查看原辅包库存、到货和生产缺口。">
    <template #actions>
      <ElButton :loading="loading" @click="loadSnapshot">刷新数据</ElButton>
    </template>
  </PageHeader>

  <ElAlert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon />
  <ElSkeleton v-else-if="loading" :rows="5" animated />
  <ElEmpty v-else-if="!currentWeek" class="surface" description="暂无可用的周度需求与库存数据" />
  <template v-else>
    <section class="surface overview-filter" aria-label="要货筛选">
      <div class="filter-field">
        <label for="requisition-overview-week">计划周</label>
        <select id="requisition-overview-week" v-model="week">
          <option v-for="option in weeks" :key="option.start" :value="option.start">
            {{ option.start }} 至 {{ option.days[option.days.length - 1] }}
          </option>
        </select>
      </div>
      <div class="filter-field">
        <label for="requisition-overview-material">物料</label>
        <select
          id="requisition-overview-material"
          v-model="materialCode"
          :disabled="!materials.length"
        >
          <option v-if="!materials.length" value="">暂无物料记录</option>
          <option v-for="item in materials" :key="item.code" :value="item.code">
            {{ item.name }} · {{ item.code }}
          </option>
        </select>
      </div>
      <div class="source">
        <ElTag v-if="isMock" type="info" effect="plain">演示数据</ElTag>
        <span>{{ snapshot?.plant }} · 计算快照 {{ displayTime(snapshot?.snapshotTime) }}</span>
      </div>
    </section>

    <section class="surface overview-tasks" aria-labelledby="requisition-tasks">
      <div class="task-heading">
        <h2 id="requisition-tasks">每日要货待办</h2>
        <span class="secondary">按所选计划周汇总</span>
      </div>
      <div class="task-grid">
        <div class="task-item">
          <strong>待下达 · {{ dispatchTasks.length }} 批</strong>
          <RouterLink
            v-for="{ planId, row } in dispatchTasks.slice(0, 3)"
            :key="row.id"
            :to="{
              name: 'requisition-execution',
              query: { planId, rowId: row.id },
            }"
            >{{ row.materialName }} · {{ row.plannedDate }} →</RouterLink
          >
          <span v-if="!dispatchTasks.length" class="secondary">当前无待下达批次</span>
        </div>
        <div class="task-item">
          <strong>最早缺料</strong>
          <RouterLink
            v-if="firstRisk"
            :to="{
              name: 'requisition-planning',
              query: { week, materialCode: firstRisk.material.code, riskDate: firstRisk.risk.date },
            }"
            >{{ firstRisk.material.name }} · {{ firstRisk.risk.date }} ·
            {{ quantity(firstRisk.risk.shortage, firstRisk.material.unit) }} →</RouterLink
          >
          <span v-else class="secondary">
            {{
              projections.some(({ days }) => days.some(({ shortage }) => shortage == null))
                ? '部分物料待补充数据'
                : '当前无需新增要货'
            }}
          </span>
        </div>
        <div class="task-item">
          <strong>待处理执行偏差 · {{ unresolvedExceptions.length }} 条</strong>
          <RouterLink
            v-for="{ planId, row, cause } in unresolvedExceptions.slice(0, 3)"
            :key="row.id"
            :to="{ name: 'requisition-execution', query: { planId, rowId: row.id } }"
            >{{ row.materialName }} · {{ row.plannedDate }} · {{ cause }} →</RouterLink
          >
          <span v-if="!unresolvedExceptions.length" class="secondary">当前无待处理执行偏差</span>
          <RouterLink
            v-if="unresolvedExceptions.length > 3"
            :to="{ name: 'requisition-execution', query: { exceptions: '1' } }"
            >查看执行异常</RouterLink
          >
        </div>
      </div>
      <ul v-if="openCoordinationRecords.length" class="task-coordination">
        <li v-for="item in openCoordinationRecords" :key="item.id">
          <span
            >{{ item.materialName }} · {{ item.direction }} · {{ item.owner }} ·
            {{ item.status }}</span
          >
          <ElButton link type="primary" @click="reviewCoordination(item)">复核协调结果</ElButton>
        </li>
      </ul>
    </section>

    <dl class="overview-metrics" aria-label="周度要货指标">
      <div v-for="metric in metrics" :key="metric.label" class="surface metric">
        <dt>{{ metric.label }}</dt>
        <dd class="metric-value" :class="{ shortage: metric.highlight }">
          <ElButton
            v-if="metric.label === '在途原料' && selectedArrivalRows.length"
            link
            type="primary"
            class="metric-link"
            aria-label="查看在途原料明细"
            @click="showArrivals()"
            >{{ metric.value }}</ElButton
          >
          <template v-else>{{ metric.value }}</template>
        </dd>
        <dd class="secondary">{{ metric.detail }}</dd>
      </div>
    </dl>

    <section class="surface plan-entry" aria-labelledby="weekly-plan-title">
      <header class="plan-entry-header">
        <div>
          <h2 id="weekly-plan-title">周度要货计划</h2>
          <p class="secondary">
            {{ currentWeek.start }} 至 {{ currentWeek.days[currentWeek.days.length - 1] }}
            <template v-if="selectedMaterial"> · {{ selectedMaterial.name }}</template>
          </p>
          <p class="secondary">本周全部物料 · 预计缺料 {{ shortageProjections.length }} 种</p>
        </div>
        <div class="plan-entry-actions">
          <RouterLink
            v-if="activeDraft"
            class="draft-link"
            :to="{ name: 'requisition-planning', query: { week, materialCode } }"
            >继续草稿</RouterLink
          >
          <RouterLink
            v-if="publishedPlan"
            class="draft-link"
            :to="{ name: 'requisition-execution', query: { planId: publishedPlan.id } }"
          >
            查看下达与执行
          </RouterLink>
          <RouterLink
            v-if="selectedMaterial"
            class="plan-link"
            :to="{ name: 'requisition-planning', query: { week, materialCode, mode: 'new' } }"
          >
            {{ publishedPlan ? '补充要货' : '新建周度要货计划' }}
          </RouterLink>
        </div>
      </header>

      <section
        v-if="draftRows.length"
        class="plan-drafts"
        aria-labelledby="requisition-drafts-title"
      >
        <h3 id="requisition-drafts-title">本地草稿</h3>
        <ElTable :data="draftRows" row-key="id" size="small">
          <ElTableColumn label="计划周" min-width="202">
            <template #default="{ row }">{{ row.weekStart }} 至 {{ row.weekEnd }}</template>
          </ElTableColumn>
          <ElTableColumn label="物料" min-width="142">
            <template #default="{ row }">
              {{ row.materialName }}
              <div v-if="row.materialName !== row.materialCode" class="secondary">
                {{ row.materialCode }}
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn
            prop="suggestedQuantity"
            label="建议到货量"
            min-width="106"
            align="right"
          />
          <ElTableColumn prop="updatedAt" label="最后保存" min-width="140" />
          <ElTableColumn label="操作" min-width="140">
            <template #default="{ row }">
              <div class="draft-actions">
                <RouterLink
                  class="draft-link"
                  :to="{
                    name: 'requisition-planning',
                    query: { week: row.weekStart, materialCode: row.materialCode },
                  }"
                  >继续编辑</RouterLink
                >
                <ElPopconfirm
                  title="删除这份要货草稿？"
                  confirm-button-text="确认删除"
                  confirm-button-type="danger"
                  cancel-button-text="取消"
                  @confirm="removeDraft(row as RequisitionDraft)"
                >
                  <template #reference><ElButton link type="danger">删除</ElButton></template>
                </ElPopconfirm>
              </div>
            </template>
          </ElTableColumn>
        </ElTable>
      </section>
    </section>

    <section
      ref="inventoryPanel"
      class="surface inventory-panel"
      aria-labelledby="requisition-inventory-title"
      tabindex="-1"
    >
      <header class="panel-heading">
        <div>
          <h2 id="requisition-inventory-title">
            {{ selectedMaterial?.category ?? '原料' }}库存与耗用推演
          </h2>
          <p v-if="selectedMaterial" class="secondary">
            {{ selectedMaterial.name }} · {{ selectedMaterial.code }} ·
            {{ selectedMaterial.category }} · 单位 {{ selectedMaterial.unit }} · 需求
            {{ snapshot?.demandVersion }}
          </p>
          <p class="secondary">
            库存来源为 WMS 库存查询（#124）的「可用数量」。
            <template v-if="isMock"
              >有质检反馈时按放行量及放行日计算。普通预计到货按到厂当日可用演示。</template
            >
          </p>
        </div>
      </header>
      <ElTable
        :data="selectedInventory"
        row-key="date"
        empty-text="暂无该物料的库存推演"
        size="small"
      >
        <ElTableColumn prop="date" label="日期" min-width="102" />
        <ElTableColumn
          v-for="{ key, label } in inventoryColumns"
          :key="key"
          :label="label"
          min-width="88"
          align="right"
        >
          <template #default="{ row }">
            <ElButton
              v-if="key === 'fixedArrival' && row.fixedArrival > 0"
              link
              type="primary"
              :aria-label="`查看 ${row.date} 固定到货明细`"
              @click="showArrivals(row.date)"
              >{{ quantity(row.fixedArrival) }}</ElButton
            >
            <span
              v-else
              :class="{
                shortage:
                  (key === 'shortage' && row.shortage > 0) ||
                  (key === 'closingStock' && row.closingStock < 0),
              }"
            >
              {{ quantity(row[key]) }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="预计生产状态" min-width="108" align="center">
          <template #default="{ row }">
            <span v-if="row.closingStock == null" class="secondary">待补充</span>
            <ElTag
              v-else
              :type="row.closingStock <= 0 ? 'danger' : 'success'"
              effect="light"
              size="small"
            >
              {{ row.closingStock <= 0 ? '异常' : '正常' }}
            </ElTag>
          </template>
        </ElTableColumn>
      </ElTable>
    </section>

    <section class="surface inventory-panel" aria-labelledby="requisition-aux-inventory-title">
      <header class="panel-heading">
        <div>
          <h2 id="requisition-aux-inventory-title">辅料与包材</h2>
          <p class="secondary">正式 WMS 接口的辅料、包材库存覆盖待确认。点击物料可查看逐日推演。</p>
        </div>
      </header>
      <ElTable
        :data="auxiliaryInventory"
        row-key="material.code"
        empty-text="暂无辅料与包材库存"
        size="small"
      >
        <ElTableColumn label="物料" min-width="155">
          <template #default="{ row }">
            <ElButton link type="primary" @click="showMaterial(row.material.code)">{{
              row.material.name
            }}</ElButton>
            <div class="secondary">{{ row.material.code }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="material.category" label="类别" min-width="64" />
        <ElTableColumn prop="material.unit" label="单位" min-width="64" />
        <ElTableColumn label="快照可用库存" min-width="116" align="right">
          <template #default="{ row }">{{ quantity(row.material.availableStock) }}</template>
        </ElTableColumn>
        <ElTableColumn label="本周耗用" min-width="92" align="right">
          <template #default="{ row }">{{ quantity(row.demand) }}</template>
        </ElTableColumn>
        <ElTableColumn label="本周在途量" min-width="116" align="right">
          <template #default="{ row }">{{ quantity(row.arrivals) }}</template>
        </ElTableColumn>
        <ElTableColumn label="最早预计缺料" min-width="114">
          <template #default="{ row }">
            <span v-if="row.earliestGap" class="shortage">{{ row.earliestGap }}</span>
            <span v-else>{{ row.hasUnknownDays ? '待补充' : '—' }}</span>
          </template>
        </ElTableColumn>
      </ElTable>
    </section>

    <ElDrawer
      v-model="arrivalDetailsOpen"
      title="固定到货明细"
      size="min(94vw, 850px)"
      append-to-body
    >
      <p class="arrival-context">
        {{ selectedMaterial?.name }} ·
        {{ arrivalDate || `${currentWeek.start} 至 ${currentWeek.days.at(-1)}` }}
      </p>
      <ElTable :data="arrivalDetails" row-key="id" size="small" empty-text="暂无固定到货明细">
        <ElTableColumn prop="supplierName" label="供应商" min-width="158" />
        <ElTableColumn label="采购订单 / 行号" min-width="145">
          <template #default="{ row }"
            >{{ row.orderId || '—' }} / {{ row.orderLineNumber || '—' }}</template
          >
        </ElTableColumn>
        <ElTableColumn label="到货计划号" min-width="106">
          <template #default="{ row }">{{ row.arrivalPlanNumber || '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="计划到货日期" min-width="114">
          <template #default="{ row }">{{ row.plannedArrivalDate || '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="预计到厂时间" min-width="126">
          <template #default="{ row }">{{ displayTime(row.estimatedArrivalTime) }}</template>
        </ElTableColumn>
        <ElTableColumn label="安排到货量" min-width="104" align="right">
          <template #default="{ row }">{{
            quantity(row.quantity, selectedMaterial?.unit)
          }}</template>
        </ElTableColumn>
        <ElTableColumn label="可投料" min-width="114">
          <template #default="{ row }">
            {{
              quantity(
                row.availableDate === null ? null : (row.availableQuantity ?? row.quantity),
                selectedMaterial?.unit,
              )
            }}
            <div class="secondary">
              {{ row.availableDate === null ? '放行待定' : row.availableDate || row.date }}
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="status" label="计划状态" min-width="92" />
      </ElTable>
    </ElDrawer>
  </template>
  <RequisitionCoordinationDrawer
    :context="coordination"
    :can-close="coordinationCanClose"
    @close="coordination = undefined"
    @saved="
      (item) =>
        (coordinationRecords = [item, ...coordinationRecords.filter((row) => row.id !== item.id)])
    "
  />
</template>

<style scoped>
.overview-filter,
.plan-entry,
.inventory-panel,
.overview-tasks {
  min-width: 0;
  margin-bottom: 16px;
  padding: clamp(14px, 2vw, 22px);
}

.task-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.task-heading h2 {
  font-size: 16px;
}
.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 225px), 1fr));
  gap: 12px;
}
.task-item {
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 11px;
  border-radius: 7px;
  background: var(--scos-background);
}
.task-item a {
  color: var(--scos-primary);
  font-size: 13px;
}
.task-coordination {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.task-coordination li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 12px;
  font-size: 13px;
}

.overview-filter,
.plan-entry-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
}

.filter-field {
  display: grid;
  gap: 6px;
}

.filter-field select {
  min-height: 34px;
  max-width: 100%;
  padding: 0 8px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--scos-surface);
  color: var(--scos-ink);
}

.source {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  margin-left: auto;
  color: var(--scos-muted);
  font-size: 12px;
}

.overview-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
  gap: 12px;
  margin: 0 0 16px;
}

.metric {
  padding: 14px 16px;
}

.metric dt,
.secondary {
  color: var(--scos-muted);
  font-size: 12px;
}

.metric dd {
  margin: 5px 0 0;
}

.metric-value {
  color: var(--scos-ink);
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.metric-link {
  padding: 0;
  font-size: inherit;
  font-weight: inherit;
}

.arrival-context {
  margin: 0 0 12px;
  color: var(--scos-muted);
}

.plan-entry-header {
  align-items: center;
  justify-content: space-between;
}

.plan-entry-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.plan-entry h2,
.panel-heading h2 {
  font-size: 16px;
}

.plan-entry-header .secondary,
.panel-heading .secondary {
  margin-top: 5px;
}

.plan-link {
  padding: 9px 15px;
  border-radius: 7px;
  background: var(--scos-primary);
  color: white;
  font-weight: 600;
}

.plan-link:hover {
  background: #096d78;
}

.plan-drafts {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.plan-drafts h3 {
  margin: 0 0 6px;
  font-size: 14px;
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

.panel-heading {
  margin-bottom: 10px;
}

.shortage {
  color: var(--el-color-danger);
  font-weight: 600;
}
</style>
