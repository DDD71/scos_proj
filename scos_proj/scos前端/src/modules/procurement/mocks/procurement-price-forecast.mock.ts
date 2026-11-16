import {
  forecastPeriodMonths,
  isActivePriceForecast,
  validatePriceForecast,
  type ProcurementPriceForecast,
  type ProcurementPriceForecastInput,
} from '../model/price-forecast'

const storagePrefix = 'scos.mock.procurement.price-forecasts.'
const reporter = '采购提报员（演示）'
const approver = '采购审核员（演示）'

// 价格及趋势沿用旧采购 DEMO 的已发布样例。
const sampleForecasts: ProcurementPriceForecast[] = [
  {
    id: 'PF-202612-C01',
    materialCode: 'RM-CORN-STARCH',
    currency: 'CNY',
    unit: '吨',
    method: 'change',
    status: 'published',
    updatedAt: '2026-09-29T14:05:00+08:00',
    submittedBy: reporter,
    publishedBy: approver,
    publishedAt: '2026-09-29T14:05:00+08:00',
    baselinePrice: 3220,
    basis: '旧 DEMO 演示样例。原粮到货改善后，12 月价格小幅回落，次年 1 月温和修复。',
    periods: [
      { month: '2026-12', value: -0.5 },
      { month: '2027-01', value: 0.3 },
    ],
  },
  {
    id: 'PF-202702-T01',
    materialCode: 'RM-CORN-STARCH',
    currency: 'CNY',
    unit: '吨',
    method: 'trend',
    status: 'published',
    updatedAt: '2026-09-30T09:10:00+08:00',
    submittedBy: reporter,
    publishedBy: approver,
    publishedAt: '2026-09-30T09:10:00+08:00',
    basis: '旧 DEMO 演示样例。春节前备货带动上涨，节后供需转稳，原粮到货改善后回落。',
    periods: [
      { month: '2027-02', direction: 'up' },
      { month: '2027-03', direction: 'flat' },
      { month: '2027-04', direction: 'down' },
    ],
  },
]

export function listMockPriceForecasts(materialCode: string): ProcurementPriceForecast[] {
  const saved = localStorage.getItem(storagePrefix + materialCode)
  if (saved !== null) return JSON.parse(saved) as ProcurementPriceForecast[]
  return structuredClone(sampleForecasts.filter((item) => item.materialCode === materialCode))
}

function writeForecasts(materialCode: string, forecasts: ProcurementPriceForecast[]): void {
  localStorage.setItem(storagePrefix + materialCode, JSON.stringify(forecasts))
}

function requireDraft(forecasts: ProcurementPriceForecast[], id: string): ProcurementPriceForecast {
  const forecast = forecasts.find((item) => item.id === id)
  if (!forecast) throw new Error('未找到价格预测。')
  if (forecast.status !== 'draft') throw new Error('只有草稿可以编辑或删除。')
  return forecast
}

function requireActiveForecast(
  forecasts: ProcurementPriceForecast[],
  id: string,
): ProcurementPriceForecast {
  const forecast = forecasts.find((item) => item.id === id)
  if (!forecast || !isActivePriceForecast(forecast)) {
    throw new Error('原发布版本已变更，请基于当前生效版本重新修订。')
  }
  return forecast
}

export function saveMockPriceForecast(
  materialCode: string,
  currency: string,
  unit: string,
  input: ProcurementPriceForecastInput,
  draftId?: string,
  replacesId?: string,
): ProcurementPriceForecast {
  const forecasts = listMockPriceForecasts(materialCode)
  const existingDraft = draftId ? requireDraft(forecasts, draftId) : undefined
  if (!existingDraft && replacesId) requireActiveForecast(forecasts, replacesId)

  const saved: ProcurementPriceForecast = {
    ...input,
    periods: input.periods.map((period) => ({ ...period })),
    id: draftId ?? crypto.randomUUID(),
    materialCode,
    currency,
    unit,
    status: 'draft',
    updatedAt: new Date().toISOString(),
    replacesId: existingDraft ? existingDraft.replacesId : replacesId,
  }
  saved.audit = [
    ...(existingDraft?.audit ?? []),
    {
      action: existingDraft ? '编辑草稿' : '新建草稿',
      actor: reporter,
      at: saved.updatedAt,
    },
  ]
  writeForecasts(materialCode, [saved, ...forecasts.filter((item) => item.id !== saved.id)])
  return saved
}

export function reviewMockPriceForecast(
  materialCode: string,
  id: string,
  action: 'submit' | 'return',
) {
  const forecasts = listMockPriceForecasts(materialCode)
  const forecast = forecasts.find((item) => item.id === id)
  if (!forecast || forecast.status !== (action === 'submit' ? 'draft' : 'submitted')) {
    throw new Error('提报状态已变化，请刷新后重试。')
  }
  if (action === 'submit') {
    const error = validatePriceForecast(forecast)
    if (error) throw new Error(error)
  }
  const at = new Date().toISOString()
  const next: ProcurementPriceForecast = {
    ...forecast,
    status: action === 'submit' ? 'submitted' : 'draft',
    submittedBy: action === 'submit' ? reporter : forecast.submittedBy,
    updatedAt: at,
    audit: [
      ...(forecast.audit ?? []),
      {
        action: action === 'submit' ? '提交审核' : '审核退回',
        actor: action === 'submit' ? reporter : approver,
        at,
      },
    ],
  }
  writeForecasts(
    materialCode,
    forecasts.map((item) => (item.id === id ? next : item)),
  )
  return next
}

export function publishMockPriceForecast(
  materialCode: string,
  id: string,
): ProcurementPriceForecast {
  const forecasts = listMockPriceForecasts(materialCode)
  const draft = forecasts.find((item) => item.id === id && item.status === 'submitted')
  if (!draft) throw new Error('请先提交审核。')
  const validationError = validatePriceForecast(draft)
  if (validationError) throw new Error(validationError)

  const months = new Set(draft.periods.flatMap(forecastPeriodMonths))
  const replaced = draft.replacesId ? requireActiveForecast(forecasts, draft.replacesId) : undefined
  if (replaced) {
    if (draft.method !== replaced.method) throw new Error('修订版须沿用原发布版本的预测方式。')
    if (draft.currency !== replaced.currency || draft.unit !== replaced.unit) {
      throw new Error('修订版须沿用原发布版本的币种和计价单位。')
    }
    if (replaced.periods.flatMap(forecastPeriodMonths).some((month) => !months.has(month))) {
      throw new Error('修订版须覆盖原发布版本的全部月份。')
    }
  }

  for (const forecast of forecasts) {
    if (!isActivePriceForecast(forecast) || forecast.id === replaced?.id) continue
    const conflict = forecast.periods
      .flatMap(forecastPeriodMonths)
      .find((month) => months.has(month))
    if (conflict) throw new Error(`${conflict} 已由版本 ${forecast.id} 发布。`)
  }

  const published: ProcurementPriceForecast = {
    ...draft,
    status: 'published',
    updatedAt: new Date().toISOString(),
    publishedBy: approver,
  }
  published.publishedAt = published.updatedAt
  published.audit = [
    ...(draft.audit ?? []),
    { action: '审核发布', actor: approver, at: published.updatedAt },
  ]
  writeForecasts(
    materialCode,
    forecasts.map((item) => {
      if (item.id === id) return published
      if (item.id === replaced?.id)
        return {
          ...item,
          supersededById: published.id,
          audit: [
            ...(item.audit ?? []),
            { action: '被修订版替代', actor: approver, at: published.updatedAt },
          ],
        }
      return item
    }),
  )
  return published
}

export function deleteMockPriceForecast(materialCode: string, id: string): void {
  const forecasts = listMockPriceForecasts(materialCode)
  const draft = requireDraft(forecasts, id)
  const at = new Date().toISOString()
  const deleted: ProcurementPriceForecast = {
    ...draft,
    status: 'deleted',
    updatedAt: at,
    audit: [...(draft.audit ?? []), { action: '删除草稿', actor: reporter, at }],
  }
  writeForecasts(
    materialCode,
    forecasts.map((item) => (item.id === id ? deleted : item)),
  )
}
