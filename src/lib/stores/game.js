import { writable, derived, get as getStore } from 'svelte/store';
import { browser } from '$app/environment';
import { ref, onValue, get as dbGet, set } from "firebase/database";
import { db } from '../firebase/database.js';
import { user } from './user.js';

// Cache for world info to reduce database calls
const worldInfoCache = new Map();

// Add a store to track auth status
export const isAuthReady = writable(false);

// Store for game state with more detailed loading states
export const game = writable({
  currentWorld: null,
  joinedWorlds: [],
  worldInfo: {},
  loading: true,
  worldLoading: false, // New specific loading state for current world data
  error: null          // Store errors related to world loading
});

// Create a derived store for the current world's info
export const currentWorldInfo = derived(
  game,
  $game => {
    if (!$game.currentWorld) return null;
    return $game.worldInfo[$game.currentWorld] || null;
  }
);

// Create a derived store for the current world's seed
export const currentWorldSeed = derived(
  currentWorldInfo,
  $worldInfo => $worldInfo?.seed || null
);

// Load player's joined worlds
export function loadJoinedWorlds(userId) {
  if (!userId) return;
  
  const userWorldsRef = ref(db, `players/${userId}/worlds`);
  return onValue(userWorldsRef, (snapshot) => {
    if (snapshot.exists()) {
      const joinedWorlds = Object.keys(snapshot.val());
      game.update(state => ({ ...state, joinedWorlds, loading: false }));
      
      // If we have a currentWorld but no info for it, load it
      const currentState = getStore(game);
      if (currentState.currentWorld && !currentState.worldInfo[currentState.currentWorld]) {
        loadCurrentWorldInfo(currentState.currentWorld);
      }
    } else {
      game.update(state => ({ ...state, joinedWorlds: [], loading: false }));
    }
  });
}

// Function to load the current world's info automatically
function loadCurrentWorldInfo(worldId) {
  if (!worldId) return Promise.resolve(null);
  
  // Set loading state
  game.update(state => ({ ...state, worldLoading: true, error: null }));
  
  return getWorldInfo(worldId)
    .then(worldInfo => {
      // Success - worldInfo is already set in the store by getWorldInfo
      game.update(state => ({ ...state, worldLoading: false }));
      return worldInfo;
    })
    .catch(error => {
      console.error('Failed to load world info:', error);
      game.update(state => ({ 
        ...state, 
        worldLoading: false, 
        error: error.message || 'Failed to load world information'
      }));
      return null;
    });
}

// Set the current world with info caching and auto-loading
export function setCurrentWorld(worldId, worldInfo = null) {
  if (!worldId) return Promise.resolve(null);
  
  // Update the store with the new world ID
  game.update(state => {
    // If worldInfo was passed, cache it
    const updatedWorldInfo = { ...state.worldInfo };
    if (worldInfo) {
      updatedWorldInfo[worldId] = worldInfo;
      worldInfoCache.set(worldId, worldInfo);
      
      return { 
        ...state, 
        currentWorld: worldId,
        worldInfo: updatedWorldInfo,
        worldLoading: false,
        error: null
      };
    }
    
    // Otherwise just update the ID - we'll load info in the next step
    return {
      ...state,
      currentWorld: worldId,
      worldLoading: !updatedWorldInfo[worldId] // Only set loading if we don't have the data
    };
  });
  
  // If we don't have the world info, load it
  const currentState = getStore(game);
  if (!worldInfo && !currentState.worldInfo[worldId]) {
    return loadCurrentWorldInfo(worldId);
  }
  
  return Promise.resolve(worldInfo || currentState.worldInfo[worldId]);
}

// Join a world
export function joinWorld(worldId, userId) {
  if (!worldId || !userId) return Promise.reject('Missing worldId or userId');
  
  // Update database to mark player as joined to this world
  const userWorldRef = ref(db, `players/${userId}/worlds/${worldId}`);
  return set(userWorldRef, { joined: Date.now() })
    .then(() => {
      // Update local store
      game.update(state => ({
        ...state,
        currentWorld: worldId,
        joinedWorlds: state.joinedWorlds.includes(worldId) ? 
          state.joinedWorlds : 
          [...state.joinedWorlds, worldId]
      }));
      
      // Load world info if needed
      const currentState = getStore(game);
      if (!currentState.worldInfo[worldId]) {
        return loadCurrentWorldInfo(worldId);
      }
      
      return worldId;
    });
}

// Get world information including seed with caching
export function getWorldInfo(worldId, forceRefresh = false) {
  if (!worldId) return Promise.reject(new Error('Missing worldId'));
  
  // Set loading state first to ensure UI responds correctly
  game.update(state => ({ 
    ...state, 
    worldLoading: true,
    error: null
  }));
  
  // Check if we have valid cached data and aren't forcing a refresh
  const currentGameState = getStore(game);
  if (!forceRefresh && 
      currentGameState.worldInfo && 
      currentGameState.worldInfo[worldId] && 
      currentGameState.worldInfo[worldId].seed !== undefined) {
    
    game.update(state => ({ ...state, worldLoading: false }));
    return Promise.resolve(currentGameState.worldInfo[worldId]);
  }
  
  // Check memory cache if not forcing refresh
  if (!forceRefresh && 
      worldInfoCache.has(worldId) && 
      worldInfoCache.get(worldId).seed !== undefined) {
    
    // Update the store
    const worldInfo = worldInfoCache.get(worldId);
    game.update(state => ({
      ...state,
      worldLoading: false,
      worldInfo: {
        ...state.worldInfo,
        [worldId]: worldInfo
      }
    }));
    
    return Promise.resolve(worldInfo);
  }
  
  // No valid cache, fetch from database with direct path to ensure we get the seed
  const worldRef = ref(db, `worlds/${worldId}/info`);
  return dbGet(worldRef).then(snapshot => {
    if (snapshot.exists()) {
      const worldInfo = snapshot.val();
      
      // Validate seed - it's critical for map generation
      if (worldInfo.seed === undefined || worldInfo.seed === null) {
        game.update(state => ({ 
          ...state, 
          worldLoading: false,
          error: `World ${worldId} has no seed defined`
        }));
        
        throw new Error(`World ${worldId} has no seed defined`);
      }
      
      // Update both caches
      worldInfoCache.set(worldId, worldInfo);
      
      // Update store with the world info
      game.update(state => ({
        ...state,
        worldLoading: false,
        worldInfo: {
          ...state.worldInfo,
          [worldId]: worldInfo
        }
      }));
      
      return worldInfo;
    } else {
      game.update(state => ({ 
        ...state, 
        worldLoading: false,
        error: `World ${worldId} not found in database`
      }));
      
      throw new Error(`World ${worldId} not found in database`);
    }
  }).catch(error => {
    // Keep this error log but make it more concise
    console.error(`World error: ${error.message}`);
    
    game.update(state => ({ 
      ...state, 
      worldLoading: false,
      error: error.message || `Failed to load world ${worldId}`
    }));
    
    throw error;
  });
}

// Initialize the store on app start - simplified version
export function initGameStore() {
  if (browser) {
    // Set initial loading state
    game.update(state => ({ ...state, loading: true }));
    isAuthReady.set(false);
    
    // Subscribe to auth changes to load joined worlds
    const unsubscribe = user.subscribe($user => {
      if ($user?.uid) {
        // Set auth as ready once we have a user
        isAuthReady.set(true);
        loadJoinedWorlds($user.uid);
      } else if ($user === null) {
        // User is definitely not logged in (not just undefined/loading)
        isAuthReady.set(true);
        game.update(state => ({ 
          ...state, 
          joinedWorlds: [], 
          loading: false,
          worldLoading: false
        }));
      }
    });
    
    return unsubscribe;
  }
}
