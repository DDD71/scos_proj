import { createModuleRoutes } from '@/shared/lib/create-module-routes'
import { traceabilityModule } from './model/module'

export const traceabilityRoutes = createModuleRoutes(
  traceabilityModule,
  () => import('./pages/TraceabilityPage.vue'),
)
