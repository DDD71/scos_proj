import type { RouteRecordRaw } from 'vue-router'
import { procurementModule } from './model/module'

export const procurementRoutes: RouteRecordRaw[] = [
  {
    path: '/procurement',
    component: () => import('./pages/ProcurementPage.vue'),
    redirect: '/procurement/plans',
    children: [
      ...procurementModule.sections.map(({ path, key, title }) => ({
        path,
        name: `procurement-${key}`,
        component: {
          plans: () => import('./pages/ProcurementPlansPage.vue'),
          suppliers: () => import('./pages/ProcurementSuppliersPage.vue'),
          execution: () => import('./pages/ProcurementExecutionPage.vue'),
        }[key],
        meta: { title, moduleId: procurementModule.id, moduleTitle: procurementModule.title },
      })),
      {
        path: 'plans/new',
        name: 'procurement-plan-new',
        component: () => import('./pages/ProcurementPlanCreatePage.vue'),
        meta: {
          title: '新建采购方案',
          moduleId: procurementModule.id,
          moduleTitle: procurementModule.title,
        },
      },
      {
        path: 'plans/:draftId',
        name: 'procurement-draft',
        component: () => import('./pages/ProcurementDraftPage.vue'),
        props: true,
        meta: {
          title: '采购优化流程',
          moduleId: procurementModule.id,
          moduleTitle: procurementModule.title,
        },
      },
      { path: 'price-forecasts', redirect: { name: 'procurement-plan-new' } },
      { path: 'overview', redirect: '/procurement/plans' },
    ],
  },
]
