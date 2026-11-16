import type { ProcurementSupplier, ProcurementSupplierStatus } from '../model/types'

const statusKeyPrefix = 'scos.mock.procurement.supplier-status.'
const legacyRiskScoreKeyPrefix = 'scos.mock.procurement.supplier-risk-score.'
const riskScoreKeyPrefix = 'scos.mock.procurement.supplier-deduction-score.'
const qualificationKeyPrefix = 'scos.mock.procurement.supplier-qualification-expiry.'

const suppliers: ProcurementSupplier[] = [
  {
    supplierCode: 'MOCK-S001',
    supplierName: '供应商 A（演示）',
    address: '江苏省苏州市',
    enabledStatus: '启用',
    riskScore: 94.2,
    qualificationExpiry: '2027-06-30',
    paymentTerms: '30 天',
    currency: 'CNY',
    syncedAt: '2026-11-14T08:30:00+08:00',
  },
  {
    supplierCode: 'MOCK-S002',
    supplierName: '供应商 B（演示）',
    address: '山东省潍坊市',
    enabledStatus: '启用',
    riskScore: 47.6,
    qualificationExpiry: '2026-11-30',
    paymentTerms: '45 天',
    currency: 'CNY',
    syncedAt: '2026-11-14T08:30:00+08:00',
  },
  {
    supplierCode: 'MOCK-S003',
    supplierName: '供应商 C（演示）',
    address: '河北省石家庄市',
    enabledStatus: '启用',
    riskScore: 82,
    qualificationExpiry: '2026-10-31',
    paymentTerms: '60 天',
    currency: 'CNY',
    syncedAt: '2026-11-12T10:15:00+08:00',
  },
  {
    supplierCode: 'MOCK-S004',
    supplierName: '供应商 D（演示）',
    address: '山东省德州市',
    enabledStatus: '停用',
    riskScore: 58,
    qualificationExpiry: '2027-03-31',
    paymentTerms: '30 天',
    currency: 'CNY',
    syncedAt: '2026-11-10T09:00:00+08:00',
  },
  {
    supplierCode: 'MOCK-S005',
    supplierName: '供应商 E（演示）',
    enabledStatus: '启用',
    paymentTerms: '预付款',
    currency: 'USD',
  },
]

export function listMockSuppliers(): ProcurementSupplier[] {
  return suppliers.map((supplier) => ({
    ...supplier,
    enabledStatus:
      localStorage.getItem(statusKeyPrefix + supplier.supplierCode) ?? supplier.enabledStatus,
    riskScore: readMockSupplierRiskScore(supplier),
    qualificationExpiry:
      (localStorage.getItem(qualificationKeyPrefix + supplier.supplierCode) ??
        supplier.qualificationExpiry) ||
      null,
  }))
}

function readMockSupplierRiskScore(supplier: ProcurementSupplier): number | null | undefined {
  const saved = localStorage.getItem(riskScoreKeyPrefix + supplier.supplierCode)
  if (saved !== null) return JSON.parse(saved) as number | null

  const legacy = localStorage.getItem(legacyRiskScoreKeyPrefix + supplier.supplierCode)
  if (legacy === null) return supplier.riskScore

  // 旧值是扣掉的分数，新值是扣分后的余额。
  const deduction = JSON.parse(legacy) as number | null
  return deduction === null ? null : Number((100 - deduction).toFixed(10))
}

export function setMockSupplierStatus(supplierCode: string, status: ProcurementSupplierStatus) {
  localStorage.setItem(statusKeyPrefix + supplierCode, status)
}

export function setMockSupplierRiskScore(supplierCode: string, riskScore: number | null) {
  localStorage.setItem(riskScoreKeyPrefix + supplierCode, JSON.stringify(riskScore))
}

export function setMockSupplierQualificationExpiry(supplierCode: string, expiry: string | null) {
  localStorage.setItem(qualificationKeyPrefix + supplierCode, expiry ?? '')
}
