import type { RouteRecordRaw } from 'vue-router'

export const traceabilityRoutes: RouteRecordRaw[] = [
  { path: '/traceability', redirect: { name: 'costing-traceability' } },
  { path: '/traceability/query', redirect: { name: 'costing-traceability' } },
  {
    path: '/traceability/impact',
    redirect: (to) => ({
      name: 'costing-traceability',
      query: { ...to.query, tab: 'impact' },
    }),
  },
]
