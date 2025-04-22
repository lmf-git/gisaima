import { browser } from '$app/environment';
import { initGameStore } from '$lib/stores/game.js';
import { initAuthListener } from '$lib/stores/user';

// Track whether initialization has already happened
let initialized = false;
let unsubscribeFunctions = [];

/**
 * Core initialization for Gisaima services.
 * This is the single entry point for all store initialization.
 */
export function load() {
  if (!browser) return {};
  
  // If already initialized, return the existing cleanup function
  if (initialized) {
    return { 
      unsubscribe: () => {
        unsubscribeFunctions.forEach(fn => {
          if (typeof fn === 'function') fn();
        });
        unsubscribeFunctions = [];
      }
    };
  }
  
  try {
    console.log('Layout load: Initializing core services');
    
    // 1. Initialize auth first - store unsubscribe function
    const authUnsubscribe = initAuthListener();
    console.log('Auth listener initialized');
    if (authUnsubscribe) unsubscribeFunctions.push(authUnsubscribe);
    
    // 2. Initialize game store which depends on auth - store unsubscribe function
    const gameUnsubscribe = initGameStore();
    console.log('Game store initialized');
    if (gameUnsubscribe) unsubscribeFunctions.push(gameUnsubscribe);
    
    // Mark as initialized
    initialized = true;
    
    // Return unsubscribe function to be called when the layout is destroyed
    return { 
      unsubscribe: () => {
        unsubscribeFunctions.forEach(fn => {
          if (typeof fn === 'function') fn();
        });
        unsubscribeFunctions = [];
        initialized = false;
      }
    };
  } catch (error) {
    console.error('Error initializing core services:', error);
    return {};
  }
}
