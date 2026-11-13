import type { BusinessModule } from '@/shared/types/navigation'

export const systemModule = {
  id: 'system',
  title: '系统管理',
  description: '管理用户上下文、规则配置、任务状态和审计记录。',
  group: '系统与协同',
  sections: [
    {
      key: 'context',
      path: '/system/context',
      title: '用户与组织',
      description: '接入企业认证、用户身份、组织范围和权限。',
    },
    {
      key: 'rules',
      path: '/system/rules',
      title: '规则与参数',
      description: '维护公共规则和参数版本，业务专属规则归所属模块。',
    },
    {
      key: 'jobs',
      path: '/system/jobs',
      title: '任务中心',
      description: '查询异步计算和导出任务进度、失败原因与结果。',
    },
    {
      key: 'audit',
      path: '/system/audit',
      title: '操作审计',
      description: '查询关键业务操作、访问与审批审计记录。',
    },
  ],
} as const satisfies BusinessModule
