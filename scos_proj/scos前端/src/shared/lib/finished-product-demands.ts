import type {
  FinishedProductDemand,
  FinishedProductDemandInput,
} from '../types/finished-product-demands'
export function matchesFinishedProductDemand(
  published: FinishedProductDemand,
  current: FinishedProductDemandInput,
) {
  return (
    published.snapshotId === current.snapshotId &&
    published.businessDate === current.businessDate &&
    published.lines.length === current.lines.length &&
    published.lines.every((line, index) => {
      const candidate = current.lines[index]
      return (
        candidate &&
        line.requestedStartDate === candidate.requestedStartDate &&
        line.requiredAvailableDate === candidate.requiredAvailableDate &&
        line.quantity === candidate.quantity
      )
    })
  )
}
