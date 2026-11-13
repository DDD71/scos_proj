import type { BusinessModule } from '@/shared/types/navigation'

export const costingModule = {
  id: 'costing',
  title: '成本核算分析',
  description: '从批次谱系归集成本，追踪订单盈利与经营影响。',
  group: '分析与追溯',
  sections: [
    {
      key: 'lineage',
      path: '/costing/lineage',
      title: '批次和批次谱系管理',
      description: '查看批次、上下游数量关系、证据与完整追溯链。',
    },
    {
      key: 'batch',
      path: '/costing/batch',
      title: '批次成本管理',
      description: '查看直接成本、费用池分摊、成本传导、差异和规则。',
    },
    {
      key: 'multidim',
      path: '/costing/multidim',
      title: '多维成本和盈利分析',
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
