<script setup lang="ts">
import { ElDescriptions, ElDescriptionsItem, ElTable, ElTableColumn } from 'element-plus'
import {
  forecastGranularityLabels,
  priceForecastDirectionLabels,
  priceForecastMethodLabels,
  type ProcurementPriceForecast,
} from '../model/price-forecast'
import { formatSupplierSyncTime } from '../model/supplier-sync'

defineProps<{ forecast: ProcurementPriceForecast }>()
</script>

<template>
  <ElDescriptions :column="2" border>
    <ElDescriptionsItem label="版本">{{ forecast.id }}</ElDescriptionsItem>
    <ElDescriptionsItem label="原料">{{ forecast.materialCode }}</ElDescriptionsItem>
    <ElDescriptionsItem label="提报方式">{{
      priceForecastMethodLabels[forecast.method]
    }}</ElDescriptionsItem>
    <ElDescriptionsItem label="颗粒度">{{
      forecastGranularityLabels[forecast.granularity ?? 'month']
    }}</ElDescriptionsItem>
    <ElDescriptionsItem label="提报人">{{ forecast.submittedBy || '—' }}</ElDescriptionsItem>
    <ElDescriptionsItem label="发布人">{{ forecast.publishedBy || '—' }}</ElDescriptionsItem>
    <ElDescriptionsItem label="发布时间">
      {{ forecast.publishedAt ? formatSupplierSyncTime(forecast.publishedAt) : '—' }}
    </ElDescriptionsItem>
    <ElDescriptionsItem v-if="forecast.replacesId" label="修订自">{{
      forecast.replacesId
    }}</ElDescriptionsItem>
    <ElDescriptionsItem v-if="forecast.supersededById" label="替代版本">{{
      forecast.supersededById
    }}</ElDescriptionsItem>
    <ElDescriptionsItem v-if="forecast.baselinePrice != null" label="基准价">
      {{ forecast.baselinePrice }} {{ forecast.currency }}/{{ forecast.unit }}
    </ElDescriptionsItem>
    <ElDescriptionsItem label="研判依据">{{ forecast.basis }}</ElDescriptionsItem>
    <ElDescriptionsItem label="数据来源">{{ forecast.source || '—' }}</ElDescriptionsItem>
    <ElDescriptionsItem v-if="forecast.riskNote" label="风险说明">{{
      forecast.riskNote
    }}</ElDescriptionsItem>
  </ElDescriptions>
  <ElTable :data="forecast.periods">
    <ElTableColumn label="预测期间" min-width="167">
      <template #default="{ row }">
        {{ row.month }}{{ row.endMonth && row.endMonth !== row.month ? ' 至 ' + row.endMonth : '' }}
      </template>
    </ElTableColumn>
    <template v-if="forecast.method === 'trend'">
      <ElTableColumn label="方向" min-width="70">
        <template #default="{ row }">{{
          row.direction
            ? priceForecastDirectionLabels[
                row.direction as keyof typeof priceForecastDirectionLabels
              ]
            : '—'
        }}</template>
      </ElTableColumn>
      <ElTableColumn prop="strength" label="强度" min-width="70" />
      <ElTableColumn prop="confidence" label="把握" min-width="70" />
      <ElTableColumn prop="basis" label="本期依据" min-width="180" />
    </template>
    <ElTableColumn
      v-else
      :label="forecast.method === 'change' ? '涨跌幅（%）' : '预测价格'"
      prop="value"
      min-width="120"
    >
      <template #default="{ row }">
        {{ row.value }}
        {{ forecast.method === 'price' ? forecast.currency + '/' + forecast.unit : '%' }}
      </template>
    </ElTableColumn>
  </ElTable>
  <details v-if="forecast.audit?.length" class="forecast-audit">
    <summary>操作记录</summary>
    <ul>
      <li v-for="(entry, index) in forecast.audit" :key="index">
        {{ formatSupplierSyncTime(entry.at) }} · {{ entry.actor }} · {{ entry.action }}
      </li>
    </ul>
  </details>
</template>

<style scoped>
.forecast-audit {
  margin-top: 14px;
}
.forecast-audit summary {
  cursor: pointer;
}
</style>
