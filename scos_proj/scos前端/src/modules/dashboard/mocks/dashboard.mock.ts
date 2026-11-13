import type { DashboardRepository } from '../api/dashboard.repository'

export const mockDashboardRepository: DashboardRepository = {
  async getOverview() {
    // 用空数据验证加载链路；尚未迁移 Demo 的经营数字。
    return {
      snapshotAt: null,
      metrics: [
        { key: 'sales', label: '销售金额', value: null, unit: '万元' },
        { key: 'inventory', label: '成品库存', value: null, unit: '吨' },
        { key: 'procurement', label: '采购执行量', value: null, unit: '吨' },
        { key: 'profit', label: '经营利润', value: null, unit: '万元' },
      ],
    }
  },
}
