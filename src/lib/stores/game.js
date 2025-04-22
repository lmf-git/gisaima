import { writable, derived, get as getStore, get } from 'svelte/store';
import { browser } from '$app/environment';
import { ref, onValue, get as dbGet, set, update } from "firebase/database";
import { db } from '../firebase/database.js';
import { userStore, isAuthReady as userAuthReady } from './user'; 

// Constants for localStorage
const CURRENT_WORLD_KEY = 'gisaima-current-world';

// New constants for controlling debug output
const DEBUG_MODE = false; // Set to true to enable verbose logging
const debugLog = (...args) => DEBUG_MODE && console.log(...args);

// Use the imported auth ready store instead of creating a new one
export { userAuthReady as isAuthReady };

// Store for game state with more detailed loading states
export const game = writable({
  currentWorld: null,
  joinedWorlds: [],
  world: {},
  playerData: null, // Renamed from playerWorldData
  loading: true,
  worldLoading: false,
  error: null,
  initialized: false // Add new flag to track initialization status
});

// Create a derived store for the current world's info
export const currentWorldInfo = derived(
  game,
  $game => {
    if (!$game || !$game.currentWorld) return null;
    return $game.world[$game.currentWorld] || null;
  }
);

// Create a derived store for the current world's seed
export const currentWorldSeed = derived(
  currentWorldInfo,
  $world => {
    if (!$world) return null;
    return $world.seed || null;
  }
);

// Create a derived store for the current world's center coordinates
export const currentWorldCenter = derived(
  [game, currentWorldInfo],
  ([$game, $world]) => {
    if (!$world) return { x: 0, y: 0 };
    
    // Use center coordinates if explicitly defined
    if ($world.center && typeof $world.center.x === 'number' && typeof $world.center.y === 'number') {
      return { x: $world.center.x, y: $world.center.y };
    }
    
    // Otherwise check if we have spawn information in the world data
    const worldId = $game.currentWorld;
    if (!worldId) return { x: 0, y: 0 };
    
    // Default center
    return { x: 0, y: 0 };
  }
);

// Create a derived store for available spawn points in the current world
export const worldSpawnPoints = derived(
  currentWorldInfo,
  $world => {
    if (!$world) return [];
    
    // If world has spawns in info.spawns (as seen in backup.json)
    if ($world.info?.spawns) {
      const spawns = Object.values($world.info.spawns);
      debugLog(`Found ${spawns.length} spawn points in world.info.spawns`);
      return spawns;
    }
    
    // Legacy support for old spawn structure
    if ($world.spawns) {
      debugLog('Using legacy spawns structure');
      return Object.values($world.spawns);
    }
    
    // Extended search for spawns in other locations
    if ($world.chunks) {
      // Try to find spawns in chunks (as structures with type=spawn)
      const spawnsFromChunks = [];
      
      try {
        Object.entries($world.chunks).forEach(([chunkKey, chunk]) => {
          if (!chunk) return;
          
          Object.entries(chunk).forEach(([tileKey, tile]) => {
            if (tile?.structure?.type === 'spawn') {
              const [x, y] = tileKey.split(',').map(Number);
              spawnsFromChunks.push({
                ...tile.structure,
                position: { x, y },
                id: tile.structure.id || `spawn_${x}_${y}`
              });
            }
          });
        });
        
        if (spawnsFromChunks.length > 0) {
          debugLog(`Found ${spawnsFromChunks.length} spawn points in world chunks`);
          return spawnsFromChunks;
        }
      } catch (e) {
        console.error('Error searching for spawns in chunks:', e);
      }
    }
    
    debugLog('No spawns found in world data');
    return [];
  }, 
  [] // Return empty array as default
);

// Create a derived store that combines user data with player world-specific data
// Fixed: Use a safer approach for derived stores with proper null checks
export const currentPlayer = derived(
  [userStore, game], // Use userStore directly instead of the redundant user variable
  ([$user, $game]) => {
    // Early returns for missing data
    if (!$user) return null;
    if (!$game) return null;
    if (!$game.currentWorld) return null;
    if (!$game.playerData) return null;
    
    try {
      // Use the stored display name if available, otherwise fall back to auth
      let displayName = $game.playerData.displayName;
      
      // If no stored display name, use fallback logic
      if (!displayName) {
        if ($user.isAnonymous) {
          displayName = `Guest ${$user.uid.substring(0, 4)}`;
        } else {
          displayName = $user.displayName || ($user.email ? $user.email.split('@')[0] : `Player ${$user.uid.substring(0, 4)}`);
        }
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
        worldName: $game.world[$game.currentWorld]?.name,
        // Player status in this world
        alive: $game.playerData.alive || false,
        lastLocation: $game.playerData.lastLocation || null,
        // Race information
        race: $game.playerData.race,
        // Joined timestamp
        joinedAt: $game.playerData.joined || null,
        // For convenience, include all world-specific player data
        worldData: $game.playerData
      };
    } catch (e) {
      console.error("Error in currentPlayer derived store:", e);
      return null;
    }
  }
);

// Fix the needsSpawn store to properly check player alive status with cleaner logic
export const needsSpawn = derived(
  [game, userStore], // Use userStore directly 
  ([$game, $user]) => {
    // Only show spawn menu when all these conditions are met:
    // 1. User is logged in
    // 2. Current world is selected
    // 3. Player has joined this world (playerData exists)
    // 4. Player is not alive in this world
    
    return (
      !!$user?.uid && 
      !!$game.currentWorld && 
      !!$game.playerData && 
      $game.playerData.alive !== true
    );
  }
);

// Create a derived store for the next world tick time
export const nextWorldTick = derived(
  game,
  ($game) => {
    if (!$game.currentWorld || !$game.world[$game.currentWorld]) {
      return null;
    }
    
    const world = $game.world[$game.currentWorld];
    const worldSpeed = world.speed || 1.0;
    const lastTick = world.lastTick || Date.now();
    
    // Base tick interval is 1 minute (60000ms) for 1x speed worlds
    const baseTickInterval = 60000; // 1 minute
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
    
    // Format as minutes only for simplicity
    const minutes = Math.floor(remaining / 60000);
    return `${minutes}m`;
  }
);

// Track active subscriptions for proper cleanup
let activeJoinedWorldsSubscription = null;
let activePlayerWorldDataSubscription = null;

// Keep track of pending requests to avoid duplicates
const pendingWorldInfoRequests = new Map();
// Add cache for world info to reduce redundant fetches
const worldInfoCache = new Map();
const CACHE_TTL = 30000; // 30 seconds cache TTL

// Helper function to validate world IDs
function validateWorldId(worldId) {
  if (!worldId) return null;
  
  // Handle case where worldId is an object
  if (typeof worldId === 'object') {
    console.error('Invalid worldId object received in game store:', worldId);
    return null;
  }
  
  return String(worldId); // Ensure it's a string
}

// Load player's joined worlds
export function loadJoinedWorlds(userId) {
  if (!userId) {
    debugLog('Cannot load joined worlds: No user ID provided');
    return Promise.resolve([]);
  }
  
  // Clean up existing subscription to prevent multiple listeners
  if (activeJoinedWorldsSubscription) {
    debugLog('Clearing previous joined worlds subscription');
    activeJoinedWorldsSubscription();
    activeJoinedWorldsSubscription = null;
  }
  
  debugLog(`Loading joined worlds for user: ${userId}`);
  
  return new Promise((resolve) => {
    const userWorldsRef = ref(db, `players/${userId}/worlds`);
    debugLog('User worlds path:', `players/${userId}/worlds`);
    
    activeJoinedWorldsSubscription = onValue(userWorldsRef, (snapshot) => {
      debugLog('User worlds snapshot received:', snapshot.exists() ? 'Data exists' : 'No data');
      
      if (snapshot.exists()) {
        const joinedWorlds = Object.keys(snapshot.val());
        debugLog('User joined worlds:', joinedWorlds);
        
        game.update(state => ({ ...state, joinedWorlds, loading: false }));
        
        // If we have a currentWorld but no info for it, load it
        const currentState = getStore(game);
        if (currentState.currentWorld && !currentState.world[currentState.currentWorld]) {
          debugLog('Loading info for current world:', currentState.currentWorld);
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
        debugLog('No joined worlds found for user');
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

// Enhanced loadPlayerWorldData to also update the player entity if needed
export function loadPlayerWorldData(userId, worldId) {
  if (!userId || !worldId) {
    debugLog('Cannot load player world data: Missing user ID or world ID');
    return null;
  }

  // Clean up existing subscription to prevent multiple listeners
  if (activePlayerWorldDataSubscription) {
    debugLog('Clearing previous player world data subscription');
    activePlayerWorldDataSubscription();
    activePlayerWorldDataSubscription = null;
  }
  
  debugLog(`Loading player world data for ${userId} in world ${worldId}`);
  
  const playerWorldRef = ref(db, `players/${userId}/worlds/${worldId}`);
  activePlayerWorldDataSubscription = onValue(playerWorldRef, async (snapshot) => {
    if (snapshot.exists()) {
      const playerData = snapshot.val();
      debugLog(`Loaded player world data for ${userId}`);
      
      game.update(state => ({ 
        ...state, 
        playerData
      }));
    
    } else {
      game.update(state => ({ ...state, playerData: null }));
    }
  });
  
  return activePlayerWorldDataSubscription;
}

// Function to load the current world's info automatically with caching
function loadCurrentWorldInfo(worldId) {
  if (!worldId) {
    debugLog('Cannot load current world info: No world ID provided');
    return Promise.resolve(null);
  }
  
  // Set loading state
  game.update(state => ({ ...state, worldLoading: true, error: null }));
  
  return getWorldInfo(worldId)
    .then(world => {
      // Success - world is already set in the store by getWorldInfo
      game.update(state => ({ ...state, worldLoading: false }));
      return world;
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
  debugLog(`Map module not yet loaded. Will initialize world ${worldId} later.`);
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
export function setCurrentWorld(worldId, world = null) {
  // Validate the world ID
  const validWorldId = validateWorldId(worldId);
  
  if (!validWorldId) {
    debugLog('Cannot set current world: No valid world ID provided');
    return Promise.resolve(null);
  }
  
  debugLog(`Setting current world to: ${validWorldId}`);
  
  // Save to localStorage if in browser
  if (browser) {
    debugLog(`Saved world ${validWorldId} to localStorage`);
    localStorage.setItem(CURRENT_WORLD_KEY, validWorldId);
  }
  
  // Update the store with the new world ID
  game.update(state => ({
    ...state,
    currentWorld: validWorldId
  }));
  
  // If we don't have the world info, load it
  const currentState = getStore(game);
  const promises = [];
  
  // Check both cache and store before fetching
  const cachedWorld = worldInfoCache.get(validWorldId);
  if (!world && !currentState.world[validWorldId] && !cachedWorld) {
    debugLog(`Loading info for current world: ${validWorldId}`);
    promises.push(getWorldInfo(validWorldId));
  } else if (cachedWorld && !currentState.world[validWorldId]) {
    // Use cached world info if available but not in store
    debugLog(`Using cached world info for ${validWorldId}`);
    game.update(state => ({
      ...state,
      world: {
        ...state.world,
        [validWorldId]: cachedWorld
      }
    }));
  }
  
  // Also load player data if user is authenticated
  const currentUser = getStore(userStore);
  if (currentUser?.uid) {
    promises.push(loadPlayerWorldData(currentUser.uid, validWorldId));
  }
  
  if (promises.length > 0) {
    return Promise.all(promises).then(() => {
      return currentState.world[validWorldId] || cachedWorld;
    });
  }
  
  return Promise.resolve(world || currentState.world[validWorldId] || cachedWorld);
}

// Improved getWorldInfo function with better validation
export function getWorldInfo(worldId) {
  // Validate the world ID
  const validWorldId = validateWorldId(worldId);
  
  if (!validWorldId) {
    debugLog('Cannot get world info: No valid world ID provided');
    return Promise.resolve(null);
  }
  
  debugLog(`Getting world info for: ${validWorldId}`);
  
  // Check cache first
  const now = Date.now();
  const cachedInfo = worldInfoCache.get(validWorldId);
  if (cachedInfo && cachedInfo._timestamp && (now - cachedInfo._timestamp < CACHE_TTL)) {
    debugLog(`Using cached world info for ${validWorldId} (age: ${now - cachedInfo._timestamp}ms)`);
    return Promise.resolve(cachedInfo);
  }
  
  // Check for pending request for this world to avoid duplicates
  if (pendingWorldInfoRequests.has(validWorldId)) {
    debugLog(`Using pending request for world ${validWorldId}`);
    return pendingWorldInfoRequests.get(validWorldId);
  }
  
  // Set loading state
  game.update(state => ({ 
    ...state, 
    worldLoading: true,
    error: null
  }));
  
  // Directly fetch from the database
  debugLog(`Fetching world info from database for ${validWorldId}`);
  const worldRef = ref(db, `worlds/${validWorldId}/info`);
  
  // Create a promise for this request and store it
  const fetchPromise = dbGet(worldRef)
    .then(snapshot => {
      let worldInfo = null;
      
      if (snapshot.exists()) {
        debugLog(`World info snapshot for ${validWorldId}: Data exists`);
        worldInfo = snapshot.val();
        
        // Enrich with spawn data - standardize format
        const spawns = getWorldSpawnPoints(validWorldId, worldInfo);
        if (spawns.length > 0) {
          debugLog(`World ${validWorldId} has ${spawns.length} spawn points (format: chunk-based)`);
          worldInfo.spawns = spawns.reduce((acc, spawn) => {
            const key = spawn.position ? 
              `${spawn.position.chunkX || 0}:${spawn.position.chunkY || 0}:${spawn.position.x || 0}:${spawn.position.y || 0}` : 
              `spawn_${spawn.id || Math.random().toString(36).substr(2, 9)}`;
            acc[key] = spawn;
            return acc;
          }, {});
        }
        
        // Add timestamp for cache validation
        worldInfo._timestamp = Date.now();
        
        // Cache the world info
        worldInfoCache.set(validWorldId, worldInfo);
        
        // Update the game store with world info
        game.update(state => ({
          ...state,
          worldLoading: false,
          error: null,
          world: {
            ...state.world,
            [validWorldId]: worldInfo
          }
        }));
        
        debugLog(`Successfully loaded world info for ${validWorldId}`);
      } else {
        debugLog(`No world info found for ${validWorldId}`);
        game.update(state => ({
          ...state,
          worldLoading: false,
          error: `World not found: ${validWorldId}`
        }));
      }
      
      return worldInfo;
    })
    .catch(error => {
      const errorMsg = `Failed to load world ${validWorldId}: ${error.message || error}`;
      console.error(errorMsg);
      
      game.update(state => ({
        ...state,
        worldLoading: false,
        error: errorMsg
      }));
      
      return null;
    })
    .finally(() => {
      pendingWorldInfoRequests.delete(validWorldId);
    });
  
  // Store the promise for deduplication
  pendingWorldInfoRequests.set(validWorldId, fetchPromise);
  
  return fetchPromise;
}

// Function to get spawn points for a specific world
export function getWorldSpawnPoints(worldId) {
  if (!worldId) return [];
  
  const currentGameState = getStore(game);
  const world = currentGameState.world?.[worldId];
  
  if (!world) {
    debugLog(`No world data available for ${worldId} to get spawn points`);
    return [];
  }
  
  // DEBUG: Log detailed info about available world structure
  debugLog(`[DEBUG] Looking for spawn points in world ${worldId}:`, {
    worldDataAvailable: !!world,
    worldInfoAvailable: !!world.info,
    spawnsInInfoAvailable: !!(world.info?.spawns),
    legacySpawnsAvailable: !!world.spawns,
    worldInfoKeys: world.info ? Object.keys(world.info) : [],
    worldKeys: Object.keys(world)
  });
  
  // Primary location: world.info.spawns (as in backup.json)
  if (world.info?.spawns) {
    const spawns = Object.values(world.info.spawns);
    debugLog(`[DEBUG] Found ${spawns.length} spawn points in world.info.spawns:`, spawns);
    return spawns;
  }
  
  // Legacy location: world.spawns
  if (world.spawns) {
    const spawns = Object.values(world.spawns);
    debugLog(`[DEBUG] Found ${spawns.length} spawn points in world.spawns:`, spawns);
    return spawns;
  }
  
  // Extended search: look in chunks
  if (world.chunks) {
    const spawnsFromChunks = [];
    
    try {
      Object.entries(world.chunks).forEach(([chunkKey, chunk]) => {
        if (!chunk) return;
        
        Object.entries(chunk).forEach(([tileKey, tile]) => {
          if (tile?.structure?.type === 'spawn') {
            const [x, y] = tileKey.split(',').map(Number);
            spawnsFromChunks.push({
              ...tile.structure,
              position: { x, y },
              id: tile.structure.id || `spawn_${x}_${y}`
            });
          }
        });
      });
      
      if (spawnsFromChunks.length > 0) {
        debugLog(`[DEBUG] Found ${spawnsFromChunks.length} spawn points in chunks:`, spawnsFromChunks);
        return spawnsFromChunks;
      }
    } catch (e) {
      console.error('Error searching for spawns in chunks:', e);
    }
  }
  
  debugLog(`[DEBUG] No spawn points defined for world ${worldId}`);
  return [];
}

// Simplify this function - it now just gets world info directly
export async function refreshWorldInfo(worldId) {
  if (!worldId) return null;
  
  debugLog(`Getting fresh world info for ${worldId}`);
  
  try {
    // First try to get the info normally
    const worldInfo = await getWorldInfo(worldId);
    
    // If we didn't get spawns, try to get them separately
    if (worldInfo && !worldInfo.spawns && !worldInfo.info?.spawns) {
      debugLog(`No spawns found, trying direct fetch for spawns`);
      
      // Try to get spawns directly
      const worldSpawnsRef = ref(db, `worlds/${worldId}/info/spawns`);
      const spawnsSnapshot = await dbGet(worldSpawnsRef);
      
      if (spawnsSnapshot.exists()) {
        const spawns = spawnsSnapshot.val();
        debugLog(`Found spawns via direct fetch:`, spawns);
        
        // Update the world info with these spawns
        game.update(state => ({
          ...state,
          world: {
            ...state.world,
            [worldId]: {
              ...state.world[worldId],
              info: {
                ...(state.world[worldId]?.info || {}),
                spawns
              }
            }
          }
        }));
      }
    }
    
    return worldInfo;
  } catch (err) {
    console.error(`Failed to get world info for ${worldId}:`, err);
    return null;
  }
}

// Function to get world center coordinates - improved with better validation
export function getWorldCenterCoordinates(worldId, world = null) {
  // Validate the world ID
  const validWorldId = validateWorldId(worldId);
  
  if (!validWorldId) {
    debugLog('Cannot get world center: No valid world ID provided');
    return { x: 0, y: 0 };
  }
  
  // Use provided world or try to get from store
  const info = world || (getStore(game).world?.[validWorldId]);
  if (!info) {
    debugLog(`No world info available for ${validWorldId}, using default center (0,0)`);
    return { x: 0, y: 0 };
  }
  
  // If world has explicit center coordinates, use those
  if (info.center && typeof info.center.x === 'number' && typeof info.center.y === 'number') {
    // Log with world ID and exact values to help debugging
    debugLog(`Using explicit center for world ${validWorldId}: (${info.center.x}, ${info.center.y})`);
    return { 
      x: info.center.x, 
      y: info.center.y 
    };
  }
  
  // For worlds without explicit center, return 0,0
  debugLog(`No explicit center for world ${validWorldId}, using default (0,0)`);
  return { x: 0, y: 0 };
}

// Add a function to calculate when the next tick will likely occur
export function calculateNextTickTime(worldId) {
  const world = get(game).world?.[worldId];
  if (!world) return null;
  
  const worldSpeed = world.speed || 1.0;
  const lastTick = world.lastTick || Date.now();
  
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

// Initialization state tracking improved
let gameInitializationPromise = null;
let gameStoreInitialized = false;

// Initialize the store on app start - with improved startup handling and deduplication
export function initGameStore() {
  if (!browser) {
    return () => {}; // Return empty cleanup function for SSR
  }
  
  // Return existing initialization promise if it exists
  if (gameInitializationPromise) {
    return () => {
      // Return the existing cleanup function - no need to reinitialize
      console.log('Game store initialization already in progress, reusing');
    };
  }
  
  // Prevent duplicate initialization
  if (gameStoreInitialized) {
    return () => {
      // Return a no-op cleanup function since everything is already initialized
      console.log('Game store already initialized, skipping');
    };
  }
  
  debugLog('Initializing game store');
  gameStoreInitialized = true;
  
  // Create a new initialization promise with proper variable initialization
  let unsubscribeUser = null;
  let unsubscribeWorlds = null;
  let authReadyUnsubscribe = null;
  
  // Define cleanup function outside promise to ensure it's always available
  const cleanup = () => {
    if (typeof unsubscribeUser === 'function') unsubscribeUser();
    if (typeof unsubscribeWorlds === 'function') unsubscribeWorlds();
    if (typeof authReadyUnsubscribe === 'function') authReadyUnsubscribe();
    gameStoreInitialized = false;
    gameInitializationPromise = null;
    console.log('Game store cleanup complete');
  };
  
  // Initialize with safe defaults and proper promise handling
  try {
    // Subscribe to auth ready state changes
    authReadyUnsubscribe = userAuthReady.subscribe(isReady => {
      if (isReady) {
        console.log('Auth is ready, initializing game data');
        
        // Initialize with safe defaults first
        game.update(state => ({
          ...state,
          loading: true,
          error: null,
          initialized: false
        }));
        
        // Load saved world ID from localStorage
        let savedWorldId = null;
        if (browser) {
          try {
            savedWorldId = localStorage.getItem(CURRENT_WORLD_KEY);
            if (savedWorldId) {
              debugLog(`Found saved world: ${savedWorldId}`);
              
              // Update store with saved world ID
              game.update(state => ({
                ...state,
                currentWorld: savedWorldId
              }));
            }
          } catch (e) {
            console.warn('Failed to read saved world from localStorage:', e);
          }
        }
        
        // At this point, we have either a saved world ID or null
        // We can proceed with any other initialization steps safely
        
        // Mark initialization as complete
        game.update(state => ({
          ...state,
          loading: false,
          initialized: true
        }));
      }
    });
    
    // Initialize gameInitializationPromise here if needed for other parts of your code
    gameInitializationPromise = Promise.resolve();
    
  } catch (err) {
    console.error('Game store initialization failed:', err);
    game.update(state => ({
      ...state,
      loading: false,
      error: err.message || 'Initialization failed',
      initialized: false
    }));
    
    // Clean up on error
    cleanup();
  }

  return cleanup;
}

// Function to join a world with race selection
export async function joinWorld(worldId, userId, race, displayName) {
  if (!worldId || !userId) {
    throw new Error('Missing required parameters for joining world');
  }
  
  debugLog(`User ${userId} joining world ${worldId} as ${race} with name "${displayName}"`);
  
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
      alive: false,
      displayName: displayName || '',  // Store the display name
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
    if (!currentState.world[worldId]) {
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
