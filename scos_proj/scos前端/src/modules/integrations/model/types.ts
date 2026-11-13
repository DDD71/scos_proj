// 初始视图类型，正式字段与单位需在后端联调时确认。
export interface IntegrationCapability {
  key: string
  sourceSystem: string
  status: 'not_connected' | 'available' | 'unavailable'
  lastUpdatedAt: string | null
}
