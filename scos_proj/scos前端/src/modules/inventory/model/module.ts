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
      title: '库存优化',
      description: '查看成品库存预测、周汇总和日度库存日历，按成品调整库存策略。',
    },
    {
      key: 'plans',
      path: '/inventory/plans',
      title: '补货计划明细',
      description: '管理月度补充额度、四周生产建议和逐日库存风险。',
    },
    {
      key: 'health',
      path: '/inventory/health',
      title: '库存健康度',
      description: '按月查看计划与实际偏差、自动预警、策略建议和跟进事项。',
    },
  ],
} as const satisfies BusinessModule
