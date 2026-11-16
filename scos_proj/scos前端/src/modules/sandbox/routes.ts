import type { RouteLocationNormalized } from 'vue-router'
import { dashboardModule } from '@/modules/dashboard'
import { createModuleRoutes } from '@/shared/lib/create-module-routes'
import { sandboxModule } from './model/module'

export const sandboxRoutes = createModuleRoutes(
  sandboxModule,
  () => import('./pages/SandboxPage.vue'),
).map((route) => ({
  ...route,
  meta: {
    moduleId: dashboardModule.id,
    moduleTitle: dashboardModule.title,
    title: sandboxModule.sections[0].title,
    sectionKey: sandboxModule.sections[0].key,
  },
  beforeEnter: (to: RouteLocationNormalized) => {
    const { eventId, event } = to.query
    if (typeof eventId === 'string' && eventId.startsWith('stock:') && eventId.length > 6) {
      return {
        path: '/inventory/overview',
        query: {
          product: eventId.slice(6),
          adjust: '1',
          reason: typeof event === 'string' ? event : undefined,
        },
        replace: true,
      }
    }
  },
}))
