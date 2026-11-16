export interface InventoryException {
  id: string
  date: string
  products: readonly string[]
  reason: string
  change: string
  risk: string
}
