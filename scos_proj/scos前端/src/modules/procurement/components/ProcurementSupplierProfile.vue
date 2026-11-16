<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ElAlert,
  ElButton,
  ElInput,
  ElTable,
  ElTableColumn,
  ElTabPane,
  ElTabs,
  ElTag,
} from 'element-plus'
import { env } from '@/shared/config/env'
import { procurementRepository } from '../api/procurement.repository'
import { getSupplierRegion } from '../model/supplier-region'
import type { ProcurementSupplier, ProcurementSupplierDelivery } from '../model/types'
import ProcurementSupplierQuotes from './ProcurementSupplierQuotes.vue'
import ProcurementSupplierRiskScore from './ProcurementSupplierRiskScore.vue'

const props = defineProps<{ supplier: ProcurementSupplier }>()
const emit = defineEmits<{ qualificationSaved: [expiry: string | null] }>()
const activeTab = ref('qualification')
const editingQualification = ref(false)
const qualificationDraft = ref('')
const savingQualification = ref(false)
const qualificationError = ref(false)
const qualificationWarningDays = 45
const qualification = computed(() => {
  const expiry = props.supplier.qualificationExpiry
  if (!expiry) return { label: '待维护', type: 'info' } as const

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format()
  const days = (Date.parse(expiry) - Date.parse(today)) / 86_400_000
  if (days < 0) return { label: '已过期', type: 'danger' } as const
  if (days <= qualificationWarningDays) return { label: '即将到期', type: 'warning' } as const
  return { label: '有效', type: 'success' } as const
})
const deliveries = ref<ProcurementSupplierDelivery[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const orderedDeliveries = computed(() =>
  [...deliveries.value].sort((a, b) =>
    (b.purchaseOrderDate ?? '').localeCompare(a.purchaseOrderDate ?? ''),
  ),
)
const receivedLines = computed(
  () => deliveries.value.filter((row) => (row.receivedQuantity ?? 0) > 0).length,
)
const openLines = computed(
  () => deliveries.value.filter((row) => (row.openDeliveryQuantity ?? 0) > 0).length,
)

async function loadDeliveries() {
  loading.value = true
  loadFailed.value = false
  try {
    deliveries.value = await procurementRepository.listSupplierDeliveries(
      props.supplier.supplierCode,
    )
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

function editQualification() {
  qualificationDraft.value = props.supplier.qualificationExpiry ?? ''
  qualificationError.value = false
  editingQualification.value = true
}

async function saveQualification() {
  savingQualification.value = true
  qualificationError.value = false
  const expiry = qualificationDraft.value || null
  try {
    await procurementRepository.setSupplierQualificationExpiry(props.supplier.supplierCode, expiry)
    emit('qualificationSaved', expiry)
    editingQualification.value = false
  } catch {
    qualificationError.value = true
  } finally {
    savingQualification.value = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'history' && !deliveries.value.length && !loading.value) void loadDeliveries()
})
</script>

<template>
  <dl class="profile-summary">
    <div>
      <dt>供应商编码</dt>
      <dd>{{ supplier.supplierCode }}</dd>
    </div>
    <div>
      <dt>区域</dt>
      <dd>{{ getSupplierRegion(supplier) || '—' }}</dd>
    </div>
    <div>
      <dt>地址</dt>
      <dd>{{ supplier.address || '—' }}</dd>
    </div>
    <div>
      <dt>付款账期</dt>
      <dd>{{ supplier.paymentTerms || '—' }}</dd>
    </div>
    <div>
      <dt>结算币种</dt>
      <dd>{{ supplier.currency || '—' }}</dd>
    </div>
    <div>
      <dt>综合风险分</dt>
      <dd><ProcurementSupplierRiskScore :score="supplier.riskScore" /></dd>
    </div>
  </dl>

  <ElTabs v-model="activeTab">
    <ElTabPane label="资质与准入" name="qualification">
      <dl class="profile-summary qualification-summary">
        <div>
          <dt>主数据启用状态</dt>
          <dd>{{ supplier.enabledStatus || '—' }}</dd>
        </div>
        <div>
          <dt>准入资质有效期</dt>
          <dd>{{ supplier.qualificationExpiry || '—' }}</dd>
        </div>
        <div>
          <dt>资质状态</dt>
          <dd>
            <ElTag :type="qualification.type" effect="plain">{{ qualification.label }}</ElTag>
          </dd>
        </div>
      </dl>
      <p class="qualification-note">
        资质按有效期检查，到期前 {{ qualificationWarningDays }} 天提示。
      </p>
      <template v-if="env.dataSource === 'mock'">
        <form
          v-if="editingQualification"
          class="qualification-editor"
          @submit.prevent="saveQualification"
        >
          <label for="supplier-qualification-expiry"> 准入资质有效期（留空表示待维护） </label>
          <div class="qualification-actions">
            <ElInput
              id="supplier-qualification-expiry"
              v-model="qualificationDraft"
              type="date"
              :disabled="savingQualification"
            />
            <ElButton :disabled="savingQualification" @click="editingQualification = false">
              取消
            </ElButton>
            <ElButton type="primary" native-type="submit" :loading="savingQualification">
              保存有效期
            </ElButton>
          </div>
          <ElAlert
            v-if="qualificationError"
            title="资质有效期保存失败，请重试。"
            type="error"
            :closable="false"
            show-icon
          />
        </form>
        <ElButton v-else @click="editQualification">维护资质有效期</ElButton>
      </template>
    </ElTabPane>
    <ElTabPane label="报价与可供量" name="quotes" lazy>
      <ProcurementSupplierQuotes :supplier-code="supplier.supplierCode" />
    </ElTabPane>
    <ElTabPane label="历史供货" name="history">
      <div class="profile-heading">
        <div>
          <h3>历史供货</h3>
          <p>
            {{
              env.dataSource === 'mock'
                ? '以下为 Mock 供货记录。'
                : '采购订单来自 SAP，到厂时间来自 TMS。'
            }}
          </p>
        </div>
        <ElButton :loading="loading" @click="loadDeliveries">刷新记录</ElButton>
      </div>

      <ElAlert
        v-if="loadFailed"
        title="历史供货记录加载失败，请刷新重试。"
        type="error"
        :closable="false"
        show-icon
      />
      <template v-else>
        <p v-if="deliveries.length" class="profile-counts">
          {{ deliveries.length }} 条订单明细 · {{ receivedLines }} 条已有收货 ·
          {{ openLines }} 条仍有未交货量
        </p>
        <ElTable
          :data="orderedDeliveries"
          :empty-text="loading ? '正在读取历史供货记录…' : '暂无该供应商的历史供货记录'"
          max-height="400"
        >
          <ElTableColumn prop="purchaseOrderDate" label="订单日期" min-width="108" />
          <ElTableColumn prop="purchaseOrderNumber" label="采购订单号" min-width="125" />
          <ElTableColumn prop="purchaseOrderLineNumber" label="行号" width="64" />
          <ElTableColumn label="物料" min-width="108">
            <template #default="{ row }">{{
              row.materialName || row.materialCode || '—'
            }}</template>
          </ElTableColumn>
          <ElTableColumn label="已收／采购量" min-width="125">
            <template #default="{ row }">
              {{ row.receivedQuantity ?? '—' }} / {{ row.purchaseQuantity ?? '—' }} {{ row.unit }}
            </template>
          </ElTableColumn>
          <ElTableColumn prop="openDeliveryQuantity" label="未交货量" min-width="90" />
          <ElTableColumn prop="plannedArrivalDate" label="计划到货" min-width="108" />
          <ElTableColumn prop="actualArrivalTime" label="实际到厂" min-width="150" />
          <ElTableColumn prop="inspectionStatus" label="检验状态" min-width="92" />
        </ElTable>
      </template>
    </ElTabPane>
  </ElTabs>
</template>

<style scoped>
.profile-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin: 0 0 20px;
  padding: 12px;
  border: 1px solid var(--scos-border);
  border-radius: 8px;
}

.profile-summary dt,
.profile-heading p,
.qualification-note,
.profile-counts {
  color: var(--scos-muted);
}

.profile-summary dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}

.profile-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.profile-heading p {
  margin-top: 4px;
}

.profile-counts {
  margin-bottom: 8px;
}

.qualification-summary,
.qualification-note {
  margin-bottom: 12px;
}

.qualification-editor {
  display: grid;
  gap: 8px;
}

.qualification-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.qualification-actions .el-input {
  width: 175px;
}

.qualification-actions .el-button {
  margin-left: 0;
}
</style>
