import { browser } from '$app/environment';
import { setup as setupUAuth } from '$lib/stores/user.js';
import { setup as setupGame } from '$lib/stores/game.js';

export async function load() {
  if (browser) {
    console.log('Layout load: Initializing core services');
    
    setupUAuth()
    setupGame()
  }
  return {};
};