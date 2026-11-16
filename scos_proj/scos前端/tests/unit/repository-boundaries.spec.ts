import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '../../src/shared/config/env'
import { http } from '../../src/shared/api/http'
import {
  readInventoryPolicyVersions,
  confirmInventoryPolicy,
} from '../../src/modules/inventory/api/inventory-policy'
import {
  readMonthlyInventoryPlan,
  saveMonthlyInventoryPlan,
  readWeeklyInventoryPlans,
  saveWeeklyInventoryPlan,
} from '../../src/modules/inventory/api/inventory-plans'
import {
  getInventorySnapshot,
  getInventoryHealthHistory,
  listInventoryExceptions,
} from '../../src/modules/inventory/api/inventory.repository'
import {
  readFinishedProductDemands,
  publishFinishedProductDemand,
} from '../../src/shared/api/finished-product-demands'
import {
  listRequisitionCoordination,
  saveRequisitionCoordination,
  listRequisitionRestrictions,
  saveRequisitionRestriction,
} from '../../src/modules/requisition/api/requisition-operations'
import {
  loadQualityDisposition,
  saveQualityDisposition,
  listCostingPoolAdoptions,
  adoptCostingPoolTrial,
} from '../../src/modules/costing/api/costing.repository'
import { procurementRepository } from '../../src/modules/procurement/api/procurement.repository'
import { emptyDraft } from '../../src/modules/procurement/model/drafts'
import {
  readDrafts,
  saveDraft,
  deleteDraft,
} from '../../src/modules/procurement/api/procurement-drafts.local'

vi.mock('../../src/shared/config/env', () => ({ env: { dataSource: 'mock', apiBaseUrl: '/api' } }))
const local = new Map<string, string>()
const session = new Map<string, string>()
const storage = (values: Map<string, string>) => ({
  getItem: vi.fn((key: string) => values.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => values.set(key, value)),
})
beforeEach(() => {
  Object.assign(env, { dataSource: 'mock' })
  local.clear()
  session.clear()
  vi.stubGlobal('localStorage', storage(local))
  vi.stubGlobal('sessionStorage', storage(session))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('repository 数据源边界', () => {
  it('HTTP 模式的未接入业务接口拒绝读写演示存储', async () => {
    const snapshot = await getInventorySnapshot()
    const product = snapshot.products[0]!
    const state = await readInventoryPolicyVersions(
      snapshot,
      product.code,
      product.policy,
      snapshot.strategyVersion,
    )
    vi.mocked(localStorage.getItem).mockClear()
    Object.assign(env, { dataSource: 'http' })
    const operations = [
      () => getInventorySnapshot(),
      () => getInventoryHealthHistory(),
      () => listInventoryExceptions(),
      () =>
        readInventoryPolicyVersions(
          snapshot,
          product.code,
          product.policy,
          snapshot.strategyVersion,
        ),
      () =>
        confirmInventoryPolicy(snapshot, product.code, state, {
          parameters: product.policy,
          reason: '',
        }),
      () => readMonthlyInventoryPlan(snapshot, product.code),
      () => saveMonthlyInventoryPlan(snapshot, product.code, { confirmedQuantity: 20 }),
      () => readWeeklyInventoryPlans(snapshot, product.code),
      () =>
        saveWeeklyInventoryPlan(snapshot, product.code, 2, {
          status: '已确认',
          policyVersion: 'V1',
          batches: [],
        }),
      () => readFinishedProductDemands(),
      () =>
        publishFinishedProductDemand({
          plant: 'P1',
          productCode: 'FG1',
          productName: '成品',
          unit: '吨',
          snapshotId: 'S1',
          lines: [],
        }),
      () => listRequisitionCoordination(),
      () => listRequisitionRestrictions(),
      () => saveRequisitionCoordination({} as Parameters<typeof saveRequisitionCoordination>[0]),
      () => saveRequisitionRestriction({} as Parameters<typeof saveRequisitionRestriction>[0]),
      () => loadQualityDisposition('P1', 'Q1'),
      () => saveQualityDisposition('P1', 'Q1', { status: '待处置', history: [] }),
      () => listCostingPoolAdoptions({ factory: 'P1', period: '2026-10' }),
      () =>
        adoptCostingPoolTrial(
          { factory: 'P1', period: '2026-10' },
          {} as Parameters<typeof adoptCostingPoolTrial>[1],
        ),
    ]
    for (const operation of operations) await expect(operation()).rejects.toThrow('尚未接入')
    expect(localStorage.getItem).not.toHaveBeenCalled()
    expect(localStorage.setItem).not.toHaveBeenCalled()
    expect(sessionStorage.getItem).not.toHaveBeenCalled()
    expect(sessionStorage.setItem).not.toHaveBeenCalled()
  })

  it('HTTP 查询失败保留原错误，不降级为 Mock 或空列表', async () => {
    Object.assign(env, { dataSource: 'http' })
    const failure = new Error('连接失败')
    vi.spyOn(http, 'get').mockRejectedValue(failure)
    await expect(procurementRepository.listSuppliers()).rejects.toBe(failure)
    expect(localStorage.getItem).not.toHaveBeenCalled()
  })

  it('确认策略后从 repository 读取同一生效版本', async () => {
    const snapshot = await getInventorySnapshot()
    const product = snapshot.products[0]!
    const state = await readInventoryPolicyVersions(
      snapshot,
      product.code,
      product.policy,
      snapshot.strategyVersion,
    )
    const parameters = { ...product.policy, leadDays: product.policy.leadDays + 1 }
    const confirmed = await confirmInventoryPolicy(snapshot, product.code, state, {
      parameters,
      reason: '检修',
    })
    const refreshed = await getInventorySnapshot()
    expect(refreshed.products[0]?.policy).toEqual(parameters)
    expect(refreshed.products[0]?.policyVersion).toBe(confirmed.activeVersion)
    expect(snapshot.products[0]?.policy).toEqual(product.policy)
  })

  it('仅生产确认后的周计划计入快照，反复读取不会重复累计', async () => {
    const snapshot = await getInventorySnapshot()
    const product = snapshot.products[0]!
    await saveMonthlyInventoryPlan(snapshot, product.code, { confirmedQuantity: 18000 })
    const plan = {
      status: '待生产确认' as const,
      policyVersion: snapshot.strategyVersion,
      batches: [{ date: '2026-10-09', availableDate: '2026-10-12', quantity: 100 }],
    }
    await saveWeeklyInventoryPlan(snapshot, product.code, 2, plan)
    expect((await getInventorySnapshot()).products[0]?.receipts).toEqual(product.receipts)
    await saveWeeklyInventoryPlan(snapshot, product.code, 2, { ...plan, status: '已确认' })
    const first = await getInventorySnapshot()
    const second = await getInventorySnapshot()
    expect(first.products[0]?.receipts).toHaveLength(product.receipts.length + 1)
    expect(second).toEqual(first)
    expect(first.products[0]?.monthlyProduction?.quota).toBe(18000)
  })

  it('跨模块成品需求发布保留原存储键，重复发布不产生副本', async () => {
    const input = {
      plant: 'P1',
      productCode: 'FG1',
      productName: '成品',
      unit: '吨',
      snapshotId: 'S1',
      lines: [
        { requestedStartDate: '2026-10-09', requiredAvailableDate: '2026-10-12', quantity: 100 },
      ],
    }
    const first = await publishFinishedProductDemand(input)
    expect(await publishFinishedProductDemand(input)).toEqual(first)
    expect(await readFinishedProductDemands()).toEqual([first])
    expect(local.has('scos:finished-product-demands')).toBe(true)
  })

  it('质量处置通过 repository 保存并按作用域隔离', async () => {
    await saveQualityDisposition('P1', 'Q1', { status: '已关闭', history: [] })
    expect((await loadQualityDisposition('P1', 'Q1')).status).toBe('已关闭')
    expect((await loadQualityDisposition('P2', 'Q1')).status).toBe('待处置')
  })

  it('本地未提交采购草稿在两种模式下都保留编辑功能', () => {
    for (const dataSource of ['mock', 'http']) {
      Object.assign(env, { dataSource })
      const draft = { ...emptyDraft(), id: dataSource, month: '2026-10' }
      saveDraft(draft)
      expect(readDrafts().find(({ id }) => id === dataSource)).toMatchObject(draft)
      expect(deleteDraft(dataSource)).toEqual([])
    }
  })
})
