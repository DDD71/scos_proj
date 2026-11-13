import { env } from '@/shared/config/env'
import type { DashboardOverview } from '../model/types'
import { httpDashboardRepository } from './dashboard.http'

export interface DashboardRepository {
  getOverview(): Promise<DashboardOverview>
}

export const dashboardRepository: DashboardRepository = {
  async getOverview() {
    if (env.dataSource === 'mock') {
      const { mockDashboardRepository } = await import('../mocks/dashboard.mock')
      return mockDashboardRepository.getOverview()
    }
    // HTTP 失败直接返回错误；禁止自动退回样例数据。
    return httpDashboardRepository.getOverview()
  },
}
