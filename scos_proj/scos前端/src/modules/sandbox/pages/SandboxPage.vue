<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/shared/components/PageHeader.vue'
import { env } from '@/shared/config/env'
import { sandboxRepository } from '../api/sandbox.repository'
import BaselineSettings from '../components/BaselineSettings.vue'
import ContractEditor from '../components/ContractEditor.vue'
import ScenarioResults from '../components/ScenarioResults.vue'
import { businessLogic, calendarDaysBetween } from '../model/business-logic'
import { addDays, departments, formatValue, round, scenarios } from '../model/scenarios'
import type { SandboxEvaluation, SandboxRun } from '../model/types'
import { message, useSandbox } from '../model/use-sandbox'
import '../sandbox.css'

const route = useRoute()
const query = (key: string) => (typeof route.query[key] === 'string' ? route.query[key] : undefined)
const eventName = computed(() => query('event'))
const {
  baselines,
  baseline,
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
} = useSandbox(() => ({ snapshot: query('snapshot'), eventId: query('eventId') }))

const modelNotice =
  env.dataSource === 'mock' ? '演示基线 · 模拟结果仅供决策参考' : '模拟结果仅供决策参考'
const controls = computed(() =>
  kind.value === 'demand'
    ? { min: -30, max: 50, maxDays: 7 }
    : kind.value === 'production'
      ? { min: 0, max: 60, maxDays: 5 }
      : { min: 0, max: 100, maxDays: 14 },
)
const activeArrival = computed(() =>
  baseline.value?.arrivals.find((item) => item.id === selected.value?.id),
)
const activeProduct = computed(() =>
  baseline.value?.products.find((item) => item.id === activeArrival.value?.productId),
)
const original = computed(() => {
  const activeOrder = baseline.value?.orders.find((item) => item.id === selected.value?.id)
  if (kind.value === 'supply' && activeArrival.value)
    return {
      ...activeArrival.value,
      unit: activeProduct.value?.unit ?? '吨',
      direction: 1,
      minFactor: 0,
      maxFactor: 1,
    }
  if (kind.value === 'demand' && activeOrder)
    return {
      ...activeOrder,
      unit:
        baseline.value?.products.find((item) => item.id === activeOrder.productId)?.unit ?? '吨',
      direction: -1,
      minFactor: 0.7,
      maxFactor: 1.5,
    }
  return undefined
})
const changedDate = computed(() => {
  const source = original.value
  const values = input.value
  if (!source || !values || values.kind === 'contract' || !Number.isFinite(values.days)) return ''
  return addDays(source.date, source.direction * values.days)
})
const changedQuantity = computed(() => {
  const source = original.value
  const values = input.value
  if (!source || !values || values.kind === 'contract' || !Number.isFinite(values.quantityPct))
    return ''
  return round(source.quantity * (1 - (source.direction * values.quantityPct) / 100))
})
const changePreview = computed(() => {
  const values = input.value
  if (
    !values ||
    values.kind === 'contract' ||
    !Number.isInteger(values.days) ||
    values.days < 0 ||
    values.days > controls.value.maxDays ||
    !Number.isFinite(values.quantityPct) ||
    values.quantityPct < controls.value.min ||
    values.quantityPct > controls.value.max
  )
    return undefined
  if (values.kind === 'production')
    return `${values.start} 起减产 ${values.quantityPct}% · 持续 ${values.days} 天`
  if (values.days || values.quantityPct)
    return [
      values.days ? `${values.kind === 'supply' ? '晚' : '提前'} ${values.days} 天` : '',
      values.quantityPct && original.value && changedQuantity.value !== ''
        ? `数量${changedQuantity.value > original.value.quantity ? '增加' : '减少'} ${formatValue(Math.abs(round(changedQuantity.value - original.value.quantity)), original.value.unit)}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ')
  return undefined
})

function setBusinessDate(event: Event) {
  const values = input.value
  const source = original.value
  if (!source || !values || values.kind === 'contract') return
  const date = (event.target as HTMLInputElement).value
  values.days = source.direction * calendarDaysBetween(source.date, date)
}

function setBusinessQuantity(event: Event) {
  const values = input.value
  const source = original.value
  if (!source || !values || values.kind === 'contract') return
  const quantity = (event.target as HTMLInputElement).valueAsNumber
  values.quantityPct = source.quantity
    ? round(source.direction * (1 - quantity / source.quantity) * 100, 10)
    : quantity === 0
      ? 0
      : NaN
}
const mitigations = computed(
  () =>
    baseline.value?.mitigations.filter(
      (item) =>
        kind.value === 'supply' &&
        item.productId === activeArrival.value?.productId &&
        item.id !== activeArrival.value?.contractId,
    ) ?? [],
)
const activeMitigation = computed(() =>
  input.value && input.value.kind !== 'contract'
    ? mitigations.value.find(
        (item) => input.value?.kind !== 'contract' && item.id === input.value?.alternative?.id,
      )
    : undefined,
)
const hasSaved = computed(() => history.value.runs.some((item) => item.run.id === run.value?.id))
const visibleComparison = computed(() =>
  history.value.runs.filter((item) => comparison.value.includes(item.run.id)),
)
const comparisonBase = computed(() => visibleComparison.value[0]?.run)
const stale = computed(() => phase.value === '待运行' && Boolean(run.value))
const running = computed(() => phase.value === '运行中' || phase.value === '排队中')

const actionNote = ref('')
const actionError = ref('')
const busy = ref(false)
const evaluationOpen = ref(false)
const saveName = ref('')
const parameterPanel = ref<HTMLElement>()
const resultPanel = ref<HTMLElement>()
const evaluation = ref({
  department: '',
  owner: '',
  dueAt: '',
  rationale: '',
  decision: '采纳' as NonNullable<SandboxEvaluation['decision']>,
})
const feedback = ref<Record<string, string>>({})

watch(run, (result) => {
  saveName.value =
    history.value.runs.find((item) => item.run.id === result?.id)?.name ?? result?.title ?? ''
  evaluationOpen.value = false
  evaluation.value = {
    department:
      result?.input.kind === 'supply'
        ? '要货计划'
        : result?.input.kind === 'contract'
          ? '成本核算分析'
          : '精益排程',
    owner: '',
    dueAt: '',
    rationale: '',
    decision: result?.status === '不可行' ? '不采纳' : '采纳',
  }
})

function initializeMitigation() {
  if (!input.value || input.value.kind === 'contract' || !baseline.value) return
  if (input.value.alternative) {
    input.value.alternative = undefined
    return
  }
  const candidate = mitigations.value[0]
  if (!candidate) return
  input.value.alternative = {
    id: candidate.id,
    date: candidate.earliest > baseline.value.start ? candidate.earliest : baseline.value.start,
    quantity: candidate.minimum,
  }
}

async function act(action: () => Promise<void>, notice = '') {
  if (busy.value) return
  busy.value = true
  actionError.value = ''
  actionNote.value = ''
  try {
    await action()
    actionNote.value = notice
  } catch (cause) {
    actionError.value = message(cause)
  } finally {
    busy.value = false
  }
}

function save() {
  const result = run.value
  if (!result || !saveName.value.trim()) return
  void act(async () => {
    await sandboxRepository.save(saveName.value.trim(), result)
    await reloadHistory()
  }, '已保存方案及基线，可在历史方案中打开。')
}

function compare(result: SandboxRun) {
  actionNote.value = ''
  actionError.value = ''
  if (comparison.value.includes(result.id)) {
    comparison.value = comparison.value.filter((id) => id !== result.id)
    return
  }
  if (comparisonBase.value && comparisonBase.value.comparisonKey !== result.comparisonKey) {
    actionError.value = '不可比。请选择基线、场景、业务对象、推演时段和模型口径相同的方案。'
    return
  }
  comparison.value = [...comparison.value, result.id]
}

function reuse(result: SandboxRun) {
  void act(async () => {
    reuseSaved(result)
    await nextTick()
    parameterPanel.value?.scrollIntoView({ block: 'start' })
  })
}

function exportResult() {
  const result = run.value
  if (!result) return
  const report = {
    说明: '模拟结果仅供决策参考',
    方案: saveName.value || result.title,
    推演结果: result,
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `沙盘推演-${result.id}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function sendEvaluation() {
  const result = run.value
  const { department, owner, dueAt, rationale, decision } = evaluation.value
  if (
    !result ||
    !owner.trim() ||
    !rationale.trim() ||
    (decision !== '不采纳' && (!department || !dueAt || result.status === '不可行'))
  )
    return
  void act(
    async () => {
      await sandboxRepository.requestEvaluation({
        runId: result.id,
        department: decision === '不采纳' ? '' : department,
        owner: owner.trim(),
        dueAt: decision === '不采纳' ? '' : dueAt,
        rationale: rationale.trim(),
        decision,
      })
      await reloadHistory()
      evaluationOpen.value = false
    },
    decision === '不采纳' ? '已归档不采纳结论。' : '已创建评估任务，含模拟依据和处理时限。',
  )
}

function updateTask(id: string, status: SandboxEvaluation['status']) {
  void act(async () => {
    await sandboxRepository.updateEvaluation(id, status, feedback.value[id]?.trim() ?? '')
    await reloadHistory()
  }, '评估状态已更新。')
}

function setFeedback(id: string, value: string) {
  feedback.value = { ...feedback.value, [id]: value }
}

async function adjustConditions() {
  await nextTick()
  parameterPanel.value?.scrollIntoView({ block: 'start' })
  parameterPanel.value?.focus({ preventScroll: true })
}

async function runScenario() {
  await execute()
  if (phase.value === '已完成') {
    await nextTick()
    resultPanel.value?.scrollIntoView({ block: 'start' })
  }
}

onMounted(() => void act(reloadHistory))
</script>

<template>
  <div class="sandbox-workspace">
    <PageHeader title="沙盘推演">
      <template #actions
        ><RouterLink to="/dashboard" class="sb-secondary">返回驾驶舱</RouterLink></template
      >
    </PageHeader>
    <aside class="sb-banner" aria-label="驾驶舱基线">
      <strong>{{ modelNotice }}</strong>
      <span v-if="eventName">来自预警 · {{ eventName }}</span>
      <span v-if="contextNote">{{ contextNote }}</span>
    </aside>

    <div v-if="loadError" class="surface sb-panel sb-stack" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="sb-secondary" @click="load(true)">加载最新可用基线</button>
    </div>
    <p v-else-if="phase === '准备中'" class="surface sb-panel" role="status">正在加载基线快照…</p>

    <div v-else-if="baseline" class="surface sb-workflow">
      <aside class="sb-scenarios" aria-label="场景选择">
        <h2>想看什么？</h2>
        <div class="sb-scenario-options">
          <button
            v-for="item in scenarios"
            :key="item.id"
            type="button"
            :aria-pressed="kind === item.id"
            @click="kind !== item.id && setScenario(item.id)"
          >
            <strong>{{ item.title }}</strong
            ><span>{{ item.description }}</span>
          </button>
        </div>
      </aside>
      <section
        ref="parameterPanel"
        class="sb-panel sb-stack sb-condition-panel"
        tabindex="-1"
        aria-label="基线与参数"
      >
        <header class="sb-row">
          <h2>推演条件</h2>
          <p class="sb-muted">参考计划 {{ baseline.time.slice(0, 10) }}</p>
        </header>
        <form class="sb-stack" aria-label="填写推演条件" novalidate @submit.prevent="runScenario">
          <template v-if="input?.kind === 'contract' && profile">
            <ContractEditor
              :model-value="input"
              :baseline="baseline"
              :profile="profile"
              @update:model-value="restoreContract"
              @product="setScenario('contract', $event)"
            />
            <details v-if="baselines.length > 1" class="sb-advanced">
              <summary>更换参考计划</summary>
              <BaselineSettings
                :baseline="baseline"
                :choices="baselines"
                @select="selectBaseline"
              />
            </details>
          </template>
          <template v-else-if="input && input.kind !== 'contract'">
            <div
              class="sb-core-fields"
              :class="{ 'sb-production-fields': input.kind === 'production' }"
            >
              <label
                >推演对象
                <select
                  :value="input.objectId"
                  @change="selectObject(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="option in options" :key="option.id" :value="option.id">
                    {{ option.label }} · {{ option.date }}
                  </option>
                </select>
              </label>
              <template v-if="original">
                <label
                  >{{ input.kind === 'supply' ? '改到哪天到厂' : '改到哪天交付' }}
                  <input
                    type="date"
                    :value="changedDate"
                    :min="
                      original.direction === 1
                        ? original.date
                        : addDays(original.date, -controls.maxDays)
                    "
                    :max="
                      original.direction === 1
                        ? addDays(original.date, controls.maxDays)
                        : original.date
                    "
                    @input="setBusinessDate"
                  />
                  <small>原定 {{ original.date }}</small>
                </label>
                <label
                  >{{ input.kind === 'supply' ? '预计到货量' : '调整后订单量' }}（{{
                    original.unit
                  }}）
                  <input
                    type="number"
                    :value="changedQuantity"
                    :min="round(original.quantity * original.minFactor)"
                    :max="round(original.quantity * original.maxFactor)"
                    step="0.001"
                    @input="setBusinessQuantity"
                  />
                  <small>原定 {{ formatValue(original.quantity, original.unit) }}</small>
                </label>
              </template>
              <template v-else-if="input.kind === 'production'">
                <label
                  >哪天开始减产<input
                    v-model="input.start"
                    type="date"
                    :min="baseline.start"
                    :max="addDays(baseline.start, input.horizon - 1)"
                /></label>
                <label
                  >减产比例（%）<input
                    v-model.number="input.quantityPct"
                    type="number"
                    min="0"
                    :max="controls.max"
                    step="1"
                /></label>
                <label
                  >减产持续几天<input
                    v-model.number="input.days"
                    type="number"
                    min="0"
                    :max="controls.maxDays"
                    step="1"
                /></label>
              </template>
            </div>
            <p v-if="changePreview" class="sb-change-preview" aria-live="polite">
              <strong>这次怎么改</strong> {{ changePreview }}
            </p>
            <details class="sb-advanced">
              <summary>
                更多推演条件<small
                  v-if="input.kind === 'supply' && (input.alternative || input.priceAssumption)"
                  >已设置补位或价格条件</small
                >
              </summary>
              <label class="sb-inline"
                >看多久<select v-model.number="input.horizon">
                  <option :value="7">未来 7 天</option>
                  <option :value="14">未来 14 天</option>
                </select></label
              >
              <div
                v-if="input.kind === 'supply' && activeProduct?.unit === '吨'"
                class="sb-disclosure sb-stack"
              >
                <label class="sb-inline"
                  ><input
                    type="checkbox"
                    :checked="Boolean(input.priceAssumption)"
                    @change="
                      input.priceAssumption = input.priceAssumption
                        ? undefined
                        : { base: 0, increasePct: 0 }
                    "
                  />
                  同时评估该批采购价格变化</label
                >
                <div v-if="input.priceAssumption" class="sb-fields">
                  <label
                    >基准采购净价（元/吨）<input
                      v-model.number="input.priceAssumption.base"
                      type="number"
                      min="0.01"
                      step="0.01"
                  /></label>
                  <label
                    >采购价格变化（%）<input
                      v-model.number="input.priceAssumption.increasePct"
                      type="number"
                      min="-100"
                      step="0.1"
                  /></label>
                  <p class="sb-muted sb-wide">人工填写价格假设，仅计算该批模拟净额。</p>
                </div>
              </div>
              <div v-if="mitigations.length" class="sb-disclosure sb-stack">
                <label class="sb-inline"
                  ><input
                    type="checkbox"
                    :checked="Boolean(input.alternative)"
                    @change="initializeMitigation"
                  />
                  同时评估备用供应商补位</label
                >
                <div v-if="input.alternative" class="sb-fields">
                  <label
                    >备选供应商<select v-model="input.alternative.id">
                      <option v-for="item in mitigations" :key="item.id" :value="item.id">
                        {{ item.label }}
                      </option>
                    </select></label
                  >
                  <label
                    >补位到货日期<input
                      v-model="input.alternative.date"
                      type="date"
                      :min="baseline.start"
                      :max="addDays(baseline.start, input.horizon - 1)"
                  /></label>
                  <label
                    >补位数量（{{
                      baseline.products.find((item) => item.id === activeArrival?.productId)?.unit
                    }}）<input
                      v-model.number="input.alternative.quantity"
                      type="number"
                      min="0.001"
                      step="any"
                  /></label>
                  <p v-if="activeMitigation" class="sb-muted sb-wide">
                    可供日期 {{ activeMitigation.earliest }} 至 {{ activeMitigation.latest }} ·
                    合同余量 {{ formatValue(activeMitigation.maximum) }} · 日供货上限
                    {{ formatValue(activeMitigation.dailyMaximum) }} · 最小批量
                    {{ formatValue(activeMitigation.minimum) }}
                  </p>
                </div>
              </div>
              <BaselineSettings
                :baseline="baseline"
                :choices="baselines"
                @select="selectBaseline"
              />
            </details>
          </template>

          <div class="sb-actions">
            <button type="submit" class="sb-primary" :disabled="running || Boolean(validation)">
              {{ running ? '推演中…' : stale ? '重新推演' : '开始推演' }}
            </button>
            <button v-if="running" type="button" class="sb-secondary" @click="cancel">
              取消运行
            </button>
            <button type="button" class="sb-secondary" @click="setScenario(kind, input?.objectId)">
              恢复默认
            </button>
            <span v-if="input && input.kind !== 'contract'" class="sb-muted"
              >评估未来 {{ input.horizon }} 天</span
            >
          </div>
          <div v-if="runProgress" class="sb-run-progress">
            <div class="sb-row">
              <strong role="status">{{ runProgress.message }}</strong>
              <span v-if="runProgress.percent != null">{{ runProgress.percent }}%</span>
            </div>
            <progress aria-label="推演进度" :value="runProgress.percent" max="100" />
          </div>
          <p v-else-if="phase === '已取消'" class="sb-muted" role="status">推演已取消。</p>
          <p v-if="validation" class="sb-warning">{{ validation }}</p>
          <p v-if="error" class="sb-warning" role="alert">{{ error }}</p>
          <p v-if="stale" class="sb-warning" role="status">
            下方为上一次推演结果。参数已变化，请重新运行。
          </p>
        </form>
        <div class="sb-method">
          <strong>系统怎么算</strong>
          <p>{{ businessLogic[kind] }}</p>
        </div>
      </section>
    </div>

    <div v-if="run && baseline" ref="resultPanel" class="sb-stack" style="scroll-margin-top: 16px">
      <ScenarioResults :key="run.id" :run="run" @adjust="adjustConditions" />
      <details class="surface sb-panel sb-advanced sb-utility" aria-label="保存与评估">
        <summary>保存、导出与评估</summary>
        <div class="sb-actions">
          <label class="sb-inline"
            >方案名称<input v-model.trim="saveName" maxlength="100" :disabled="hasSaved || stale"
          /></label>
          <button
            type="button"
            class="sb-primary"
            :disabled="busy || hasSaved || stale || !saveName"
            @click="save"
          >
            {{ hasSaved ? '已保存' : '保存方案' }}
          </button>
          <button type="button" class="sb-secondary" :disabled="stale" @click="exportResult">
            导出报告
          </button>
          <button
            v-if="run.input.kind !== 'inventory'"
            type="button"
            class="sb-secondary"
            :disabled="!hasSaved || stale"
            @click="evaluationOpen = !evaluationOpen"
          >
            {{ run.status === '不可行' ? '记录不采纳' : '发起专业评估' }}
          </button>
        </div>
        <form v-if="evaluationOpen" class="sb-fields" @submit.prevent="sendEvaluation">
          <label
            >采纳结论<select v-model="evaluation.decision">
              <option v-if="run.status !== '不可行'">采纳</option>
              <option v-if="run.status !== '不可行'">部分采纳</option>
              <option>不采纳</option>
            </select></label
          >
          <label v-if="evaluation.decision !== '不采纳'"
            >承接模块<select v-model="evaluation.department">
              <option v-for="item in departments" :key="item.name">{{ item.name }}</option>
            </select></label
          >
          <label
            >{{ evaluation.decision === '不采纳' ? '记录人' : '责任人'
            }}<input v-model="evaluation.owner" required
          /></label>
          <label v-if="evaluation.decision !== '不采纳'"
            >处理时限<input v-model="evaluation.dueAt" type="date" required
          /></label>
          <label class="sb-wide"
            >评估事项及采纳依据<textarea v-model="evaluation.rationale" rows="3" required />
          </label>
          <button type="submit" class="sb-primary" :disabled="busy">
            {{ evaluation.decision === '不采纳' ? '归档结论' : '提交评估' }}
          </button>
        </form>
      </details>
    </div>

    <div v-if="actionNote" class="sb-banner" role="status">{{ actionNote }}</div>
    <div v-if="actionError" class="sb-warning" role="alert">{{ actionError }}</div>
    <details
      v-if="history.runs.length || history.evaluations.length"
      class="surface sb-panel sb-advanced sb-utility"
      aria-label="历史方案和协同任务"
    >
      <summary>
        历史方案与评估<small v-if="history.runs.length"
          >{{ history.runs.length }} 个已保存方案</small
        >
      </summary>
      <header class="sb-row">
        <h2>历史方案</h2>
        <button
          v-if="comparison.length"
          type="button"
          class="sb-secondary"
          @click="comparison = []"
        >
          清空对比
        </button>
      </header>
      <p v-if="!history.runs.length" class="sb-muted">暂无已保存方案。</p>
      <div v-else class="sb-table">
        <table>
          <thead>
            <tr>
              <th>方案</th>
              <th>基线时间</th>
              <th>结果</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in history.runs" :key="item.run.id">
              <th scope="row">{{ item.name }}</th>
              <td>{{ item.run.baselineTime.slice(0, 16).replace('T', ' ') }}</td>
              <td>{{ item.run.status }}</td>
              <td>
                <div class="sb-actions">
                  <button type="button" class="sb-secondary" @click="openSaved(item.run)">
                    查看 {{ item.name }}
                  </button>
                  <button
                    v-if="item.run.input.kind !== 'inventory'"
                    type="button"
                    class="sb-secondary"
                    @click="reuse(item.run)"
                  >
                    沿用参数
                  </button>
                  <button type="button" class="sb-secondary" @click="compare(item.run)">
                    {{ comparison.includes(item.run.id) ? '移出对比' : '加入对比' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <template v-if="comparisonBase">
        <h3>方案对比</h3>
        <div class="sb-table">
          <table>
            <thead>
              <tr>
                <th>指标</th>
                <th>基线</th>
                <th v-for="item in visibleComparison" :key="item.run.id">{{ item.name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in comparisonBase.metrics" :key="item.key">
                <th scope="row">{{ item.label }}</th>
                <td>{{ formatValue(item.base, item.unit) }}</td>
                <td v-for="record in visibleComparison" :key="record.run.id">
                  {{
                    formatValue(
                      record.run.metrics.find((metric) => metric.key === item.key)?.simulated,
                      item.unit,
                    )
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <h3>专业评估任务</h3>
      <p v-if="!history.evaluations.length" class="sb-muted">暂无评估任务。</p>
      <div v-for="task in history.evaluations" :key="task.id" class="sb-disclosure sb-stack">
        <div class="sb-row">
          <strong>{{
            [task.decision, task.department, task.owner, task.dueAt].filter(Boolean).join(' · ')
          }}</strong
          ><span class="sb-badge">{{ task.status }}</span>
        </div>
        <p>{{ task.rationale }}</p>
        <p v-if="task.feedback" class="sb-muted">反馈 {{ task.feedback }}</p>
        <div class="sb-actions">
          <button
            type="button"
            class="sb-secondary"
            @click="openSaved(history.runs.find((item) => item.run.id === task.runId)!.run)"
          >
            查看模拟依据
          </button>
          <RouterLink
            v-if="departments.find((item) => item.name === task.department)"
            :to="departments.find((item) => item.name === task.department)!.to"
            >转到{{ task.department }} →</RouterLink
          >
        </div>
        <div v-if="task.status === '待受理' || task.status === '已受理'" class="sb-actions">
          <label class="sb-inline"
            >处理意见<input
              :value="feedback[task.id]"
              @input="setFeedback(task.id, ($event.target as HTMLInputElement).value)"
          /></label>
          <button
            v-if="task.status === '待受理'"
            type="button"
            class="sb-secondary"
            :disabled="busy"
            @click="updateTask(task.id, '已受理')"
          >
            受理
          </button>
          <button
            v-if="task.status === '待受理'"
            type="button"
            class="sb-secondary"
            :disabled="busy || !feedback[task.id]?.trim()"
            @click="updateTask(task.id, '退回')"
          >
            退回
          </button>
          <button
            v-if="task.status === '已受理'"
            type="button"
            class="sb-secondary"
            :disabled="busy || !feedback[task.id]?.trim()"
            @click="updateTask(task.id, '已反馈')"
          >
            提交反馈
          </button>
        </div>
      </div>
    </details>
  </div>
</template>
