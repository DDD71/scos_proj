import type { RouteRecordRaw } from 'vue-router'
import { requisitionModule } from './model/module'

const moduleMeta = { moduleId: requisitionModule.id, moduleTitle: requisitionModule.title }

export const requisitionRoutes: RouteRecordRaw[] = [
  ...requisitionModule.sections.map(({ key, path, title, description }) => ({
    path,
    name: `requisition-${key}`,
    component:
      key === 'overview'
        ? () => import('./pages/RequisitionOverviewPage.vue')
        : key === 'conditions'
          ? () => import('./pages/RequisitionSuppliersPage.vue')
          : () => import('./pages/RequisitionExecutionPage.vue'),
    props: key === 'overview' ? false : { title, description },
    meta: { ...moduleMeta, title, sectionKey: key },
  })),
  {
    path: '/requisition/planning',
    name: 'requisition-planning',
    component: () => import('./pages/RequisitionWeeklyPlanPage.vue'),
    meta: { ...moduleMeta, title: '周要货计划', sectionKey: 'overview' },
  },
  { path: '/requisition', redirect: { name: 'requisition-overview' } },
  { path: '/requisition/rolling', redirect: { name: 'requisition-planning' } },
  {
    path: '/requisition/exceptions',
    redirect: (route) => ({
      name: 'requisition-execution',
      query: { ...route.query, exceptions: '1' },
    }),
  },
  { path: '/requisition/embargo', redirect: { name: 'requisition-conditions' } },
]
