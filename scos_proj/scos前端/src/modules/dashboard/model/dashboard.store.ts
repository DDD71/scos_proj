import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dashboardRepository } from '../api/dashboard.repository'
import type { DashboardOverview } from './types'

export const useDashboardStore = defineStore('dashboard', () => {
  const overview = ref<DashboardOverview | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadOverview() {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      overview.value = await dashboardRepository.getOverview()
    } catch (cause) {
      overview.value = null
      error.value = cause instanceof Error ? cause.message : '驾驶舱数据加载失败。'
    } finally {
      loading.value = false
    }
  }

  return { overview, loading, error, loadOverview }
})
