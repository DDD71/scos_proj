export interface ProcurementHistoryRow {
  planNumber: string
  month?: string | null
  plant?: string | null
  materialCode?: string | null
  materialName?: string | null
  publishedAt?: string | null
  plannedQuantity?: number | null
  unit?: string | null
  status?: string | null
}
