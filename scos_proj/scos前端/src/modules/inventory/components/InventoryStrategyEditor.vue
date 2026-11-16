<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElTag } from 'element-plus'
import {
  confirmInventoryPolicy,
  readInventoryPolicyVersions,
  sameInventoryPolicyParameters,
  type InventoryPolicyVersions,
} from '../api/inventory-policy'
import { calculateInventoryPolicy } from '../domain/inventory'
import type { InventoryPolicyParameters, InventoryProduct, InventorySnapshot } from '../model/types'

const props = defineProps<{
  snapshot: InventorySnapshot
  product: InventoryProduct
  initialReason: string
}>()
const emit = defineEmits<{
  confirmed: []
}>()
const scenario = ref<InventoryPolicyParameters>()
const hasStaticValue = ref(false)
const versionState = ref<InventoryPolicyVersions>()
const selectedVersion = ref('')
const reason = ref('')
const saveError = ref('')
const confirmMessage = ref('')
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format
const safetyModes = [
  { type: 'dynamic', label: '按服务水平计算' },
  { type: 'static', label: '直接填写吨数' },
] as const

const activePolicy = computed(() => calculateInventoryPolicy(props.product))
const activeVersion = computed(() =>
  versionState.value?.versions.find(({ version }) => version === versionState.value?.activeVersion),
)
const versions = computed(() => [...(versionState.value?.versions ?? [])].reverse())
const draftPreview = computed(() =>
  scenario.value && !scenarioError.value
    ? calculateInventoryPolicy(props.product, scenario.value)
    : null,
)
const metrics = [
  { key: 'safetyStock', label: '安全库存（SS）' },
  { key: 'reorderPoint', label: '补货点（s）' },
  { key: 'targetStock', label: '目标库存（S）' },
] as const

function validateScenario(params: InventoryPolicyParameters) {
  if (!Number.isInteger(params.leadDays) || params.leadDays < 1) {
    return '生产提前期须为正整数。'
  }
  if (!Number.isInteger(params.reviewDays) || params.reviewDays < 1) {
    return '复核周期须为正整数。'
  }
  if (params.type === 'dynamic') {
    return Number.isFinite(params.serviceLevel) &&
      params.serviceLevel >= 50 &&
      params.serviceLevel <= 99.99
      ? ''
      : '服务水平须在 50% 至 99.99% 之间。'
  }
  return Number.isFinite(params.staticSafetyStock) && params.staticSafetyStock >= 0
    ? ''
    : '安全库存须为非负数。'
}

const scenarioError = computed(() => (scenario.value ? validateScenario(scenario.value) : ''))
const pendingChanges = computed(() => {
  const current = activeVersion.value
  const parameters = scenario.value
  return (
    current &&
    parameters &&
    (selectedVersion.value !== current.version ||
      !sameInventoryPolicyParameters(parameters, current.parameters) ||
      reason.value.trim() !== current.reason)
  )
})

watch(
  [() => props.snapshot.plant, () => props.snapshot.month, () => props.product.code],
  async ([, , code], _, onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    scenario.value = undefined
    saveError.value = ''
    try {
      const { policy, policyVersion, policyBaseline } = props.product
      const state = await readInventoryPolicyVersions(
        props.snapshot,
        code,
        policyBaseline?.parameters ?? policy,
        policyBaseline?.version ?? policyVersion ?? props.snapshot.strategyVersion,
      )
      if (!active) return
      versionState.value = state
      selectVersion(state.activeVersion)
      if (state.legacyDraft) {
        loadParameters(state.legacyDraft.parameters)
        reason.value = state.legacyDraft.reason
      }
      if (props.initialReason) reason.value = props.initialReason
    } catch (error) {
      if (active) saveError.value = error instanceof Error ? error.message : '策略读取失败。'
    }
  },
  { immediate: true },
)

watch(
  () => props.initialReason,
  (linkedReason) => {
    if (linkedReason) reason.value = linkedReason
  },
)

function selectVersion(id: string) {
  const version = versionState.value?.versions.find((item) => item.version === id)
  if (!version) return
  selectedVersion.value = id
  loadParameters(version.parameters)
  reason.value = version.reason
  saveError.value = ''
  confirmMessage.value = ''
}

function loadParameters(parameters: InventoryPolicyParameters) {
  scenario.value = { ...parameters }
  hasStaticValue.value = parameters.type === 'static' || parameters.staticSafetyStock > 0
}

function selectSafetyMode(type: InventoryPolicyParameters['type']) {
  const current = scenario.value
  if (!current || current.type === type) return
  if (type === 'static' && !hasStaticValue.value) {
    const buffer = draftPreview.value?.safetyStock ?? activePolicy.value.safetyStock
    current.staticSafetyStock = Number(buffer.toFixed(2))
    hasStaticValue.value = true
  }
  current.type = type
}

async function confirmStrategy() {
  if (!scenario.value || !versionState.value || scenarioError.value) return
  saveError.value = ''
  confirmMessage.value = ''
  try {
    const next = await confirmInventoryPolicy(
      props.snapshot,
      props.product.code,
      versionState.value,
      { parameters: scenario.value, reason: reason.value.trim() },
      selectedVersion.value,
    )
    versionState.value = next
    selectVersion(next.activeVersion)
    confirmMessage.value = '已确认，库存预测已更新。'
    emit('confirmed')
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '库存策略保存失败。'
  }
}

function formatDelta(value: number) {
  return value > 0 ? `+${number(value)}` : number(value)
}
</script>

<template>
  <p v-if="!scenario && saveError" role="alert">{{ saveError }}</p>
  <div v-if="scenario" class="strategy-editor">
    <section class="strategy-card active-policy" aria-labelledby="inventory-active-policy">
      <header class="card-heading">
        <h3 id="inventory-active-policy">当前生效策略</h3>
        <ElTag type="success" effect="plain">{{
          product.policyVersion ?? snapshot.strategyVersion
        }}</ElTag>
      </header>
      <dl class="policy-values">
        <div>
          <dt>安全库存</dt>
          <dd>{{ number(activePolicy.safetyStock) }} {{ product.unit }}</dd>
        </div>
        <div>
          <dt>安全库存设置方式</dt>
          <dd>{{ safetyModes.find(({ type }) => type === product.policy.type)?.label }}</dd>
        </div>
        <div>
          <dt>生产提前期</dt>
          <dd>{{ product.policy.leadDays }} 天</dd>
        </div>
        <div>
          <dt>复核周期</dt>
          <dd>{{ product.policy.reviewDays }} 天</dd>
        </div>
      </dl>
      <p v-if="activeVersion?.reason" class="secondary storage-note">
        调整原因 {{ activeVersion.reason }}
      </p>
    </section>

    <form
      class="strategy-card strategy-form"
      aria-labelledby="inventory-scenario-policy"
      novalidate
      @submit.prevent="confirmStrategy"
    >
      <header class="card-heading">
        <h3 id="inventory-scenario-policy">库存策略</h3>
      </header>
      <fieldset class="policy-form">
        <label class="strategy-field strategy-version">
          <span>参数版本</span>
          <select
            :value="selectedVersion"
            @change="selectVersion(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="item in versions" :key="item.version" :value="item.version">
              {{ item.version }}{{ item.version === activeVersion?.version ? ' · 当前生效' : '' }}
            </option>
          </select>
        </label>
        <fieldset class="safety-mode">
          <legend>安全库存设置方式</legend>
          <div class="safety-mode-options">
            <label v-for="{ type, label } in safetyModes" :key="type">
              <input
                type="radio"
                name="inventory-safety-mode"
                :value="type"
                :checked="scenario.type === type"
                @change="selectSafetyMode(type)"
              />
              {{ label }}
            </label>
          </div>
        </fieldset>
        <label v-if="scenario.type === 'static'" class="strategy-field">
          <span>安全库存（{{ product.unit }}）</span>
          <input v-model.number="scenario.staticSafetyStock" type="number" min="0" step="any" />
        </label>
        <section
          v-if="draftPreview"
          class="safety-preview"
          aria-labelledby="inventory-safety-preview"
        >
          <h4 id="inventory-safety-preview">参数预览</h4>
          <dl>
            <div>
              <dt>安全库存</dt>
              <dd>{{ number(draftPreview.safetyStock) }} {{ product.unit }}</dd>
            </div>
            <div>
              <dt>补货点（s）</dt>
              <dd>{{ number(draftPreview.reorderPoint) }} {{ product.unit }}</dd>
            </div>
            <div>
              <dt>目标库存（S）</dt>
              <dd>{{ number(draftPreview.targetStock) }} {{ product.unit }}</dd>
            </div>
          </dl>
        </section>
        <details v-if="scenario.type === 'dynamic'" class="strategy-advanced">
          <summary>高级设置</summary>
          <label class="strategy-field">
            <span>服务水平（%）</span>
            <input
              v-model.number="scenario.serviceLevel"
              type="number"
              min="50"
              max="99.99"
              step="0.01"
              aria-describedby="inventory-service-level-hint"
            />
          </label>
          <p id="inventory-service-level-hint" class="secondary">
            服务水平是模型设定的库存覆盖需求的目标概率。设得越高，预留的安全库存越多。
          </p>
          <details class="service-level-help">
            <summary>查看换算与补货示例</summary>
            <p>
              例如，98% 表示按模型估计，100 个条件相近的补货窗口中约有 98 个窗口的库存足以覆盖需求。
            </p>
            <p>
              模型先把服务水平换成正态分布系数。
              <strong>预留吨数 = 系数 × 历史日出货量标准差 × √覆盖天数</strong>。
            </p>
            <p>
              以果糖 F55 为例，日均出货 400 吨，日出货量波动（标准差）为 46.8 吨。服务水平设为 98%，
              对应的系数约为 2.05375。
            </p>
            <dl>
              <div>
                <dt>补货点 s · 什么时候补</dt>
                <dd>覆盖 3 天生产提前期。预计出货 1,200 吨 + 安全库存 166.48 吨 = 1,366.48 吨。</dd>
              </div>
              <div>
                <dt>目标库存 S · 补到多少</dt>
                <dd>
                  覆盖 3 天生产提前期和 1 天复核周期。预计出货 1,600 吨 + 波动缓冲 192.23 吨 =
                  1,792.23 吨。
                </dd>
              </div>
            </dl>
            <p>
              逐日预测按未来计划出货量算。计入生产提前期内的预计入库后，库存低于 s 时建议补到 S，
              并校验罐容和月度额度。
            </p>
          </details>
        </details>
        <label class="strategy-field">
          <span>生产提前期（天）</span>
          <input v-model.number="scenario.leadDays" type="number" min="1" step="1" />
        </label>
        <label class="strategy-field">
          <span>复核周期（天）</span>
          <input v-model.number="scenario.reviewDays" type="number" min="1" step="1" />
        </label>
        <label class="strategy-field strategy-reason">
          <span>调整原因</span>
          <textarea v-model="reason" rows="2" placeholder="记录需求、产能或罐容的变化" />
        </label>
      </fieldset>
      <p v-if="scenarioError || saveError" class="strategy-error" role="alert">
        {{ scenarioError || saveError }}
      </p>
      <p v-else-if="pendingChanges" class="secondary storage-note">确认后应用当前参数。</p>
      <p v-else-if="confirmMessage" class="secondary storage-note" role="status">
        {{ confirmMessage }}
      </p>
      <div class="strategy-actions">
        <ElButton type="primary" native-type="submit" :disabled="Boolean(scenarioError)"
          >确认</ElButton
        >
      </div>
    </form>

    <section class="strategy-card policy-comparison" aria-labelledby="inventory-policy-comparison">
      <header class="card-heading">
        <div>
          <h3 id="inventory-policy-comparison">库存水位对比</h3>
          <p class="secondary">单位 {{ product.unit }} · 计划月份 {{ snapshot.month }}</p>
        </div>
        <RouterLink
          class="plan-link"
          :to="{ name: 'inventory-plans', query: { product: product.code } }"
        >
          查看补货计划明细
        </RouterLink>
      </header>
      <div class="comparison-scroll">
        <table class="comparison-table" aria-labelledby="inventory-policy-comparison">
          <thead>
            <tr>
              <th scope="col">指标</th>
              <th scope="col">当前生效</th>
              <th scope="col">参数预览</th>
              <th scope="col">变化量</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ key, label } in metrics" :key="key">
              <th scope="row">{{ label }}</th>
              <td>{{ number(activePolicy[key]) }}</td>
              <td>{{ draftPreview ? number(draftPreview[key]) : '—' }}</td>
              <td>{{ draftPreview ? formatDelta(draftPreview[key] - activePolicy[key]) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="draftPreview?.capacityRisk" class="strategy-error" role="status">
        试算目标库存超过参考库容。
      </p>
      <details class="secondary storage-note">
        <summary>试算依据</summary>
        <p>
          历史日均需求 {{ number(product.historyMean) }} {{ product.unit }}/天 · 日需求标准差
          {{ number(product.historyStdDev) }} {{ product.unit }}
        </p>
        <p>
          {{ product.storageType === 'shared' ? '共享库容组' : '独立库位' }}
          {{ product.storageGroup }} · 库容 {{ number(product.capacity) }} {{ product.unit }} ·
          罐内实物库存 {{ number(product.physicalStock) }} {{ product.unit }}
          <template v-if="product.storageType === 'shared'">
            · 需结合组内其他成品复核实际可用库容</template
          >
        </p>
        <p>库存预测和补货计划使用当前生效策略。</p>
      </details>
    </section>
  </div>
</template>

<style scoped>
.strategy-card {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--scos-border);
  border-radius: 8px;
}

.card-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
}

.strategy-editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'trial published'
    'trial comparison';
  align-items: start;
  gap: 12px;
}

.active-policy {
  grid-area: published;
}

.strategy-form {
  grid-area: trial;
}

.policy-comparison {
  grid-area: comparison;
}

.card-heading {
  margin-bottom: 10px;
}

.card-heading h3 {
  font-size: 16px;
}

.secondary,
.policy-values dt {
  color: var(--scos-muted);
  font-size: 12px;
}

summary {
  cursor: pointer;
}

.strategy-field {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.strategy-field select,
.strategy-field input,
.strategy-field textarea {
  min-width: 0;
  min-height: 34px;
  max-width: 100%;
  padding: 0 8px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--scos-surface);
  color: var(--scos-ink);
}

.strategy-field textarea {
  padding: 6px 8px;
  resize: vertical;
}

.policy-values,
.policy-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin: 0;
}

.policy-form {
  min-width: 0;
  padding: 0;
  border: 0;
}

.strategy-reason,
.strategy-version,
.safety-mode,
.safety-preview,
.strategy-advanced {
  grid-column: 1 / -1;
}

.safety-mode {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.safety-mode legend {
  margin-bottom: 6px;
  padding: 0;
}

.safety-mode-options,
.safety-preview dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr));
  gap: 8px;
}

.safety-mode-options label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid var(--scos-border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.safety-mode-options label:has(input:checked) {
  border-color: var(--scos-primary);
  background: var(--scos-primary-soft);
}

.safety-mode-options input {
  margin: 0;
  accent-color: var(--scos-primary);
}

.safety-preview {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--scos-background);
}

.safety-preview h4 {
  margin: 0 0 8px;
  font-size: 13px;
}

.safety-preview dl {
  margin: 0;
}

.safety-preview dt {
  color: var(--scos-muted);
  font-size: 12px;
}

.safety-preview dd {
  margin: 3px 0 0;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.safety-preview dl > :first-child dd {
  color: var(--scos-primary);
}

.strategy-advanced summary {
  width: fit-content;
  color: var(--scos-primary);
  font-size: 13px;
}

.strategy-advanced .strategy-field,
.strategy-advanced p {
  margin: 8px 0 0;
}

.strategy-advanced input {
  max-width: 160px;
}

.service-level-help {
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid var(--scos-border);
  border-radius: 6px;
  background: var(--scos-background);
  color: var(--scos-muted);
  font-size: 12px;
  line-height: 1.6;
}

.service-level-help dl {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
}

.service-level-help dt,
.service-level-help strong {
  color: var(--scos-ink);
  font-weight: 650;
}

.service-level-help dd {
  margin: 0;
}

.policy-values dd {
  margin: 6px 0 0;
  font-weight: 600;
}

.strategy-actions {
  margin-top: 14px;
}

.strategy-error {
  margin-top: 10px;
  color: var(--el-color-danger);
  font-size: 13px;
}

.plan-link {
  color: var(--scos-primary);
  font-weight: 600;
}

.plan-link:hover {
  text-decoration: underline;
}

.comparison-scroll {
  overflow-x: auto;
}

.comparison-table {
  width: 100%;
  min-width: 330px;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.comparison-table th,
.comparison-table td {
  padding: 9px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: right;
}

.comparison-table th:first-child {
  text-align: left;
}

.storage-note {
  margin-top: 10px;
}

@media (max-width: 760px) {
  .strategy-editor {
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    grid-template-areas:
      'trial'
      'published'
      'comparison';
  }
}
</style>
