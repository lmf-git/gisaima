import { browser } from '$app/environment';
import { setMapInitializer } from './game.js';
import { initializeMapForWorld, setupFromGameStore } from './map.js';
import { game } from './game.js';

// Flag to track if we've already initialized
let initialized = false;

/**
 * Connect the stores together to avoid circular dependencies
 * This should be called once at app startup
 */
export function connectStores() {
  if (!browser || initialized) return;
  
  try {
    console.log('Connecting stores...');
    
    // Set map initializer function in the game store
    setMapInitializer(initializeMapForWorld);
    
    // Configure map store to use game store
    // This is safe since we're doing it after both modules have initialized
    if (browser) {
      const mapSetupSuccess = setupFromGameStore(game);
      console.log('Map setup from game store:', mapSetupSuccess ? 'successful' : 'not yet possible');
    }
    
    initialized = true;
    console.log('Stores connected successfully');
  } catch (error) {
    console.error('Error connecting stores:', error);
  }
}
