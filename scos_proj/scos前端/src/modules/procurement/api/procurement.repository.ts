import { http } from '@/shared/api/http'
import { env } from '@/shared/config/env'
import type { ProcurementDemandVersion } from '../model/demand'
import type { ProcurementExecutionOrder, ProcurementRollingAssessment } from '../model/execution'
import type { ProcurementFuturesContract, ProcurementFuturesMarket } from '../model/futures'
import type { ProcurementHistoryRow } from '../model/history'
import type {
  ProcurementOptimizationInput,
  ProcurementOptimizationOffer,
  ProcurementOptimizationResult,
} from '../model/optimization'
import type { ProcurementOverview } from '../model/overview'
import type {
  ProcurementPriceForecast,
  ProcurementPriceForecastInput,
} from '../model/price-forecast'
import type {
  ProcurementMaterial,
  ProcurementQuote,
  ProcurementSupplier,
  ProcurementSupplierDelivery,
  ProcurementSupplierStatus,
} from '../model/types'

// SCOS 客户端读接口暂定路径。联调时在这里映射服务端响应。
async function list<T>(resource: string, params?: Record<string, string>): Promise<T[]> {
  if (env.dataSource === 'mock') return []

  const { data } = await http.get<T[]>(`/v1/procurement/${resource}`, { params })
  if (!Array.isArray(data)) throw new Error('业务接口未返回可用数据。')
  return data
}

export const procurementRepository = {
  async listPriceForecasts(materialCode: string): Promise<ProcurementPriceForecast[]> {
    if (env.dataSource !== 'mock')
      return list<ProcurementPriceForecast>('price-forecasts', { materialCode })
    const { listMockPriceForecasts } = await import('../mocks/procurement-price-forecast.mock')
    return listMockPriceForecasts(materialCode)
  },
  async savePriceForecast(
    materialCode: string,
    currency: string,
    unit: string,
    input: ProcurementPriceForecastInput,
    draftId?: string,
    replacesId?: string,
  ) {
    if (env.dataSource !== 'mock') {
      const body = { materialCode, currency, unit, ...input, replacesId }
      const path = '/v1/procurement/price-forecasts'
      const { data } = draftId
        ? await http.put<ProcurementPriceForecast>(`${path}/${encodeURIComponent(draftId)}`, body)
        : await http.post<ProcurementPriceForecast>(path, body)
      return data
    }
    const { saveMockPriceForecast } = await import('../mocks/procurement-price-forecast.mock')
    return saveMockPriceForecast(materialCode, currency, unit, input, draftId, replacesId)
  },
  async publishPriceForecast(materialCode: string, id: string) {
    if (env.dataSource !== 'mock') {
      const { data } = await http.post<ProcurementPriceForecast>(
        `/v1/procurement/price-forecasts/${encodeURIComponent(id)}/publish`,
        { materialCode },
      )
      return data
    }
    const { publishMockPriceForecast } = await import('../mocks/procurement-price-forecast.mock')
    return publishMockPriceForecast(materialCode, id)
  },
  async deletePriceForecast(materialCode: string, id: string) {
    if (env.dataSource !== 'mock') {
      await http.delete(`/v1/procurement/price-forecasts/${encodeURIComponent(id)}`, {
        params: { materialCode },
      })
      return
    }
    const { deleteMockPriceForecast } = await import('../mocks/procurement-price-forecast.mock')
    deleteMockPriceForecast(materialCode, id)
  },
  async reviewPriceForecast(materialCode: string, id: string, action: 'submit' | 'return') {
    if (env.dataSource !== 'mock') {
      const { data } = await http.post<ProcurementPriceForecast>(
        `/v1/procurement/price-forecasts/${encodeURIComponent(id)}/${action}`,
        { materialCode },
      )
      return data
    }
    const { reviewMockPriceForecast } = await import('../mocks/procurement-price-forecast.mock')
    return reviewMockPriceForecast(materialCode, id, action)
  },
  async optimizePlan(input: ProcurementOptimizationInput): Promise<ProcurementOptimizationResult> {
    if (env.dataSource !== 'mock') throw new Error('正式采购优化服务尚未接入。')
    const { optimizeMockProcurement } = await import('../mocks/procurement-optimization.mock')
    return optimizeMockProcurement(input)
  },
  async listOptimizationOffers(
    materialCode: string,
    unit: string,
    month: string,
  ): Promise<ProcurementOptimizationOffer[] | undefined> {
    if (env.dataSource !== 'mock') return undefined
    const { listMockProcurementOptimizationOffers } =
      await import('../mocks/procurement-optimization.mock')
    return listMockProcurementOptimizationOffers(materialCode, unit, month)
  },
  async listPublishedDemandVersions(month: string): Promise<ProcurementDemandVersion[]> {
    if (env.dataSource === 'mock') {
      const { listMockPublishedDemandVersions } = await import('../mocks/procurement-demand.mock')
      return listMockPublishedDemandVersions(month)
    }
    // 已发布生产需求尚未接入。该路径及返回口径待联调确认。
    return list<ProcurementDemandVersion>('published-demand-versions', { month })
  },
  async listCornStarchFuturesContracts(): Promise<ProcurementFuturesContract[]> {
    if (env.dataSource === 'mock') {
      const { mockCornStarchMarkets } = await import('../mocks/procurement-futures.mock')
      return mockCornStarchMarkets.map(({ contractCode, deliveryMonth, currency, unit }) => ({
        contractCode,
        deliveryMonth,
        currency,
        unit,
      }))
    }
    return list<ProcurementFuturesContract>('corn-starch-futures/contracts')
  },
  async getCornStarchFutures(contractCode?: string): Promise<ProcurementFuturesMarket | null> {
    if (env.dataSource === 'mock') {
      const { mockCornStarchMarkets } = await import('../mocks/procurement-futures.mock')
      return contractCode
        ? (mockCornStarchMarkets.find((market) => market.contractCode === contractCode) ?? null)
        : (mockCornStarchMarkets[0] ?? null)
    }
    const { data } = await http.get<ProcurementFuturesMarket | null>(
      '/v1/procurement/corn-starch-futures',
      { params: contractCode ? { contractCode } : undefined },
    )
    if (data !== null && !Array.isArray(data?.candles)) {
      throw new Error('业务接口未返回可用的期货行情。')
    }
    return data
  },
  async getOverview(month: string): Promise<ProcurementOverview> {
    if (env.dataSource === 'mock') {
      const { getMockProcurementOverview } = await import('../mocks/procurement-overview.mock')
      return getMockProcurementOverview()
    }
    const { data } = await http.get<ProcurementOverview>('/v1/procurement/overview', {
      params: { month },
    })
    if (typeof data !== 'object' || !data) throw new Error('业务接口未返回可用数据。')
    return data
  },
  async listHistory(): Promise<ProcurementHistoryRow[]> {
    if (env.dataSource === 'mock') {
      const { listMockHistory } = await import('../mocks/procurement-history.mock')
      return listMockHistory()
    }
    return list<ProcurementHistoryRow>('plans')
  },
  async listMaterials(): Promise<ProcurementMaterial[]> {
    if (env.dataSource === 'mock') {
      const { mockQuoteMaterial } = await import('../mocks/procurement-quotes.mock')
      return [mockQuoteMaterial]
    }
    return list<ProcurementMaterial>('materials')
  },
  async listSuppliers(): Promise<ProcurementSupplier[]> {
    if (env.dataSource === 'mock') {
      const { listMockSuppliers } = await import('../mocks/procurement-suppliers.mock')
      return listMockSuppliers()
    }
    return list<ProcurementSupplier>('suppliers')
  },
  async listSupplierDeliveries(supplierCode: string): Promise<ProcurementSupplierDelivery[]> {
    if (env.dataSource === 'mock') {
      const { mockSupplierDeliveries } =
        await import('../mocks/procurement-supplier-deliveries.mock')
      return mockSupplierDeliveries.filter((row) => row.supplierCode === supplierCode)
    }
    return list<ProcurementSupplierDelivery>('supplier-deliveries', { supplierCode })
  },
  async setSupplierStatus(supplierCode: string, status: ProcurementSupplierStatus): Promise<void> {
    if (env.dataSource !== 'mock') throw new Error('供应商状态维护接口尚未接入。')
    const { setMockSupplierStatus } = await import('../mocks/procurement-suppliers.mock')
    setMockSupplierStatus(supplierCode, status)
  },
  async setSupplierRiskScore(supplierCode: string, riskScore: number | null): Promise<void> {
    if (env.dataSource !== 'mock') throw new Error('综合风险分维护接口尚未接入。')
    const { setMockSupplierRiskScore } = await import('../mocks/procurement-suppliers.mock')
    setMockSupplierRiskScore(supplierCode, riskScore)
  },
  async setSupplierQualificationExpiry(supplierCode: string, expiry: string | null): Promise<void> {
    if (env.dataSource !== 'mock') throw new Error('供应商资质维护接口尚未接入。')
    const { setMockSupplierQualificationExpiry } =
      await import('../mocks/procurement-suppliers.mock')
    setMockSupplierQualificationExpiry(supplierCode, expiry)
  },
  async listQuotes(materialCode: string): Promise<ProcurementQuote[]> {
    if (env.dataSource === 'mock') {
      const { mockQuotes } = await import('../mocks/procurement-quotes.mock')
      return mockQuotes.filter((quote) => quote.materialCode === materialCode)
    }
    return list<ProcurementQuote>('quotes', { materialCode })
  },
  async listSupplierQuotes(supplierCode: string): Promise<ProcurementQuote[]> {
    if (env.dataSource === 'mock') {
      const { mockQuotes } = await import('../mocks/procurement-quotes.mock')
      return mockQuotes.filter((quote) => quote.supplierCode === supplierCode)
    }
    const quotes = await list<ProcurementQuote>('quotes', { supplierCode })
    return quotes.filter((quote) => quote.supplierCode === supplierCode)
  },
  async listExecution(planNumber: string): Promise<ProcurementExecutionOrder[]> {
    if (env.dataSource === 'mock') {
      const { listMockExecution } = await import('../mocks/procurement-execution.mock')
      return listMockExecution(planNumber)
    }
    return list<ProcurementExecutionOrder>('execution', { planNumber })
  },
  async getRollingAssessment(
    planNumber: string,
    orderKeys: string[],
  ): Promise<ProcurementRollingAssessment | null> {
    if (env.dataSource === 'mock') {
      const { getMockRollingAssessment } = await import('../mocks/procurement-execution.mock')
      return getMockRollingAssessment(planNumber, orderKeys)
    }
    const { data } = await http.get<ProcurementRollingAssessment | null>(
      '/v1/procurement/rolling-assessment',
      {
        params: { planNumber, orderKeys: JSON.stringify(orderKeys) },
      },
    )
    return data
  },
}
