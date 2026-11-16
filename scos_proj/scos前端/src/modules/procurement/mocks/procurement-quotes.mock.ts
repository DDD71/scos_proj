import type { ProcurementMaterial, ProcurementQuote } from '../model/types'

export const mockQuoteMaterialCode = 'RM-CORN-STARCH'
export const mockQuoteUnit = '吨'
export const mockQuoteCurrency = 'CNY'

export const mockQuoteMaterial = {
  plant: '中粮太仓工厂',
  materialCode: mockQuoteMaterialCode,
  materialDescription: '玉米淀粉',
  purchasingUnit: mockQuoteUnit,
} satisfies ProcurementMaterial

// 供应商资料与演示优化结果共用采购 DEMO 的四家报价和供货量。
const offerSamples = [
  { supplierCode: 'MOCK-S001', unitPrice: 3188, availableQuantity: 3600, dailySupplyCapacity: 180 },
  { supplierCode: 'MOCK-S002', unitPrice: 3160, availableQuantity: 3200, dailySupplyCapacity: 160 },
  { supplierCode: 'MOCK-S003', unitPrice: 3145, availableQuantity: 2600, dailySupplyCapacity: 130 },
  { supplierCode: 'MOCK-S004', unitPrice: 3210, availableQuantity: 2800, dailySupplyCapacity: 140 },
]

export const mockQuotes = offerSamples.map((offer, index) => ({
  ...offer,
  quoteNumber: `MOCK-Q202611-${index + 1}`,
  quoteLineNumber: '10',
  materialCode: mockQuoteMaterialCode,
  quoteDate: '2026-11-01',
  syncedAt: '2026-11-13T16:20:00+08:00',
  currency: mockQuoteCurrency,
  pricingUnit: mockQuoteUnit,
  validFrom: '2026-11-01',
  validTo: '2026-11-30',
  availableDate: '2026-11-01',
  minimumOrderQuantity: 300,
})) satisfies ProcurementQuote[]
