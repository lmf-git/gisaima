
import { derived } from 'svelte/store';
import { game } from './game.js';

// Calculate next tick once as a derived store
export const nextWorldTick = derived(
  game,
  ($game, set) => {
    if (!$game.currentWorld || !$game.worldInfo[$game.currentWorld]) {
      set(null);
      return;
    }
    
    const worldInfo = $game.worldInfo[$game.currentWorld];
    const worldSpeed = worldInfo.speed || 1.0;
    const lastTick = worldInfo.lastTick || Date.now();
    
    // Base tick interval is 5 minutes (300000ms)
    const baseTickInterval = 300000;
    const adjustedInterval = Math.round(baseTickInterval / worldSpeed);
    
    // Calculate the next tick time
    const nextTick = lastTick + adjustedInterval;
    set(nextTick);
    
    // Set up interval to update the countdown every second
    const interval = setInterval(() => {
      // If current time has passed the next tick, we should have received 
      // a new lastTick value from the server, but if not, estimate the next one
      const now = Date.now();
      if (now >= nextTick) {
        // Estimate next tick based on the last known tick
        const ticksElapsed = Math.floor((now - lastTick) / adjustedInterval);
        const estimatedNextTick = lastTick + ((ticksElapsed + 1) * adjustedInterval);
        set(estimatedNextTick);
      }
    }, 1000);

    return () => clearInterval(interval);
  }
);

// Add a derived store for formatted time remaining
export const timeUntilNextTick = derived(
  nextWorldTick,
  ($nextWorldTick) => {
    if (!$nextWorldTick) return "Unknown";
    
    const updateTime = () => {
      const now = Date.now();
      const remaining = $nextWorldTick - now;
      
      if (remaining <= 0) {
        return "Any moment now";
      }
      
      // Format as minutes and seconds
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      
      if (minutes <= 0) {
        return `${seconds}s`;
      }
      
      return `${minutes}m ${seconds}s`;
    };
    
    // Initial value
    return updateTime();
  }
);

// Helper function to check if something requires tick processing
export function requiresTickProcessing(status) {
  return status === 'mobilizing' || status === 'demobilising';
}
