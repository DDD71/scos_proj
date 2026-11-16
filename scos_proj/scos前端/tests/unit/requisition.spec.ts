import { describe, expect, it } from 'vitest'
import {
  projectRequisition,
  suggestRequisitionArrivals,
  validateRequisitionSuggestions,
} from '@/modules/requisition/domain/plan'
import type {
  RequisitionArrival,
  RequisitionMaterial,
  RequisitionSupply,
} from '@/modules/requisition/model/types'

const firstDay = '2026-10-05'
const secondDay = '2026-10-06'
const dates = [firstDay, secondDay]
const material: RequisitionMaterial = {
  code: 'RM-CORN-STARCH',
  name: '玉米淀粉',
  category: '原料',
  unit: '吨',
  availableStock: 40,
  onHandStock: 100,
  warehouseCapacity: null,
  receivingCapacity: 90,
  demandSource: '生产计划',
  dailyDemand: { [firstDay]: 30, [secondDay]: 50 },
}
const supplier: RequisitionSupply = {
  id: 'HT-001',
  orderId: 'PO-001',
  materialCode: material.code,
  supplierId: 'SUP-001',
  supplierName: '供应商甲',
  signedAt: '2026-09-01',
  validTo: '2026-10-31',
  earliestArrival: firstDay,
  latestArrival: firstDay,
  remainingQuantity: 100,
  dailyCapacity: 60,
  minimumQuantity: 10,
  priority: 1,
  status: '有效',
  embargoed: false,
}
const fixedArrival: RequisitionArrival = {
  id: 'FIX-001',
  materialCode: material.code,
  supplierName: supplier.supplierName,
  contractId: supplier.id,
  orderId: supplier.orderId,
  date: secondDay,
  quantity: 20,
  status: '已下达',
  locked: true,
}

describe('要货仓容和投料约束', () => {
  it.each([
    { expectedQuantity: 35, unfilled: false },
    { expectedQuantity: 70, unfilled: true },
  ])(
    '生产缺口为零时按预期要货量 $expectedQuantity 安排备料，并守住仓容',
    ({ expectedQuantity, unfilled }) => {
      const input = {
        ...material,
        onHandStock: 40,
        dailyDemand: { [firstDay]: 20, [secondDay]: 20 },
      }
      expect(
        projectRequisition(input, firstDay, dates, []).map(({ shortage }) => shortage),
      ).toEqual([0, 0])

      const { suggestions, constraintMessage } = suggestRequisitionArrivals(
        input,
        firstDay,
        dates,
        [],
        [supplier],
        75,
        [],
        expectedQuantity,
      )

      expect(suggestions).toEqual([expect.objectContaining({ date: firstDay, quantity: 35 })])
      expect(projectRequisition(input, firstDay, dates, [], suggestions)[0]?.warehousePeak).toBe(75)
      expect(Boolean(constraintMessage)).toBe(unfilled)
    },
  )

  it('不可用的在库原料占用仓容，生产只消耗可用库存', () => {
    const days = projectRequisition(material, firstDay, dates, [fixedArrival])

    expect(days.map(({ warehousePeak }) => warehousePeak)).toEqual([100, 90])
    expect(days.map(({ shortage }) => shortage)).toEqual([0, 20])
  })

  it('部分放行减少可投料量，全部实收仍占用仓容', () => {
    const arrival = {
      ...fixedArrival,
      date: firstDay,
      quantity: 30,
      availableQuantity: 20,
      availableDate: secondDay,
    }
    const days = projectRequisition(material, firstDay, dates, [arrival])
    expect(days.map(({ fixedArrival }) => fixedArrival)).toEqual([30, 0])
    expect(days.map(({ fixedAvailableArrival }) => fixedAvailableArrival)).toEqual([0, 20])
    expect(days.map(({ unavailableStock }) => unavailableStock)).toEqual([90, 70])
    expect(days.map(({ warehousePeak }) => warehousePeak)).toEqual([130, 100])
    expect(days.map(({ shortage }) => shortage)).toEqual([0, 20])
  })

  it('缺料日没有可送供应商时，提前安排到货并守住仓容', () => {
    const input = {
      ...material,
      onHandStock: 55,
      dailyDemand: { [firstDay]: 30, [secondDay]: 55 },
    }
    const { suggestions, constraintMessage } = suggestRequisitionArrivals(
      input,
      firstDay,
      dates,
      [],
      [supplier],
      100,
    )

    expect(suggestions).toEqual([
      expect.objectContaining({ date: firstDay, quantity: 45, supplierName: '供应商甲' }),
    ])
    expect(constraintMessage).toBeUndefined()
    const days = projectRequisition(input, firstDay, dates, [], suggestions)
    expect(days.map(({ warehousePeak }) => warehousePeak)).toEqual([100, 70])
    expect(days.map(({ shortage }) => shortage)).toEqual([0, 0])
  })

  it('集中到货挤占次日起送量所需仓容时，改用可覆盖生产的分批方案', () => {
    const input = {
      ...material,
      availableStock: 0,
      onHandStock: 0,
      receivingCapacity: 100,
      dailyDemand: { [firstDay]: 70, [secondDay]: 100 },
    }
    const supply = {
      ...supplier,
      latestArrival: secondDay,
      remainingQuantity: 200,
      dailyCapacity: 100,
      minimumQuantity: 80,
    }
    const { suggestions } = suggestRequisitionArrivals(input, firstDay, dates, [], [supply], 100)

    expect(suggestions).toEqual([
      expect.objectContaining({ date: firstDay, quantity: 80 }),
      expect.objectContaining({ date: secondDay, quantity: 90 }),
    ])
    const days = projectRequisition(input, firstDay, dates, [], suggestions)
    expect(days.map(({ warehousePeak }) => warehousePeak)).toEqual([80, 100])
    expect(days.map(({ shortage }) => shortage)).toEqual([0, 0])
  })

  it('校验提前到货时计入后续已安排到货造成的仓容超限', () => {
    const input = {
      ...material,
      availableStock: 10,
      onHandStock: 10,
      dailyDemand: { [firstDay]: 10, [secondDay]: 40 },
    }
    const existing = { ...fixedArrival, quantity: 40 }
    const early: RequisitionArrival = {
      ...fixedArrival,
      id: 'REQ-001',
      date: firstDay,
      quantity: 40,
      status: '建议',
      locked: false,
    }

    const violations = validateRequisitionSuggestions(input, [supplier], [existing], [early], {
      startDate: firstDay,
      dates,
      capacity: 60,
    })

    expect(violations).toEqual([expect.stringMatching(/2026-10-06.*80 吨.*仓容上限 60 吨/)])
  })
})
