import { describe, expect, it } from 'vitest'
import { sumMoney } from '@/modules/costing/domain/analysis'
import {
  applyPoolAdoptions,
  batchQuantityDriver,
  createPoolTrial,
  replacePoolAdoption,
  summarizePoolTrial,
} from '@/modules/costing/domain/pool-trial'
import sample from '@/modules/costing/mocks/costing-demo.json'
import type { CostingPoolAdoption } from '@/modules/costing/model/pool-trial'
import type { CostingPoolDraft, CostingSnapshot } from '@/modules/costing/model/snapshot'

const data = sample as CostingSnapshot
const source = data.pools.find(({ poolCode }) => poolCode === 'POOL_ELECTRICITY')!
const draft: CostingPoolDraft = {
  ...source,
  id: 'draft-electricity',
  costCenter: '',
  costElement: '',
  sourceReference: '',
  periodAmount: 48_000,
}

function adoption(input: CostingPoolDraft): CostingPoolAdoption {
  return {
    trial: createPoolTrial(data, input),
    sourceVersion: data.context.costVersion,
    adoptedAt: '2026-09-01T10:00:00.000Z',
  }
}

describe('费用池 Mock 试算', () => {
  it('分摊合计等于费用池金额，并将差额传到下游批次', () => {
    const first = adoption(draft)
    const snapshot = applyPoolAdoptions(data, [first])
    const summary = summarizePoolTrial(data, snapshot, first.trial)
    const finished = summary.affected.find(({ batch }) => batch === '260813-F01-01')!
    const truck = summary.affected.find(({ batch }) => batch === '20260816-F01-001')!

    expect(summary.allocated).toBe(48_000)
    expect(finished.newAmount - finished.oldAmount).toBeCloseTo(finished.change, 2)
    expect(finished.totalChange).toBeGreaterThan(finished.change)
    expect(truck.totalChange).toBeGreaterThan(0)
    expect(data.pools.find(({ poolCode }) => poolCode === source.poolCode)?.periodAmount).toBe(
      46_800,
    )
  })

  it('再次采用同一费用池时替换原试算，并按分处理分摊尾差', () => {
    const first = adoption(draft)
    const second = adoption({ ...draft, periodAmount: 0.37, primaryDriver: batchQuantityDriver })
    const updated = replacePoolAdoption([first], second)

    expect(updated).toEqual([second])
    expect(sumMoney(second.trial.allocations, (row) => row.amount)).toBe(0.37)
    expect(second.trial.allocations.every((row) => row.amount >= 0)).toBe(true)
    expect(
      applyPoolAdoptions(data, updated).pools.find(({ poolCode }) => poolCode === source.poolCode)
        ?.periodAmount,
    ).toBe(0.37)
  })

  it('缺少动因或范围时保留全部待分摊金额', () => {
    for (const input of [
      { ...draft, primaryDriver: '每批例外动因' },
      { ...draft, benefitScope: '无演示数据的范围' },
    ]) {
      const trial = createPoolTrial(data, input)
      expect(trial.reason).toBeTruthy()
      expect(trial.allocations).toEqual([])
      expect(trial.unallocated).toBe(48_000)
    }
  })
})
