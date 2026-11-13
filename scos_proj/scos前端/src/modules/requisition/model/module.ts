import type { BusinessModule } from '@/shared/types/navigation'

export const requisitionModule = {
  id: 'requisition',
  title: '原辅包要货计划',
  description: '在有效合同范围内，协调每天的原辅包到货安排。',
  group: '决策中心',
  sections: [
    {
      key: 'overview',
      path: '/requisition/overview',
      title: '要货计划总览',
      description: '查看原辅包供应保障、计划缺口和执行风险。',
    },
    {
      key: 'conditions',
      path: '/requisition/conditions',
      title: '基础条件与顺序',
      description: '维护供应商顺序、起送量、日可供量和工厂收货能力。',
    },
    {
      key: 'planning',
      path: '/requisition/planning',
      title: '日度要货计划',
      description: '按日安排到货，保护锁定明细并校验库存与合同约束。',
    },
    {
      key: 'execution',
      path: '/requisition/execution',
      title: '下达与执行跟踪',
      description: '查看下达、供应商承诺、运输、收货与质检反馈。',
    },
    {
      key: 'rolling',
      path: '/requisition/rolling',
      title: '要货滚动调整',
      description: '根据执行偏差调整未锁定安排，保留固定和在途数量。',
    },
    {
      key: 'exceptions',
      path: '/requisition/exceptions',
      title: '缺口与异常协调',
      description: '分派缺口处置、记录责任人、跟踪复核与关闭。',
    },
    {
      key: 'embargo',
      path: '/requisition/embargo',
      title: '供应商禁运管理',
      description: '登记禁运和解除申请，复核影响及已有在途处理。',
    },
  ],
} as const satisfies BusinessModule
