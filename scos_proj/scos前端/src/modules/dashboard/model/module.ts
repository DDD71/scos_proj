import type { BusinessModule } from '@/shared/types/navigation'

export const dashboardModule = {
  id: 'dashboard',
  title: '供应链驾驶舱',
  description: '统一查看销售、库存、生产、采购与经营态势。',
  group: '决策中心',
  sections: [
    {
      key: 'overview',
      path: '/dashboard',
      title: '供应链驾驶舱',
      description: '指标总览、态势地图、专题分析与预警处置。',
    },
  ],
} as const satisfies BusinessModule
