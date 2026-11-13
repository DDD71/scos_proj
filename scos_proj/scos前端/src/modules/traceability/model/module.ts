import type { BusinessModule } from '@/shared/types/navigation'

export const traceabilityModule = {
  id: 'traceability',
  title: '全程追溯与质量协同',
  description: '贯通批次正反向追溯，分析质量事件的业务影响范围。',
  group: '分析与追溯',
  sections: [
    {
      key: 'query',
      path: '/traceability/query',
      title: '全程批次追溯',
      description: '查询原料、生产、检验、发运和客户的关联路径及断链信息。',
    },
    {
      key: 'impact',
      path: '/traceability/impact',
      title: '质量影响分析',
      description: '查看质量事件涉及的库存、成品、订单和客户及处置建议依据。',
    },
  ],
} as const satisfies BusinessModule
