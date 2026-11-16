<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElAlert, ElButton, ElEmpty, ElInputNumber, ElOption, ElSelect } from 'element-plus'
import PageHeader from '@/shared/components/PageHeader.vue'
import { procurementRepository } from '../api/procurement.repository'
import ProcurementPriceDecisionPanel from '../components/ProcurementPriceDecisionPanel.vue'
import {
  calculateProcurementNeed,
  summarizeWeeklyProductionDemand,
  type ProcurementDemandVersion,
} from '../model/demand'
import { emptyDraft } from '../model/drafts'
import { readDrafts, saveDraft } from '../api/procurement-drafts.local'
import type { ProcurementForecastSnapshot } from '../model/price-forecast'

const router = useRouter()
const { query } = useRoute()
const initialMonth =
  typeof query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month)
    ? query.month
    : undefined
const month = ref(
  initialMonth ??
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date()),
)
const plant = ref('')
const materialCode = ref('')
const versionId = ref('')
const versions = ref<ProcurementDemandVersion[]>([])
const loading = ref(false)
const failed = ref(false)
const retry = ref(0)
const localDrafts = ref(readDrafts())
const expectedQuantity = ref<number>()
const forecastSnapshot = shallowRef<ProcurementForecastSnapshot>()

const plants = computed(() => [...new Set(versions.value.map((version) => version.plant))])
const plantVersions = computed(() =>
  versions.value.filter((version) => version.plant === plant.value),
)
const materials = computed(() => [
  ...new Map(plantVersions.value.map((version) => [version.materialCode, version])).values(),
])
const materialVersions = computed(() =>
  plantVersions.value.filter((version) => version.materialCode === materialCode.value),
)
const selectedVersion = computed(() =>
  materialVersions.value.find((version) => version.versionId === versionId.value),
)
const existingDraft = computed(() => {
  const version = selectedVersion.value
  if (!version) return
  return localDrafts.value.find(
    ({ demandSnapshot }) =>
      demandSnapshot?.month === version.month &&
      demandSnapshot.plant === version.plant &&
      demandSnapshot.materialCode === version.materialCode &&
      demandSnapshot.planId === version.planId &&
      demandSnapshot.versionId === version.versionId,
  )
})
const demandSnapshot = computed(() => existingDraft.value?.demandSnapshot ?? selectedVersion.value)
const need = computed(() =>
  demandSnapshot.value ? calculateProcurementNeed(demandSnapshot.value) : null,
)
const summary = computed(() => {
  const lines = need.value?.lines ?? []
  return {
    productionDemand: lines.reduce((sum, line) => sum + line.grossQuantity, 0),
    availableStock: lines.reduce((sum, line) => sum + line.availableStockQuantity, 0),
    effectiveInbound: lines.reduce((sum, line) => sum + line.effectiveInboundQuantity, 0),
  }
})
const weeklyDemand = computed(() =>
  summarizeWeeklyProductionDemand(demandSnapshot.value?.lines ?? []),
)
const canCreate = computed(() => {
  const net = need.value?.netQuantity ?? 0
  return net > 0 && (expectedQuantity.value ?? 0) >= net
})
const formatQuantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format

watch(
  [month, retry],
  async ([period], _, onCleanup) => {
    versions.value = []
    failed.value = false
    loading.value = Boolean(period)
    if (!period) return

    let current = true
    onCleanup(() => {
      current = false
    })
    try {
      const published = await procurementRepository.listPublishedDemandVersions(period)
      if (current) {
        versions.value = published
          .filter((version) => version.month === period)
          .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        const preferred =
          period === initialMonth
            ? versions.value.find(
                (version) =>
                  version.plant === query.plant &&
                  version.materialCode === query.materialCode &&
                  version.versionId === query.versionId,
              )
            : undefined
        if (preferred) {
          plant.value = preferred.plant
          materialCode.value = preferred.materialCode
          versionId.value = preferred.versionId
        }
      }
    } catch {
      if (current) failed.value = true
    } finally {
      if (current) loading.value = false
    }
  },
  { immediate: true },
)

watch(plants, (options) => {
  if (!options.includes(plant.value)) plant.value = options[0] ?? ''
})
watch(materials, (options) => {
  if (!options.some((option) => option.materialCode === materialCode.value)) {
    materialCode.value = options[0]?.materialCode ?? ''
  }
})
watch(materialVersions, (options) => {
  if (!options.some((option) => option.versionId === versionId.value)) {
    versionId.value = options[0]?.versionId ?? ''
  }
})
watch(selectedVersion, () => {
  expectedQuantity.value = existingDraft.value?.confirmedQuantity ?? need.value?.netQuantity
  forecastSnapshot.value = existingDraft.value?.forecastSnapshot
})

function createPlan() {
  const version = selectedVersion.value
  const quantity = need.value?.netQuantity
  if (!version || quantity == null || !canCreate.value) return

  const previous = existingDraft.value
  const id = previous?.id ?? crypto.randomUUID()
  if (previous) {
    const quantityUnchanged = expectedQuantity.value === previous.confirmedQuantity
    saveDraft({
      ...previous,
      forecastSnapshot: previous.forecastSnapshot?.frozenAt
        ? previous.forecastSnapshot
        : forecastSnapshot.value,
      confirmedQuantity: expectedQuantity.value,
      optimizationInput: quantityUnchanged ? previous.optimizationInput : undefined,
      optimizationResult: quantityUnchanged ? previous.optimizationResult : undefined,
    })
  } else {
    saveDraft({
      ...emptyDraft(),
      id,
      month: version.month,
      plant: version.plant,
      materialCode: version.materialCode,
      unit: version.unit,
      demandSnapshot: version,
      forecastSnapshot: forecastSnapshot.value,
      demandQuantity: quantity,
      confirmedQuantity: expectedQuantity.value,
    })
  }
  localDrafts.value = readDrafts()
  void router.push({ name: 'procurement-draft', params: { draftId: id } })
}
</script>

<template>
  <PageHeader title="新建采购方案" description="查看库存和生产需求，填写预期采购需求量。">
    <template #actions>
      <RouterLink class="back-link" :to="{ name: 'procurement-plans' }">返回采购方案</RouterLink>
    </template>
  </PageHeader>

  <form class="surface plan-form" @submit.prevent="createPlan">
    <div class="plan-grid">
      <div class="field">
        <label for="proc-month">方案月份</label>
        <input id="proc-month" v-model="month" type="month" />
      </div>
      <div class="field">
        <label for="proc-plant">工厂</label>
        <ElSelect id="proc-plant" v-model="plant" :disabled="!plants.length" placeholder="选择工厂">
          <ElOption v-for="option in plants" :key="option" :label="option" :value="option" />
        </ElSelect>
      </div>
      <div class="field">
        <label for="proc-material">物料</label>
        <ElSelect
          id="proc-material"
          v-model="materialCode"
          :disabled="!materials.length"
          placeholder="选择物料"
        >
          <ElOption
            v-for="option in materials"
            :key="option.materialCode"
            :value="option.materialCode"
            :label="[option.materialName, option.materialCode].filter(Boolean).join(' · ')"
          />
        </ElSelect>
      </div>
      <div class="field">
        <label for="proc-version">上游需求版本</label>
        <ElSelect
          id="proc-version"
          v-model="versionId"
          :disabled="!materialVersions.length"
          placeholder="选择已发布版本"
        >
          <ElOption
            v-for="option in materialVersions"
            :key="option.versionId"
            :value="option.versionId"
            :label="option.versionId"
          />
        </ElSelect>
      </div>
    </div>

    <p v-if="loading" role="status">正在读取已发布的原材料需求计划…</p>
    <div v-else-if="failed" class="load-error">
      <ElAlert title="未能读取已发布的原材料需求计划。" type="error" :closable="false" />
      <ElButton @click="retry++">重试</ElButton>
    </div>
    <ElEmpty
      v-else-if="!demandSnapshot"
      :description="month ? '该月暂无已发布的原材料需求计划' : '请选择方案月份'"
      :image-size="58"
    />
    <template v-else-if="need">
      <ElAlert
        v-if="need.netQuantity === 0"
        title="现有供应已覆盖需求，无需进入采购优化。"
        type="info"
        :closable="false"
      />
      <div v-else class="purchase-quantity field">
        <label for="proc-expected-quantity">预期采购需求量（{{ demandSnapshot.unit }}）</label>
        <div class="quantity-actions">
          <ElInputNumber
            id="proc-expected-quantity"
            v-model="expectedQuantity"
            :min="need.netQuantity"
            :precision="3"
            :controls="false"
            aria-describedby="proc-expected-quantity-help"
          />
          <ElButton type="primary" native-type="submit" :disabled="!canCreate">
            确认需求并设置求解参数
          </ElButton>
        </div>
        <p id="proc-expected-quantity-help">
          以需求缺口为下限，可按采购策略增加。
          <span v-if="expectedQuantity != null && expectedQuantity > need.netQuantity">
            比需求缺口多 {{ formatQuantity(expectedQuantity - need.netQuantity) }}
            {{ demandSnapshot.unit }}。
          </span>
        </p>
      </div>
      <ProcurementPriceDecisionPanel
        v-if="demandSnapshot.materialCode === 'RM-CORN-STARCH'"
        :key="
          [
            demandSnapshot.plant,
            demandSnapshot.month,
            demandSnapshot.materialCode,
            demandSnapshot.versionId,
          ].join(':')
        "
        :material-code="demandSnapshot.materialCode"
        :material-name="demandSnapshot.materialName"
        :month="demandSnapshot.month"
        :unit="demandSnapshot.unit"
        :snapshot="forecastSnapshot"
        allow-forecast-maintenance
        @reference="forecastSnapshot = $event"
      />
      <section class="need-preview" aria-labelledby="need-preview-title">
        <h2 id="need-preview-title">采购参考</h2>
        <dl class="purchase-summary">
          <div>
            <dt>现有库存（库存＋在途）</dt>
            <dd>
              {{ formatQuantity(summary.availableStock + summary.effectiveInbound) }}
              {{ demandSnapshot.unit }}
            </dd>
            <dd class="summary-detail">
              可用库存 {{ formatQuantity(summary.availableStock) }} {{ demandSnapshot.unit }} ·
              有效在途 {{ formatQuantity(summary.effectiveInbound) }} {{ demandSnapshot.unit }}
            </dd>
          </div>
          <div>
            <dt>月生产需求总量</dt>
            <dd>{{ formatQuantity(summary.productionDemand) }} {{ demandSnapshot.unit }}</dd>
          </div>
          <div>
            <dt>需求缺口</dt>
            <dd>{{ formatQuantity(need.netQuantity) }} {{ demandSnapshot.unit }}</dd>
          </div>
        </dl>
        <section class="weekly-demand" aria-labelledby="weekly-demand-title">
          <h3 id="weekly-demand-title">每周生产需求</h3>
          <dl class="purchase-summary">
            <div v-for="week in weeklyDemand" :key="week.startDate">
              <dt>{{ week.startDate }} 至 {{ week.endDate }}</dt>
              <dd>{{ formatQuantity(week.grossQuantity) }} {{ demandSnapshot.unit }}</dd>
            </div>
          </dl>
          <p>日度到货安排由要货计划优化模型结合生产需求、库存和在途生成。</p>
        </section>
      </section>
    </template>
  </form>
</template>

<style scoped>
.plan-form,
.need-preview {
  display: grid;
  gap: 16px;
}
.plan-form {
  padding: 24px;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
}
.plan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
  gap: 16px;
}
.field {
  display: grid;
  gap: 8px;
}
input[type='month'] {
  width: 100%;
  height: 32px;
  padding-inline: 10px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  color: var(--el-text-color-regular);
}
.load-error,
.quantity-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.need-preview h2 {
  font-size: 16px;
}
.weekly-demand h3 {
  font-size: 14px;
}
.weekly-demand {
  display: grid;
  gap: 8px;
}
.weekly-demand p,
.purchase-quantity p,
.purchase-summary dt,
.purchase-summary .summary-detail {
  color: var(--scos-muted);
  font-size: 13px;
}
.purchase-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
  gap: 12px;
  margin: 0;
}
.purchase-summary > div {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 7px;
  background: var(--scos-background);
}
.purchase-summary dd {
  margin: 5px 0 0;
  font-size: 18px;
  font-weight: 600;
}
.purchase-summary .summary-detail {
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
}
.purchase-quantity {
  padding: 14px 16px;
  border: 1px solid var(--scos-border);
  border-inline-start: 4px solid var(--scos-primary);
  border-radius: 7px;
  background: var(--scos-primary-soft);
}
.purchase-quantity label {
  color: var(--scos-primary);
  font-size: 16px;
  font-weight: 600;
}
.purchase-quantity .el-input-number {
  width: min(100%, 220px);
}
.purchase-quantity :deep(.el-input__inner) {
  font-size: 18px;
  font-weight: 600;
}
.back-link {
  color: var(--scos-primary);
}
</style>
