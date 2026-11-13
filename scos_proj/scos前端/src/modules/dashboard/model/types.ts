export interface DashboardMetric {
  key: string
  label: string
  value: number | null
  unit: string
}

export interface DashboardOverview {
  snapshotAt: string | null
  metrics: DashboardMetric[]
}
