import type { BusinessModule } from '@/shared/types/navigation'

export const integrationsModule = {
  id: 'integrations',
  title: '外部系统协同',
  description: '对接外部业务能力，展示可用性与反馈。',
  group: '系统与协同',
  sections: [
    {
      key: 'production',
      path: '/integrations/production',
      title: '生产计划协同',
      description: '读取外部生产计划和执行结果；生产扰动模拟未接入时标记未评估。',
    },
  ],
} as const satisfies BusinessModule
