import { createModuleRoutes } from '@/shared/lib/create-module-routes'
import { integrationsModule } from './model/module'

export const integrationsRoutes = createModuleRoutes(
  integrationsModule,
  () => import('./pages/IntegrationsPage.vue'),
)
