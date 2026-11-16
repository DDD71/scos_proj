import type {
  ProcurementOptimizationAllocation,
  ProcurementOptimizationInput,
  ProcurementOptimizationOffer,
  ProcurementOptimizationResult,
} from '../model/optimization'
import { defaultProcurementOptimizationParameters } from '../model/optimization'
import {
  mockQuoteCurrency,
  mockQuoteMaterialCode,
  mockQuoteUnit,
  mockQuotes,
} from './procurement-quotes.mock'
import { listMockSuppliers } from './procurement-suppliers.mock'

// 同一组旧 DEMO 样例的单位运费和包装袋抵扣。账期用现有供应商资料。
const sampleCostItems: Record<string, { freightPerUnit: number; packagingCreditPerUnit: number }> =
  {
    'MOCK-S001': { freightPerUnit: 68, packagingCreditPerUnit: 22 },
    'MOCK-S002': { freightPerUnit: 118, packagingCreditPerUnit: 26 },
    'MOCK-S003': { freightPerUnit: 146, packagingCreditPerUnit: 12 },
    'MOCK-S004': { freightPerUnit: 52, packagingCreditPerUnit: 30 },
  }

function quoteCoversMonth(validFrom: string, validTo: string, month: string): boolean {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber || monthNumber > 12) return false
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return validFrom <= `${month}-01` && validTo >= `${month}-${lastDay}`
}

export function listMockProcurementOptimizationOffers(
  materialCode: string,
  unit: string,
  month?: string,
): ProcurementOptimizationOffer[] {
  if (materialCode !== mockQuoteMaterialCode || unit !== mockQuoteUnit) return []

  const suppliers = new Map(
    listMockSuppliers().map((supplier) => [supplier.supplierCode, supplier]),
  )
  return mockQuotes
    .filter(
      (quote) =>
        quote.currency === mockQuoteCurrency &&
        (!month || quoteCoversMonth(quote.validFrom, quote.validTo, month)),
    )
    .map((quote) => {
      const terms = suppliers.get(quote.supplierCode)?.paymentTerms
      const days = terms?.match(/^(\d+(?:\.\d+)?)\s*天$/)?.[1]
      return {
        supplierCode: quote.supplierCode,
        unitPrice: quote.unitPrice,
        capacity: quote.availableQuantity,
        minimumQuantity: quote.minimumOrderQuantity,
        currency: quote.currency,
        ...sampleCostItems[quote.supplierCode],
        paymentDays: days === undefined ? undefined : Number(days),
      }
    })
}

const quantityScale = 1000

export function optimizeMockProcurement(
  input: ProcurementOptimizationInput,
): ProcurementOptimizationResult {
  const { materialCode, unit, month, supplierCodes } = input
  const requested = Math.round(input.requestedQuantity * quantityScale)
  const requestedQuantity = requested / quantityScale
  const { minSupplierCount, maxSupplierShare, minSelectedSupplierShare, annualFundingRate } =
    input.parameters ?? defaultProcurementOptimizationParameters
  const result: ProcurementOptimizationResult = {
    requestedQuantity,
    allocatedQuantity: 0,
    shortageQuantity: requestedQuantity,
    totalCost: null,
    currency: null,
    allocations: [],
    source: 'mock',
  }

  if (
    !Number.isFinite(requested) ||
    requested <= 0 ||
    !Number.isInteger(minSupplierCount) ||
    minSupplierCount < 1 ||
    !Number.isFinite(minSelectedSupplierShare) ||
    minSelectedSupplierShare < 0 ||
    !Number.isFinite(maxSupplierShare) ||
    maxSupplierShare > 100 ||
    maxSupplierShare < minSelectedSupplierShare ||
    !Number.isFinite(annualFundingRate) ||
    annualFundingRate < 0
  ) {
    result.infeasibleReason = '请核对确认采购量、供应商家数、占比和年化资金成本率。'
    return result
  }

  const selected = new Set(supplierCodes)
  const enabledSuppliers = new Map(
    listMockSuppliers()
      .filter(
        (supplier) => supplier.enabledStatus === '启用' && selected.has(supplier.supplierCode),
      )
      .map((supplier) => [supplier.supplierCode, supplier.supplierName ?? supplier.supplierCode]),
  )
  const offers = listMockProcurementOptimizationOffers(materialCode, unit, month)
  const minimumShareQuantity = Math.ceil((requested * minSelectedSupplierShare) / 100 - 1e-9)
  const maximumShareQuantity = Math.floor((requested * maxSupplierShare) / 100 + 1e-9)
  const candidates = offers
    .filter((offer) => enabledSuppliers.has(offer.supplierCode))
    .map((offer) => {
      const supplierName = enabledSuppliers.get(offer.supplierCode) ?? offer.supplierCode
      const minimum = Math.max(
        1,
        minimumShareQuantity,
        Math.ceil(offer.minimumQuantity * quantityScale),
      )
      const capacity = Math.min(maximumShareQuantity, Math.floor(offer.capacity * quantityScale))
      const packagingCreditPerUnit = offer.packagingCreditPerUnit ?? 0
      // 报价、运费、包装抵扣和账期资金节省构成演示成本口径。
      const paymentSavings =
        (offer.unitPrice * (annualFundingRate / 100) * (offer.paymentDays ?? 0)) / 365
      const effectiveUnitCost =
        offer.unitPrice + (offer.freightPerUnit ?? 0) - packagingCreditPerUnit - paymentSavings
      return {
        ...offer,
        supplierName,
        minimum,
        capacity,
        effectiveUnitCost,
        packagingCreditPerUnit,
      }
    })
    .filter((offer) => offer.capacity >= offer.minimum)
    .sort((left, right) => left.effectiveUnitCost - right.effectiveUnitCost)

  if (offers.length === 0) {
    result.infeasibleReason = '当前物料、月份和单位没有可用的演示报价。'
    return result
  }
  if (candidates.length < minSupplierCount) {
    result.infeasibleReason = '符合条件的候选供应商少于设定的最少家数，请检查报价、起订量和占比。'
    return result
  }

  // 四家报价样例可直接枚举。先比较保供量，同量时比较估算成本。
  let bestAllocated = 0
  let bestEstimatedCents = Number.POSITIVE_INFINITY
  for (let mask = 1; mask < 2 ** candidates.length; mask++) {
    const group = candidates.filter((_, index) => (mask & (1 << index)) !== 0)
    if (group.length < minSupplierCount) continue
    const minimum = group.reduce((sum, offer) => sum + offer.minimum, 0)
    const capacity = group.reduce((sum, offer) => sum + offer.capacity, 0)
    const allocated = Math.min(requested, capacity)
    if (minimum > allocated || allocated < bestAllocated) continue

    let remaining = allocated - minimum
    let quoteCents = 0
    let estimatedCents = 0
    let creditCents = 0
    const allocations: ProcurementOptimizationAllocation[] = group.map((offer) => {
      const additional = Math.min(remaining, offer.capacity - offer.minimum)
      remaining -= additional
      const quantity = (offer.minimum + additional) / quantityScale
      const amountCents = Math.round(quantity * offer.unitPrice * 100)
      const estimatedAmountCents = Math.round(quantity * offer.effectiveUnitCost * 100)
      const packagingCreditCents = Math.round(quantity * offer.packagingCreditPerUnit * 100)
      quoteCents += amountCents
      estimatedCents += estimatedAmountCents
      creditCents += packagingCreditCents
      return {
        supplierCode: offer.supplierCode,
        supplierName: offer.supplierName,
        quantity,
        unitPrice: offer.unitPrice,
        amount: amountCents / 100,
        currency: offer.currency,
        effectiveUnitCost: offer.effectiveUnitCost,
        estimatedCost: estimatedAmountCents / 100,
        packagingCredit: packagingCreditCents / 100,
      }
    })
    if (allocated === bestAllocated && estimatedCents >= bestEstimatedCents) continue

    bestAllocated = allocated
    bestEstimatedCents = estimatedCents
    result.allocatedQuantity = allocated / quantityScale
    result.shortageQuantity = (requested - allocated) / quantityScale
    result.totalCost = quoteCents / 100
    result.estimatedCost = estimatedCents / 100
    result.packagingCredit = creditCents / 100
    result.currency = mockQuoteCurrency
    result.allocations = allocations
  }

  if (!result.allocations.length) {
    result.infeasibleReason = '当前采购量无法同时满足供应商家数、最小份额和起订量。'
  }
  return result
}
