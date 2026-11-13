// 初始视图类型，正式字段与单位需在后端联调时确认。
export interface UserContext {
  userId: string
  displayName: string
  organizationIds: string[]
  permissions: string[]
}
