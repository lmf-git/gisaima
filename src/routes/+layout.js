import { browser } from '$app/environment';
import { initGameStore } from '$lib/stores/game.js';

// Initialize stores in the correct order
export function load() {
  if (browser) {
    try {
      // First initialize the game store which loads localStorage data
      const unsubscribe = initGameStore();
      

      
      return { unsubscribe };
    } catch (error) {
      console.error('Error initializing stores:', error);
    }
  }
  
  return {};
}
