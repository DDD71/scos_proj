import type { BusinessModule } from '@/shared/types/navigation'

export const procurementModule = {
  id: 'procurement',
  title: '采购优化',
  description: '根据物料需求和供应条件确定供应商及采购量。',
  group: '决策中心',
  sections: [
    {
      key: 'plans',
      path: '/procurement/plans',
      title: '采购方案',
      description: '制定月度采购方案，确认需求、供应商和采购条件。',
    },
    {
      key: 'suppliers',
      path: '/procurement/suppliers',
      title: '供应商资料',
      description: '查看上游供应商档案。',
    },
    {
      key: 'execution',
      path: '/procurement/execution',
      title: '执行情况',
      description: '接收权威业务系统的采购合同、订单及执行反馈。',
    },
  ],
} as const satisfies BusinessModule
