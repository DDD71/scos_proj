import type { BusinessModule } from '@/shared/types/navigation'

export const schedulingModule = {
  id: 'scheduling',
  title: '精益排程',
  description: '精益排程工作台。',
  group: '决策中心',
  sections: [
    {
      key: 'overview',
      path: '/scheduling',
      title: '精益排程',
      description: '精益排程工作台。',
    },
  ],
} as const satisfies BusinessModule
