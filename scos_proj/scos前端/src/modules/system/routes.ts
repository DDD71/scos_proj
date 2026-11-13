import { createModuleRoutes } from '@/shared/lib/create-module-routes'
import { systemModule } from './model/module'

export const systemRoutes = createModuleRoutes(systemModule, () => import('./pages/SystemPage.vue'))
