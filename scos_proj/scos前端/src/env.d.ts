/// <reference types="vite/client" />

import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    moduleId?: string
    moduleTitle?: string
    sectionKey?: string
  }
}
