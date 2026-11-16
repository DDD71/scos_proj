import type { CostingBatchBenchmark, CostingBatchResult, CostingContext } from '../model/snapshot'

const comparisonPeriods = [
  { key: 'month', label: '环比', offset: -1 },
  { key: 'year', label: '同比', offset: -12 },
] as const

function monthOffset(period: string, offset: number) {
  const month = new Date(`${period}-01T00:00:00Z`)
  if (!Number.isFinite(month.getTime())) return ''
  month.setUTCMonth(month.getUTCMonth() + offset)
  return month.toISOString().slice(0, 7)
}

export function compareBatchPeriods(
  batch: CostingBatchResult,
  context: CostingContext,
  benchmarks: readonly CostingBatchBenchmark[],
) {
  return comparisonPeriods.map(({ key, label, offset }) => {
    const period = monthOffset(context.period, offset)
    const baseline = benchmarks.find(
      (row) =>
        row.period === period &&
        row.factory === context.factory &&
        row.line === batch.line &&
        row.stage === batch.stage &&
        row.material === batch.material &&
        row.unit === batch.unit,
    )
    const baselineUnitCost =
      baseline && baseline.quantity > 0 ? baseline.totalCost / baseline.quantity : null
    const rate =
      batch.unitCost != null && baselineUnitCost != null && baselineUnitCost > 0
        ? (batch.unitCost - baselineUnitCost) / baselineUnitCost
        : null
    return { key, label, period, baseline, baselineUnitCost, rate }
  })
}
