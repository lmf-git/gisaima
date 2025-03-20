import { writable, derived, get as getStore } from 'svelte/store';
import { browser } from '$app/environment';
import { ref, onValue, get as dbGet, set } from "firebase/database";
import { db } from '../firebase/database.js';
import { user } from '../firebase/user.js'; // Assuming you have an auth store

// Cache for world info to reduce database calls
const worldInfoCache = new Map();

// Store for game state
export const game = writable({
  currentWorld: null,
  joinedWorlds: [],
  worldInfo: {}, // Add cached world info 
  loading: true
});

// Load player's joined worlds
export function loadJoinedWorlds(userId) {
  if (!userId) return;
  
  const userWorldsRef = ref(db, `players/${userId}/worlds`);
  return onValue(userWorldsRef, (snapshot) => {
    if (snapshot.exists()) {
      const joinedWorlds = Object.keys(snapshot.val());
      game.update(state => ({ ...state, joinedWorlds, loading: false }));
    } else {
      game.update(state => ({ ...state, joinedWorlds: [], loading: false }));
    }
  });
}

// Set the current world with info caching
export function setCurrentWorld(worldId, worldInfo = null) {
  if (!worldId) return;
  
  game.update(state => {
    // If worldInfo was passed, cache it
    const updatedWorldInfo = { ...state.worldInfo };
    if (worldInfo) {
      updatedWorldInfo[worldId] = worldInfo;
      worldInfoCache.set(worldId, worldInfo);
    }
    
    return { 
      ...state, 
      currentWorld: worldId,
      worldInfo: updatedWorldInfo
    };
  });
  
  // Save to localStorage for persistence
  if (browser) {
    localStorage.setItem('currentWorld', worldId);
  }
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
        joinedWorlds: [...state.joinedWorlds, worldId]
      }));
      
      return worldId;
    });
}

// Get world information including seed with caching
export function getWorldInfo(worldId) {
  if (!worldId) return Promise.reject('Missing worldId');
  
  // Check if we already have this world's info in the store
  const currentGameState = getStore(game);
  if (currentGameState.worldInfo && currentGameState.worldInfo[worldId]) {
    return Promise.resolve(currentGameState.worldInfo[worldId]);
  }
  
  // Check cache first
  if (worldInfoCache.has(worldId)) {
    return Promise.resolve(worldInfoCache.get(worldId));
  }
  
  // Fetch from database if not cached
  const worldRef = ref(db, `worlds/${worldId}/info`);
  return dbGet(worldRef).then(snapshot => {
    if (snapshot.exists()) {
      const worldInfo = snapshot.val();
      
      // Update cache
      worldInfoCache.set(worldId, worldInfo);
      
      // Update store with the world info
      game.update(state => ({
        ...state,
        worldInfo: {
          ...state.worldInfo,
          [worldId]: worldInfo
        }
      }));
      
      return worldInfo;
    } else {
      throw new Error(`World ${worldId} not found`);
    }
  });
}

// Initialize the store on app start
export function initGameStore() {
  if (browser) {
    // Restore current world from localStorage if available
    const savedWorld = localStorage.getItem('currentWorld');
    if (savedWorld) {
      game.update(state => ({ ...state, currentWorld: savedWorld }));
    }
    
    // Subscribe to auth changes to load joined worlds
    const unsubscribe = user.subscribe($user => {
      if ($user?.uid) {
        loadJoinedWorlds($user.uid);
      } else {
        game.update(state => ({ ...state, joinedWorlds: [], loading: false }));
      }
    });
    
    return unsubscribe;
  }
}
