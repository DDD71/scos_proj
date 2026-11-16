<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { ElAlert, ElButton, ElDialog, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { env } from '@/shared/config/env'
import { procurementRepository } from '../api/procurement.repository'
import ProcurementPriceForecastDialog from './ProcurementPriceForecastDialog.vue'
import ProcurementPriceForecastRecord from './ProcurementPriceForecastRecord.vue'
import {
  forecastGranularityLabels,
  formatForecastRange,
  isActivePriceForecast,
  priceForecastMethodLabels,
  priceForecastStatusLabels,
  type ProcurementPriceForecast,
  type ProcurementPriceForecastInput,
} from '../model/price-forecast'
import { formatSupplierSyncTime } from '../model/supplier-sync'

const props = defineProps<{
  materialCode: string
  materialName: string
  month: string
  currency: string
  unit: string
}>()
const emit = defineEmits<{ published: [] }>()
const period = ref('')
const status = ref('')
const records = ref<ProcurementPriceForecast[]>([])
const loading = ref(false)
const busy = ref(false)
const loadFailed = ref(false)
const error = ref('')
const feedback = ref('')
const editorOpen = ref(false)
const editing = shallowRef<ProcurementPriceForecast>()
const revision = shallowRef<ProcurementPriceForecast>()
const detail = shallowRef<ProcurementPriceForecast>()
const demoRole = ref<'reporter' | 'reviewer'>('reporter')
const canEdit = computed(() => env.dataSource !== 'mock' || demoRole.value === 'reporter')
const canReview = computed(() => env.dataSource !== 'mock' || demoRole.value === 'reviewer')
const filtered = computed(() =>
  records.value
    .filter(
      (record) =>
        (status.value
          ? (record.supersededById ? 'superseded' : record.status) === status.value
          : record.status !== 'deleted') &&
        (!period.value ||
          record.periods.some(
            ({ month, endMonth }) => month <= period.value && (endMonth ?? month) >= period.value,
          )),
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
)

function showError(cause: unknown) {
  error.value = cause instanceof Error ? cause.message : '价格预测操作失败。'
}

async function loadRecords() {
  loading.value = true
  loadFailed.value = false
  try {
    records.value = await procurementRepository.listPriceForecasts(props.materialCode)
  } catch (cause) {
    records.value = []
    loadFailed.value = true
    showError(cause)
  } finally {
    loading.value = false
  }
}

onMounted(loadRecords)

function openEditor(record?: ProcurementPriceForecast, parent?: ProcurementPriceForecast) {
  editing.value = record
  revision.value = parent ?? records.value.find((item) => item.id === record?.replacesId)
  error.value = ''
  editorOpen.value = true
}

async function run(action: () => Promise<unknown>, message: string) {
  if (busy.value) return false
  busy.value = true
  error.value = ''
  feedback.value = ''
  try {
    await action()
    await loadRecords()
    feedback.value = message
    return true
  } catch (cause) {
    showError(cause)
    return false
  } finally {
    busy.value = false
  }
}

async function save(input: ProcurementPriceForecastInput) {
  const previous = editing.value ?? revision.value
  if (
    await run(
      () =>
        procurementRepository.savePriceForecast(
          props.materialCode,
          previous?.currency ?? props.currency,
          previous?.unit ?? props.unit,
          input,
          editing.value?.id,
          revision.value?.id,
        ),
      '草稿已保存。',
    )
  )
    editorOpen.value = false
}

function review(id: string, action: 'submit' | 'return') {
  return run(
    () => procurementRepository.reviewPriceForecast(props.materialCode, id, action),
    action === 'submit' ? '已提交审核。' : '已退回草稿。',
  )
}

async function publish(id: string) {
  if (
    await run(
      () => procurementRepository.publishPriceForecast(props.materialCode, id),
      '预测版本已发布。',
    )
  )
    emit('published')
}

function remove(id: string) {
  return run(
    () => procurementRepository.deletePriceForecast(props.materialCode, id),
    '草稿已删除。',
  )
}
</script>

<template>
  <section aria-label="预测提报列表">
    <div class="filters">
      <label>覆盖月份 <input v-model="period" type="month" /></label>
      <label
        >状态
        <select v-model="status">
          <option value="">全部状态</option>
          <option v-for="(label, key) in priceForecastStatusLabels" :key="key" :value="key">
            {{ label }}
          </option>
          <option value="superseded">已被替代</option>
        </select>
      </label>
      <ElButton
        class="new-forecast"
        :disabled="!canEdit || busy || loading || loadFailed"
        type="primary"
        @click="openEditor()"
        >新建预测提报</ElButton
      >
      <label v-if="env.dataSource === 'mock'"
        >演示角色
        <select v-model="demoRole">
          <option value="reporter">采购提报员</option>
          <option value="reviewer">采购审核员</option>
        </select>
      </label>
    </div>
    <ElAlert v-if="error && !editorOpen" :title="error" type="error" :closable="false" />
    <p v-if="feedback" role="status">{{ feedback }}</p>
    <ElTable :data="filtered" :empty-text="loading ? '正在读取预测…' : '暂无匹配的提报记录'">
      <ElTableColumn prop="id" label="版本" min-width="150" show-overflow-tooltip />
      <ElTableColumn label="覆盖期间" min-width="164"
        ><template #default="{ row }">{{
          formatForecastRange(row as ProcurementPriceForecast)
        }}</template></ElTableColumn
      >
      <ElTableColumn label="颗粒度" width="85"
        ><template #default="{ row }">{{
          forecastGranularityLabels[
            (row.granularity ?? 'month') as keyof typeof forecastGranularityLabels
          ]
        }}</template></ElTableColumn
      >
      <ElTableColumn label="方式" width="93"
        ><template #default="{ row }">{{
          priceForecastMethodLabels[row.method as keyof typeof priceForecastMethodLabels]
        }}</template></ElTableColumn
      >
      <ElTableColumn prop="basis" label="研判摘要" min-width="130" show-overflow-tooltip />
      <ElTableColumn label="状态" min-width="98"
        ><template #default="{ row }"
          ><ElTag
            effect="plain"
            :type="isActivePriceForecast(row as ProcurementPriceForecast) ? 'success' : 'info'"
            >{{
              row.supersededById
                ? '已被替代'
                : priceForecastStatusLabels[row.status as keyof typeof priceForecastStatusLabels]
            }}</ElTag
          ></template
        ></ElTableColumn
      >
      <ElTableColumn prop="submittedBy" label="提报人" min-width="135" />
      <ElTableColumn prop="publishedBy" label="发布人" min-width="135" />
      <ElTableColumn label="发布时间" min-width="150"
        ><template #default="{ row }">{{
          row.publishedAt ? formatSupplierSyncTime(row.publishedAt) : '—'
        }}</template></ElTableColumn
      >
      <ElTableColumn label="更新时间" min-width="150"
        ><template #default="{ row }">{{
          formatSupplierSyncTime(row.updatedAt)
        }}</template></ElTableColumn
      >
      <ElTableColumn label="操作" width="195" fixed="right">
        <template #default="{ row }">
          <ElButton link type="primary" @click="detail = row as ProcurementPriceForecast"
            >查看</ElButton
          >
          <template v-if="row.status === 'draft' && canEdit">
            <ElButton link :disabled="busy" @click="openEditor(row as ProcurementPriceForecast)"
              >编辑</ElButton
            >
            <ElButton link type="primary" :disabled="busy" @click="review(row.id, 'submit')"
              >提交</ElButton
            >
            <ElButton link type="danger" :disabled="busy" @click="remove(row.id)">删除</ElButton>
          </template>
          <template v-else-if="row.status === 'submitted' && canReview">
            <ElButton link type="primary" :disabled="busy" @click="publish(row.id)"
              >审核发布</ElButton
            >
            <ElButton link :disabled="busy" @click="review(row.id, 'return')">退回</ElButton>
          </template>
          <ElButton
            v-else-if="isActivePriceForecast(row as ProcurementPriceForecast) && canEdit"
            link
            type="primary"
            :disabled="busy"
            @click="
              openEditor(
                records.find((item) => item.status === 'draft' && item.replacesId === row.id),
                row as ProcurementPriceForecast,
              )
            "
            >修订</ElButton
          >
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
  <ProcurementPriceForecastDialog
    v-model="editorOpen"
    :material-name="materialName"
    :initial-month="month"
    :currency="currency"
    :unit="unit"
    :editing="editing"
    :revision="revision"
    :save-error="editorOpen ? error : ''"
    @save="save"
  />
  <ElDialog
    :model-value="!!detail"
    title="价格预测详情"
    width="min(820px, 94vw)"
    append-to-body
    @update:model-value="detail = undefined"
  >
    <ProcurementPriceForecastRecord v-if="detail" :forecast="detail" />
  </ElDialog>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
  margin-bottom: 16px;
}
.new-forecast {
  margin-inline-start: auto;
}
.filters label {
  display: grid;
  gap: 5px;
}
.filters input,
.filters select {
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--scos-border);
  border-radius: 5px;
  color: inherit;
  background: #fff;
}
</style>
