import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useContextStore = defineStore('app-context', () => {
  const organization = ref<{ id: string; name: string } | null>(null)
  const mobileNavigationOpen = ref(false)

  function closeNavigation() {
    mobileNavigationOpen.value = false
  }

  function toggleNavigation() {
    mobileNavigationOpen.value = !mobileNavigationOpen.value
  }

  return { organization, mobileNavigationOpen, closeNavigation, toggleNavigation }
})
