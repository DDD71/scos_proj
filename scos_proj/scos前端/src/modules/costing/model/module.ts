import type { BusinessModule } from '@/shared/types/navigation'

export const costingModule = {
  id: 'costing',
  title: '成本核算分析',
  description: '从批次谱系归集成本，追踪订单盈利与经营影响。',
  group: '分析与追溯',
  sections: [
    {
      key: 'overview',
      path: '/costing/overview',
      title: '成本核算分析',
      description: '查看批次成本、费用分摊与盈利分析。',
    },
    {
      key: 'lineage',
      path: '/costing/lineage',
      title: '批次划分',
      description: '按工序查看切批时间、设备或罐号和划分规则。',
    },
    {
      key: 'traceability',
      path: '/costing/traceability',
      title: '全程追溯协同',
      description: '从批次、订单或客户查找上下游，评估质量异常的影响并跟踪处置。',
    },
    {
      key: 'batch',
      path: '/costing/batch',
      title: '批次成本',
      description: '查看各批次总成本、单位成本、费用占比及同比环比。',
    },
    {
      key: 'multidim',
      path: '/costing/multidim',
      title: '多维成本和利润分析',
      description: '按生产订单、销售订单、产品、客户、供应商、渠道和区域分析。',
    },
    {
      key: 'management',
      path: '/costing/management',
      title: '管理决策分析',
      description: '分析利润、资金占用和经营偏差，追踪管理建议。',
    },
  ],
} as const satisfies BusinessModule
