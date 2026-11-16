import type { BusinessModule } from '@/shared/types/navigation'

export const requisitionModule = {
  id: 'requisition',
  title: '要货计划',
  description: '在有效合同范围内，协调每天的原辅包到货安排。',
  group: '决策中心',
  sections: [
    {
      key: 'overview',
      path: '/requisition/overview',
      title: '要货概览',
      description: '查看本周原辅包库存、到货和生产缺口，并进入周要货计划。',
    },
    {
      key: 'conditions',
      path: '/requisition/conditions',
      title: '已签约供应商',
      description: '查看已签约供应商、合同供货量和合同执行情况。',
    },
    {
      key: 'execution',
      path: '/requisition/execution',
      title: '下达与执行',
      description: '查看下达、供应商承诺、运输、收货与质检反馈。',
    },
  ],
} as const satisfies BusinessModule
