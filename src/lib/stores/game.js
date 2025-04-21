import { writable, derived, get as getStore, get } from 'svelte/store';
import { browser } from '$app/environment';
import { ref, onValue, get as dbGet, set, update } from "firebase/database";
import { db } from '../firebase/database.js';
import { userStore } from './user.js'; 

// Constants for localStorage
const CURRENT_WORLD_KEY = 'gisaima-current-world';

// Add a store to track auth status
export const isAuthReady = writable(false);

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

// Remove redundant user store redirection - use userStore directly

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
      console.log(`Found ${spawns.length} spawn points in world.info.spawns`);
      return spawns;
    }
    
    // Legacy support for old spawn structure
    if ($world.spawns) {
      console.log('Using legacy spawns structure');
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
          console.log(`Found ${spawnsFromChunks.length} spawn points in world chunks`);
          return spawnsFromChunks;
        }
      } catch (e) {
        console.error('Error searching for spawns in chunks:', e);
      }
    }
    
    console.log('No spawns found in world data');
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
        if (currentState.currentWorld && !currentState.world[currentState.currentWorld]) {
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

// Enhanced loadPlayerWorldData to also update the player entity if needed
export function loadPlayerWorldData(userId, worldId) {
  if (!userId || !worldId) return;
  
  // Clean up existing subscription to prevent multiple listeners
  if (activePlayerWorldDataSubscription) {
    activePlayerWorldDataSubscription();
    activePlayerWorldDataSubscription = null;
  }
  
  console.log(`Loading player world data for ${userId} in world ${worldId}`);
  
  const playerWorldRef = ref(db, `players/${userId}/worlds/${worldId}`);
  activePlayerWorldDataSubscription = onValue(playerWorldRef, async (snapshot) => {
    if (snapshot.exists()) {
      const playerData = snapshot.val();
      console.log(`Loaded player world data for ${userId}`);
      
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

// Function to load the current world's info automatically
function loadCurrentWorldInfo(worldId) {
  if (!worldId) return Promise.resolve(null);
  
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
export function setCurrentWorld(worldId, world = null) {
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
    // If world was passed, store it
    const updatedWorldInfo = { ...state.world };
    if (world) {
      updatedWorldInfo[worldId] = world;
      
      const newState = { 
        ...state, 
        currentWorld: worldId,
        world: updatedWorldInfo,
        worldLoading: false,
        error: null,
        playerData: null // Reset player data when changing worlds
      };
      
      // Initialize map with the new world data
      initMapForWorld(worldId, world);
      
      return newState;
    }
    
    // Otherwise just update the ID - we'll load info in the next step
    return {
      ...state,
      currentWorld: worldId,
      worldLoading: !updatedWorldInfo[worldId], // Only set loading if we don't have the data
      playerData: null // Reset player data when changing worlds
    };
  });
  
  // If we don't have the world info, load it
  const currentState = getStore(game);
  const promises = [];
  
  if (!world && !currentState.world[worldId]) {
    promises.push(loadCurrentWorldInfo(worldId));
  }
  
  // Also load player data if user is authenticated
  const currentUser = getStore(userStore);  // Update to use userStore directly
  if (currentUser?.uid) {
    loadPlayerWorldData(currentUser.uid, worldId);
  }
  
  if (promises.length > 0) {
    return Promise.all(promises).then(() => getStore(game).world[worldId] || null);
  }
  
  return Promise.resolve(world || currentState.world[worldId]);
}

// Simplified getWorldInfo function that always fetches fresh data
export function getWorldInfo(worldId) {
  if (!worldId) return Promise.reject(new Error('Missing worldId'));
  
  console.log(`Getting world info for: ${worldId}`);
  
  // Check for pending request for this world to avoid duplicates
  if (pendingWorldInfoRequests.has(worldId)) {
    return pendingWorldInfoRequests.get(worldId);
  }
  
  // Set loading state
  game.update(state => ({ 
    ...state, 
    worldLoading: true,
    error: null
  }));
  
  // Directly fetch from the database without checking cache
  console.log(`Fetching world info from database for ${worldId}`);
  const worldRef = ref(db, `worlds/${worldId}/info`);
  
  // Create a promise for this request and store it
  const fetchPromise = dbGet(worldRef)
    .then(snapshot => {
      console.log(`World info snapshot for ${worldId}:`, snapshot.exists() ? 'Data exists' : 'No data');
      
      if (snapshot.exists()) {
        const world = snapshot.val();
        
        // Validate seed - it's critical for map generation
        if (world.seed === undefined || world.seed === null) {
          const error = `World ${worldId} has no seed defined`;
          console.error(error);
          
          game.update(state => ({ 
            ...state, 
            worldLoading: false,
            error: error
          }));
          
          throw new Error(error);
        }
        
        // Log spawn information for debugging
        if (world.spawns) {
          const isChunkFormat = Object.keys(world.spawns).some(key => key.includes(':'));
          const spawnCount = Array.isArray(world.spawns) 
            ? world.spawns.length 
            : Object.keys(world.spawns).length;
          
          console.log(`World ${worldId} has ${spawnCount} spawn points (format: ${isChunkFormat ? 'chunk-based' : 'standard'})`);
        }
        
        // Update store with the world info
        game.update(state => ({
          ...state,
          worldLoading: false,
          world: {
            ...state.world,
            [worldId]: world
          }
        }));
        
        // Log the center coordinates for debugging
        if (world.center) {
          console.log(`Loaded world center for ${worldId}: ${JSON.stringify(world.center)}`);
        }
        
        console.log(`Successfully loaded world info for ${worldId}`);
        return world;
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
      // Remove this request from pending
      pendingWorldInfoRequests.delete(worldId);
    });
  
  // Store the promise for deduplication
  pendingWorldInfoRequests.set(worldId, fetchPromise);
  
  return fetchPromise;
}

// Function to get spawn points for a specific world
export function getWorldSpawnPoints(worldId) {
  if (!worldId) return [];
  
  const currentGameState = getStore(game);
  const world = currentGameState.world?.[worldId];
  
  if (!world) {
    console.log(`No world data available for ${worldId} to get spawn points`);
    return [];
  }
  
  // DEBUG: Log detailed info about available world structure
  console.log(`[DEBUG] Looking for spawn points in world ${worldId}:`, {
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
    console.log(`[DEBUG] Found ${spawns.length} spawn points in world.info.spawns:`, spawns);
    return spawns;
  }
  
  // Legacy location: world.spawns
  if (world.spawns) {
    const spawns = Object.values(world.spawns);
    console.log(`[DEBUG] Found ${spawns.length} spawn points in world.spawns:`, spawns);
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
        console.log(`[DEBUG] Found ${spawnsFromChunks.length} spawn points in chunks:`, spawnsFromChunks);
        return spawnsFromChunks;
      }
    } catch (e) {
      console.error('Error searching for spawns in chunks:', e);
    }
  }
  
  console.log(`[DEBUG] No spawn points defined for world ${worldId}`);
  return [];
}

// Simplify this function - it now just gets world info directly
export async function refreshWorldInfo(worldId) {
  if (!worldId) return null;
  
  console.log(`Getting fresh world info for ${worldId}`);
  
  try {
    // First try to get the info normally
    const worldInfo = await getWorldInfo(worldId);
    
    // If we didn't get spawns, try to get them separately
    if (worldInfo && !worldInfo.spawns && !worldInfo.info?.spawns) {
      console.log(`No spawns found, trying direct fetch for spawns`);
      
      // Try to get spawns directly
      const worldSpawnsRef = ref(db, `worlds/${worldId}/info/spawns`);
      const spawnsSnapshot = await dbGet(worldSpawnsRef);
      
      if (spawnsSnapshot.exists()) {
        const spawns = spawnsSnapshot.val();
        console.log(`Found spawns via direct fetch:`, spawns);
        
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

// Function to get world center coordinates - improved with better debugging
export function getWorldCenterCoordinates(worldId, world = null) {
  if (!worldId) return { x: 0, y: 0 };
  
  // Use provided world or try to get from store
  const info = world || (getStore(game).world?.[worldId]);
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
    const unsubscribe = userStore.subscribe($user => {  // Use userStore directly
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
            playerData: null,
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
export async function joinWorld(worldId, userId, race, displayName) {
  if (!worldId || !userId) {
    throw new Error('Missing required parameters for joining world');
  }
  
  console.log(`User ${userId} joining world ${worldId} as ${race} with name "${displayName}"`);
  
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
