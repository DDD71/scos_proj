// 初始视图类型，正式字段与单位需在后端联调时确认。
export interface ArrivalAllocation {
  id: string
  contractId: string
  supplierId: string
  arrivalDate: string
  quantity: number
  unit: string
  locked: boolean
}
