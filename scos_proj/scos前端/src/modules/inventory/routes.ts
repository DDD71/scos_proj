import type { RouteRecordRaw } from 'vue-router'
import { inventoryModule } from './model/module'

const pages = {
  overview: () => import('./pages/InventoryOverviewPage.vue'),
  plans: () => import('./pages/InventoryPage.vue'),
  health: () => import('./pages/InventoryHealthPage.vue'),
}

export const inventoryRoutes: RouteRecordRaw[] = [
  ...inventoryModule.sections.map(({ key, path, title }) => ({
    path,
    name: `inventory-${key}`,
    component: pages[key],
    meta: {
      title,
      moduleId: inventoryModule.id,
      moduleTitle: inventoryModule.title,
      sectionKey: key,
    },
  })),
  { path: '/inventory', redirect: { name: 'inventory-overview' } },
  {
    path: '/inventory/strategy',
    name: 'inventory-strategy',
    redirect: (to) => ({ name: 'inventory-overview', query: { ...to.query, adjust: '1' } }),
  },
  { path: '/inventory/abnormal', redirect: { name: 'inventory-plans', query: { mode: 'day' } } },
]
