export const supplierRiskThreshold = 60

export function isRiskSupplier(score: number | null | undefined): boolean {
  return score != null && score < supplierRiskThreshold
}
