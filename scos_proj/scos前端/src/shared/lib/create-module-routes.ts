import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import type { BusinessModule } from '@/shared/types/navigation'

export function createModuleRoutes(
  module: BusinessModule,
  page: () => Promise<{ default: Component }>,
): RouteRecordRaw[] {
  return module.sections.map((section) => ({
    path: section.path,
    name: `${module.id}-${section.key}`,
    component: page,
    meta: {
      title: section.title,
      moduleId: module.id,
      moduleTitle: module.title,
      sectionKey: section.key,
    },
  }))
}
