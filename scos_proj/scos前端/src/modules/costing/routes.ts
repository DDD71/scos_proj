import type { RouteRecordRaw } from 'vue-router'
import { costingModule } from './model/module'

const sectionPages = {
  traceability: () => import('./pages/CostingTraceabilityPage.vue'),
  batch: () => import('./pages/CostingBatchPage.vue'),
  multidim: () => import('./pages/CostingMultidimPage.vue'),
  management: () => import('./pages/CostingManagementPage.vue'),
}
const meta = { moduleId: costingModule.id, moduleTitle: costingModule.title }

export const costingRoutes: RouteRecordRaw[] = [
  {
    path: '/costing',
    component: () => import('./pages/CostingPage.vue'),
    redirect: { name: 'costing-lineage' },
    meta: { ...meta, title: costingModule.title },
    children: costingModule.sections.map(({ key, path, title }): RouteRecordRaw => {
      if (key === 'overview') {
        return { path, name: 'costing-overview', redirect: { name: 'costing-lineage' } }
      }
      const sectionMeta = { ...meta, title, sectionKey: key }
      if (key === 'lineage') {
        return {
          path,
          component: () => import('./pages/CostingLineagePage.vue'),
          meta: sectionMeta,
          children: [
            {
              path: '',
              name: 'costing-lineage',
              component: () => import('./components/CostingBatchTimeline.vue'),
              beforeEnter: (to) => {
                if (to.query.tab === 'ledger') {
                  return {
                    name: 'costing-lineage-ledger',
                    query: { ...to.query, tab: undefined },
                    replace: true,
                  }
                }
              },
            },
            {
              path: 'ledger',
              name: 'costing-lineage-ledger',
              component: () => import('./components/CostingBatchLedger.vue'),
              meta: { title: '批次台账' },
            },
          ],
        }
      }
      return { path, name: `costing-${key}`, component: sectionPages[key], meta: sectionMeta }
    }),
  },
]
