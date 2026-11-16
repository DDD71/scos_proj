import type { InventoryPolicyParameters } from '../model/types'

export function sameInventoryPolicyParameters(
  current: InventoryPolicyParameters,
  reference: InventoryPolicyParameters,
) {
  return (
    current.type === reference.type &&
    current.leadDays === reference.leadDays &&
    current.reviewDays === reference.reviewDays &&
    (current.type === 'dynamic'
      ? current.serviceLevel === reference.serviceLevel
      : current.staticSafetyStock === reference.staticSafetyStock)
  )
}
