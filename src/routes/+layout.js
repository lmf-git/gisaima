import { browser } from '$app/environment';
import { initGameStore } from '$lib/stores/game.js';
import { initAuthListener } from '$lib/stores/user';

/**
 * Core initialization for Gisaima services.
 * This is the single entry point for all store initialization.
 */
export function load() {
  if (!browser) return {};
  
  try {
    console.log('Layout load: Initializing core services');
    
    // 1. Initialize auth first
    const authUnsubscribe = initAuthListener();
    console.log('Auth listener initialized');
    
    // 2. Initialize game store which depends on auth
    const gameUnsubscribe = initGameStore();
    console.log('Game store initialized');
    
    // Return unsubscribe functions to be called when the layout is destroyed
    return { 
      unsubscribe: () => {
        if (typeof authUnsubscribe === 'function') authUnsubscribe();
        if (typeof gameUnsubscribe === 'function') gameUnsubscribe();
      }
    };
  } catch (error) {
    console.error('Error initializing core services:', error);
    return {};
  }
}
