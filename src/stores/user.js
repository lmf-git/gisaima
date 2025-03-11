import { writable } from 'svelte/store'

// Initialize user state with basic info only
export const userState = writable({
  id: 1,
  isActive: true
})
