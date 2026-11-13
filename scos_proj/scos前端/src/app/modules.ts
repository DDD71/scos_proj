import { dashboardModule, dashboardRoutes } from '@/modules/dashboard'
import { sandboxModule, sandboxRoutes } from '@/modules/sandbox'
import { inventoryModule, inventoryRoutes } from '@/modules/inventory'
import { procurementModule, procurementRoutes } from '@/modules/procurement'
import { requisitionModule, requisitionRoutes } from '@/modules/requisition'
import { costingModule, costingRoutes } from '@/modules/costing'
import { traceabilityModule, traceabilityRoutes } from '@/modules/traceability'
import { systemModule, systemRoutes } from '@/modules/system'
import { integrationsModule, integrationsRoutes } from '@/modules/integrations'
import type { BusinessModule } from '@/shared/types/navigation'
import type { RouteRecordRaw } from 'vue-router'

export const businessModules: readonly BusinessModule[] = [
  dashboardModule,
  sandboxModule,
  inventoryModule,
  procurementModule,
  requisitionModule,
  costingModule,
  traceabilityModule,
  systemModule,
  integrationsModule,
]

export const businessRoutes: RouteRecordRaw[] = [
  ...dashboardRoutes,
  ...sandboxRoutes,
  ...inventoryRoutes,
  ...procurementRoutes,
  ...requisitionRoutes,
  ...costingRoutes,
  ...traceabilityRoutes,
  ...systemRoutes,
  ...integrationsRoutes,
]
