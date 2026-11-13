<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton, ElMenu, ElMenuItem, ElSubMenu, ElTag } from 'element-plus'
import { businessModules } from '@/app/modules'
import { useContextStore } from '@/app/stores/context'
import { env } from '@/shared/config/env'

const route = useRoute()
const router = useRouter()
const context = useContextStore()
const groups = ['决策中心', '分析与追溯', '系统与协同'] as const
const openMenus = computed(() => (route.meta.moduleId ? [route.meta.moduleId] : []))
watch(
  () => route.path,
  () => context.closeNavigation(),
)

function selectPage(path: string) {
  void router.push(path)
}
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">跳转到主要内容</a>
    <button
      v-if="context.mobileNavigationOpen"
      class="nav-scrim"
      aria-label="关闭导航"
      @click="context.closeNavigation"
    />
    <aside
      id="main-navigation"
      class="sidebar"
      :class="{ 'is-open': context.mobileNavigationOpen }"
    >
      <RouterLink class="brand" to="/dashboard" aria-label="SCOS 首页">
        <span class="brand-mark">SC</span>
        <span><strong>SCOS</strong><small>供应链优化与协同</small></span>
      </RouterLink>
      <nav class="sidebar-navigation" aria-label="业务模块导航">
        <ElMenu
          :default-active="route.path"
          :default-openeds="openMenus"
          background-color="transparent"
          text-color="#b8cbd9"
          active-text-color="#70e6cf"
          @select="selectPage"
        >
          <template v-for="group in groups" :key="group">
            <li class="nav-group-label" role="presentation">{{ group }}</li>
            <template
              v-for="module in businessModules.filter((item) => item.group === group)"
              :key="module.id"
            >
              <ElMenuItem v-if="module.sections.length === 1" :index="module.sections[0]!.path">
                {{ module.title }}
              </ElMenuItem>
              <ElSubMenu v-else :index="module.id">
                <template #title>{{ module.title }}</template>
                <ElMenuItem
                  v-for="section in module.sections"
                  :key="section.key"
                  :index="section.path"
                >
                  {{ section.title }}
                </ElMenuItem>
              </ElSubMenu>
            </template>
          </template>
        </ElMenu>
      </nav>
      <div class="sidebar-footer"><span class="status-dot" /> 协同计划 · 可解释决策</div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="topbar-leading">
          <ElButton
            class="mobile-menu-button"
            aria-controls="main-navigation"
            :aria-expanded="context.mobileNavigationOpen"
            @click="context.toggleNavigation"
            >导航</ElButton
          >
          <div class="breadcrumbs">
            <span>{{ route.meta.moduleTitle || '工作台' }}</span>
            <span v-if="route.meta.title !== route.meta.moduleTitle" class="breadcrumb-current"
              >/ {{ route.meta.title }}</span
            >
          </div>
        </div>
        <div class="topbar-context">
          <ElTag :type="env.dataSource === 'mock' ? 'warning' : 'info'" effect="plain">
            {{ env.dataSource === 'mock' ? '示例模式' : '业务接口模式' }}
          </ElTag>
          <span>{{ context.organization?.name || '组织待选择' }}</span>
        </div>
      </header>
      <main id="main-content" class="main-content" tabindex="-1">
        <RouterView />
      </main>
      <footer class="workspace-footer">SCOS · 供应链优化与协同系统</footer>
    </div>
  </div>
</template>
