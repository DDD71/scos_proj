import { createModuleRoutes } from '@/shared/lib/create-module-routes'
import { procurementModule } from './model/module'

export const procurementRoutes = createModuleRoutes(
  procurementModule,
  () => import('./pages/ProcurementPage.vue'),
)
