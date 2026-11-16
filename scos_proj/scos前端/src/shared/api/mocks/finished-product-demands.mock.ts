import type {
  FinishedProductDemand,
  FinishedProductDemandInput,
} from '../../types/finished-product-demands'
import { matchesFinishedProductDemand } from '../../lib/finished-product-demands'
const storageKey = 'scos:finished-product-demands'

export function readFinishedProductDemands(): FinishedProductDemand[] {
  try {
    const saved = localStorage.getItem(storageKey)
    return saved ? (JSON.parse(saved) as FinishedProductDemand[]) : []
  } catch {
    return []
  }
}

export function publishFinishedProductDemand(input: FinishedProductDemandInput) {
  const demands = readFinishedProductDemands()
  const sameProduct = (demand: FinishedProductDemand) =>
    demand.plant === input.plant && demand.productCode === input.productCode
  const previous = demands.find(sameProduct)
  if (previous && matchesFinishedProductDemand(previous, input)) return previous

  const published: FinishedProductDemand = {
    ...input,
    id:
      previous?.id ?? `${encodeURIComponent(input.plant)}/${encodeURIComponent(input.productCode)}`,
    publishedAt: new Date().toISOString(),
  }
  localStorage.setItem(
    storageKey,
    JSON.stringify([published, ...demands.filter((d) => !sameProduct(d))]),
  )
  return published
}
