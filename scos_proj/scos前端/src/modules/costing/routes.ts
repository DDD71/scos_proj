import { createModuleRoutes } from '@/shared/lib/create-module-routes'
import { costingModule } from './model/module'

export const costingRoutes = createModuleRoutes(
  costingModule,
  () => import('./pages/CostingPage.vue'),
)
