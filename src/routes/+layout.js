import { browser } from '$app/environment';
import { initAuthListener } from '$lib/stores/user.js';
import { initGameStore } from '$lib/stores/game.js';

// Initialize all core services with proper sequencing
export async function load() {
  if (browser) {
    console.log('Layout load: Initializing core services');
    
    // Initialize auth first and wait for it
    let authCleanup = initAuthListener();
    console.log('Auth listener initialized');
    
    // Initialize game store after auth
    let gameCleanup = initGameStore();
    console.log('Game store initialized');
    
    // Return cleanup functions so SvelteKit can dispose resources
    return {
      authCleanup,
      gameCleanup
    };
  }
  
  return {};
}
