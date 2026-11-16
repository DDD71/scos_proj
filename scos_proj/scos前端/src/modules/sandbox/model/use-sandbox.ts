import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { sandboxRepository } from '../api/sandbox.repository'
import { contractError, createContract } from '../domain/contract'
import type {
  ContractInput,
  SandboxBaseline,
  SandboxContext,
  SandboxHistory,
  SandboxInput,
  SandboxRun,
  SandboxRunProgress,
  ScenarioKind,
} from './types'

export function useSandbox(getContext: () => SandboxContext) {
  const baselines = ref<SandboxBaseline[]>([])
  const baselineId = ref('')
  const baseline = computed(() => baselines.value.find((item) => item.id === baselineId.value))
  const kind = ref<ScenarioKind>('supply')
  const input = ref<SandboxInput>()
  const run = ref<SandboxRun>()
  const history = ref<SandboxHistory>({ runs: [], evaluations: [] })
  const phase = ref<'准备中' | '待运行' | '排队中' | '运行中' | '已取消' | '已完成' | '失败'>(
    '准备中',
  )
  const runProgress = ref<SandboxRunProgress>()
  const error = ref('')
  const loadError = ref('')
  const contextNote = ref('')
  const ignoredContext = ref(false)
  const comparison = ref<string[]>([])
  let request = 0
  let controller: AbortController | undefined

  const options = computed(() => {
    const current = baseline.value
    if (!current) return []
    if (kind.value === 'supply')
      return current.arrivals
        .filter((item) => !item.locked && item.date >= current.start)
        .map((item) => ({ id: item.id, label: item.label, date: item.date }))
    if (kind.value === 'demand')
      return current.orders
        .filter((item) => item.date >= current.start)
        .map((item) => ({ id: item.id, label: item.name, date: item.date }))
    const lines = new Map<string, { id: string; label: string; date: string }>()
    for (const item of current.production) {
      if (!item.confirmed || item.availableDate < current.start) continue
      const line = lines.get(item.lineId)
      // 一条产线可能有多批入库，用最近一批作为减产起点。
      if (!line || item.availableDate < line.date)
        lines.set(item.lineId, {
          id: item.lineId,
          label: item.lineName,
          date: item.availableDate,
        })
    }
    return [...lines.values()].sort((a, b) => a.date.localeCompare(b.date))
  })

  const profile = computed(() =>
    baseline.value?.profiles.find((item) => item.id === input.value?.objectId),
  )
  const selected = computed(() => options.value.find((item) => item.id === input.value?.objectId))
  const validation = computed(() => {
    const snapshot = baseline.value
    const values = input.value
    if (!snapshot || !values) return '当前基线没有可用的业务对象。'
    if (values.kind === 'contract') {
      if (!profile.value) return '当前产品缺少模拟成本配置。'
      if (!Number.isFinite(values.salePrice) || values.salePrice <= 0)
        return '请填写大于 0 的推演成品售价。'
      return contractError(values, profile.value)
    }
    const option = selected.value
    if (!option) return '请选择业务对象。'
    const limits = {
      supply: [0, 100, 14],
      demand: [-30, 50, 7],
      production: [0, 60, 5],
    }[values.kind]
    if (
      !Number.isFinite(values.quantityPct) ||
      values.quantityPct < limits[0]! ||
      values.quantityPct > limits[1]! ||
      !Number.isInteger(values.days) ||
      values.days < 0 ||
      values.days > limits[2]!
    )
      return values.kind === 'supply'
        ? '请填写允许范围内的到厂日期和到货量。'
        : values.kind === 'demand'
          ? '请填写允许范围内的交付日期和订单量。'
          : '请检查减产比例和持续天数。'
    if (
      values.priceAssumption &&
      (!Number.isFinite(values.priceAssumption.base) ||
        values.priceAssumption.base <= 0 ||
        !Number.isFinite(values.priceAssumption.increasePct) ||
        values.priceAssumption.increasePct < -100)
    )
      return '请填写基准采购净价和价格变化比例。'
    if (
      values.alternative &&
      (!values.alternative.id || !values.alternative.date || !(values.alternative.quantity > 0))
    )
      return '请填写备选供应商、补位到货日期和数量。'
    return ''
  })

  function stopRun() {
    controller?.abort()
    controller = undefined
    runProgress.value = undefined
  }

  function setScenario(value: ScenarioKind, objectId?: string) {
    stopRun()
    kind.value = value
    run.value = undefined
    error.value = ''
    phase.value = '待运行'
    const snapshot = baseline.value
    if (!snapshot) return
    if (value === 'contract') {
      const profile = snapshot.profiles.find((item) => item.id === objectId) ?? snapshot.profiles[0]
      input.value = profile
        ? createContract(profile, snapshot.start, snapshot.customers[0]?.id ?? '')
        : undefined
      return
    }
    const choice = options.value.find((item) => item.id === objectId) ?? options.value[0]
    input.value = choice
      ? {
          kind: value,
          objectId: choice.id,
          horizon: 14,
          start: value === 'production' ? choice.date : snapshot.start,
          quantityPct: value === 'production' ? 30 : 0,
          days: value === 'production' ? 3 : 0,
        }
      : undefined
  }

  function selectObject(id: string) {
    const values = input.value
    if (!values || values.kind === 'contract') return
    values.objectId = id
    if (values.kind === 'production') values.start = selected.value?.date ?? baseline.value!.start
    values.alternative = undefined
    values.priceAssumption = undefined
  }

  function restoreContract(value: ContractInput) {
    input.value = value
  }

  async function load(useLatest = false) {
    const current = ++request
    stopRun()
    phase.value = '准备中'
    contextNote.value = ''
    loadError.value = ''
    baselines.value = []
    baselineId.value = ''
    input.value = undefined
    run.value = undefined
    ignoredContext.value = useLatest
    const context = useLatest ? {} : getContext()
    try {
      const results = await sandboxRepository.baselines(context)
      if (current !== request) return
      baselines.value = results
      const active = context.snapshot
        ? results.find((item) => item.time === context.snapshot)
        : results[0]
      if (!active) throw new Error('当前没有可用的基线快照。')
      baselineId.value = active.id
      const target = active.arrivals.find(
        (item) => !item.locked && item.sourceId === context.eventId,
      )
      if (context.eventId && !target)
        contextNote.value = '该预警未匹配到可调整对象。已载入基线，可手动选择业务对象。'
      setScenario('supply', target?.id)
    } catch (cause) {
      if (current !== request) return
      phase.value = '待运行'
      loadError.value = message(cause)
    }
  }

  function selectBaseline(id: string) {
    baselineId.value = id
    ignoredContext.value = true
    contextNote.value = '已切换基线，请重新确认推演对象。'
    setScenario(kind.value)
  }

  let settingVersion = 0
  watch(
    input,
    () => {
      settingVersion += 1
      if (run.value) phase.value = '待运行'
      if (controller) {
        stopRun()
        phase.value = '待运行'
      }
      error.value = ''
    },
    { deep: true, flush: 'sync' },
  )

  async function execute() {
    const snapshot = baseline.value
    if (!snapshot || !input.value || validation.value || controller) return
    error.value = ''
    run.value = undefined
    const requestVersion = settingVersion
    const signal = new AbortController()
    controller = signal
    phase.value = '运行中'
    runProgress.value = { status: '运行中', message: '正在准备推演' }
    try {
      const values = JSON.parse(JSON.stringify(input.value)) as SandboxInput
      const eventId = ignoredContext.value ? undefined : getContext().eventId
      const result = await sandboxRepository.run(
        snapshot,
        values,
        eventId,
        signal.signal,
        (state) => {
          if (signal.signal.aborted) return
          phase.value = state.status
          runProgress.value = state
        },
      )
      if (signal.signal.aborted || requestVersion !== settingVersion) return
      run.value = result
      phase.value = '已完成'
    } catch (cause) {
      if (signal.signal.aborted) return
      error.value = message(cause)
      phase.value = '失败'
    } finally {
      if (controller === signal) {
        controller = undefined
        runProgress.value = undefined
      }
    }
  }

  function cancel() {
    stopRun()
    phase.value = '已取消'
  }

  async function reloadHistory() {
    history.value = await sandboxRepository.history()
  }

  function openSaved(result: SandboxRun) {
    stopRun()
    run.value = result
    phase.value = '已完成'
    error.value = ''
  }

  function reuseSaved(result: SandboxRun) {
    if (result.input.kind === 'inventory') return
    const snapshot = baselines.value.find(
      (item) => item.id === result.baselineId && item.modelVersion === result.modelVersion,
    )
    if (!snapshot) throw new Error('该方案使用的基线或模型版本已不可用。仍可查看和导出历史结果。')
    baselineId.value = snapshot.id
    ignoredContext.value = getContext().eventId !== result.eventId
    setScenario(result.input.kind, result.input.objectId)
    input.value = JSON.parse(JSON.stringify(result.input)) as SandboxInput
  }

  watch(getContext, () => void load(), { immediate: true })
  onBeforeUnmount(() => {
    request += 1
    stopRun()
  })

  return {
    baselines,
    baseline,
    baselineId,
    kind,
    input,
    run,
    history,
    phase,
    runProgress,
    error,
    loadError,
    contextNote,
    comparison,
    options,
    profile,
    selected,
    validation,
    load,
    selectBaseline,
    setScenario,
    selectObject,
    restoreContract,
    execute,
    cancel,
    reloadHistory,
    openSaved,
    reuseSaved,
  }
}

export function message(cause: unknown) {
  return cause instanceof Error ? cause.message : '沙盘服务返回异常。'
}
