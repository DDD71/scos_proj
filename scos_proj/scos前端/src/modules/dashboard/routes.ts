import { createModuleRoutes } from '@/shared/lib/create-module-routes'
import { dashboardModule } from './model/module'

export const dashboardRoutes = createModuleRoutes(
  dashboardModule,
  () => import('./pages/DashboardPage.vue'),
)
