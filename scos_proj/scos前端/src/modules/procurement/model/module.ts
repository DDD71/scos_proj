import type { BusinessModule } from '@/shared/types/navigation'

export const procurementModule = {
  id: 'procurement',
  title: '采购优化',
  description: '根据物料需求和供应条件确定供应商及采购量。',
  group: '决策中心',
  sections: [
    {
      key: 'overview',
      path: '/procurement/overview',
      title: '采购优化总览',
      description: '汇总销售需求、采购建议区间和成本影响。',
    },
    {
      key: 'suppliers',
      path: '/procurement/suppliers',
      title: '供应商资料库',
      description: '查询供应商准入、质量、交付、资质与报价信息。',
    },
    {
      key: 'forecast',
      path: '/procurement/forecast',
      title: '价格预测提报',
      description: '维护价格预测及依据，比较内部、外部和市场参考。',
    },
    {
      key: 'plans',
      path: '/procurement/plans',
      title: '采购方案管理',
      description: '按选择、评价、报价、优化和协同五步制定方案。',
    },
    {
      key: 'rolling',
      path: '/procurement/rolling',
      title: '采购滚动调整',
      description: '保留已执行部分，对需求变化和风险余量重新制定方案。',
    },
    {
      key: 'execution',
      path: '/procurement/execution',
      title: '采购执行追踪',
      description: '接收权威业务系统的采购合同、订单及执行反馈。',
    },
  ],
} as const satisfies BusinessModule
