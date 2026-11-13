import { createModuleRoutes } from '@/shared/lib/create-module-routes'
import { requisitionModule } from './model/module'

export const requisitionRoutes = createModuleRoutes(
  requisitionModule,
  () => import('./pages/RequisitionPage.vue'),
)
