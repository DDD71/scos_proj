<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElButton, ElTable, ElTableColumn } from 'element-plus'
import { compareBatchPeriods } from '../domain/batch-comparison'
import { formatQuantity, formatRate, money } from '../domain/analysis'
import type { CostingBatchResult, CostingSnapshot } from '../model/snapshot'

const props = defineProps<{ batch: CostingBatchResult; data: CostingSnapshot }>()
const emit = defineEmits<{ viewBatch: [batch: string] }>()
const active = ref<string>()
const catalogOpen = ref(false)
const formatAllocationInput = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 20 }).format
const breakdown = computed(() => [
  { key: 'upstream', label: '上游转入', amount: props.batch.inboundCost },
  { key: 'direct', label: '直接成本', amount: props.batch.directCost },
  { key: 'allocation', label: '费用分摊', amount: props.batch.poolCost },
  { key: 'adjustment', label: '调整', amount: props.batch.adjustment },
])
const upstream = computed(() => props.data.relations.filter((row) => row.to === props.batch.batch))
const transfers = computed(
  () => new Map(props.data.transfers.map((row) => [row.relationId, row.amount])),
)
const direct = computed(() => props.data.direct.filter((row) => row.batch === props.batch.batch))
const allocations = computed(() =>
  props.data.allocations.filter((row) => row.batch === props.batch.batch),
)
const pools = computed(() => new Map(props.data.pools.map((row) => [row.poolCode, row])))
const costBatchIds = computed(() => new Set(props.data.costs.map((row) => row.batch)))
const comparisons = computed(() =>
  compareBatchPeriods(props.batch, props.data.context, props.data.batchCostBenchmarks ?? []),
)

function share(amount: number) {
  return formatRate(props.batch.totalCost ? amount / props.batch.totalCost : null)
}

function toggle(key: string) {
  active.value = active.value === key ? undefined : key
  catalogOpen.value = false
}
</script>

<template>
  <div class="cost-detail">
    <h2>{{ batch.batch }} · {{ batch.material }}</h2>
    <p class="detail-muted">
      {{ batch.stage }} · {{ formatQuantity(batch.quantity) }} {{ batch.unit }}
    </p>
    <dl class="detail-summary">
      <div>
        <dt>总成本</dt>
        <dd>{{ money(batch.totalCost) }}</dd>
      </div>
      <div>
        <dt>单位成本</dt>
        <dd>{{ money(batch.unitCost) }}{{ batch.unitCost == null ? '' : '/' + batch.unit }}</dd>
      </div>
    </dl>

    <h3>成本构成</h3>
    <div class="breakdown">
      <section v-for="item in breakdown" :key="item.key" class="breakdown-item">
        <button
          type="button"
          class="breakdown-button"
          :aria-expanded="active === item.key"
          :aria-controls="`batch-cost-${item.key}`"
          @click="toggle(item.key)"
        >
          <span class="breakdown-arrow" aria-hidden="true"></span>
          <span>{{ item.label }}</span>
          <strong>{{ money(item.amount) }}</strong>
          <small>{{ share(item.amount) }}</small>
        </button>
        <div :id="`batch-cost-${item.key}`" :hidden="active !== item.key" class="breakdown-body">
          <template v-if="active === item.key">
            <template v-if="item.key === 'upstream'">
              <RouterLink
                class="detail-link"
                :to="{
                  name: 'costing-traceability',
                  query: { batch: batch.batch, direction: 'up' },
                }"
              >
                查看全程追溯
              </RouterLink>
              <p v-if="!upstream.length" class="detail-muted">本批次没有上游转入记录。</p>
              <details v-for="row in upstream" :key="row.id" class="source-entry">
                <summary>
                  <span>{{ row.from }}</span
                  ><strong>{{ money(transfers.get(row.id)) }}</strong>
                </summary>
                <dl class="source-fields">
                  <div>
                    <dt>转入数量</dt>
                    <dd>{{ formatQuantity(row.qty) }} {{ row.unit }}</dd>
                  </div>
                  <div>
                    <dt>来源证据</dt>
                    <dd>{{ row.evidence }}</dd>
                  </div>
                </dl>
                <ElButton
                  v-if="costBatchIds.has(row.from)"
                  link
                  type="primary"
                  @click="emit('viewBatch', row.from)"
                >
                  查看上游批次成本
                </ElButton>
              </details>
            </template>

            <template v-else-if="item.key === 'direct'">
              <p v-if="!direct.length" class="detail-muted">本批次没有直接成本明细。</p>
              <details v-for="row in direct" :key="row.id" class="source-entry">
                <summary>
                  <span>{{ row.costName }}</span
                  ><strong>{{ money(row.amount) }}</strong>
                </summary>
                <dl class="source-fields">
                  <div>
                    <dt>成本要素</dt>
                    <dd>{{ row.itemCode }} · {{ row.costCategory }}</dd>
                  </div>
                  <div>
                    <dt>数量 × 单价</dt>
                    <dd>
                      {{ formatQuantity(row.quantity) }} {{ row.unit }} × {{ money(row.unitPrice) }}
                    </dd>
                  </div>
                  <div>
                    <dt>归集编号</dt>
                    <dd>{{ row.id }}</dd>
                  </div>
                  <div>
                    <dt>数据来源与证据</dt>
                    <dd>{{ row.source }} · {{ row.evidence }}</dd>
                  </div>
                </dl>
              </details>
              <details
                class="supplement"
                @toggle="catalogOpen = ($event.currentTarget as HTMLDetailsElement).open"
              >
                <summary>查看可直接计入批次的成本项</summary>
                <ElTable v-if="catalogOpen" :data="data.catalog" max-height="340" row-key="code">
                  <ElTableColumn prop="code" label="编码" min-width="95" />
                  <ElTableColumn prop="name" label="成本项" min-width="140" />
                  <ElTableColumn prop="directEligibility" label="直计资格" min-width="105" />
                  <ElTableColumn prop="sourceSystem" label="来源系统" min-width="130" />
                  <ElTableColumn prop="directCondition" label="直计条件" min-width="180" />
                </ElTable>
              </details>
            </template>

            <template v-else-if="item.key === 'allocation'">
              <p v-if="!allocations.length" class="detail-muted">本批次没有费用分摊明细。</p>
              <details v-for="row in allocations" :key="row.id" class="source-entry">
                <summary>
                  <span>{{ row.costName }}</span
                  ><strong>{{ money(row.amount) }}</strong>
                </summary>
                <dl class="source-fields">
                  <div>
                    <dt>费用池</dt>
                    <dd>{{ pools.get(row.poolCode)?.poolName ?? row.poolCode }}</dd>
                  </div>
                  <div>
                    <dt>分摊动因</dt>
                    <dd>{{ row.driverName }}</dd>
                  </div>
                  <div>
                    <dt>动因量 × 分摊率</dt>
                    <dd>
                      {{ formatAllocationInput(row.driverQuantity) }} {{ row.driverUnit }} ×
                      {{ formatAllocationInput(row.allocationRate) }}
                    </dd>
                  </div>
                  <div>
                    <dt>费用池原金额</dt>
                    <dd>{{ money(pools.get(row.poolCode)?.periodAmount) }}</dd>
                  </div>
                  <div>
                    <dt>分摊明细编号</dt>
                    <dd>{{ row.id }}</dd>
                  </div>
                  <div>
                    <dt>动因版本</dt>
                    <dd>{{ data.context.poolRuleVersion }}</dd>
                  </div>
                </dl>
              </details>
            </template>
            <p v-else class="detail-muted">
              {{ batch.adjustment ? '当前核算快照仅提供调整合计。' : '本批次没有调整金额。' }}
            </p>
          </template>
        </div>
      </section>
    </div>

    <details class="supplement">
      <summary>单位成本同比、环比</summary>
      <dl class="source-fields">
        <div v-for="row in comparisons" :key="row.key">
          <dt>{{ row.label }} · {{ row.period }}</dt>
          <dd v-if="row.baseline">
            {{ formatRate(row.rate) }} · 基准 {{ money(row.baselineUnitCost) }}/{{ batch.unit }}
            <small>{{ row.baseline.source }} · {{ row.baseline.version }}</small>
          </dd>
          <dd v-else>暂无可比数据</dd>
        </div>
      </dl>
    </details>
    <details class="supplement">
      <summary>核算信息</summary>
      <dl class="source-fields">
        <div>
          <dt>核算状态</dt>
          <dd>{{ batch.status }}</dd>
        </div>
        <div>
          <dt>数据快照</dt>
          <dd>{{ data.context.snapshot }}</dd>
        </div>
        <div>
          <dt>成本版本</dt>
          <dd>{{ data.context.costVersion }}</dd>
        </div>
      </dl>
    </details>
  </div>
</template>

<style scoped>
.cost-detail h2 {
  margin: 0 0 6px;
}
.cost-detail h3 {
  margin: 22px 0 10px;
  font-size: 16px;
}
.detail-muted,
.source-fields dt,
.detail-summary dt {
  color: var(--scos-muted);
}
.detail-muted {
  margin: 0 0 12px;
}
.detail-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.detail-summary > div {
  padding: 14px;
  border: 1px solid var(--scos-border);
  border-radius: 8px;
  background: var(--scos-background);
}
.detail-summary dd {
  margin: 5px 0 0;
  font-size: clamp(16px, 4vw, 24px);
  font-weight: 700;
  overflow-wrap: anywhere;
}
.breakdown {
  border: 1px solid var(--scos-border);
  border-radius: 8px;
}
.breakdown-item + .breakdown-item {
  border-top: 1px solid var(--scos-border);
}
.breakdown-button {
  display: grid;
  grid-template-columns: auto 1fr auto minmax(3.5em, auto);
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 46px;
  padding: 10px 12px;
  border: 0;
  background: var(--scos-surface);
  color: var(--scos-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.breakdown-button:hover,
.breakdown-button[aria-expanded='true'] {
  background: var(--scos-primary-soft);
}
.breakdown-arrow {
  width: 6px;
  height: 6px;
  border-right: 1px solid currentColor;
  border-bottom: 1px solid currentColor;
  transform: rotate(-45deg);
}
.breakdown-button[aria-expanded='true'] .breakdown-arrow {
  transform: rotate(45deg);
}
.breakdown-button small {
  justify-self: end;
  color: var(--scos-muted);
}
.breakdown-body {
  padding: 10px 12px;
}
.source-entry summary {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px solid var(--scos-border);
}
.source-entry summary span::before {
  content: '+';
  display: inline-block;
  width: 1.15em;
  color: var(--scos-primary);
}
.source-entry[open] summary span::before {
  content: '−';
}
.source-entry summary,
.supplement summary {
  cursor: pointer;
}
.source-entry strong {
  white-space: nowrap;
}
.source-fields {
  margin: 10px 0;
  font-size: 13px;
}
.source-fields > div {
  display: grid;
  grid-template-columns: minmax(95px, 0.35fr) minmax(0, 1fr);
  gap: 8px;
  margin: 6px 0;
}
.source-fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.source-fields small {
  display: block;
  color: var(--scos-muted);
}
.supplement {
  margin-top: 14px;
}
.detail-link {
  color: var(--scos-primary);
  display: inline-block;
  margin-bottom: 9px;
}
</style>
