import type { BusinessModule } from '@/shared/types/navigation'

export const sandboxModule = {
  id: 'sandbox',
  title: '沙盘推演',
  description: '基于版本化快照评估业务假设，模拟结果与正式方案隔离。',
  group: '决策中心',
  sections: [
    {
      key: 'scenarios',
      path: '/sandbox',
      title: '沙盘推演',
      description: '设定情景、运行模拟任务、比较结果与提交采纳建议。',
    },
  ],
} as const satisfies BusinessModule
