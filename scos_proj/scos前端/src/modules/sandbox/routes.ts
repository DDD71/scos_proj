import { createModuleRoutes } from '@/shared/lib/create-module-routes'
import { sandboxModule } from './model/module'

export const sandboxRoutes = createModuleRoutes(
  sandboxModule,
  () => import('./pages/SandboxPage.vue'),
)
