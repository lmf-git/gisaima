import { browser } from '$app/environment';
import { initAuthListener } from '$lib/stores/user.js';
import { initGameStore } from '$lib/stores/game.js';

// Improve initialization to make it more reliable
export async function load() {
  if (browser) {
    console.log('Layout load: Initializing core services');
    
    try {
      // Initialize auth first and wait for it
      let authCleanup = initAuthListener();
      console.log('Auth listener initialized');
      
      // Initialize game store after auth - make sure it's fully initialized
      // by actively waiting for the promise to resolve
      const gameCleanupPromise = initGameStore();
      
      // Wait a small amount of time for initial game store setup
      if (typeof gameCleanupPromise.then === 'function') {
        await gameCleanupPromise;
        console.log('Game store initialization promise resolved');
      } else {
        console.log('Game store initialized (no promise returned)');
      }
      
      // Return cleanup functions so SvelteKit can dispose resources
      return {
        authCleanup,
        gameCleanup: typeof gameCleanupPromise === 'function' ? gameCleanupPromise : () => {}
      };
    } catch (error) {
      console.error('Error initializing core services:', error);
      // Return empty cleanup functions
      return {
        authCleanup: () => {},
        gameCleanup: () => {}
      };
    }
  }
  
  return {};
}
