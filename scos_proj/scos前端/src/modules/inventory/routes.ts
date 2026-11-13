import { createModuleRoutes } from '@/shared/lib/create-module-routes'
import { inventoryModule } from './model/module'

export const inventoryRoutes = createModuleRoutes(
  inventoryModule,
  () => import('./pages/InventoryPage.vue'),
)
