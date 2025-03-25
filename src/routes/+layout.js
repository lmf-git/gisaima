import { browser } from '$app/environment';
import { initGameStore } from '$lib/stores/game.js';
import { connectStores } from '$lib/stores/store-initializer.js';

// Initialize stores in the correct order
export function load() {
  if (browser) {
    try {
      // First initialize the game store which loads localStorage data
      const unsubscribe = initGameStore();
      
      // Then connect the stores to establish proper relationships
      // This happens after both stores are loaded
      setTimeout(() => {
        connectStores();
      }, 0);
      
      return { unsubscribe };
    } catch (error) {
      console.error('Error initializing stores:', error);
    }
  }
  
  return {};
}
