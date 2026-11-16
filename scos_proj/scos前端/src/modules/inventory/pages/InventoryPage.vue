<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ElAlert,
  ElButton,
  ElDialog,
  ElEmpty,
  ElInputNumber,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import { env } from '@/shared/config/env'
import {
  readMonthlyInventoryPlan,
  readWeeklyInventoryPlans,
  saveMonthlyInventoryPlan,
  saveWeeklyInventoryPlan,
  type WeeklyInventoryBatch,
  type WeeklyInventoryPlan,
} from '../api/inventory-plans'
import { readInventoryDraft, saveInventoryDraft } from '../api/inventory-drafts.local'
import type { MonthlyInventoryPlan } from '../model/inventory-plans'
import { getInventorySnapshot } from '../api/inventory.repository'
import InventoryDailyVariance from '../components/InventoryDailyVariance.vue'
import InventoryMonthlyHistory from '../components/InventoryMonthlyHistory.vue'
import {
  calculateInventoryPolicy,
  projectInventory,
  remainingMonthlyProduction,
} from '../domain/inventory'
import { buildInventoryDailyMonitoring } from '../domain/inventory-daily-monitoring'
import { buildInventoryPlanDetails } from '../domain/inventory-plan-details'
import type { InventorySnapshot } from '../model/types'

const route = useRoute()
const router = useRouter()
const snapshot = ref<InventorySnapshot>()
const loading = ref(true)
const errorMessage = ref('')
const edited = ref<Record<string, number>>({})
const editingDate = ref('')
const editingQuantity = ref<number>()
const saveMessage = ref('')
const selectedWeek = ref(1)
const monthlyQuantity = ref<number>()
const monthlyMessage = ref('')
const weeklyMessage = ref('')
const isMock = env.dataSource === 'mock'
const editOpen = computed({
  get: () => Boolean(editingDate.value),
  set: (open: boolean) => {
    if (!open) editingDate.value = ''
  },
})

const views = [
  { key: 'month', label: '月度计划' },
  { key: 'week', label: '周度计划' },
  { key: 'day', label: '日度监控' },
] as const
const view = computed(() => views.find(({ key }) => key === route.query.mode)?.key ?? 'week')
const product = computed(() => {
  const products = snapshot.value?.products ?? []
  return (
    products.find(({ code }) => code === route.query.product) ??
    products.find(({ code }) => code === 'FG-F55') ??
    products[0]
  )
})
const policy = computed(() => product.value && calculateInventoryPolicy(product.value))
const useRollingProjection = computed(() => view.value !== 'month')
const monitoring = computed(() =>
  snapshot.value && product.value && useRollingProjection.value
    ? buildInventoryDailyMonitoring(snapshot.value, product.value, edited.value)
    : null,
)
const baselineClosing = computed(
  () => new Map(monitoring.value?.baseline.map((day) => [day.date, day.closingStock])),
)
const recordedDays = computed(
  () => new Map(monitoring.value?.days.filter((day) => day.actual).map((day) => [day.date, day])),
)
const rows = computed(() => {
  if (!snapshot.value || !product.value) return []
  const current = monitoring.value
  const asOf = current?.anchor
    ? `${current.anchor.date}T23:59:59+08:00`
    : snapshot.value.snapshotTime
  return buildInventoryPlanDetails(
    current?.projection ??
      projectInventory(snapshot.value, product.value, product.value.policy, edited.value),
    product.value,
    asOf,
  ).map((row) => {
    const actual = recordedDays.value.get(row.date)?.actual
    return {
      ...row,
      workshopOutput: actual?.production ?? row.workshopOutput,
      warehouseReceipt: actual?.availableReceipt ?? row.warehouseReceipt,
    }
  })
})
const draftKey = computed(() =>
  snapshot.value && product.value
    ? `scos.inventory.plan.${snapshot.value.snapshotId}.${product.value.policyVersion ?? snapshot.value.strategyVersion}.${product.value.code}`
    : '',
)
const weekRows = computed(() => rows.value.filter(({ week }) => week === selectedWeek.value))
const monthlyPlan = ref<MonthlyInventoryPlan>()
const weeklyPlans = ref<Record<number, WeeklyInventoryPlan>>({})
watch([snapshot, product], async ([current, item], _, onCleanup) => {
  let active = true
  onCleanup(() => {
    active = false
  })
  monthlyPlan.value = undefined
  weeklyPlans.value = {}
  if (!current || !item) return
  try {
    const [monthly, weekly] = await Promise.all([
      readMonthlyInventoryPlan(current, item.code),
      readWeeklyInventoryPlans(current, item.code),
    ])
    if (!active) return
    monthlyPlan.value = monthly
    weeklyPlans.value = weekly
  } catch (error) {
    if (active) errorMessage.value = error instanceof Error ? error.message : '计划读取失败。'
  }
})
const weeklyPlan = computed(() => weeklyPlans.value[selectedWeek.value])
const nextEditableWeek = computed(
  () =>
    rows.value.find((row) => !row.locked && weeklyPlans.value[row.week]?.status !== '已确认')?.week,
)
const weekEditable = computed(
  () => weeklyPlan.value?.status !== '已确认' && weekRows.value.some(({ locked }) => !locked),
)
const monthlyOpening = computed(
  () => rows.value.find(({ date }) => date === `${snapshot.value?.month}-01`)?.openingStock ?? null,
)
const monthlySuggestion = computed(() =>
  product.value && policy.value && monthlyOpening.value != null
    ? Math.max(
        0,
        Math.round(
          (product.value.monthlyDemand + policy.value.targetSafetyStock - monthlyOpening.value) *
            10,
        ) / 10,
      )
    : null,
)
const monthlyCommitted = computed(
  () =>
    (product.value?.monthlyProduction?.completed ?? 0) +
    (product.value?.monthlyProduction?.scheduled ?? 0),
)
const monthlyRemaining = computed(() =>
  product.value ? remainingMonthlyProduction(product.value) : null,
)
const hasMonthlyQuantity = computed(
  () =>
    monthlyQuantity.value != null &&
    Number.isFinite(monthlyQuantity.value) &&
    monthlyQuantity.value >= 0,
)
const weeklyBatches = computed(() =>
  weekRows.value.flatMap((row): WeeklyInventoryBatch[] =>
    !row.locked && row.plannedQuantity && row.suggestedAvailableDate
      ? [
          {
            date: row.date,
            availableDate: row.suggestedAvailableDate,
            quantity: row.plannedQuantity,
          },
        ]
      : [],
  ),
)
const weeklyAmount = computed(() =>
  (weeklyPlan.value?.batches ?? weeklyBatches.value).reduce(
    (total, row) => total + row.quantity,
    0,
  ),
)
function checkBatches(batches: WeeklyInventoryBatch[]) {
  if (!snapshot.value || !product.value || !batches.length) return ''
  const dates = new Set(batches.map(({ date }) => date))
  const receiptDates = new Set(batches.map(({ availableDate }) => availableDate))
  const overrides = Object.fromEntries([
    ...rows.value.map(({ date }) => [date, 0] as const),
    ...batches.map(({ date, quantity }) => [date, quantity] as const),
  ])
  const projected = useRollingProjection.value
    ? buildInventoryDailyMonitoring(snapshot.value, product.value, overrides).projection
    : projectInventory(snapshot.value, product.value, product.value.policy, overrides)
  if (projected.some((row) => dates.has(row.date) && row.locked))
    return '本周有批次已进入锁定窗口，请重新提交周计划。'
  if (projected.some((row) => dates.has(row.date) && row.quotaRisk))
    return '待确认补充量超过月度剩余额度，请先调整补充量或月度额度。'
  if (
    projected.some(
      (row) => (dates.has(row.date) || receiptDates.has(row.date)) && row.plannedCapacityRisk,
    )
  )
    return '预计入库时成品实占超过罐容，请调整各日补充量。'
  return ''
}
const trialIssue = computed(() => checkBatches(weeklyBatches.value))
const submittedIssue = computed(() => {
  const pending = weeklyPlan.value
  if (pending?.status !== '待生产确认') return ''
  if (pending.policyVersion !== (product.value?.policyVersion ?? snapshot.value?.strategyVersion))
    return '库存策略已更新，请按当前策略更新待确认计划。'
  return checkBatches(pending.batches)
})
const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 })

function quantity(value: number | null | undefined) {
  return value == null ? '—' : numberFormat.format(value)
}

function sumKnown(values: (number | null)[]) {
  const known = values.filter((value) => value !== null)
  return known.length ? known.reduce((total, value) => total + value, 0) : null
}

function transferTime(value: string) {
  return value.replace('T', ' ').slice(5, 16)
}

const weeks = computed(() =>
  [...new Set(rows.value.map(({ week }) => week))].map((week) => {
    const days = rows.value.filter((row) => row.week === week)
    const lastDay = days.at(-1)
    return {
      week,
      start: days[0]?.date,
      end: lastDay?.date,
      locked: days.every((day) => day.locked),
      demand: sumKnown(days.map((day) => day.demand)),
      workshopOutput: sumKnown(days.map((day) => day.workshopOutput)),
      receipt: sumKnown(days.map((day) => day.warehouseReceipt)),
      inTransit: days
        .flatMap((day) => day.productionTransfers)
        .reduce(
          (total, transfer) => total + (transfer.status === '在途' ? transfer.quantity : 0),
          0,
        ),
      closingStock: lastDay?.closingStock,
      safetyStock: lastDay?.safetyStock,
      reorderPoint: lastDay?.reorderPoint,
      production: weeklyPlans.value[week],
      riskDays: days.filter(
        (day) => (day.shortage ?? 0) > 0 || (day.safetyGap ?? 0) > 0 || day.plannedCapacityRisk,
      ).length,
      incomplete: days.some(
        (day) =>
          day.demand == null ||
          day.workshopOutput == null ||
          day.warehouseReceipt == null ||
          day.closingStock == null,
      ),
    }
  }),
)

const dailyColumns = [
  { field: 'openingStock', label: '期初可用库存' },
  { field: 'demand', label: '出货量' },
  { field: 'workshopOutput', label: '车间产量' },
  { field: 'warehouseReceipt', label: '入库量' },
  { field: 'closingStock', label: '期末可用库存' },
  { field: 'safetyStock', label: '安全库存' },
  { field: 'reorderPoint', label: '补货点' },
] as const
watch(draftKey, (key) => {
  const saved = readInventoryDraft(key)
  edited.value = saved ?? {}
  editingDate.value = ''
  saveMessage.value = saved ? '已载入本地草稿。' : ''
  monthlyMessage.value = ''
  selectRequestedWeek()
  weeklyMessage.value = ''
})
watch(() => route.query.week, selectRequestedWeek)

function selectRequestedWeek() {
  const week = Number(route.query.week)
  selectedWeek.value = rows.value.some((row) => row.week === week) ? week : 1
}

watch(
  [monthlyPlan, monthlySuggestion],
  ([plan, suggestion]) => {
    monthlyQuantity.value =
      plan?.draftQuantity ?? plan?.confirmedQuantity ?? suggestion ?? undefined
  },
  { immediate: true },
)

watch(selectedWeek, () => {
  weeklyMessage.value = ''
})

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    snapshot.value = await getInventorySnapshot()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '库存数据读取失败。'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function navigate(mode = view.value, code = product.value?.code) {
  editingDate.value = ''
  void router.replace({ name: 'inventory-plans', query: { mode, product: code } })
}

function selectProduct(event: Event) {
  navigate(view.value, (event.target as HTMLSelectElement).value)
}

function editQuantity(date: string, amount: number | null) {
  if (!weekEditable.value) return
  editingDate.value = date
  editingQuantity.value = amount ?? 0
}

function applyQuantity() {
  const row = rows.value.find(({ date }) => date === editingDate.value)
  const amount = editingQuantity.value
  if (!row || row.locked || amount == null || !Number.isFinite(amount) || amount < 0) return
  edited.value = { ...edited.value, [row.date]: amount }
  editingDate.value = ''
  saveMessage.value = '已更新试算。'
}

function resetPlan() {
  edited.value = {}
  editingDate.value = ''
  saveMessage.value = '已恢复系统建议，保存草稿后生效。'
}

function savePlan() {
  if (!draftKey.value) return
  saveInventoryDraft(draftKey.value, edited.value)
  saveMessage.value = '已保存本地草稿。'
}

async function saveMonthlyPlan(confirm: boolean) {
  if (!snapshot.value || !product.value || !hasMonthlyQuantity.value) return
  const amount = monthlyQuantity.value!
  if (confirm && amount < monthlyCommitted.value) {
    monthlyMessage.value = '确认量不能低于已完成与已安排生产量之和。'
    return
  }
  try {
    await saveMonthlyInventoryPlan(
      snapshot.value,
      product.value.code,
      confirm ? { confirmedQuantity: amount } : { ...monthlyPlan.value, draftQuantity: amount },
    )
    snapshot.value = await getInventorySnapshot()
    monthlyMessage.value = confirm
      ? '已确认月度生产补充额度，周度计划将使用更新后的剩余额度。'
      : '已保存月度草稿。'
  } catch (error) {
    monthlyMessage.value = error instanceof Error ? error.message : '月度计划保存失败。'
  }
}

async function submitWeeklyPlan(confirm: boolean) {
  if (!snapshot.value || !product.value || (confirm ? submittedIssue.value : trialIssue.value))
    return
  const previous = weeklyPlan.value
  if (previous?.status === '已确认') return
  const batches = confirm ? previous?.batches : weeklyBatches.value
  if (!batches?.length) return
  const plan: WeeklyInventoryPlan = {
    status: confirm ? '已确认' : '待生产确认',
    policyVersion:
      confirm && previous
        ? previous.policyVersion
        : (product.value.policyVersion ?? snapshot.value.strategyVersion),
    batches,
  }
  try {
    await saveWeeklyInventoryPlan(snapshot.value, product.value.code, selectedWeek.value, plan)
    snapshot.value = await getInventorySnapshot()
    weeklyMessage.value = confirm
      ? '生产已模拟确认，补充量按预计可销售日期计入日度预计可用库存。'
      : '已登记待生产确认记录，确认后才计入预计可用库存。'
  } catch (error) {
    weeklyMessage.value = error instanceof Error ? error.message : '周度计划保存失败。'
  }
}
</script>

<template>
  <PageHeader title="补货计划明细">
    <template #actions>
      <RouterLink
        class="text-link"
        :to="{ name: 'inventory-overview', query: { product: product?.code } }"
      >
        返回库存优化
      </RouterLink>
    </template>
  </PageHeader>

  <p v-if="loading" role="status">正在读取库存计划…</p>
  <section v-else-if="errorMessage" class="surface plan-panel">
    <ElAlert :title="errorMessage" type="error" show-icon :closable="false" />
    <ElButton @click="load">重新读取</ElButton>
  </section>
  <ElEmpty v-else-if="!snapshot || !product" class="surface" description="暂无库存计划数据" />
  <template v-else>
    <section class="surface plan-panel" aria-label="补货计划筛选">
      <div class="plan-controls">
        <nav class="section-tabs plan-views" aria-label="计划周期">
          <RouterLink
            v-for="option in views"
            :key="option.key"
            v-slot="{ href, navigate: selectView }"
            :to="{ name: 'inventory-plans', query: { mode: option.key, product: product.code } }"
            custom
          >
            <a
              :href="href"
              :class="{ 'router-link-active': view === option.key }"
              :aria-current="view === option.key ? 'page' : undefined"
              @click="selectView"
            >
              {{ option.label }}
            </a>
          </RouterLink>
        </nav>
        <label for="inventory-plan-product" class="field">
          成品
          <select id="inventory-plan-product" :value="product.code" @change="selectProduct">
            <option v-for="item in snapshot.products" :key="item.code" :value="item.code">
              {{ item.name }}
            </option>
          </select>
        </label>
      </div>
      <p class="note">
        {{ snapshot.plant }} · 快照 {{ snapshot.snapshotId }} · 策略
        {{ product.policyVersion ?? snapshot.strategyVersion }} · 单位 {{ product.unit
        }}<template v-if="isMock"> · 演示数据</template>
      </p>
    </section>

    <template v-if="view === 'month'">
      <section class="surface plan-panel" aria-labelledby="monthly-plan-heading">
        <header class="panel-heading">
          <div>
            <h2 id="monthly-plan-heading">月度生产补充基准</h2>
            <p class="note">{{ snapshot.month }} · {{ snapshot.monthlyPlanVersion }}</p>
          </div>
          <RouterLink
            class="text-link"
            :to="{ name: 'inventory-overview', query: { product: product.code, adjust: '1' } }"
          >
            查看库存策略
          </RouterLink>
        </header>
        <dl class="plan-facts">
          <div>
            <dt>月度出货需求</dt>
            <dd>{{ quantity(product.monthlyDemand) }} {{ product.unit }}</dd>
          </div>
          <div>
            <dt>系统建议生产补充量</dt>
            <dd>{{ quantity(monthlySuggestion) }} {{ product.unit }}</dd>
          </div>
          <div>
            <dt>月度生产补充额度</dt>
            <dd>{{ quantity(product.monthlyProduction?.quota) }} {{ product.unit }}</dd>
            <p class="note">{{ monthlyPlan?.confirmedQuantity != null ? '已确认' : '计划快照' }}</p>
          </div>
          <div>
            <dt>月度剩余生产补充额度</dt>
            <dd>{{ quantity(monthlyRemaining) }} {{ product.unit }}</dd>
            <p v-if="product.monthlyProduction" class="note">
              已完成 {{ quantity(product.monthlyProduction.completed) }} · 已安排
              {{ quantity(product.monthlyProduction.scheduled) }} {{ product.unit }}
            </p>
          </div>
        </dl>
        <p class="note">
          系统建议按月度出货需求减月初预计可用库存（{{ quantity(monthlyOpening) }}
          {{ product.unit }}）再加策略期末安全余量（{{ quantity(policy?.targetSafetyStock) }}
          {{ product.unit }}）试算。
        </p>
        <div v-if="isMock" class="plan-decision">
          <label for="inventory-monthly-amount" class="field">
            月度确认量（{{ product.unit }}）
            <ElInputNumber
              id="inventory-monthly-amount"
              v-model="monthlyQuantity"
              :min="0"
              :precision="1"
              :controls="false"
            />
          </label>
          <div class="action-group">
            <ElButton :disabled="!hasMonthlyQuantity" @click="saveMonthlyPlan(false)"
              >保存月度草稿</ElButton
            >
            <ElButton type="primary" :disabled="!hasMonthlyQuantity" @click="saveMonthlyPlan(true)">
              确认月度计划
            </ElButton>
          </div>
          <p class="note" role="status">
            {{
              monthlyMessage ||
              (monthlyPlan?.draftQuantity != null
                ? '有未确认的月度草稿。'
                : '确认后作为周度补充额度。')
            }}
          </p>
        </div>
      </section>
      <InventoryMonthlyHistory
        :plant="snapshot.plant"
        :product-code="product.code"
        :unit="product.unit"
      />
    </template>

    <template v-else>
      <InventoryDailyVariance
        v-if="view === 'day' && monitoring"
        :monitoring="monitoring"
        :product-code="product.code"
        :unit="product.unit"
        :next-editable-week="nextEditableWeek"
      />
      <section
        v-if="view === 'week'"
        class="surface plan-panel"
        aria-labelledby="weekly-plan-heading"
      >
        <header class="panel-heading">
          <div>
            <h2 id="weekly-plan-heading">四周出入库汇总</h2>
            <p class="note">
              {{ product.name }} · {{ snapshot.weeklyPlanVersion }} · 每周六至下周五
            </p>
          </div>
          <p class="note">月度剩余额度 {{ quantity(monthlyRemaining) }} {{ product.unit }}</p>
        </header>
        <p v-if="monitoring?.anchor" class="note">
          按 {{ monitoring.anchor.date }} 实际期末可用库存
          {{ quantity(monitoring.anchor.closingStock) }} {{ product.unit }} 滚动重算。
          <RouterLink
            class="text-link"
            :to="{ name: 'inventory-plans', query: { mode: 'day', product: product.code } }"
          >
            查看日度执行偏差
          </RouterLink>
        </p>
        <p class="note">周合计仅统计有数据的日期，期末可用库存、安全库存和补货点取周末值。</p>
        <ElTable :data="weeks" row-key="week" size="small">
          <ElTableColumn label="周次" min-width="92">
            <template #default="{ row }">第 {{ row.week }} 周</template>
          </ElTableColumn>
          <ElTableColumn label="计划日期" min-width="205">
            <template #default="{ row }">{{ row.start }} 至 {{ row.end }}</template>
          </ElTableColumn>
          <ElTableColumn label="出货量" min-width="98" align="right">
            <template #default="{ row }">{{ quantity(row.demand) }}</template>
          </ElTableColumn>
          <ElTableColumn label="车间产量" min-width="88" align="right">
            <template #default="{ row }">{{ quantity(row.workshopOutput) }}</template>
          </ElTableColumn>
          <ElTableColumn label="入库量" min-width="100" align="right">
            <template #default="{ row }">
              {{ quantity(row.receipt) }}
              <div v-if="row.inTransit" class="note">
                <ElTag size="small" type="warning" effect="plain">在途</ElTag>
                {{ quantity(row.inTransit) }}
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="期末可用库存" min-width="112" align="right">
            <template #default="{ row }">{{ quantity(row.closingStock) }}</template>
          </ElTableColumn>
          <ElTableColumn label="安全库存" min-width="88" align="right">
            <template #default="{ row }">{{ quantity(row.safetyStock) }}</template>
          </ElTableColumn>
          <ElTableColumn label="补货点" min-width="88" align="right">
            <template #default="{ row }">{{ quantity(row.reorderPoint) }}</template>
          </ElTableColumn>
          <ElTableColumn label="风险天数" min-width="88" align="right">
            <template #default="{ row }">
              {{ row.riskDays }}<span v-if="row.incomplete" class="note">（部分日期缺数据）</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="状态与操作" min-width="142">
            <template #default="{ row }">
              <ElTag
                size="small"
                effect="plain"
                :type="
                  row.locked
                    ? 'info'
                    : row.production?.status === '待生产确认'
                      ? 'warning'
                      : 'success'
                "
              >
                {{ row.production?.status ?? (row.locked ? '已锁定' : '可试算') }}
              </ElTag>
              <ElButton link type="primary" @click="selectedWeek = row.week"
                >查看第 {{ row.week }} 周</ElButton
              >
            </template>
          </ElTableColumn>
        </ElTable>
      </section>

      <section
        v-if="view === 'week' && (weeklyPlan || weeklyBatches.length || weekEditable)"
        class="surface plan-panel"
        aria-labelledby="production-handoff-heading"
      >
        <header class="panel-heading">
          <div>
            <h2 id="production-handoff-heading">第 {{ selectedWeek }} 周生产确认</h2>
            <p class="note">
              {{ product.name }} · {{ product.code }} · {{ quantity(weeklyAmount) }}
              {{ product.unit }}
              <template v-if="weeklyPlan"> · 策略 {{ weeklyPlan.policyVersion }}</template>
            </p>
          </div>
          <div
            v-if="
              isMock &&
              (weeklyBatches.length || weeklyPlan?.status === '待生产确认') &&
              weeklyPlan?.status !== '已确认'
            "
            class="action-group"
          >
            <ElButton
              :type="weeklyPlan ? 'default' : 'primary'"
              :disabled="!weeklyBatches.length || Boolean(trialIssue)"
              @click="submitWeeklyPlan(false)"
            >
              {{ weeklyPlan ? '更新待确认计划' : '提交生产确认' }}
            </ElButton>
            <ElButton
              v-if="weeklyPlan?.status === '待生产确认'"
              type="primary"
              :disabled="Boolean(submittedIssue)"
              @click="submitWeeklyPlan(true)"
            >
              模拟生产确认
            </ElButton>
          </div>
        </header>
        <p v-if="weeklyMessage" class="note" role="status">{{ weeklyMessage }}</p>
        <ElAlert
          v-if="submittedIssue || trialIssue"
          :title="submittedIssue || trialIssue"
          type="warning"
          :closable="false"
        />
        <ElTable
          v-if="weeklyPlan || weeklyBatches.length"
          :data="weeklyPlan?.batches ?? weeklyBatches"
          row-key="date"
          size="small"
          aria-label="周度生产确认批次"
        >
          <ElTableColumn prop="date" label="计划补充日期" min-width="126" />
          <ElTableColumn label="生产补充量" min-width="100" align="right">
            <template #default="{ row }">{{ quantity(row.quantity) }} {{ product.unit }}</template>
          </ElTableColumn>
          <ElTableColumn prop="availableDate" label="预计可销售日期" min-width="126" />
          <ElTableColumn label="状态" min-width="105">
            <template #default>
              <ElTag
                size="small"
                effect="plain"
                :type="weeklyPlan?.status === '已确认' ? 'success' : 'info'"
              >
                {{ weeklyPlan?.status ?? '待提交' }}
              </ElTag>
            </template>
          </ElTableColumn>
        </ElTable>
        <p v-else class="note">本周暂无试算补充批次。</p>
        <p v-if="weeklyPlan || weeklyBatches.length" class="note">
          生产确认后，补充量在预计可销售日期计入日度库存；待确认批次仅作试算。
          <template v-if="weeklyPlan?.status === '待生产确认'">
            若调整了日度试算，需更新待确认计划。
          </template>
          <template v-else-if="weeklyPlan?.status === '已确认'">
            本周已完成生产确认，后续未确认周仍可调整。
          </template>
        </p>
      </section>

      <section class="surface plan-panel" aria-labelledby="daily-plan-heading">
        <header class="panel-heading">
          <div>
            <h2 id="daily-plan-heading">
              {{ view === 'week' ? `第 ${selectedWeek} 周日度明细` : '28 天库存滚动监控' }}
            </h2>
            <p class="note">
              已回传日期显示实绩，后续按最新实际期末库存滚动。车间产量按完工日统计，入库量按可销售日计入库存。
            </p>
          </div>
          <div v-if="view === 'week' && weekEditable" class="action-group">
            <ElButton :disabled="!Object.keys(edited).length" @click="resetPlan"
              >恢复系统建议</ElButton
            >
            <ElButton type="primary" @click="savePlan">保存草稿</ElButton>
          </div>
        </header>
        <p v-if="saveMessage" class="note" role="status">{{ saveMessage }}</p>
        <ElAlert
          v-if="product.storageType === 'shared'"
          title="该成品使用共享罐，补充试算需经联合罐容校验。"
          type="warning"
          :closable="false"
        />
        <ElTable
          :data="view === 'week' ? weekRows : rows"
          row-key="date"
          size="small"
          aria-label="日度库存与补充明细"
        >
          <ElTableColumn label="日期" min-width="122">
            <template #default="{ row }">
              {{ row.date }}
              <div v-if="row.locked" class="note">
                {{ product.confirmedPlanDates?.includes(row.date) ? '生产已确认' : '已锁定' }}
              </div>
              <div v-if="row.isActual" class="note">执行实绩</div>
              <div v-else-if="row.demandSource" class="note">{{ row.demandSource }}</div>
            </template>
          </ElTableColumn>
          <ElTableColumn
            v-for="column in dailyColumns"
            :key="column.field"
            :label="column.label"
            :min-width="column.field === 'warehouseReceipt' ? 132 : 94"
            align="right"
          >
            <template #default="{ row }">
              {{ quantity(row[column.field]) }}
              <template v-if="column.field === 'warehouseReceipt'">
                <div
                  v-for="(transfer, index) in row.productionTransfers"
                  :key="index"
                  class="transfer-status"
                  :title="`车间完工 ${transferTime(transfer.workshopAt)} · ${transfer.status === '已入库' ? '仓库入库' : '预计入库'} ${transferTime(transfer.warehouseAt)}`"
                >
                  <ElTag
                    size="small"
                    :type="
                      transfer.status === '在途'
                        ? 'warning'
                        : transfer.status === '已入库'
                          ? 'success'
                          : 'info'
                    "
                    effect="plain"
                  >
                    {{ transfer.status }}
                  </ElTag>
                  <span v-if="row.productionTransfers.length > 1" class="note">
                    {{ quantity(transfer.quantity) }}
                  </span>
                  <span v-if="transfer.status === '在途'" class="note">
                    预计 {{ transferTime(transfer.warehouseAt) }}
                  </span>
                </div>
              </template>
              <div v-if="column.field === 'closingStock' && row.isActual" class="note">
                实际回传
              </div>
              <div
                v-if="
                  column.field === 'closingStock' &&
                  view === 'day' &&
                  monitoring?.anchor &&
                  row.date > monitoring.anchor.date &&
                  baselineClosing.get(row.date) != null &&
                  baselineClosing.get(row.date) !== row.closingStock
                "
                class="note"
              >
                原预测 {{ quantity(baselineClosing.get(row.date)) }}
              </div>
              <div
                v-if="
                  column.field === 'closingStock' &&
                  (view === 'week' || !monitoring?.anchor || row.date > monitoring.anchor.date) &&
                  row.scenarioClosingStock != null &&
                  row.scenarioClosingStock !== row.closingStock
                "
                class="note"
              >
                {{ view === 'week' ? '试算' : '补充后' }} {{ quantity(row.scenarioClosingStock) }}
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn
            :label="view === 'week' ? '试算补充量' : '建议补充量'"
            min-width="105"
            align="right"
          >
            <template #default="{ row }">
              {{
                view === 'day' && monitoring?.anchor && row.date <= monitoring.anchor.date
                  ? '—'
                  : quantity(row.plannedQuantity)
              }}
              <div v-if="row.suggestedAvailableDate" class="note">
                {{ row.suggestedAvailableDate }} 可用
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn v-if="view === 'week'" label="补充依据" min-width="145">
            <template #default="{ row }">
              {{ row.replenishmentReason }}
              <div v-if="!row.locked && row.inventoryPosition != null" class="note">
                库存位置 {{ quantity(row.inventoryPosition) }}
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="库存风险" min-width="112">
            <template #default="{ row }">
              <span v-if="row.shortage == null" class="note">{{
                row.isActual ? '实际库存' : '数据不足'
              }}</span>
              <span v-else-if="row.shortage > 0" class="risk"
                >缺货 {{ quantity(row.shortage) }}</span
              >
              <div v-if="row.safetyGap > 0" class="risk">
                低于安全库存 {{ quantity(row.safetyGap) }}
              </div>
              <span
                v-if="
                  row.shortage === 0 && row.safetyGap === 0 && !row.capacityRisk && !row.quotaRisk
                "
                class="note"
                >—</span
              >
              <div v-if="row.scenarioShortage > 0" class="risk">
                试算仍缺 {{ quantity(row.scenarioShortage) }}
              </div>
              <div v-if="row.plannedCapacityRisk" class="risk">预计实占超罐容</div>
              <div v-else-if="row.capacityRisk" class="risk">补充目标需复核罐容</div>
              <div v-if="row.quotaRisk" class="risk">试算超月度额度</div>
            </template>
          </ElTableColumn>
          <ElTableColumn v-if="view === 'week' && weekEditable" label="调整" min-width="96">
            <template #default="{ row }">
              <span v-if="row.locked || row.plannedQuantity == null" class="note">—</span>
              <ElButton
                v-else
                link
                type="primary"
                @click="editQuantity(row.date, row.plannedQuantity)"
                >调整补充量</ElButton
              >
            </template>
          </ElTableColumn>
        </ElTable>
      </section>
    </template>

    <ElDialog
      v-model="editOpen"
      :title="`调整 ${editingDate} 补充量`"
      width="min(440px, calc(100vw - 32px))"
      append-to-body
    >
      <label for="inventory-plan-amount" class="field">
        试算补充量（{{ product.unit }}）
        <ElInputNumber
          id="inventory-plan-amount"
          v-model="editingQuantity"
          :min="0"
          :precision="1"
          :controls="false"
        />
      </label>
      <template #footer>
        <ElButton @click="editingDate = ''">取消</ElButton>
        <ElButton type="primary" :disabled="editingQuantity == null" @click="applyQuantity"
          >应用试算</ElButton
        >
      </template>
    </ElDialog>
  </template>
</template>

<style scoped>
.plan-panel {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: clamp(12px, 2vw, 22px);
  margin-bottom: 16px;
}
.plan-panel h2 {
  font-size: 16px;
}
.plan-controls,
.panel-heading,
.action-group,
.plan-decision {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
}
.plan-controls,
.panel-heading {
  justify-content: space-between;
}
.plan-decision {
  align-items: end;
  padding: 12px 14px;
  border: 1px solid var(--scos-border);
  border-radius: 7px;
}
.plan-views {
  margin-bottom: 0;
}
.field {
  display: grid;
  gap: 4px;
  font-size: 13px;
}
.field select {
  height: 34px;
  min-width: 130px;
  padding: 0 8px;
  border: 1px solid var(--scos-border);
  border-radius: 6px;
  background: var(--scos-surface);
  color: var(--scos-ink);
}
.note {
  color: var(--scos-muted);
  font-size: 12px;
}
.transfer-status {
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  align-items: center;
  gap: 4px;
}
.text-link {
  color: var(--scos-primary);
}
.text-link:hover {
  text-decoration: underline;
}
.risk {
  color: var(--el-color-danger);
}
.plan-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 135px), 1fr));
  gap: 12px;
  padding: 14px;
  margin: 0;
  border-radius: 7px;
  background: var(--scos-background);
}
.plan-facts dt {
  color: var(--scos-muted);
  font-size: 12px;
}
.plan-facts dd {
  margin: 4px 0 0;
  font-size: 17px;
  font-weight: 650;
}
</style>
