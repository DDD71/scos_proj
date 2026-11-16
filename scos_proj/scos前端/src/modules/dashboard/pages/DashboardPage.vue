<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElAlert, ElButton, ElDrawer, ElSkeleton } from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import { env } from '@/shared/config/env'
import DashboardMap from '../components/DashboardMap.vue'
import DashboardMetricCard from '../components/DashboardMetricCard.vue'
import DashboardTopicPanel from '../components/DashboardTopicPanel.vue'
import { useDashboardStore } from '../model/dashboard.store'
import {
  alertLevels,
  dashboardDomains,
  displayTimestamp,
  displayValue,
} from '../model/presentation'
import type {
  DashboardAlert,
  DashboardDomain,
  DashboardMapNode,
  DashboardMapRoute,
  DashboardMetric,
} from '../model/types'

type DrawerContent =
  | { kind: 'alerts' }
  | { kind: 'alert'; item: DashboardAlert; fromList?: boolean }
  | { kind: 'metric'; item: DashboardMetric }
  | { kind: 'map'; item: DashboardMapNode | DashboardMapRoute }

const store = useDashboardStore()
const { overview, loading, error } = storeToRefs(store)
const selectedPeriod = ref('')
const domain = ref<DashboardDomain>('sales')
const topicSection = ref<HTMLElement>()
const drawer = ref<DrawerContent>()
const alertLevel = ref('')
const alertDomain = ref('')
const alertState = ref('open')

const period = computed(
  () =>
    overview.value?.periods.find(({ id }) => id === selectedPeriod.value) ??
    overview.value?.periods[0],
)
const alertEvents = computed(() =>
  [...(overview.value?.alerts ?? [])].sort((left, right) => {
    if (left.level !== right.level) return left.level === 'urgent' ? -1 : 1
    return (
      (left.riskDate ?? '9999').localeCompare(right.riskDate ?? '9999') ||
      right.detectedAt.localeCompare(left.detectedAt)
    )
  }),
)
const openAlerts = computed(() => alertEvents.value.filter(({ status }) => status !== '已关闭'))
const urgentCount = computed(
  () => openAlerts.value.filter(({ level }) => level === 'urgent').length,
)
const featuredAlerts = computed(() => {
  const urgent = openAlerts.value.filter(({ level }) => level === 'urgent')
  const slots = [...urgent]
  const represented = new Set(urgent.map(({ domain }) => domain))
  for (const event of openAlerts.value) {
    if (event.level === 'urgent' || represented.has(event.domain)) continue
    slots.push(event)
    represented.add(event.domain)
  }
  return [...slots, ...openAlerts.value.filter((event) => !slots.includes(event))].slice(0, 4)
})
const visibleAlerts = computed(() =>
  alertEvents.value.filter(
    (event) =>
      (!alertLevel.value || event.level === alertLevel.value) &&
      (!alertDomain.value || event.domain === alertDomain.value) &&
      (alertState.value === 'all' ||
        (alertState.value === 'open' ? event.status !== '已关闭' : event.status === '已关闭')),
  ),
)
const drawerTitle = computed(() => {
  const content = drawer.value
  if (!content) return ''
  if (content.kind === 'alerts') return '供应链预警'
  if (content.kind === 'alert') return '预警详情'
  if (content.kind === 'metric') return '指标溯源'
  return '供应链地图详情'
})
const relatedAlert = computed(() => {
  const content = drawer.value
  if (content?.kind === 'map')
    return alertEvents.value.find(({ id }) => id === content.item.alertId)
  return undefined
})

watch(overview, (snapshot) => {
  if (snapshot && !snapshot.periods.some(({ id }) => id === selectedPeriod.value))
    selectedPeriod.value = snapshot.periods[0]?.id ?? ''
})
onMounted(() => store.loadOverview())

function showAlerts() {
  alertLevel.value = ''
  alertDomain.value = ''
  alertState.value = 'open'
  drawer.value = { kind: 'alerts' }
}

function showMetric(item: DashboardMetric) {
  drawer.value = { kind: 'metric', item }
}

function showMap(item: DashboardMapNode | DashboardMapRoute) {
  drawer.value = { kind: 'map', item }
}

async function showTopic(metric: DashboardMetric) {
  drawer.value = undefined
  domain.value = metric.domain
  await nextTick()
  topicSection.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
</script>

<template>
  <div class="dashboard">
    <PageHeader title="供应链驾驶舱">
      <template #actions>
        <div class="dashboard-controls">
          <span v-if="overview" class="dashboard-factory">{{ overview.factory }}</span>
          <label v-if="overview" class="dashboard-period">
            <span>统计期间</span>
            <select v-model="selectedPeriod">
              <option v-for="item in overview.periods" :key="item.id" :value="item.id">
                {{ item.label }}
              </option>
            </select>
          </label>
          <RouterLink v-slot="{ href, navigate }" to="/sandbox" custom>
            <ElButton tag="a" :href="href" @click="navigate">沙盘推演</ElButton>
          </RouterLink>
          <ElButton type="primary" :loading="loading" @click="store.loadOverview">刷新</ElButton>
        </div>
      </template>
    </PageHeader>

    <ElSkeleton v-if="loading && !overview" animated :rows="7" class="surface dashboard-empty" />
    <ElAlert v-else-if="error" :title="error" type="error" :closable="false" show-icon />
    <template v-else-if="overview && period">
      <div class="dashboard-context">
        <span
          ><i />数据截至
          <time :datetime="period.asOf">{{ displayTimestamp(period.asOf) }}</time></span
        >
        <span v-if="env.dataSource === 'mock'">演示数据</span>
      </div>

      <section class="dashboard-metrics" aria-label="全局核心指标">
        <DashboardMetricCard
          v-for="metric in period.metrics"
          :key="metric.key"
          :metric="metric"
          @select="showMetric"
        />
      </section>

      <div class="dashboard-operations">
        <DashboardMap
          :nodes="overview.nodes"
          :routes="overview.routes"
          @node="showMap"
          @route="showMap"
        />
        <section class="surface alert-panel" aria-labelledby="dashboard-alert-title">
          <header class="alert-head">
            <div>
              <h2 id="dashboard-alert-title">
                待处置预警 <span>{{ openAlerts.length }}</span>
              </h2>
              <p>一级 {{ urgentCount }} 条 · 二级 {{ openAlerts.length - urgentCount }} 条</p>
            </div>
            <button type="button" class="text-action" @click="showAlerts">查看全部 →</button>
          </header>
          <ul v-if="openAlerts.length" class="alert-list">
            <li v-for="event in featuredAlerts" :key="event.id">
              <button
                type="button"
                class="alert-row"
                :class="event.level"
                @click="drawer = { kind: 'alert', item: event }"
              >
                <span class="alert-row-content">
                  <strong>{{ event.title }}</strong>
                  <span>{{ event.detail }}</span>
                </span>
                <span class="alert-row-meta">
                  <span class="alert-level" :class="event.level">{{
                    alertLevels[event.level]
                  }}</span>
                  <span>{{
                    event.riskDate ? event.riskDate.slice(5) : event.detectedAt.slice(11, 16)
                  }}</span>
                </span>
              </button>
            </li>
          </ul>
          <p v-else class="alert-empty">当前无待处置预警。</p>
          <footer class="alert-foot">
            当前供应链快照 {{ displayTimestamp(overview.snapshotAt) }}
          </footer>
        </section>
      </div>

      <div ref="topicSection" class="dashboard-topics">
        <DashboardTopicPanel
          :topics="period.topics"
          :active="domain"
          @change="domain = $event"
          @metric="showMetric"
        />
      </div>
    </template>
    <p v-else class="surface dashboard-empty">暂无可用驾驶舱快照。</p>
  </div>

  <ElDrawer
    :model-value="Boolean(drawer)"
    :title="drawerTitle"
    :size="drawer?.kind === 'alerts' ? 'min(760px, 100%)' : 'min(575px, 100%)'"
    append-to-body
    @update:model-value="!$event && (drawer = undefined)"
  >
    <section v-if="drawer?.kind === 'alerts'" class="drawer-content" aria-label="全部预警">
      <div class="drawer-filters">
        <label
          >级别
          <select v-model="alertLevel">
            <option value="">全部级别</option>
            <option value="urgent">一级紧急</option>
            <option value="warning">二级预警</option>
          </select>
        </label>
        <label
          >业务域
          <select v-model="alertDomain">
            <option value="">全部业务域</option>
            <option v-for="(name, key) in dashboardDomains" :key="key" :value="key">
              {{ name }}
            </option>
          </select>
        </label>
        <label
          >状态
          <select v-model="alertState">
            <option value="open">未关闭</option>
            <option value="closed">已关闭</option>
            <option value="all">全部状态</option>
          </select>
        </label>
      </div>
      <ul v-if="visibleAlerts.length" class="alert-list drawer-alerts">
        <li v-for="event in visibleAlerts" :key="event.id">
          <button
            type="button"
            class="alert-row"
            :class="event.level"
            @click="drawer = { kind: 'alert', item: event, fromList: true }"
          >
            <span class="alert-row-content">
              <strong>{{ event.title }}</strong>
              <span>{{ event.detail }}</span>
              <span>{{ event.source }} · {{ displayTimestamp(event.detectedAt) }}</span>
            </span>
            <span class="alert-row-meta"
              ><span class="alert-level" :class="event.level">{{ alertLevels[event.level] }}</span
              ><span>{{ event.status }}</span></span
            >
          </button>
        </li>
      </ul>
      <p v-else class="alert-empty">没有符合当前筛选条件的预警。</p>
    </section>
    <section v-else-if="drawer?.kind === 'alert'" class="drawer-content">
      <button
        v-if="drawer.fromList"
        type="button"
        class="text-action drawer-back"
        @click="drawer = { kind: 'alerts' }"
      >
        ← 返回预警列表
      </button>
      <h2>{{ drawer.item.title }}</h2>
      <p class="drawer-description">{{ drawer.item.detail }}</p>
      <div class="drawer-tags">
        <span class="alert-level" :class="drawer.item.level">{{
          alertLevels[drawer.item.level]
        }}</span
        ><span>{{ drawer.item.status }}</span>
      </div>
      <dl class="detail-facts">
        <div>
          <dt>来源</dt>
          <dd>{{ drawer.item.source }}</dd>
        </div>
        <div>
          <dt>快照时间</dt>
          <dd>{{ displayTimestamp(drawer.item.detectedAt) }}</dd>
        </div>
        <div v-for="fact in drawer.item.facts" :key="fact.label">
          <dt>{{ fact.label }}</dt>
          <dd>{{ fact.value }}</dd>
        </div>
      </dl>
      <div class="drawer-tags">
        <RouterLink v-if="drawer.item.target" class="drawer-cta" :to="drawer.item.target.to">
          {{ drawer.item.target.label }} →
        </RouterLink>
        <RouterLink
          v-if="drawer.item.domain === 'inventory' && drawer.item.id.startsWith('stock:')"
          class="text-action"
          :to="{
            path: '/inventory/overview',
            query: { product: drawer.item.id.slice(6), adjust: '1', reason: drawer.item.title },
          }"
          >试算库存策略 →</RouterLink
        >
        <RouterLink
          v-else-if="drawer.item.domain !== 'inventory'"
          class="text-action"
          :to="{
            path: '/sandbox',
            query: {
              snapshot: overview?.snapshotAt ?? undefined,
              event: drawer.item.title,
              eventId: drawer.item.id,
            },
          }"
          >带入沙盘推演 →</RouterLink
        >
      </div>
    </section>
    <section v-else-if="drawer?.kind === 'metric'" class="drawer-content">
      <h2>{{ drawer.item.label }}</h2>
      <p class="drawer-number">{{ displayValue(drawer.item.value, drawer.item.unit) }}</p>
      <dl class="detail-facts">
        <div>
          <dt>数据截至</dt>
          <dd>{{ displayTimestamp(drawer.item.asOf) }}</dd>
        </div>
        <div>
          <dt>来源</dt>
          <dd>{{ drawer.item.source }}</dd>
        </div>
        <div>
          <dt>统计口径</dt>
          <dd>{{ drawer.item.basis }}</dd>
        </div>
        <div v-if="drawer.item.target">
          <dt>目标</dt>
          <dd>{{ drawer.item.target }}</dd>
        </div>
        <div>
          <dt>对比值（{{ drawer.item.comparison.replace('较', '') }}）</dt>
          <dd>{{ displayValue(drawer.item.previous, drawer.item.unit) }}</dd>
        </div>
      </dl>
      <ElButton type="primary" class="drawer-back" @click="showTopic(drawer.item)"
        >查看{{ dashboardDomains[drawer.item.domain] }}专题</ElButton
      >
    </section>
    <section v-else-if="drawer?.kind === 'map'" class="drawer-content">
      <h2>{{ drawer.item.name }}</h2>
      <dl class="detail-facts">
        <div v-for="fact in drawer.item.facts" :key="fact.label">
          <dt>{{ fact.label }}</dt>
          <dd>{{ fact.value }}</dd>
        </div>
      </dl>
      <div class="drawer-tags">
        <button
          v-if="relatedAlert"
          type="button"
          class="text-action"
          @click="drawer = { kind: 'alert', item: relatedAlert }"
        >
          查看关联预警 →
        </button>
        <RouterLink v-if="drawer.item.target" class="drawer-cta" :to="drawer.item.target.to"
          >{{ drawer.item.target.label }} →</RouterLink
        >
      </div>
    </section>
  </ElDrawer>
</template>

<style scoped>
.dashboard {
  min-width: 0;
}
.dashboard :deep(.page-heading) {
  margin-bottom: 7px;
}
.dashboard-controls,
.dashboard-period {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.dashboard-controls {
  gap: 8px 14px;
}
.dashboard-factory {
  font-weight: 600;
  color: #476476;
}
.dashboard-period,
.dashboard-context {
  color: #607789;
  font-size: 12px;
}
.dashboard-period select,
.drawer-filters select {
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid #dce6eb;
  border-radius: 7px;
  color: var(--scos-ink);
  background: white;
}
.dashboard-context {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 13px;
}
.dashboard-context span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dashboard-context i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #208e92;
}
.dashboard-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 11px;
  margin-bottom: 15px;
}
.dashboard-operations {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr);
  gap: 14px;
  margin-bottom: 15px;
}
.dashboard-topics {
  scroll-margin-top: 16px;
}
.alert-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 15px 14px 12px;
}
.alert-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 11px;
}
.alert-head h2 {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 16px;
}
.alert-head h2::before {
  content: '';
  width: 4px;
  height: 15px;
  border-radius: 2px;
  background: var(--scos-primary);
}
.alert-head h2 span {
  display: inline-grid;
  min-width: 24px;
  height: 20px;
  place-items: center;
  padding: 0 5px;
  border-radius: 11px;
  background: #edf6f7;
  color: #08737c;
  font-size: 12px;
}
.alert-head p,
.alert-foot,
.alert-empty {
  margin-top: 5px;
  color: var(--scos-muted);
  font-size: 11px;
}
.alert-foot {
  margin-top: auto;
  padding-top: 9px;
}
.alert-list {
  display: grid;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.alert-row {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 10px 9px 10px 14px;
  border: 1px solid #e1e9ee;
  border-radius: 8px;
  background: #f9fbfc;
  color: var(--scos-ink);
  cursor: pointer;
  text-align: left;
}
.alert-row:hover {
  border-color: #83b7bd;
}
.alert-row::before {
  position: absolute;
  inset: 9px auto 9px 5px;
  width: 3px;
  border-radius: 3px;
  content: '';
  background: #d59b47;
}
.alert-row.urgent::before {
  background: #cf554b;
}
.alert-row-content,
.alert-row-meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.alert-row-content strong {
  font-size: 13px;
}
.alert-row-content > span,
.alert-row-meta {
  color: #627b8c;
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.alert-row-meta {
  flex-shrink: 0;
  justify-items: end;
}
.alert-level {
  display: inline-block;
  padding: 3px 6px;
  border-radius: 5px;
  background: #fcf0da;
  color: #8a5b18;
  font-size: 10px;
  white-space: nowrap;
}
.alert-level.urgent {
  background: #fbe6e3;
  color: #a83d39;
}
.text-action {
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--scos-primary);
  cursor: pointer;
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
}
.text-action:hover {
  text-decoration: underline;
}
.dashboard-empty {
  padding: 20px;
}
.drawer-content {
  display: grid;
  gap: 13px;
}
.drawer-content h2 {
  font-size: 19px;
}
.drawer-description {
  color: #506b7d;
  line-height: 1.5;
}
.drawer-filters,
.drawer-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.drawer-filters label {
  display: grid;
  gap: 5px;
  font-size: 12px;
  color: #506b7d;
}
.drawer-number {
  font-size: 29px;
  font-weight: 700;
}
.detail-facts {
  display: grid;
  margin: 0;
  border: 1px solid #e1e9ee;
  border-radius: 8px;
  overflow: hidden;
}
.detail-facts div {
  display: grid;
  grid-template-columns: minmax(80px, 28%) 1fr;
  border-bottom: 1px solid #e1e9ee;
}
.detail-facts div:last-child {
  border-bottom: 0;
}
.detail-facts dt,
.detail-facts dd {
  margin: 0;
  padding: 9px 10px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.detail-facts dt {
  background: #f6f9fa;
  color: #567184;
}
.drawer-cta {
  justify-self: start;
  padding: 7px 11px;
  border-radius: 6px;
  background: #087f8c;
  color: white;
  font-size: 13px;
}
.drawer-cta:hover {
  background: #096e79;
}
.drawer-back {
  justify-self: start;
}
.drawer-alerts .alert-row {
  padding: 12px 11px 12px 16px;
}
@media (max-width: 1150px) {
  .dashboard-metrics {
    grid-template-columns: repeat(auto-fit, minmax(147px, 1fr));
  }
}
@media (max-width: 900px) {
  .dashboard-operations {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 520px) {
  .dashboard :deep(.page-heading) {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .alert-panel {
    order: -1;
  }
  .dashboard-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .dashboard-metrics > :last-child {
    grid-column: 1 / -1;
  }
  .dashboard-controls {
    gap: 7px;
  }
}
</style>
