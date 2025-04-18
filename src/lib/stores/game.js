import { writable, derived, get as getStore, get } from 'svelte/store';
import { browser } from '$app/environment';
import { ref, onValue, get as dbGet, set } from "firebase/database";
import { db } from '../firebase/database.js';
import { userStore } from './user.js'; 

// Remove circular dependency by not importing from map.js
// We'll define a local function for map initialization
// Which can be overridden later by the actual map module

// Constants for localStorage
const CURRENT_WORLD_KEY = 'gisaima-current-world';

// Add a store to track auth status
export const isAuthReady = writable(false);

// Store for game state with more detailed loading states
export const game = writable({
  currentWorld: null,
  joinedWorlds: [],
  worldInfo: {},
  playerWorldData: null, // Add player-specific data for the current world
  loading: true,
  worldLoading: false,
  error: null,
  initialized: false // Add new flag to track initialization status
});

// Create default empty stores for SSR context
const defaultUser = writable(null);
const user = browser ? userStore : defaultUser;

// Create a derived store for the current world's info
export const currentWorldInfo = derived(
  game,
  $game => {
    if (!$game || !$game.currentWorld) return null;
    return $game.worldInfo[$game.currentWorld] || null;
  }
);

// Create a derived store for the current world's seed
export const currentWorldSeed = derived(
  currentWorldInfo,
  $worldInfo => {
    if (!$worldInfo) return null;
    return $worldInfo.seed || null;
  }
);

// Create a derived store for the current world's center coordinates
export const currentWorldCenter = derived(
  [game, currentWorldInfo],
  ([$game, $worldInfo]) => {
    if (!$worldInfo) return { x: 0, y: 0 };
    
    // Use center coordinates if explicitly defined
    if ($worldInfo.center && typeof $worldInfo.center.x === 'number' && typeof $worldInfo.center.y === 'number') {
      return { x: $worldInfo.center.x, y: $worldInfo.center.y };
    }
    
    // Otherwise check if we have spawn information in the world data
    const worldId = $game.currentWorld;
    if (!worldId) return { x: 0, y: 0 };
    
    // Default center
    return { x: 0, y: 0 };
  }
);

// Create a derived store that combines user data with player world-specific data
// Fixed: Use a safer approach for derived stores with proper null checks
export const currentPlayer = derived(
  [user, game], 
  ([$user, $game]) => {
    // Early returns for missing data
    if (!$user) return null;
    if (!$game) return null;
    if (!$game.currentWorld) return null;
    if (!$game.playerWorldData) return null;
    
    try {
      // Get appropriate display name based on auth status
      let displayName;
      if ($user.isAnonymous) {
        displayName = `Guest ${$user.uid.substring(0, 4)}`;
      } else {
        displayName = $user.displayName || ($user.email ? $user.email.split('@')[0] : `Player ${$user.uid.substring(0, 4)}`);
      }
      
      // Base player info from user auth data
      return {
        uid: $user.uid,
        displayName: displayName,
        email: $user.email,
        isAnonymous: $user.isAnonymous,
        guest: $user.isAnonymous, // Add an explicit guest flag for easier checking
        // Current world context
        world: $game.currentWorld,
        worldName: $game.worldInfo[$game.currentWorld]?.name,
        // Player status in this world
        spawned: $game.playerWorldData.spawned || false,
        lastLocation: $game.playerWorldData.lastLocation || null,
        lastSpawn: $game.playerWorldData.lastSpawn || null,
        // Race information
        race: $game.playerWorldData.race,
        // Joined timestamp
        joinedAt: $game.playerWorldData.joined || null,
        // For convenience, include all world-specific player data
        worldData: $game.playerWorldData
      };
    } catch (e) {
      console.error("Error in currentPlayer derived store:", e);
      return null;
    }
  }
);

// Create a derived store for player's spawn status in the current world
export const needsSpawn = derived(
  currentPlayer,
  $player => {
    if (!$player) return true;
    return $player.spawned === false;
  }
);

// Create a derived store for the next world tick time
export const nextWorldTick = derived(
  game,
  ($game) => {
    if (!$game.currentWorld || !$game.worldInfo[$game.currentWorld]) {
      return null;
    }
    
    const worldInfo = $game.worldInfo[$game.currentWorld];
    const worldSpeed = worldInfo.speed || 1.0;
    const lastTick = worldInfo.lastTick || Date.now();
    
    // Base tick interval is 5 minutes (300000ms)
    const baseTickInterval = 300000;
    const adjustedInterval = Math.round(baseTickInterval / worldSpeed);
    
    // Calculate the next tick time
    return lastTick + adjustedInterval;
  }
);

// Add a derived store for formatted time remaining until next tick
export const timeUntilNextTick = derived(
  nextWorldTick,
  ($nextWorldTick) => {
    if (!$nextWorldTick) {
      return "Unknown";
    }
    
    const now = Date.now();
    const remaining = $nextWorldTick - now;
    
    // Simplified time display - show "<1m" when close to tick
    if (remaining <= 60000) {
      return "<1m";
    }
    
    // Format as minutes and seconds
    const minutes = Math.floor(remaining / 60000);
    return `${minutes}m`;
  }
);

// Track active subscriptions for proper cleanup
let activeJoinedWorldsSubscription = null;
let activePlayerWorldDataSubscription = null;

// Add a throttle mechanism for world info loading
const pendingWorldInfoRequests = new Map();
const worldInfoCache = new Map();
const WORLD_INFO_THROTTLE_MS = 500;

// Add a timestamp to track when world info was last fetched
const worldInfoLastFetchTime = new Map();

// Load player's joined worlds
export function loadJoinedWorlds(userId) {
  if (!userId) {
    console.log('Cannot load joined worlds: no userId provided');
    return Promise.resolve(false);
  }
  
  // Clean up existing subscription to prevent multiple listeners
  if (activeJoinedWorldsSubscription) {
    activeJoinedWorldsSubscription();
    activeJoinedWorldsSubscription = null;
  }
  
  console.log(`Loading joined worlds for user: ${userId}`);
  
  return new Promise((resolve) => {
    const userWorldsRef = ref(db, `players/${userId}/worlds`);
    console.log('User worlds path:', `players/${userId}/worlds`);
    
    activeJoinedWorldsSubscription = onValue(userWorldsRef, (snapshot) => {
      console.log('User worlds snapshot received:', snapshot.exists() ? 'Data exists' : 'No data');
      
      if (snapshot.exists()) {
        const joinedWorlds = Object.keys(snapshot.val());
        console.log('User joined worlds:', joinedWorlds);
        
        game.update(state => ({ ...state, joinedWorlds, loading: false }));
        
        // If we have a currentWorld but no info for it, load it
        const currentState = getStore(game);
        if (currentState.currentWorld && !currentState.worldInfo[currentState.currentWorld]) {
          console.log('Loading info for current world:', currentState.currentWorld);
          getWorldInfo(currentState.currentWorld)
            .then(() => resolve(true))
            .catch(err => {
              console.error('Error loading current world info:', err);
              resolve(false);
            });
        } else {
          resolve(true);
        }
        
        // Also load the player data for the current world if it exists
        if (currentState.currentWorld) {
          loadPlayerWorldData(userId, currentState.currentWorld);
        }
      } else {
        console.log('No joined worlds found for user');
        game.update(state => ({ ...state, joinedWorlds: [], loading: false }));
        resolve(true);
      }
    }, error => {
      console.error('Error loading joined worlds:', error);
      game.update(state => ({ ...state, loading: false, error: error.message }));
      resolve(false);
    });
  });
}

// Load player-specific data for the current world
export function loadPlayerWorldData(userId, worldId) {
  if (!userId || !worldId) return;
  
  // Clean up existing subscription to prevent multiple listeners
  if (activePlayerWorldDataSubscription) {
    activePlayerWorldDataSubscription();
    activePlayerWorldDataSubscription = null;
  }
  
  const playerWorldRef = ref(db, `players/${userId}/worlds/${worldId}`);
  activePlayerWorldDataSubscription = onValue(playerWorldRef, (snapshot) => {
    if (snapshot.exists()) {
      const playerWorldData = snapshot.val();
      game.update(state => ({ 
        ...state, 
        playerWorldData,
        // If player has last location data, update it in the store
        lastLocation: playerWorldData.lastLocation || null
      }));
    } else {
      game.update(state => ({ ...state, playerWorldData: null }));
    }
  });
  
  return activePlayerWorldDataSubscription;
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

// Placeholder function that will be replaced when map.js loads
let initMapForWorld = (worldId, worldData) => {
  console.log(`Map module not yet loaded. Will initialize world ${worldId} later.`);
  return false;
};

// Function to set the map initialization function from outside
export function setMapInitializer(initFunction) {
  if (typeof initFunction === 'function') {
    initMapForWorld = initFunction;
  }
}

// Set the current world with info caching and auto-loading
// This function ensures the world is saved to localStorage
export function setCurrentWorld(worldId, worldInfo = null) {
  if (!worldId) return Promise.resolve(null);
  
  console.log(`Setting current world to: ${worldId}`);
  
  // Save to localStorage if in browser
  if (browser) {
    try {
      localStorage.setItem(CURRENT_WORLD_KEY, worldId);
      console.log(`Saved world ${worldId} to localStorage`);
    } catch (e) {
      console.error('Failed to save world to localStorage:', e);
    }
  }
  
  // Update the store with the new world ID
  game.update(state => {
    // If worldInfo was passed, store it
    const updatedWorldInfo = { ...state.worldInfo };
    if (worldInfo) {
      updatedWorldInfo[worldId] = worldInfo;
      
      const newState = { 
        ...state, 
        currentWorld: worldId,
        worldInfo: updatedWorldInfo,
        worldLoading: false,
        error: null,
        playerWorldData: null // Reset player data when changing worlds
      };
      
      // Initialize map with the new world data
      initMapForWorld(worldId, worldInfo);
      
      return newState;
    }
    
    // Otherwise just update the ID - we'll load info in the next step
    return {
      ...state,
      currentWorld: worldId,
      worldLoading: !updatedWorldInfo[worldId], // Only set loading if we don't have the data
      playerWorldData: null // Reset player data when changing worlds
    };
  });
  
  // If we don't have the world info, load it
  const currentState = getStore(game);
  const promises = [];
  
  if (!worldInfo && !currentState.worldInfo[worldId]) {
    promises.push(loadCurrentWorldInfo(worldId));
  }
  
  // Also load player data if user is authenticated
  const currentUser = getStore(user);
  if (currentUser?.uid) {
    loadPlayerWorldData(currentUser.uid, worldId);
  }
  
  if (promises.length > 0) {
    return Promise.all(promises).then(() => getStore(game).worldInfo[worldId] || null);
  }
  
  return Promise.resolve(worldInfo || currentState.worldInfo[worldId]);
}

// Get world information including seed with caching and throttling - improved with force refresh
export function getWorldInfo(worldId, forceRefresh = false) {
  if (!worldId) return Promise.reject(new Error('Missing worldId'));
  
  console.log(`Getting world info for: ${worldId}, force refresh: ${forceRefresh}`);
  
  // Check for pending request for this world
  if (pendingWorldInfoRequests.has(worldId)) {
    return pendingWorldInfoRequests.get(worldId);
  }
  
  // Set loading state first to ensure UI responds correctly
  game.update(state => ({ 
    ...state, 
    worldLoading: true,
    error: null
  }));
  
  // Check if we have valid cached data in the store and aren't forcing a refresh
  const currentGameState = getStore(game);
  if (!forceRefresh && 
      currentGameState.worldInfo && 
      currentGameState.worldInfo[worldId] && 
      currentGameState.worldInfo[worldId].seed !== undefined) {
    
    // Only use cache if it's not too old (less than 30 seconds)
    const lastFetchTime = worldInfoLastFetchTime.get(worldId) || 0;
    const now = Date.now();
    
    if (now - lastFetchTime < 30000) {
      console.log(`Using cached world info for ${worldId} (age: ${now - lastFetchTime}ms)`);
      game.update(state => ({ ...state, worldLoading: false }));
      return Promise.resolve(currentGameState.worldInfo[worldId]);
    } else {
      console.log(`Cached world info for ${worldId} is too old (${now - lastFetchTime}ms), refreshing`);
      // Continue with refresh below
    }
  }
  
  // Also check in-memory cache with the same time expiration policy
  if (!forceRefresh && worldInfoCache.has(worldId)) {
    const lastFetchTime = worldInfoLastFetchTime.get(worldId) || 0;
    const now = Date.now();
    
    if (now - lastFetchTime < 30000) {
      console.log(`Using memory-cached world info for ${worldId}`);
      const cachedInfo = worldInfoCache.get(worldId);
      
      game.update(state => ({
        ...state,
        worldLoading: false,
        worldInfo: {
          ...state.worldInfo,
          [worldId]: cachedInfo
        }
      }));
      
      return Promise.resolve(cachedInfo);
    }
  }
  
  // No valid cache or cache expired, fetch from database with direct path
  console.log(`Fetching world info from database for ${worldId}`);
  const worldRef = ref(db, `worlds/${worldId}/info`);
  
  // Create a promise for this request and store it
  const fetchPromise = dbGet(worldRef)
    .then(snapshot => {
      console.log(`World info snapshot for ${worldId}:`, snapshot.exists() ? 'Data exists' : 'No data');
      
      if (snapshot.exists()) {
        const worldInfo = snapshot.val();
        
        // Validate seed - it's critical for map generation
        if (worldInfo.seed === undefined || worldInfo.seed === null) {
          const error = `World ${worldId} has no seed defined`;
          console.error(error);
          
          game.update(state => ({ 
            ...state, 
            worldLoading: false,
            error: error
          }));
          
          throw new Error(error);
        }
        
        // Update the last fetch time
        worldInfoLastFetchTime.set(worldId, Date.now());
        
        // Cache the world info in memory
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
        
        // Log the center coordinates for debugging with more specific output
        if (worldInfo.center) {
          console.log(`Loaded world center for ${worldId}: ${JSON.stringify(worldInfo.center)}`);
        } else {
          console.log(`No explicit center coordinates for ${worldId}, will use default (0,0)`);
        }
        
        console.log(`Successfully loaded world info for ${worldId}`);
        return worldInfo;
      } else {
        const error = `World ${worldId} not found in database`;
        console.error(error);
        
        game.update(state => ({ 
          ...state, 
          worldLoading: false,
          error: error
        }));
        
        throw new Error(error);
      }
    })
    .catch(error => {
      console.error(`World error: ${error.message}`);
      
      game.update(state => ({ 
        ...state, 
        worldLoading: false,
        error: error.message || `Failed to load world ${worldId}`
      }));
      
      throw error;
    })
    .finally(() => {
      // Remove this request from pending after a throttle delay
      setTimeout(() => {
        pendingWorldInfoRequests.delete(worldId);
      }, WORLD_INFO_THROTTLE_MS);
    });
  
  // Store the promise for deduplication
  pendingWorldInfoRequests.set(worldId, fetchPromise);
  
  return fetchPromise;
}

// Function to clear world info cache for a specific world or all worlds
export function clearWorldInfoCache(worldId = null) {
  if (worldId) {
    console.log(`Clearing cache for world ${worldId}`);
    worldInfoCache.delete(worldId);
    worldInfoLastFetchTime.delete(worldId);
    
    // Also clear from the game store
    game.update(state => {
      if (state.worldInfo[worldId]) {
        const newWorldInfo = { ...state.worldInfo };
        delete newWorldInfo[worldId];
        return { ...state, worldInfo: newWorldInfo };
      }
      return state;
    });
  } else {
    console.log('Clearing all world info cache');
    worldInfoCache.clear();
    worldInfoLastFetchTime.clear();
    
    // Also clear from the game store
    game.update(state => ({ 
      ...state, 
      worldInfo: {} 
    }));
  }
}

// Function to clear the current world from localStorage
export function clearCurrentWorld() {
  console.log('Clearing current world from localStorage');
  
  if (browser) {
    try {
      localStorage.removeItem(CURRENT_WORLD_KEY);
      console.log('Current world removed from localStorage');
    } catch (e) {
      console.error('Error removing world from localStorage:', e);
    }
  }
  
  game.update(state => ({
    ...state,
    currentWorld: null,
    playerWorldData: null
  }));
}

// Track if we've already initialized services
let gameStoreInitialized = false;

// Initialize the store on app start - with improved startup handling
export function initGameStore() {
  if (!browser) return () => {};
  
  // Prevent duplicate initialization
  if (gameStoreInitialized) {
    console.log('Game store already initialized, skipping duplicate initialization');
    return () => {};
  }
  
  console.log('Initializing game store');
  gameStoreInitialized = true;
  
  try {
    // Set initial loading state
    game.update(state => ({ ...state, loading: true, initialized: false }));
    isAuthReady.set(false);
    
    // Load the current world from localStorage if available
    try {
      const savedWorldId = localStorage.getItem(CURRENT_WORLD_KEY);
      if (savedWorldId) {
        console.log(`Found saved world in localStorage: ${savedWorldId}`);
        
        game.update(state => ({ 
          ...state, 
          currentWorld: savedWorldId 
        }));
        
        // We'll load the world info when auth is ready instead of here
      } else {
        console.log('No saved world found in localStorage');
      }
    } catch (e) {
      console.error('Error loading world from localStorage:', e);
    }
    
    let lastUserId = null;
    
    // Subscribe to auth changes to load joined worlds
    const unsubscribe = user.subscribe($user => {
      console.log('Auth state changed in game store:', $user ? 'User present' : 'No user');
      try {
        // Skip duplicate updates for the same user
        if ($user?.uid === lastUserId) {
          console.log('Skipping duplicate auth change with same user ID');
          return;
        }
        
        lastUserId = $user?.uid;
        
        if ($user?.uid) {
          console.log('User authenticated, loading joined worlds for:', $user.uid);
          // Set auth as ready once we have a user
          isAuthReady.set(true);
          
          // Load joined worlds and then mark the store as initialized
          loadJoinedWorlds($user.uid).then(() => {
            game.update(state => ({...state, initialized: true}));
            console.log('Game store initialization complete');
          });
          
          // If there's already a current world, load the player data for it
          const currentState = getStore(game);
          if (currentState.currentWorld) {
            loadPlayerWorldData($user.uid, currentState.currentWorld);
          }
        } else if ($user === null) {
          // User is definitely not logged in (not just undefined/loading)
          console.log('User not authenticated, clearing joined worlds');
          isAuthReady.set(true);
          // Don't clear the current world from localStorage here
          // Just clear local state
          game.update(state => ({ 
            ...state, 
            joinedWorlds: [], 
            playerWorldData: null,
            loading: false,
            worldLoading: false,
            initialized: true // Mark as initialized even without a user
          }));
        }
      } catch (e) {
        console.error('Error in user subscription handler:', e);
        // Make sure auth ready flag is set even if there's an error
        isAuthReady.set(true);
        // Mark as initialized with error
        game.update(state => ({...state, initialized: true, error: e.message}));
      }
    });
    
    return () => {
      // Clean up subscriptions
      unsubscribe();
      
      if (activeJoinedWorldsSubscription) {
        activeJoinedWorldsSubscription();
        activeJoinedWorldsSubscription = null;
      }
      
      if (activePlayerWorldDataSubscription) {
        activePlayerWorldDataSubscription();
        activePlayerWorldDataSubscription = null;
      }
      
      gameStoreInitialized = false;
    };
  } catch (e) {
    console.error('Error initializing game store:', e);
    // Set auth ready flag even if initialization fails
    isAuthReady.set(true);
    // Mark as initialized with error
    game.update(state => ({...state, initialized: true, loading: false, error: e.message}));
    gameStoreInitialized = false;
    // Return empty function to prevent errors when calling the unsubscribe
    return () => {};
  }
}

// Function to join a world with race selection
export async function joinWorld(worldId, userId, race) {
  if (!worldId || !userId) {
    throw new Error('Missing required parameters for joining world');
  }
  
  console.log(`User ${userId} joining world ${worldId} as ${race}`);
  
  try {
    // Set loading state
    game.update(state => ({ ...state, loading: true, error: null }));
    
    // Create a reference to the player's world data
    const playerWorldRef = ref(db, `players/${userId}/worlds/${worldId}`);
    
    // Get world center coordinates
    const centerCoords = getWorldCenterCoordinates(worldId);
    
    // Record the join with timestamp, race, and target position
    await set(playerWorldRef, {
      joined: Date.now(),
      race: race || 'human', // Default to human if race not specified
      spawned: false,
      // Set initial target to world center
      lastLocation: {
        x: centerCoords.x,
        y: centerCoords.y,
        timestamp: Date.now()
      }
    });
    
    // Update local state to include this world
    game.update(state => {
      const joinedWorlds = [...(state.joinedWorlds || [])];
      
      // Only add if not already in the list
      if (!joinedWorlds.includes(worldId)) {
        joinedWorlds.push(worldId);
      }
      
      return {
        ...state,
        joinedWorlds,
        currentWorld: worldId,
        loading: false,
      };
    });
    
    // Also load the world info if needed
    const currentState = getStore(game);
    if (!currentState.worldInfo[worldId]) {
      await getWorldInfo(worldId);
    }
    
    // Save to localStorage
    if (browser) {
      try {
        localStorage.setItem(CURRENT_WORLD_KEY, worldId);
      } catch (e) {
        console.error('Failed to save world to localStorage:', e);
      }
    }
    
    // Load player data for this world
    loadPlayerWorldData(userId, worldId);
    
    return worldId;
  } catch (error) {
    console.error('Error joining world:', error);
    game.update(state => ({ 
      ...state, 
      loading: false, 
      error: `Failed to join world: ${error.message}` 
    }));
    throw error;
  }
}

// Add a function to specifically refresh world data
export async function refreshWorldInfo(worldId) {
  if (!worldId) return null;
  
  console.log(`Forcing refresh of world info for ${worldId}`);
  
  // Clear cache for this world
  clearWorldInfoCache(worldId);
  
  // Now fetch fresh data
  try {
    return await getWorldInfo(worldId, true);
  } catch (err) {
    console.error(`Failed to refresh world ${worldId}:`, err);
    return null;
  }
}

// Function to get world center coordinates - improved with better debugging
export function getWorldCenterCoordinates(worldId, worldInfo = null) {
  if (!worldId) return { x: 0, y: 0 };
  
  // Use provided worldInfo or try to get from store
  const info = worldInfo || (getStore(game).worldInfo?.[worldId]);
  if (!info) {
    console.log(`No world info available for ${worldId}, using default center (0,0)`);
    return { x: 0, y: 0 };
  }
  
  // If world has explicit center coordinates, use those
  if (info.center && typeof info.center.x === 'number' && typeof info.center.y === 'number') {
    // Log with world ID and exact values to help debugging
    console.log(`Using explicit center for world ${worldId}: (${info.center.x}, ${info.center.y})`);
    return { 
      x: info.center.x, 
      y: info.center.y 
    };
  }
  
  // For worlds without explicit center, return 0,0
  console.log(`No explicit center for world ${worldId}, using default (0,0)`);
  return { x: 0, y: 0 };
}

// Calculate the next world tick time based on the last actual tick
export function getNextWorldTickTime() {
  const currentWorld = getStore(game).currentWorld;
  const worldInfo = getStore(game).worldInfo[currentWorld] || {};
  
  // Get the world speed and lastTick
  const worldSpeed = worldInfo.speed || 1.0;
  const lastTick = worldInfo.lastTick || Date.now();
  
  const tickIntervalMs = 60000; // 1 minute in milliseconds (world tick interval)
  const adjustedInterval = Math.round(tickIntervalMs / worldSpeed);
  
  // Calculate next tick based on the last recorded tick time
  const now = Date.now();
  const timeSinceLastTick = now - lastTick;
  const ticksElapsed = Math.floor(timeSinceLastTick / adjustedInterval);
  const nextTickTime = lastTick + ((ticksElapsed + 1) * adjustedInterval);
  
  return nextTickTime;
}

// Add a function to calculate when the next tick will likely occur
export function calculateNextTickTime(worldId) {
  const worldInfo = get(game).worldInfo?.[worldId];
  if (!worldInfo) return null;
  
  const worldSpeed = worldInfo.speed || 1.0;
  const lastTick = worldInfo.lastTick || Date.now();
  
  // Base tick interval is 5 minutes (300000ms)
  const baseTickInterval = 300000;
  const adjustedInterval = Math.round(baseTickInterval / worldSpeed);
  
  // Calculate the next tick time
  return lastTick + adjustedInterval;
}

// Helper function to format time remaining until next tick
export function formatTimeUntilNextTick(worldId) {
  const nextTickTime = calculateNextTickTime(worldId);
  if (!nextTickTime) return "Unknown";
  
  const now = Date.now();
  const remaining = nextTickTime - now;
  
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
}
