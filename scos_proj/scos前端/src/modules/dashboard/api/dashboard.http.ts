import { http } from '@/shared/api/http'
import type { DashboardOverview } from '../model/types'
import type { DashboardRepository } from './dashboard.repository'

export const httpDashboardRepository: DashboardRepository = {
  async getOverview() {
    // 暂定接口契约，接入时以服务端 OpenAPI 为准。
    const { data } = await http.get<DashboardOverview>('/v1/dashboard/overview')
    return data
  },
}
