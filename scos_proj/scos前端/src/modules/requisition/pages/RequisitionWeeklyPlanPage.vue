<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ElAlert,
  ElButton,
  ElDialog,
  ElEmpty,
  ElInputNumber,
  ElPopconfirm,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import { env } from '@/shared/config/env'
import { listRequisitionCoordination } from '../api/requisition-operations'
import {
  deleteRequisitionDraft,
  readRequisitionDraft,
  saveRequisitionDraft,
} from '../api/requisition-drafts.local'
import {
  getRequisitionSuggestions,
  getRequisitionSnapshot,
  listRequisitionExecutionPlans,
  publishRequisitionPlan,
  simulateRequisitionArrivalDelay,
} from '../api/requisition.repository'
import RequisitionArrivalTable from '../components/RequisitionArrivalTable.vue'
import RequisitionCoordinationDrawer from '../components/RequisitionCoordinationDrawer.vue'
import RequisitionSupplyConditions from '../components/RequisitionSupplyConditions.vue'
import { requisitionExecutionIssue } from '../domain/operations'
import {
  canSupply,
  firstCompleteRequisitionWeek,
  projectRequisition,
  requisitionWeekDates,
  sameRequisitionBatch,
  validateRequisitionSuggestions,
} from '../domain/plan'
import type { RequisitionExecutionPlan } from '../model/execution'
import type { RequisitionIssueContext } from '../model/operations'
import type {
  RequisitionArrival,
  RequisitionDailyProjection,
  RequisitionSnapshot,
  RequisitionSupply,
} from '../model/types'

const route = useRoute()
const router = useRouter()
const snapshot = ref<RequisitionSnapshot | null>(null)
const publishedPlans = ref<RequisitionExecutionPlan[]>([])
const loading = ref(true)
const publishing = ref(false)
const generating = ref(false)
const updatingArrival = ref(false)
const loadError = ref('')
const suggestions = ref<RequisitionArrival[]>([])
const hasWorkingPlan = ref(false)
const supplierOrder = ref<string[]>([])
const supplierOrderPending = ref(false)
const manuallyAdjusted = ref(false)
const supplyConditions = ref<InstanceType<typeof RequisitionSupplyConditions>>()
const hasSavedDraft = ref(false)
const replacingDraft = ref(false)
const submissionId = ref('')
const constraintMessage = ref('')
const feedback = ref('')
const rollingChanges = ref<string[]>([])
const saveError = ref('')
const editing = ref<RequisitionArrival>()
const editOpen = ref(false)
const editOrder = ref('')
const editDate = ref('')
const editQuantity = ref<number>()
const editError = ref('')
const enteredExpectedQuantity = ref<number>()
const adjustmentReason = ref('')
const coordination = ref<RequisitionIssueContext>()
const formatNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format

const week = computed(() => {
  if (typeof route.query.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.week)) {
    const date = new Date(`${route.query.week}T00:00:00Z`)
    if (date.getUTCDay() === 1 && date.toISOString().slice(0, 10) === route.query.week) {
      return route.query.week
    }
  }
  return snapshot.value ? firstCompleteRequisitionWeek(snapshot.value.startDate) : ''
})
const dates = computed(() => (week.value ? requisitionWeekDates(week.value) : []))
const material = computed(() => {
  const items = snapshot.value?.materials ?? []
  return typeof route.query.materialCode === 'string'
    ? items.find((item) => item.code === route.query.materialCode)
    : items[0]
})
const warehouseLabel = computed(() => `${material.value?.category ?? '原料'}仓库上限`)
const warehouseCapacity = computed(() => {
  const capacity = material.value?.warehouseCapacity
  return capacity != null && Number.isFinite(capacity) && capacity > 0 ? capacity : undefined
})
const fixedArrivals = computed(
  () =>
    snapshot.value?.fixedArrivals.filter((item) => item.materialCode === material.value?.code) ??
    [],
)
const supplies = computed(
  () => snapshot.value?.supplies.filter((item) => item.materialCode === material.value?.code) ?? [],
)
const eligibleWeeklySupplies = computed(() =>
  supplies.value
    .filter(
      (item) => item.remainingQuantity > 0 && dates.value.some((date) => canSupply(item, date)),
    )
    .sort((left, right) => left.priority - right.priority),
)
const orderedSupplierIds = computed(() => {
  const eligible = [...new Set(eligibleWeeklySupplies.value.map(({ supplierId }) => supplierId))]
  const chosen = supplierOrder.value.filter((id) => eligible.includes(id))
  return [...chosen, ...eligible.filter((id) => !chosen.includes(id))]
})
const supplierRanks = computed(
  () => new Map(orderedSupplierIds.value.map((id, index) => [id, index + 1])),
)
const weeklySupplies = computed(() =>
  eligibleWeeklySupplies.value
    .map((supply) => ({
      ...supply,
      priority: supplierRanks.value.get(supply.supplierId) ?? supply.priority,
    }))
    .sort((left, right) => left.priority - right.priority),
)
const availableSuppliers = computed(() => orderedSupplierIds.value.length)
const canAddArrival = computed(
  () => weeklySupplies.value.length > 0 && warehouseCapacity.value != null,
)
const editedSupply = computed(() =>
  weeklySupplies.value.find(({ id, orderId }) => orderKey(id, orderId) === editOrder.value),
)

function orderKey(contractId: string, orderId: string) {
  return `${contractId}/${orderId}`
}

function project(arrivals: readonly RequisitionArrival[] = []) {
  if (!snapshot.value || !material.value) return []
  return projectRequisition(
    material.value,
    snapshot.value.startDate,
    dates.value,
    fixedArrivals.value,
    arrivals,
  )
}

const baseline = computed(() => project())
const productionDemand = computed(() => {
  const demands = baseline.value.map(({ demand }) => demand)
  return demands.length && demands.every((demand) => demand != null)
    ? demands.reduce((total, demand) => total + demand, 0)
    : null
})

function projectionMaximum(days: RequisitionDailyProjection[], key: 'shortage' | 'warehousePeak') {
  const values = days.map((day) => day[key])
  return values.length && values.every((value) => value != null) ? Math.max(...values) : null
}

const demandGap = computed(() => {
  const days = baseline.value
  return {
    first: days.find(({ shortage }) => (shortage ?? 0) > 0),
    total: projectionMaximum(days, 'shortage'),
  }
})
const expectedQuantity = computed({
  get: () => enteredExpectedQuantity.value ?? demandGap.value.total ?? undefined,
  set: (value: number | undefined) => {
    enteredExpectedQuantity.value = value == null ? undefined : Number(value.toFixed(3))
    constraintMessage.value = ''
  },
})
const projection = computed(() =>
  suggestions.value.length ? project(suggestions.value) : baseline.value,
)
const suggestedArrivals = computed(() =>
  [...suggestions.value].sort((left, right) => left.date.localeCompare(right.date)),
)
const supplierResults = computed(() => {
  const byOrder = new Map(
    supplies.value.map((supply) => [
      orderKey(supply.id, supply.orderId),
      { ...supply, priority: supplierRanks.value.get(supply.supplierId) ?? supply.priority },
    ]),
  )
  const groups = new Map<
    string,
    {
      id: string
      supplierName: string
      quantity: number
      arrivals: RequisitionArrival[]
      orders: Set<RequisitionSupply>
    }
  >()
  for (const arrival of suggestedArrivals.value) {
    const supply = byOrder.get(orderKey(arrival.contractId, arrival.orderId))
    const id = supply?.supplierId ?? arrival.supplierName
    const supplier = groups.get(id) ?? {
      id,
      supplierName: arrival.supplierName,
      quantity: 0,
      arrivals: [],
      orders: new Set<RequisitionSupply>(),
    }
    supplier.quantity += arrival.quantity
    supplier.arrivals.push(arrival)
    if (supply) supplier.orders.add(supply)
    groups.set(id, supplier)
  }
  return [...groups.values()]
    .map((supplier) => {
      const orders = [...supplier.orders].sort((left, right) => left.priority - right.priority)
      const dailyCapacity = orders.length === 1 ? orders[0]?.dailyCapacity : undefined
      return {
        ...supplier,
        orders,
        minimumDays:
          dailyCapacity && dailyCapacity >= 0.001
            ? Math.ceil(Math.round(supplier.quantity * 1000) / Math.round(dailyCapacity * 1000))
            : 0,
      }
    })
    .sort(
      (left, right) =>
        (left.orders[0]?.priority ?? Infinity) - (right.orders[0]?.priority ?? Infinity) ||
        right.quantity - left.quantity,
    )
})
const suggestedTotal = computed(() =>
  supplierResults.value.reduce((total, supplier) => total + supplier.quantity, 0),
)
const targetDifference = computed(() =>
  expectedQuantity.value == null
    ? 0
    : Number((expectedQuantity.value - suggestedTotal.value).toFixed(3)),
)
const selectedSupplierNames = computed(() =>
  supplierResults.value.map(({ supplierName }) => supplierName).join('、'),
)
const planReview = computed(() => {
  const days = projection.value
  const deficitsBeforeArrival = days.flatMap(({ date, closingStock, suggestedArrival }) =>
    closingStock != null &&
    suggestedArrival != null &&
    suggestedArrival > closingStock &&
    suggestedArrival > 0
      ? [`${date} 缺 ${quantity(suggestedArrival - closingStock)} ${material.value?.unit}`]
      : [],
  )
  return {
    remainingGap: projectionMaximum(days, 'shortage'),
    warehousePeak: projectionMaximum(days, 'warehousePeak'),
    receivingPeak: days.length
      ? Math.max(
          ...days.map(({ fixedArrival, suggestedArrival }) =>
            receivingTotal(fixedArrival, suggestedArrival),
          ),
        )
      : null,
    deficitsBeforeArrival: deficitsBeforeArrival.join('、'),
  }
})
const currentDemo = computed(() => {
  const demo = snapshot.value?.planningDemo
  if (demo?.weekStart === week.value && demo.materialCode === material.value?.code) return demo
  return null
})
const generationLabel = computed(() =>
  currentDemo.value?.delayed || sourceIssue.value ? '滚动更新建议' : '生成要货建议',
)
const supplierSelectionNote = computed(() => {
  if (supplierOrderPending.value || manuallyAdjusted.value) return ''
  const preferred = weeklySupplies.value[0]
  if (!preferred) return ''
  const assigned = suggestedArrivals.value
    .filter(
      ({ contractId, orderId }) => contractId === preferred.id && orderId === preferred.orderId,
    )
    .reduce((total, { quantity }) => total + quantity, 0)
  if (
    supplierResults.value.length === 1 &&
    assigned === suggestedTotal.value &&
    !publishIssue.value
  ) {
    if (demandGap.value.total === 0) {
      return '本周生产已由现有供应覆盖，补充量由优先供货订单安排。'
    }
    return '优先供货订单能覆盖本周全部缺口，由一家供应商供货。'
  }
  if (supplierResults.value.length > 1 && assigned >= preferred.remainingQuantity) {
    return '优先供货订单已用完可安排余量，其余由后序供应商分担。'
  }
  return ''
})
const canGenerate = computed(
  () =>
    canAddArrival.value &&
    expectedQuantity.value != null &&
    Number.isFinite(expectedQuantity.value) &&
    expectedQuantity.value >= 0 &&
    baseline.value.some((day) => day.shortage != null),
)
const shortageDays = computed(() => projection.value.filter((day) => (day.shortage ?? 0) > 0))
const emptyResult = computed(() => {
  if (manuallyAdjusted.value && shortageDays.value.length) {
    return '当前方案暂无新增到货批次，可新增批次补齐生产缺口。'
  }
  if (shortageDays.value.length) return '当前供货条件下暂无可安排的新增到货。'
  if (projection.value.some((day) => day.shortage == null))
    return '部分日期缺少数据，暂无新增到货建议。'
  return canAddArrival.value ? '本周预计无生产缺口，可以按需新增到货批次。' : '本周预计无生产缺口。'
})
const materialCode = computed(() => material.value?.code)
const newPlan = computed(() => route.query.mode === 'new')
const publishedPlan = computed(() =>
  publishedPlans.value.find(
    ({ source }) => source?.weekStart === week.value && source.materialCode === materialCode.value,
  ),
)
const coordinationRecords = ref<Awaited<ReturnType<typeof listRequisitionCoordination>>>([])
const sourceIssue = computed(() => {
  if (typeof route.query.coordination === 'string')
    return coordinationRecords.value.find(({ id }) => id === route.query.coordination)
  const source = publishedPlans.value.find(({ id }) => id === route.query.sourcePlan)
  const row = source?.rows.find(({ id }) => id === route.query.sourceRow)
  if (snapshot.value && source && row) return requisitionExecutionIssue(snapshot.value, source, row)
  if (material.value && typeof route.query.restriction === 'string') {
    const item = material.value
    return {
      id: `restriction:${route.query.restriction}:${week.value}`,
      materialCode: item.code,
      materialName: item.name,
      weekStart: week.value,
      unit: item.unit,
      cause: '供应商禁运条件变更，评估剩余可供订单。',
    } satisfies RequisitionIssueContext
  }
  return undefined
})
const focusRiskDate = computed(() =>
  typeof route.query.riskDate === 'string' ? route.query.riskDate : sourceIssue.value?.riskDate,
)
const hasMissingData = computed(
  () =>
    warehouseCapacity.value == null ||
    material.value?.receivingCapacity == null ||
    projection.value.some(({ shortage }) => shortage == null),
)
const overviewLocation = computed(() => ({
  name: 'requisition-overview',
  query: { week: week.value, materialCode: materialCode.value },
}))
const publishIssue = computed(() => {
  if (!suggestions.value.length) return ''
  const validationError = validate(suggestions.value)[0]
  if (validationError) return validationError
  if (projection.value.some(({ shortage }) => shortage == null))
    return '请先补齐本周可用量和生产耗用数据。'
  const firstGap = shortageDays.value[0]
  return firstGap
    ? `${firstGap.date} 仍有 ${quantity(firstGap.shortage)} ${material.value?.unit}生产缺口，请先调整到货安排。`
    : ''
})
const bufferRisk = computed(() =>
  projection.value.find(({ safetyBufferGap }) => (safetyBufferGap ?? 0) > 0),
)
const canCloseCoordination = computed(
  () =>
    !hasMissingData.value &&
    baseline.value.length > 0 &&
    baseline.value.every(({ shortage }) => shortage === 0),
)

watch([week, materialCode, newPlan], ([weekStart, code, isNew]) => {
  feedback.value = ''
  rollingChanges.value = []
  saveError.value = ''
  const existing = code && weekStart ? readRequisitionDraft(weekStart, code) : undefined
  const saved = isNew ? undefined : existing
  submissionId.value = saved?.submissionId ?? crypto.randomUUID()
  replacingDraft.value = isNew && existing !== undefined
  constraintMessage.value = ''
  suggestions.value = saved?.suggestions ?? []
  enteredExpectedQuantity.value = saved?.expectedQuantity
  adjustmentReason.value = saved?.adjustmentReason ?? ''
  supplierOrder.value = saved?.supplierOrder ?? []
  supplierOrderPending.value = saved?.supplierOrderPending ?? false
  manuallyAdjusted.value = saved?.manuallyAdjusted ?? false
  hasSavedDraft.value = saved !== undefined
  hasWorkingPlan.value = hasSavedDraft.value
  if (hasSavedDraft.value) feedback.value = '已载入本地草稿。'
})

function openCoordination() {
  const item = material.value
  if (!item) return
  const firstGap = shortageDays.value[0]
  const riskDate = firstGap?.date
  coordination.value = {
    ...sourceIssue.value,
    id: sourceIssue.value?.id ?? `planning:${item.code}:${week.value}`,
    materialCode: item.code,
    materialName: item.name,
    weekStart: week.value,
    unit: item.unit,
    cause:
      constraintMessage.value ||
      publishIssue.value ||
      (hasMissingData.value
        ? '需求、库存、仓容或收货能力数据待核实。'
        : sourceIssue.value?.cause) ||
      '日度要货风险待协调。',
    riskDate,
    shortage: firstGap?.shortage ?? undefined,
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [data, plans] = await Promise.all([
      getRequisitionSnapshot(),
      listRequisitionExecutionPlans(),
    ])
    coordinationRecords.value = await listRequisitionCoordination()
    publishedPlans.value = plans
    snapshot.value = data
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '要货数据加载失败。'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function quantity(value: number | null) {
  return value == null ? '—' : formatNumber(value)
}

function receivingTotal(fixedArrival: number | null, suggestedArrival: number | null) {
  return Number(((fixedArrival ?? 0) + (suggestedArrival ?? 0)).toFixed(3))
}

async function generate() {
  const current = snapshot.value
  const item = material.value
  const capacity = warehouseCapacity.value
  const target = expectedQuantity.value
  if (
    !current ||
    !item ||
    !canGenerate.value ||
    capacity == null ||
    target == null ||
    generating.value
  )
    return
  const locked = suggestions.value.filter((row) => row.locked)
  generating.value = true
  saveError.value = ''
  feedback.value = ''
  rollingChanges.value = []
  try {
    const { suggestions: rows, constraintMessage: issue } = await getRequisitionSuggestions({
      material: item,
      startDate: current.startDate,
      dates: dates.value,
      fixedArrivals: fixedArrivals.value,
      supplies: weeklySupplies.value,
      warehouseCapacity: capacity,
      locked,
      expectedQuantity: target,
      usePreset: Boolean(
        currentDemo.value && !publishedPlan.value && target === demandGap.value.total,
      ),
    })
    constraintMessage.value = issue ?? ''
    if (currentDemo.value?.delayed || sourceIssue.value) {
      rollingChanges.value = rows.flatMap((row) => {
        const previous =
          suggestions.value.find(({ id }) => id === row.id) ??
          suggestions.value.find((item) => sameRequisitionBatch(item, row))
        const amount = `${quantity(row.quantity)} ${item.unit}`
        if (!previous)
          return sourceIssue.value ? [`新增 ${row.orderId} · ${row.date} · ${amount}`] : []
        if (previous.date !== row.date)
          return [`${row.orderId} · ${amount} · ${previous.date} → ${row.date}`]
        if (previous.orderId !== row.orderId)
          return [`${row.date} · ${previous.orderId} → ${row.orderId} · ${amount}`]
        if (previous.quantity !== row.quantity)
          return [`${row.orderId} · ${row.date} · ${quantity(previous.quantity)} → ${amount}`]
        return []
      })
    }
    suggestions.value = rows
    supplierOrderPending.value = false
    manuallyAdjusted.value = manuallyAdjusted.value && locked.length > 0
    hasWorkingPlan.value = true
    if (rows.length) {
      feedback.value =
        currentDemo.value?.delayed || sourceIssue.value
          ? `已滚动更新到货建议${locked.length ? `，保留 ${locked.length} 批锁定到货` : ''}。`
          : '已生成要货建议。'
    }
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '读取到货建议失败。'
  } finally {
    generating.value = false
  }
}

async function updateArrivalFeedback() {
  const demo = currentDemo.value
  if (!demo || updatingArrival.value) return
  updatingArrival.value = true
  saveError.value = ''
  try {
    await simulateRequisitionArrivalDelay(!demo.delayed)
    snapshot.value = await getRequisitionSnapshot()
    constraintMessage.value = ''
    rollingChanges.value = []
    feedback.value = demo.delayed
      ? '已恢复原预计到厂日，库存推演已更新。'
      : '已更新在途到货和库存推演。可滚动更新未锁定建议。'
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '更新在途到货失败。'
  } finally {
    updatingArrival.value = false
  }
}

function moveSupplier(id: string, direction: -1 | 1) {
  const order = [...orderedSupplierIds.value]
  const index = order.indexOf(id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= order.length) return
  order.splice(index, 1)
  order.splice(target, 0, id)
  supplierOrder.value = order
  supplierOrderPending.value = true
}

function toggleLock(arrival: RequisitionArrival) {
  suggestions.value = suggestions.value.map((row) =>
    row.id === arrival.id ? { ...row, locked: !row.locked } : row,
  )
  constraintMessage.value = ''
  saveError.value = ''
  feedback.value = arrival.locked ? '已解锁到货建议。' : '已锁定到货建议，重新生成时会保留。'
}

function startEdit(row?: RequisitionArrival) {
  editing.value = row
  editDate.value =
    row?.date ?? shortageDays.value[0]?.date ?? demandGap.value.first?.date ?? dates.value[0] ?? ''
  editOrder.value = row ? orderKey(row.contractId, row.orderId) : ''
  editQuantity.value = row?.quantity
  editError.value = ''
  editOpen.value = true
}

function validate(rows: RequisitionArrival[]) {
  const capacity = warehouseCapacity.value
  if (!material.value || !snapshot.value) return ['请选择物料。']
  if (capacity == null) return ['WMS 仓库上限待补充。']
  if (rows.some((row) => !dates.value.includes(row.date))) return ['计划到货日期须在本周内。']
  if (rows.some((row) => !Number.isFinite(row.quantity) || row.quantity <= 0)) {
    return ['计划到货量须大于 0。']
  }
  return validateRequisitionSuggestions(material.value, supplies.value, fixedArrivals.value, rows, {
    startDate: snapshot.value.startDate,
    dates: dates.value,
    capacity,
  })
}

function applyEdit() {
  const supply = editedSupply.value
  const original = editing.value
  if (!supply) {
    editError.value = '请选择可供货的供应商和采购订单。'
    return
  }
  const orderLineNumber =
    original && original.contractId === supply.id && original.orderId === supply.orderId
      ? original.orderLineNumber
      : undefined
  const arrival: RequisitionArrival = {
    id: original?.id ?? `REQ-${crypto.randomUUID()}`,
    materialCode: supply.materialCode,
    supplierName: supply.supplierName,
    contractId: supply.id,
    orderId: supply.orderId,
    ...(orderLineNumber ? { orderLineNumber } : {}),
    date: editDate.value,
    quantity: editQuantity.value ?? 0,
    status: '建议',
    locked: false,
  }
  const rows = original
    ? suggestions.value.map((row) => (row.id === original.id ? arrival : row))
    : [...suggestions.value, arrival]
  if (rows.some((row) => row.id !== arrival.id && sameRequisitionBatch(row, arrival))) {
    editError.value = '该采购订单行当天已有到货批次，可调整已有批次的数量。'
    return
  }
  editError.value = validate(rows)[0] ?? ''
  if (editError.value) return
  updateManualArrivals(rows)
}

function removeArrival() {
  if (!editing.value) return
  updateManualArrivals(suggestions.value.filter(({ id }) => id !== editing.value?.id))
}

function updateManualArrivals(rows: RequisitionArrival[]) {
  suggestions.value = rows
  hasWorkingPlan.value = true
  manuallyAdjusted.value = true
  constraintMessage.value = ''
  rollingChanges.value = []
  saveError.value = ''
  feedback.value = '已更新到货计划和库存推演。'
  editOpen.value = false
}

async function saveDraft() {
  if (!materialCode.value) return
  saveError.value = ''
  saveRequisitionDraft({
    weekStart: week.value,
    materialCode: materialCode.value,
    submissionId: submissionId.value,
    suggestions: suggestions.value,
    expectedQuantity: expectedQuantity.value,
    supplierOrder: supplierOrder.value,
    supplierOrderPending: supplierOrderPending.value,
    manuallyAdjusted: manuallyAdjusted.value,
    adjustmentReason: adjustmentReason.value.trim(),
    savedAt: new Date().toISOString(),
  })
  if (newPlan.value) {
    await router.replace({ query: { ...route.query, mode: undefined } })
  }
  hasSavedDraft.value = true
  hasWorkingPlan.value = true
  feedback.value = '已保存本地草稿。'
}

function removeDraft() {
  if (!materialCode.value || !hasSavedDraft.value) return
  deleteRequisitionDraft(week.value, materialCode.value)
  suggestions.value = []
  hasWorkingPlan.value = false
  hasSavedDraft.value = false
  feedback.value = ''
  saveError.value = ''
  editing.value = undefined
  editOpen.value = false
  void router.replace(overviewLocation.value)
}

async function publishPlan() {
  const current = snapshot.value
  const item = material.value
  if (!current || !item || !suggestions.value.length || publishIssue.value || publishing.value)
    return

  publishing.value = true
  saveError.value = ''
  try {
    const plan = await publishRequisitionPlan({
      submissionId: submissionId.value,
      weekStart: week.value,
      plant: current.plant,
      materialCode: item.code,
      materialName: item.name,
      unit: item.unit,
      demandVersion: current.demandVersion,
      inventoryVersion: current.inventoryVersion,
      conditionVersion: current.conditionVersion,
      suggestions: suggestions.value,
      expectedQuantity: expectedQuantity.value,
      ...(!supplierOrderPending.value ? { supplierOrder: orderedSupplierIds.value } : {}),
      manuallyAdjusted: manuallyAdjusted.value,
      adjustmentReason: adjustmentReason.value.trim(),
      coordinationId:
        sourceIssue.value?.id ??
        (await listRequisitionCoordination()).find(
          ({ id }) => id === `planning:${item.code}:${week.value}`,
        )?.id,
    })
    deleteRequisitionDraft(week.value, item.code)
    await router.push({ name: 'requisition-execution', query: { planId: plan.id } })
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '要货计划发布失败，请重试。'
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <PageHeader title="周要货计划" description="每日滚动核对生产需求和到货，按需安排厂内收货。">
    <template #actions>
      <RouterLink class="back-link" :to="overviewLocation">返回要货概览</RouterLink>
    </template>
  </PageHeader>

  <section v-if="loading" class="surface weekly-panel">
    <p role="status">正在读取要货数据…</p>
  </section>
  <section v-else-if="loadError" class="surface weekly-panel">
    <ElAlert :title="loadError" type="error" :closable="false" show-icon />
    <ElButton @click="load">重新读取</ElButton>
  </section>
  <ElEmpty v-else-if="!material" class="surface" description="暂无所选物料的要货数据" />
  <template v-else>
    <section class="surface weekly-panel">
      <div class="panel-heading">
        <div>
          <div class="material-heading">
            <h2>{{ material.name }} · {{ snapshot?.plant }}</h2>
            <ElTag v-if="env.dataSource === 'mock'" size="small" type="warning" effect="plain">
              演示数据
            </ElTag>
          </div>
          <p class="muted">
            {{ dates[0] }} 至 {{ dates.at(-1) }} · {{ material.code }} · {{ material.unit }}
          </p>
        </div>
        <div class="actions target-actions">
          <div class="target-field">
            <label for="requisition-expected-quantity">预期要货量（{{ material.unit }}）</label>
            <ElInputNumber
              id="requisition-expected-quantity"
              v-model="expectedQuantity"
              aria-label="预期要货量"
              aria-describedby="requisition-expected-quantity-help"
              :min="0"
              :precision="3"
              :controls="false"
              :disabled="generating || publishing || updatingArrival"
              @input="expectedQuantity = $event ?? undefined"
            />
          </div>
          <ElButton
            type="primary"
            :disabled="!canGenerate || warehouseCapacity == null || publishing || updatingArrival"
            :loading="generating"
            @click="generate"
          >
            {{ generationLabel }}
          </ElButton>
          <ElButton :disabled="publishing || generating || updatingArrival" @click="saveDraft">
            保存草稿
          </ElButton>
          <ElPopconfirm
            v-if="hasSavedDraft"
            :disabled="publishing"
            title="删除本周该物料的草稿？当前调整也会清除。"
            confirm-button-text="确认删除"
            confirm-button-type="danger"
            cancel-button-text="取消"
            width="260"
            @confirm="removeDraft"
          >
            <template #reference><ElButton type="danger" plain>删除草稿</ElButton></template>
          </ElPopconfirm>
        </div>
      </div>
      <p id="requisition-expected-quantity-help" class="muted">
        默认按需求缺口，可按备料安排调整。修改后点击「{{ generationLabel }}」。
      </p>
      <p class="muted">
        需求版本 {{ snapshot?.demandVersion }} · WMS 库存快照 {{ snapshot?.inventoryVersion }} ·
        合同供货版本 {{ snapshot?.conditionVersion }}
      </p>
      <div v-if="currentDemo && !publishedPlan" class="arrival-feedback">
        <div>
          <strong>在途到货反馈</strong>
          <p class="muted">
            {{ currentDemo.quantity }} {{ material.unit }} · 预计到厂
            {{ currentDemo.delayed ? currentDemo.delayedDate : currentDemo.originalDate }}
            <template v-if="currentDemo.delayed">
              （原预计 {{ currentDemo.originalDate }}）
            </template>
          </p>
        </div>
        <ElButton
          plain
          :loading="updatingArrival"
          :disabled="generating || publishing"
          @click="updateArrivalFeedback"
        >
          {{ currentDemo.delayed ? '恢复原预计到货' : '模拟在途延期' }}
        </ElButton>
      </div>
      <p v-if="publishedPlan" class="muted">
        本周已确认的到货和合同占用已计入计算。
        <RouterLink
          class="back-link"
          :to="{ name: 'requisition-execution', query: { planId: publishedPlan.id } }"
        >
          查看已确认计划
        </RouterLink>
      </p>
      <section v-if="sourceIssue" class="arrival-feedback" aria-label="滚动调整依据">
        <div>
          <strong>滚动调整 · {{ sourceIssue.materialName }}</strong>
          <p class="muted">{{ sourceIssue.cause }}</p>
          <p v-if="sourceIssue.plannedDate" class="muted">
            原计划 {{ sourceIssue.plannedDate }} ·
            {{ quantity(sourceIssue.plannedQuantity ?? null) }} {{ material.unit }}； 最新反馈
            {{ sourceIssue.feedbackDate || '待核实' }}
            <template v-if="sourceIssue.feedbackQuantity != null">
              · {{ quantity(sourceIssue.feedbackQuantity) }} {{ material.unit }}
            </template>
          </p>
          <p class="muted">已确认、已下达和锁定批次保留，复核未锁定安排及新增补货。</p>
        </div>
        <div class="actions">
          <RouterLink
            v-if="sourceIssue.planId"
            class="back-link"
            :to="{
              name: 'requisition-execution',
              query: { planId: sourceIssue.planId, rowId: sourceIssue.executionRowId },
            }"
            >查看原执行单据</RouterLink
          >
          <ElButton @click="openCoordination">查看或登记协调</ElButton>
        </div>
      </section>
      <label
        v-if="
          adjustmentReason ||
          enteredExpectedQuantity != null ||
          manuallyAdjusted ||
          supplierOrder.length
        "
        class="adjustment-field"
      >
        调整原因
        <input v-model="adjustmentReason" placeholder="记录增减要货量、顺序或批次的业务原因" />
      </label>
      <p v-if="replacingDraft" class="muted">保存草稿将更新本周该物料的草稿。</p>
      <p v-if="feedback" role="status">{{ feedback }}</p>
      <ElAlert v-if="saveError" :title="saveError" type="error" :closable="false" show-icon />
    </section>

    <section class="surface weekly-panel" aria-labelledby="requisition-basis-title">
      <h2 id="requisition-basis-title">要货依据</h2>
      <dl class="result-summary">
        <div>
          <dt>生产计划{{ material.category }}需求</dt>
          <dd>
            {{ productionDemand == null ? '—' : `${quantity(productionDemand)} ${material.unit}` }}
          </dd>
          <dd class="basis-detail">来源 {{ material.demandSource }}</dd>
        </div>
        <div>
          <dt>需求缺口</dt>
          <dd>
            {{ demandGap.total == null ? '—' : `${quantity(demandGap.total)} ${material.unit}` }}
          </dd>
          <dd v-if="demandGap.first" class="basis-detail">
            最早缺口 {{ demandGap.first.date }} · {{ quantity(demandGap.first.shortage) }}
            {{ material.unit }}
          </dd>
          <dd v-else class="basis-detail">
            {{ demandGap.total == null ? '需求或库存数据待补充' : '本周预计无缺口' }}
          </dd>
        </div>
        <div>
          <dt>可安排供应商</dt>
          <dd>{{ availableSuppliers }} 家</dd>
        </div>
        <div>
          <dt>{{ warehouseLabel }}</dt>
          <dd>
            {{
              warehouseCapacity == null ? '—' : `${quantity(warehouseCapacity)} ${material.unit}`
            }}
          </dd>
          <dd class="basis-detail">
            {{ warehouseCapacity == null ? 'WMS 仓库上限待补充' : '来源 WMS 库存快照' }}
          </dd>
        </div>
        <div>
          <dt>工厂日收货上限</dt>
          <dd>
            {{
              material.receivingCapacity == null
                ? '—'
                : `${quantity(material.receivingCapacity)} ${material.unit}`
            }}
          </dd>
          <dd class="basis-detail">固定与新增到货合计</dd>
        </div>
      </dl>
      <p class="muted">需求缺口按计划期内最大累计生产缺口显示，最早缺口按首个缺料日显示。</p>
      <RequisitionSupplyConditions
        ref="supplyConditions"
        :supplies="weeklySupplies"
        :unit="material.unit"
        :editable="hasWorkingPlan && !publishing"
        @move="moveSupplier"
      />
      <div v-if="supplierOrderPending" class="actions muted">
        <span role="status">供货顺序已调整，已锁定批次会在重新生成时保留。</span>
        <ElButton
          link
          type="primary"
          :disabled="!canGenerate || warehouseCapacity == null || publishing || updatingArrival"
          :loading="generating"
          @click="generate"
          >按新顺序重新生成</ElButton
        >
      </div>
    </section>

    <section class="surface weekly-panel" aria-labelledby="requisition-result-title">
      <div class="panel-heading">
        <h2 id="requisition-result-title">供应商要货计划</h2>
        <div class="actions">
          <ElButton
            v-if="shortageDays.length || hasMissingData || constraintMessage"
            @click="openCoordination"
            >发起协调</ElButton
          >
          <ElButton
            v-if="hasWorkingPlan && availableSuppliers > 1"
            :disabled="publishing"
            @click="supplyConditions?.show()"
          >
            调整供货顺序
          </ElButton>
          <ElButton :disabled="!canAddArrival || publishing" @click="startEdit()">
            新增到货批次
          </ElButton>
          <ElPopconfirm
            v-if="suggestedArrivals.length"
            title="确认并发布当前要货计划？"
            confirm-button-text="确认发布"
            cancel-button-text="取消"
            width="208"
            :disabled="Boolean(publishIssue) || publishing"
            @confirm="publishPlan"
          >
            <template #reference>
              <ElButton type="primary" :disabled="Boolean(publishIssue)" :loading="publishing">
                确认并前往下达
              </ElButton>
            </template>
          </ElPopconfirm>
        </div>
      </div>
      <p v-if="constraintMessage || publishIssue" class="shortage">
        {{ constraintMessage || publishIssue }}
      </p>
      <p v-if="hasMissingData" class="muted">
        <template v-if="warehouseCapacity == null">原料仓库上限待 WMS 核对。 </template>
        <template v-if="material.receivingCapacity == null">日收货能力待仓储物流确认。 </template>
        <template v-if="projection.some(({ shortage }) => shortage == null)">
          生产耗用或可用库存待计划端、WMS 核对。
        </template>
        可先保存草稿或登记数据核对。
      </p>
      <p v-if="hasWorkingPlan && expectedQuantity != null" class="target-summary">
        <span
          >预期要货量 <strong>{{ quantity(expectedQuantity) }} {{ material.unit }}</strong></span
        >
        <span
          >已安排 <strong>{{ quantity(suggestedTotal) }} {{ material.unit }}</strong></span
        >
        <span v-if="targetDifference > 0" class="shortage">
          未排足 {{ quantity(targetDifference) }} {{ material.unit }}
        </span>
        <span v-else-if="targetDifference < 0" class="muted">
          超出目标 {{ quantity(-targetDifference) }} {{ material.unit }}
        </span>
      </p>
      <p v-if="!hasWorkingPlan" class="muted">
        {{
          canAddArrival
            ? '可生成要货建议，也可直接新增到货批次。'
            : '补齐仓容和供货条件后即可安排到货。'
        }}
      </p>
      <template v-else-if="supplierResults.length">
        <div class="plan-decision">
          <p>
            {{ manuallyAdjusted ? '当前方案由' : '建议由' }}
            <strong>{{ selectedSupplierNames }}</strong> 供货
            <ElTag v-if="manuallyAdjusted" size="small" effect="plain">已人工调整</ElTag>
          </p>
          <p class="muted">
            {{ supplierResults.length }} 家供应商 · {{ suggestedArrivals.length }} 批
          </p>
        </div>
        <section class="plan-explanation" aria-labelledby="requisition-explanation-title">
          <h3 id="requisition-explanation-title">方案说明</h3>
          <p class="muted">先覆盖生产耗用，满足仓容和收货上限后，再合并可集中到货的批次。</p>
          <p v-for="change in rollingChanges" :key="change" class="muted">到货调整 {{ change }}</p>
          <p v-if="supplierSelectionNote" class="muted">{{ supplierSelectionNote }}</p>
          <p v-if="planReview.deficitsBeforeArrival" class="muted">
            若取消当日建议到货，预计 {{ planReview.deficitsBeforeArrival }}。
          </p>
          <p class="muted checks">
            <span v-if="planReview.remainingGap === 0">预计全周生产需求已覆盖</span>
            <span v-else-if="planReview.remainingGap != null">
              预计最大剩余缺口 {{ quantity(planReview.remainingGap) }} {{ material.unit }}
            </span>
            <span v-else>生产覆盖待校验</span>
            <span v-if="planReview.warehousePeak != null && warehouseCapacity != null">
              预计最高入库占用 {{ quantity(planReview.warehousePeak) }} {{ material.unit }} / 上限
              {{ quantity(warehouseCapacity) }} {{ material.unit }}
            </span>
            <span v-else>仓容待校验</span>
            <span v-if="planReview.receivingPeak != null && material.receivingCapacity != null">
              预计最高单日收货 {{ quantity(planReview.receivingPeak) }} {{ material.unit }} / 上限
              {{ quantity(material.receivingCapacity) }} {{ material.unit }}
            </span>
          </p>
        </section>
        <section
          v-for="supplier in supplierResults"
          :key="supplier.id"
          class="supplier-plan"
          :aria-label="supplier.supplierName"
        >
          <header class="supplier-plan-heading">
            <h3>{{ supplier.supplierName }}</h3>
            <p class="muted">
              本周要货合计 <strong>{{ quantity(supplier.quantity) }} {{ material.unit }}</strong> ·
              {{ supplier.arrivals.length }} 批
            </p>
          </header>
          <ul v-if="supplier.orders.length" class="supplier-conditions muted">
            <li v-for="order in supplier.orders" :key="`${order.id}/${order.orderId}`">
              供货顺序第 {{ order.priority }} · 订单 {{ order.orderId }} · 可安排余量
              {{ quantity(order.remainingQuantity) }} {{ material.unit }} · 日可供量
              {{ quantity(order.dailyCapacity) }} {{ material.unit }}
            </li>
            <li v-if="supplier.minimumDays > 1">
              按所用订单的日可供量，安排该供应量至少需要 {{ supplier.minimumDays }} 个到货日。
            </li>
          </ul>
          <RequisitionArrivalTable
            :rows="supplier.arrivals"
            :unit="material.unit"
            empty-text="本周暂无建议到货"
            hide-supplier
          >
            <template #actions="{ row }">
              <ElButton
                v-if="!row.locked"
                link
                type="primary"
                :disabled="publishing"
                @click="startEdit(row)"
                >调整到货</ElButton
              >
              <ElButton link type="primary" :disabled="publishing" @click="toggleLock(row)">{{
                row.locked ? '解锁' : '锁定'
              }}</ElButton>
            </template>
          </RequisitionArrivalTable>
        </section>
      </template>
      <p v-else-if="!constraintMessage" class="muted">{{ emptyResult }}</p>
    </section>

    <section class="surface weekly-panel" aria-labelledby="requisition-weekly-inventory-title">
      <div class="panel-heading">
        <h2 id="requisition-weekly-inventory-title">每日需求与{{ material.category }}库存推演</h2>
        <span class="muted">
          数量单位 {{ material.unit }}
          <template v-if="warehouseCapacity != null">
            · 仓库上限 {{ quantity(warehouseCapacity) }} {{ material.unit }}
          </template>
        </span>
      </div>
      <p class="muted">
        生产耗用按 WMS「可用数量」推演，仓容按
        WMS「在库量」校验入库峰值。待检或冻结到货计入当天占仓，按质检放行量计入可投料库存。
      </p>
      <p v-if="bufferRisk" class="muted">
        安全缓冲 {{ quantity(material.safetyBuffer ?? null) }} {{ material.unit }} ·
        {{ bufferRisk.date }} 首次不足 {{ quantity(bufferRisk.safetyBufferGap) }}
        {{ material.unit }}。
      </p>
      <p v-if="focusRiskDate" class="shortage">本次关注日期 {{ focusRiskDate }}</p>
      <ElAlert
        v-if="shortageDays.length"
        :title="`本周有 ${shortageDays.length} 天预计存在生产缺口。`"
        type="warning"
        :closable="false"
      />
      <ElTable
        :data="projection"
        row-key="date"
        size="small"
        :row-class-name="
          ({ row }: { row: RequisitionDailyProjection }) =>
            row.date === focusRiskDate ? 'risk-source-row' : ''
        "
      >
        <ElTableColumn prop="date" label="日期" min-width="108" />
        <ElTableColumn
          v-for="[key, label] in [
            ['openingStock', '期初可用库存'],
            ['demand', '生产需求'],
            ['fixedArrival', '固定到货'],
            ['suggestedArrival', '建议到货'],
            ['closingStock', '预计期末可用库存'],
          ]"
          :key="key"
          :label="label"
          min-width="100"
          align="right"
        >
          <template #default="{ row }">{{ quantity(row[key]) }}</template>
        </ElTableColumn>
        <ElTableColumn label="预计入库峰值" min-width="112" align="right">
          <template #default="{ row }">
            <span
              :class="{
                shortage: warehouseCapacity != null && row.warehousePeak > warehouseCapacity,
              }"
            >
              {{ quantity(row.warehousePeak) }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="累计生产缺口" min-width="112" align="right">
          <template #default="{ row }">
            <span :class="{ shortage: row.shortage > 0 }">{{ quantity(row.shortage) }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="当日收货合计" min-width="115" align="right">
          <template #default="{ row }">
            <span
              v-if="row.fixedArrival != null"
              :class="{
                shortage:
                  material.receivingCapacity != null &&
                  receivingTotal(row.fixedArrival, row.suggestedArrival) >
                    material.receivingCapacity,
              }"
            >
              {{ quantity(receivingTotal(row.fixedArrival, row.suggestedArrival)) }}
            </span>
            <span v-else>—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn
          v-if="
            projection.some(
              ({ fixedArrival, fixedAvailableArrival }) => fixedArrival !== fixedAvailableArrival,
            )
          "
          label="固定到货可投料量"
          min-width="120"
          align="right"
        >
          <template #default="{ row }">{{ quantity(row.fixedAvailableArrival) }}</template>
        </ElTableColumn>
        <ElTableColumn
          v-if="projection.some(({ unavailableStock }) => (unavailableStock ?? 0) > 0)"
          label="不可用占仓"
          min-width="105"
          align="right"
        >
          <template #default="{ row }">{{ quantity(row.unavailableStock) }}</template>
        </ElTableColumn>
      </ElTable>
    </section>
  </template>

  <ElDialog
    v-model="editOpen"
    :title="editing ? '调整到货建议' : '新增到货批次'"
    width="min(calc(100vw - 32px), 460px)"
    append-to-body
  >
    <form class="edit-form" novalidate @submit.prevent="applyEdit">
      <label>
        供货供应商 / 采购订单
        <select v-model="editOrder" aria-label="供货供应商 / 采购订单" required>
          <option value="" disabled>请选择供应商和订单</option>
          <option
            v-for="supply in weeklySupplies"
            :key="orderKey(supply.id, supply.orderId)"
            :value="orderKey(supply.id, supply.orderId)"
          >
            {{ supply.supplierName }} · {{ supply.orderId }}
          </option>
        </select>
      </label>
      <p v-if="editedSupply" class="muted">
        可安排余量 {{ quantity(editedSupply.remainingQuantity) }} {{ material?.unit }} · 日可供量
        {{ quantity(editedSupply.dailyCapacity) }} {{ material?.unit }} · 起送量
        {{ quantity(editedSupply.minimumQuantity) }} {{ material?.unit }}
      </p>
      <label>
        计划到货日期
        <input v-model="editDate" type="date" :min="dates[0]" :max="dates.at(-1)" required />
      </label>
      <label>
        计划到货量
        <ElInputNumber
          v-model="editQuantity"
          aria-label="计划到货量"
          :controls="false"
          :precision="3"
        />
      </label>
      <ElAlert v-if="editError" :title="editError" type="error" :closable="false" show-icon />
      <div class="actions">
        <ElButton v-if="editing" class="remove-arrival" link type="danger" @click="removeArrival">
          移除批次
        </ElButton>
        <ElButton @click="editOpen = false">取消</ElButton>
        <ElButton type="primary" native-type="submit">{{
          editing ? '保存调整' : '加入方案'
        }}</ElButton>
      </div>
    </form>
  </ElDialog>
  <RequisitionCoordinationDrawer
    :context="coordination"
    :can-close="canCloseCoordination"
    @close="coordination = undefined"
  />
</template>

<style scoped>
.weekly-panel {
  display: grid;
  gap: 12px;
  margin-bottom: 18px;
  padding: clamp(14px, 2vw, 22px);
  overflow: hidden;
}

h2 {
  font-size: 16px;
}

.result-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 144px), 1fr));
  gap: 12px;
  margin: 0;
  padding: 12px 14px;
  border-radius: 7px;
  background: var(--scos-background);
}

.result-summary dt {
  color: var(--scos-muted);
  font-size: 13px;
}

.result-summary dd {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.result-summary .basis-detail {
  color: var(--scos-muted);
  font-size: 13px;
  font-weight: 400;
}

.plan-decision {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 7px;
  background: var(--scos-background);
}

.plan-decision .el-tag {
  margin-left: 6px;
}

.target-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  padding: 10px 14px;
  border-radius: 7px;
  background: var(--scos-background);
}

.arrival-feedback {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 10px 14px;
  border-radius: 7px;
  background: var(--scos-background);
}

.adjustment-field {
  display: grid;
  gap: 6px;
  max-width: 520px;
}
.adjustment-field input {
  min-height: 34px;
  padding-inline: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-blank);
}
.weekly-panel :deep(.risk-source-row) {
  background: var(--el-color-warning-light-9);
}

.plan-explanation {
  display: grid;
  gap: 4px;
}

.plan-explanation h3 {
  font-size: 14px;
}

.checks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
}

.supplier-plan {
  min-width: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 7px;
  padding: 10px 12px;
}

.supplier-plan-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 4px 12px;
  margin-bottom: 6px;
}

.supplier-plan-heading h3 {
  margin: 0;
  font-size: 14px;
}

.supplier-conditions {
  display: grid;
  gap: 4px;
  margin: 0 0 6px;
  padding: 0;
  list-style: none;
}

.material-heading,
.panel-heading,
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.panel-heading {
  justify-content: space-between;
}

.panel-heading p {
  margin-top: 6px;
}

.actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.target-actions {
  align-items: flex-end;
}

.target-field {
  display: grid;
  gap: 4px;
}

.target-field label {
  font-size: 13px;
  font-weight: 600;
}

.muted {
  color: var(--scos-muted);
  font-size: 13px;
}

.back-link {
  color: var(--scos-primary);
}

.shortage {
  color: var(--el-color-danger);
  font-weight: 600;
}

.edit-form,
.edit-form label {
  display: grid;
  gap: 8px;
}

.edit-form {
  gap: 14px;
}

.edit-form input[type='date'],
.edit-form select {
  min-height: 32px;
  padding-inline: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-blank);
}

.remove-arrival {
  margin-right: auto;
}

.edit-form :deep(.el-input-number) {
  width: 100%;
}

.edit-form .actions {
  justify-content: flex-end;
}
</style>
