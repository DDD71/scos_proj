import type { BusinessModule } from '@/shared/types/navigation'

export const inventoryModule = {
  id: 'inventory',
  title: '成品库存优化',
  description: '维护成品库存策略，协同月、周、日补充计划。',
  group: '决策中心',
  sections: [
    {
      key: 'overview',
      path: '/inventory/overview',
      title: '库存总览',
      description: '查看成品水位、可用库存、风险和待办。',
    },
    {
      key: 'strategy',
      path: '/inventory/strategy',
      title: '库存策略',
      description: '按 SKU、类目和 ABC 分类维护动态或静态策略及版本。',
    },
    {
      key: 'plans',
      path: '/inventory/plans',
      title: '计划管理',
      description: '制定月、周、日计划，进行人工调整、审批和发布。',
    },
    {
      key: 'abnormal',
      path: '/inventory/abnormal',
      title: '策略异常调整',
      description: '登记重大变化，关联策略与月周日计划调整任务。',
    },
    {
      key: 'health',
      path: '/inventory/health',
      title: '库存健康度',
      description: '复核周转、缺货、库容和临期表现，形成改进报告。',
    },
  ],
} as const satisfies BusinessModule
