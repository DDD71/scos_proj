import { createModuleRoutes } from '@/shared/lib/create-module-routes'
import { schedulingModule } from './model/module'

export const schedulingRoutes = createModuleRoutes(
  schedulingModule,
  () => import('./pages/SchedulingPage.vue'),
)
