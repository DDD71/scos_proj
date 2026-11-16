import { dashboardModule, dashboardRoutes } from '@/modules/dashboard'
import { sandboxModule, sandboxRoutes } from '@/modules/sandbox'
import { inventoryModule, inventoryRoutes } from '@/modules/inventory'
import { procurementModule, procurementRoutes } from '@/modules/procurement'
import { requisitionModule, requisitionRoutes } from '@/modules/requisition'
import { costingModule, costingRoutes } from '@/modules/costing'
import { traceabilityRoutes } from '@/modules/traceability'
import { systemRoutes } from '@/modules/system'
import { integrationsRoutes } from '@/modules/integrations'
import { schedulingModule, schedulingRoutes } from '@/modules/scheduling'
import type { RouteRecordRaw } from 'vue-router'

export const sidebarModules = [
  { ...dashboardModule, sections: [...dashboardModule.sections, ...sandboxModule.sections] },
  procurementModule,
  requisitionModule,
  inventoryModule,
  costingModule,
  schedulingModule,
] as const

export const businessRoutes: RouteRecordRaw[] = [
  ...dashboardRoutes,
  ...sandboxRoutes,
  ...inventoryRoutes,
  ...procurementRoutes,
  ...requisitionRoutes,
  ...costingRoutes,
  ...schedulingRoutes,
  ...traceabilityRoutes,
  ...systemRoutes,
  ...integrationsRoutes,
]
