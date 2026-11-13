import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/app/layouts/AppLayout.vue'
import { businessRoutes } from '@/app/modules'
import { env } from '@/shared/config/env'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        { path: '', redirect: '/dashboard' },
        ...businessRoutes,
        { path: '/integrations/trace', redirect: '/traceability/query' },
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('@/app/pages/NotFoundPage.vue'),
          meta: { title: '页面不存在' },
        },
      ],
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  document.title = `${to.meta.title || '工作台'} · ${env.appTitle}`
})

// 企业认证接入后在此装配路由守卫；后端始终负责最终权限校验。
