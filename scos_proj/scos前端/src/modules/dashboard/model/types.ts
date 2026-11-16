export type DashboardDomain = 'sales' | 'inventory' | 'production' | 'procurement' | 'operation'
export type DashboardAlertLevel = 'urgent' | 'warning'

export interface DashboardTarget {
  label: string
  to: string
}

export interface DashboardMetric {
  key: string
  label: string
  value: number | null
  unit: string
  domain: DashboardDomain
  source: string
  asOf: string
  basis: string
  comparison: '较上日' | '较上月' | '较上次快照'
  previous: number | null
  trend: (number | null)[]
  direction: 'higher' | 'lower' | 'neutral'
  target?: string
}

export interface DashboardChart {
  title: string
  categories: string[]
  fallbackRowId?: string
  series: Array<{
    name: string
    kind: 'bar' | 'line'
    unit: string
    values: (number | null)[]
    stack?: string
  }>
}

export interface DashboardTopic {
  key: DashboardDomain
  title: string
  metrics: DashboardMetric[]
  charts: DashboardChart[]
  columns: { key: string; label: string; unit?: string }[]
  rows: {
    id: string
    name: string
    values: Record<string, string | number | null>
    target?: DashboardTarget
  }[]
  target?: DashboardTarget
  detailTitle: string
}

export interface DashboardAlert {
  id: string
  level: DashboardAlertLevel
  domain: DashboardDomain
  title: string
  detail: string
  status: '待处置' | '协调中' | '待复核' | '已关闭'
  detectedAt: string
  riskDate?: string
  source: string
  facts: { label: string; value: string }[]
  target?: DashboardTarget
}

export interface DashboardMapNode {
  id: string
  name: string
  mapLabel?: string
  kind: 'factory' | 'supplier' | 'customer'
  coordinates: [number, number]
  facts: { label: string; value: string }[]
  alertId?: string
  target?: DashboardTarget
}

export interface DashboardMapRoute {
  id: string
  name: string
  kind: 'inbound' | 'outbound'
  from: string
  to: string
  facts: { label: string; value: string }[]
  alertId?: string
  target?: DashboardTarget
}

export interface DashboardPeriod {
  id: string
  label: string
  asOf: string
  metrics: DashboardMetric[]
  topics: DashboardTopic[]
}

export interface DashboardOverview {
  factory: string
  snapshotAt: string | null
  periods: DashboardPeriod[]
  alerts: DashboardAlert[]
  nodes: DashboardMapNode[]
  routes: DashboardMapRoute[]
}
