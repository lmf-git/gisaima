import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { ref, onValue, get as dbGet, set, update } from "firebase/database";
import { db } from '../firebase/firebase.js';
import { user, isAuthReady as userAuthReady } from './user'; 
import { clearSavedTargetPosition } from './map.js'; // Import clearSavedTargetPosition from map.js

// Constants for localStorage
const CURRENT_WORLD_KEY = 'gisaima-current-world'; // Keeping this for backward compatibility with localStorage

// Use the imported auth ready store instead of creating a new one
export { userAuthReady as isAuthReady };

// Add CHUNK_SIZE constant to match the one in tick.mjs
const CHUNK_SIZE = 20;

// Achievement definitions moved to top level constant
const ACHIEVEMENT_DEFINITIONS = {
  'first_steps': {
    title: 'First Steps',
    description: 'Draw your first movement path',
    category: 'explore',
  },
  'world_traveler': {
    title: 'World Traveler',
    description: 'Visit 50 different tiles',
    category: 'explore',
    hidden: true,
  },
  'inspector': {
    title: 'Inspector',
    description: 'Inspect your first structure',
    category: 'explore',
  },
  'mobilised': {
    title: 'Leader',
    description: 'Mobilize your first group',
    category: 'explore',
  },
  'strategist': {
    title: 'Strategist',
    description: 'Move a group to another location',
    category: 'explore',
  },
  'demobilizer': {
    title: 'Demobilizer',
    description: 'Demobilize a group at a structure',
    category: 'explore',
  },
  'first_attack': {
    title: 'First Blood',
    description: 'Start your first attack',
    category: 'combat',
  },
  'first_battle': {
    title: 'Battle Hardened',
    description: 'Win your first battle',
    category: 'combat',
  },
  'battle_joiner': {
    title: 'Opportunist',
    description: 'Join an in-progress battle',
    category: 'combat',
  },
  'survivor': {
    title: 'Survivor',
    description: 'Survive 5 battles',
    category: 'combat',
    hidden: true,
  },
  'first_gather': {
    title: 'Gatherer',
    description: 'Gather resources for the first time',
    category: 'items',
  },
  'treasure_finder': {
    title: 'Treasure Finder',
    description: 'Find a rare resource',
    category: 'items',
    hidden: true,
  },
  'army_builder': {
    title: 'Army Builder',
    description: 'Create 5 groups simultaneously',
    category: 'social',
    hidden: true,
  },
  'first_message': {
    title: 'Communicator',
    description: 'Send your first chat message',
    category: 'social',
  },
};

// Make the achievement definitions available to other modules
export { ACHIEVEMENT_DEFINITIONS };

// Store for recent achievement unlocks
export const recentUnlock = writable(null);

// Store for game state with more detailed loading states
export const game = writable({
  worldKey: null,
  joinedWorlds: [],
  worlds: {},
  player: null,
  loading: true,
  worldLoading: false,
  error: null,
  initialized: false
});

// Create a derived store for the current world's info
export const currentWorldInfo = derived(
  game,
  $game => {
    if (!$game || !$game.worldKey) return null;
    return $game.worlds[$game.worldKey] || null;
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
    const worldId = $game.worldKey;
    if (!worldId) return { x: 0, y: 0 };
    
    // Default center
    return { x: 0, y: 0 };
  }
);

// Create a derived store that combines user data with player world-specific data
export const currentPlayer = derived(
  [user, game], // Use user directly instead of the redundant user variable
  ([$user, $game]) => {
    // Early returns for missing data
    if (!$user) return null;
    if (!$game) return null;
    if (!$game.worldKey) return null;
    if (!$game.player) return null;
    
    return {
      id: $user.uid,
      ...$game.player
    };
  }
);

// New writable store for current world info from database
export const worldInfo = writable({
  loading: false,
  name: null,
  description: null,
  seed: null,
  lastTick: null,
  speed: 1,
  size: null,
  center: { x: 0, y: 0 },
  spawns: {}
});

// Create a derived store for the next world tick time
export const nextWorldTick = derived(
  worldInfo,
  ($worldInfo) => {
    if (!$worldInfo || !$worldInfo.lastTick) {
      return null;
    }
    
    const worldSpeed = $worldInfo.speed || 1.0;
    const lastTick = $worldInfo.lastTick || Date.now();
    
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

// Track active subscriptions
let activeJoinedWorldsSubscription = null;
let activePlayerWorldDataSubscription = null;
let activeWorldInfoSubscription = null;

// Keep track of pending requests to avoid duplicates
const pendingWorldInfoRequests = new Map();

// Load player's joined worlds
export function loadJoinedWorlds(userId) {
  if (!userId) {
    return Promise.resolve([]);
  }
  
  // Clean up existing subscription to prevent multiple listeners
  if (activeJoinedWorldsSubscription) {
    activeJoinedWorldsSubscription();
    activeJoinedWorldsSubscription = null;
  }
  
  console.log(`⭐ Setting up listener for joined worlds: players/${userId}/worlds`);
  
  return new Promise((resolve) => {
    const userWorldsRef = ref(db, `players/${userId}/worlds`);
    
    activeJoinedWorldsSubscription = onValue(userWorldsRef, (snapshot) => {
      console.log('🌍 User joined worlds snapshot received:', snapshot.exists() ? `Found ${Object.keys(snapshot.val()).length} worlds` : 'No worlds joined');
      
      if (snapshot.exists()) {
        const joinedWorlds = Object.keys(snapshot.val());
        console.log('🌍 User joined worlds:', joinedWorlds);
        
        game.update(state => ({ ...state, joinedWorlds, loading: false }));
        
        // If we have a worldKey but no info for it, load it
        const currentState = get(game);
        if (currentState.worldKey && !currentState.worlds[currentState.worldKey]) {
          getWorldInfo(currentState.worldKey)
            .then(() => resolve(true))
            .catch(err => {
              console.error('Error loading current world info:', err);
              resolve(false);
            });
        } else {
          resolve(true);
        }
        
      } else {
        console.log('🌍 No joined worlds found for user');
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

// Add a function to set up a listener for player data in a specific world
export function listenToPlayerWorldData(userId, worldKey) {
  if (!userId || !worldKey) {
    console.log('Cannot listen to player world data: Missing userId or worldKey');
    return null;
  }
  
  // Clean up existing subscription to prevent multiple listeners
  if (activePlayerWorldDataSubscription) {
    console.log('Clearing previous player world data subscription');
    activePlayerWorldDataSubscription();
    activePlayerWorldDataSubscription = null;
  }
  
  console.log(`👤 Setting up listener for player world data: players/${userId}/worlds/${worldKey}`);
  
  const playerWorldRef = ref(db, `players/${userId}/worlds/${worldKey}`);
  activePlayerWorldDataSubscription = onValue(playerWorldRef, snapshot => {
    const data = snapshot.val();
    console.log(`👤 Player data for world [${worldKey}]:`, data);
    
    if (snapshot.exists()) {
      game.update(state => ({
        ...state,
        player: data
      }));
    } else {
      console.log(`No player data found for world ${worldKey}`);
      game.update(state => ({
        ...state,
        player: null
      }));
    }
  }, error => {
    console.error(`Error getting player data for world ${worldKey}:`, error);
  });
  
  return activePlayerWorldDataSubscription;
}

// Function to subscribe to world info updates
export function subscribeToWorldInfo(worldId) {
  // Clean up existing subscription
  if (activeWorldInfoSubscription) {
    activeWorldInfoSubscription();
    activeWorldInfoSubscription = null;
  }
  
  // Return early if no worldId
  if (!worldId) {
    worldInfo.set({
      loading: false,
      name: null,
      description: null,
      seed: null,
      lastTick: null,
      speed: 1,
      size: null,
      center: { x: 0, y: 0 },
      spawns: {}
    });
    return null;
  }
  
  // Set loading state
  worldInfo.update(state => ({ ...state, loading: true }));
  
  console.log(`🌎 Setting up listener for world info: worlds/${worldId}/info`);
  
  // Create reference to the world info node
  const worldInfoRef = ref(db, `worlds/${worldId}/info`);
  
  // Subscribe to changes
  activeWorldInfoSubscription = onValue(worldInfoRef, snapshot => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      console.log(`🌎 World info updated for [${worldId}]:`, data);
      
      // Update the store with the data
      worldInfo.set({
        ...data,
        loading: false
      });
    } else {
      console.log(`No world info found for world ${worldId}`);
      worldInfo.update(state => ({
        ...state,
        loading: false
      }));
    }
  }, error => {
    console.error(`Error getting world info for ${worldId}:`, error);
    worldInfo.update(state => ({
      ...state,
      loading: false,
      error: error.message
    }));
  });
  
  return activeWorldInfoSubscription;
}

// Enhanced set current world with addition of worldInfo subscription
export function setCurrentWorld(worldId, world = null, callback = null) {
  // Validate the world ID directly
  if (!worldId) {
    if (callback) callback(null);
    return Promise.resolve(null);
  }
  
  // Handle case where worldId is an object
  if (typeof worldId === 'object') {
    console.error('Invalid worldId object received in game store:', worldId);
    if (callback) callback(null);
    return Promise.resolve(null);
  }
  
  const validWorldId = String(worldId);
  
  // Save to localStorage if in browser
  if (browser) {
    localStorage.setItem(CURRENT_WORLD_KEY, validWorldId);
  }

  // Clear any saved target position when changing worlds
  if (browser && validWorldId) {
    clearSavedTargetPosition(validWorldId);
  }
  
  // Update the store with the new world ID
  game.update(state => ({
    ...state,
    worldKey: validWorldId
  }));
  
  // Subscribe to world info for this world
  subscribeToWorldInfo(validWorldId);
  
  // Set up a listener for player data in this world
  const currentUser = get(user);  // Change from 'const user = get(user)' to avoid variable shadowing
  if (currentUser?.uid) {
    listenToPlayerWorldData(currentUser.uid, validWorldId);
  }

  // If we don't have the world info, load it
  const currentState = get(game);
  const promises = [];
  
  // Check store before fetching, remove cache check
  const worldToUse = world || currentState.worlds[validWorldId];
  
  if (!worldToUse) {
    promises.push(getWorldInfo(validWorldId)
      .then(info => {
        return info;
      })
    );
  }
  
  if (promises.length > 0) {
    return Promise.all(promises).then(() => {
      // All data loaded, invoke callback if provided
      if (callback) callback(worldToUse);
      return worldToUse;
    });
  }
  
  // If no promises were needed, invoke callback immediately
  if (callback) callback(worldToUse);
  return Promise.resolve(worldToUse);
}

// Improved getWorldInfo function with better validation
export function getWorldInfo(worldId) {
  // Validate the world ID directly
  if (!worldId) {
    return Promise.resolve(null);
  }
  
  // Handle case where worldId is an object
  if (typeof worldId === 'object') {
    console.error('Invalid worldId object received in game store:', worldId);
    return Promise.resolve(null);
  }
  
  const validWorldId = String(worldId);
  
  // Check for pending request for this world to avoid duplicates
  if (pendingWorldInfoRequests.has(validWorldId)) {
    return pendingWorldInfoRequests.get(validWorldId);
  }
  
  // Set loading state
  game.update(state => ({ 
    ...state, 
    worldLoading: true,
    error: null
  }));
  
  // Directly fetch from the database
  const worldRef = ref(db, `worlds/${validWorldId}/info`);
  
  // Create a promise for this request and store it
  const fetchPromise = dbGet(worldRef)
    .then(snapshot => {
      let worldInfo = null;
      
      if (snapshot.exists()) {
        worldInfo = snapshot.val();
        
        // Enrich with spawn data - standardize format
        const spawns = getWorldSpawnPoints(validWorldId, worldInfo);
        if (spawns.length > 0) {
          worldInfo.spawns = spawns.reduce((acc, spawn) => {
            const key = spawn.position ? 
              `${spawn.position.chunkX || 0}:${spawn.position.chunkY || 0}:${spawn.position.x || 0}:${spawn.position.y || 0}` : 
              `spawn_${spawn.id || Math.random().toString(36).substr(2, 9)}`;
            acc[key] = spawn;
            return acc;
          }, {});
        }
        
        // Update the game store with world info
        game.update(state => ({
          ...state,
          worldLoading: false,
          error: null,
          worlds: {
            ...state.worlds,
            [validWorldId]: worldInfo
          }
        }));
        
      } else {
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
  
  const currentGameState = get(game);
  const world = currentGameState.worlds?.[worldId];
  
  if (!world) {
    return [];
  }
  
  // Primary location: world.info.spawns (as in backup.json)
  if (world.info?.spawns) {
    const spawns = Object.entries(world.info.spawns).map(([key, spawn]) => {
      // If spawn doesn't have position data, try to parse from key
      if (!spawn.position) {
        // Parse from key format "chunkX:chunkY:tileX:tileY"
        const parts = key.split(':').map(Number);
        if (parts.length === 4) {
          const [chunkX, chunkY, tileX, tileY] = parts;
          // Calculate global coordinates (chunkX * CHUNK_SIZE + tileX)
          const globalX = (chunkX * CHUNK_SIZE) + tileX;
          const globalY = (chunkY * CHUNK_SIZE) + tileY;
          
          return {
            ...spawn,
            id: spawn.id || key,
            key,
            // Store the original chunk coordinates
            position: {
              chunkX,
              chunkY,
              x: tileX,
              y: tileY
            },
            // Add calculated global coordinates for easier use
            x: globalX,
            y: globalY
          };
        }
      }
      return { ...spawn, id: spawn.id || key, key };
    });
    
    return spawns;
  }
  
  // Legacy location: world.spawns
  if (world.spawns) {
    const spawns = Object.values(world.spawns);
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
        return spawnsFromChunks;
      }
    } catch (e) {
      console.error('Error searching for spawns in chunks:', e);
    }
  }
  
  return [];
}

// Function to get world center coordinates - improved with better validation
export function getWorldCenterCoordinates(worldId, world = null) {
  // Validate the world ID directly
  if (!worldId) {
    return { x: 0, y: 0 };
  }
  
  // Handle case where worldId is an object
  if (typeof worldId === 'object') {
    console.error('Invalid worldId object received in game store:', worldId);
    return { x: 0, y: 0 };
  }
  
  const validWorldId = String(worldId);
  
  // Use provided world or try to get from store
  const info = world || (get(game).worlds?.[validWorldId]);
  if (!info) {
    return { x: 0, y: 0 };
  }
  
  // If world has explicit center coordinates, use those
  if (info.center && typeof info.center.x === 'number' && typeof info.center.y === 'number') {
    return { 
      x: info.center.x, 
      y: info.center.y 
    };
  }
  
  // For worlds without explicit center, return 0,0
  return { x: 0, y: 0 };
}

// Add a function to calculate when the next tick will likely occur
export function calculateNextTickTime(worldId) {
  const world = get(game).worlds?.[worldId];
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

// Simplified setup function - no need to track initialization or return cleanup
let initialized = false;

export function setup() {
  // Skip if not in browser or already initialized
  if (!browser || initialized) {
    return Promise.resolve();
  }
  
  initialized = true;
  
  return new Promise((resolve) => {
    try {
      // Initialize with safe defaults
      game.update(state => ({
        ...state,
        loading: true,
        error: null,
        initialized: false
      }));
      
      // Subscribe to auth ready state changes
      userAuthReady.subscribe(isReady => {
        if (isReady) {
          console.log('Auth is ready, initializing game data');
          
          // Get current user
          const currentUser = get(user);
          
          if (currentUser?.uid) {
            console.log(`User authenticated: ${currentUser.uid}`);
            
            // Set up listener for all player's joined worlds (account-level)
            loadJoinedWorlds(currentUser.uid);
            
            // Load saved world ID from localStorage
            if (browser) {
              try {
                const savedWorldId = localStorage.getItem(CURRENT_WORLD_KEY);
                console.log('🌎 World key from localStorage:', savedWorldId);
                if (savedWorldId) {
                  // Update store with saved world ID
                  game.update(state => ({
                    ...state,
                    worldKey: savedWorldId
                  }));
                  
                  // Set up listener for player data in this world
                  listenToPlayerWorldData(currentUser.uid, savedWorldId);
                }
              } catch (e) {
                console.warn('Failed to read saved world from localStorage:', e);
              }
            }
          } else {
            console.log('No authenticated user yet');
          }
          
          // Mark initialization as complete
          game.update(state => ({
            ...state,
            loading: false,
            initialized: true
          }));
          
          resolve();
        }
      });
      
      // Add a listener for user changes to handle login/logout
      user.subscribe(newUser => {
        if (initialized) {
          if (newUser?.uid) {
            // User logged in - set up world listeners
            const currentState = get(game);
            
            // Set up listener for joined worlds if not already active
            if (!activeJoinedWorldsSubscription) {
              loadJoinedWorlds(newUser.uid);
            }
            
            // Set up listener for current world if one is selected and no listener is active
            if (currentState.worldKey && !activePlayerWorldDataSubscription) {
              listenToPlayerWorldData(newUser.uid, currentState.worldKey);
            }
          } else {
            // User logged out - clean up listeners
            if (activeJoinedWorldsSubscription) {
              activeJoinedWorldsSubscription();
              activeJoinedWorldsSubscription = null;
            }
            if (activePlayerWorldDataSubscription) {
              activePlayerWorldDataSubscription();
              activePlayerWorldDataSubscription = null;
            }
            if (activeWorldInfoSubscription) {
              activeWorldInfoSubscription();
              activeWorldInfoSubscription = null;
            }
            
            // Clear player data
            game.update(state => ({
              ...state,
              player: null,
              joinedWorlds: []
            }));
          }
        }
      });
    } catch (err) {
      console.error('Game store initialization failed:', err);
      game.update(state => ({
        ...state,
        loading: false,
        error: err.message || 'Initialization failed',
        initialized: false
      }));
      
      resolve();
    }
  });
}

// Add a function to check if player data is ready for a specific world
export function isPlayerWorldDataReady(worldId) {
  const state = get(game);
  return !!(
    state.player && 
    state.worldKey === worldId && 
    !state.loading && 
    !state.worldLoading
  );
}

// Function to save a player achievement for a specific world
export async function savePlayerAchievement(worldId, achievementId, value = true) {
  if (!browser || !worldId || !achievementId) {
    return Promise.reject(new Error('Missing required parameters'));
  }
  
  const currentUser = get(user);
  if (!currentUser?.uid) {
    return Promise.reject(new Error('User not authenticated'));
  }
  
  try {
    // Reference to this achievement
    const achievementRef = ref(db, `players/${currentUser.uid}/worlds/${worldId}/achievements/${achievementId}`);
    
    // Check if achievement is already unlocked
    const snapshot = await dbGet(achievementRef);
    const alreadyUnlocked = snapshot.exists() && snapshot.val() === true;
    
    // Save achievement with value (typically true)
    await set(achievementRef, value);
    
    // Also save the timestamp when this achievement was unlocked
    if (value === true) {
      const achievementDateRef = ref(db, `players/${currentUser.uid}/worlds/${worldId}/achievements/${achievementId}_date`);
      await set(achievementDateRef, Date.now());
      
      // Only update recentUnlock if this is a new achievement
      if (!alreadyUnlocked) {
        // Use the top-level ACHIEVEMENT_DEFINITIONS constant
        const achievementInfo = ACHIEVEMENT_DEFINITIONS[achievementId] || { 
          title: achievementId, 
          description: 'Achievement unlocked!' 
        };
        
        recentUnlock.set({
          id: achievementId,
          ...achievementInfo,
          date: Date.now()
        });
        
        // Auto-clear recentUnlock after some time
        setTimeout(() => {
          recentUnlock.update(current => {
            if (current?.id === achievementId) {
              return null;
            }
            return current;
          });
        }, 8000);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error saving achievement:', error);
    return Promise.reject(error);
  }
}

// Function to check if player has a specific achievement
export function hasAchievement(worldId, achievementId) {
  if (!browser || !worldId || !achievementId) {
    return false;
  }
  
  const state = get(game);
  if (!state.player?.achievements) {
    return false;
  }
  
  return state.player.achievements[achievementId] === true;
}

// Add cleanup function for active subscriptions
export function cleanup() {
  if (activeJoinedWorldsSubscription) {
    activeJoinedWorldsSubscription();
    activeJoinedWorldsSubscription = null;
  }

  if (activePlayerWorldDataSubscription) {
    activePlayerWorldDataSubscription();
    activePlayerWorldDataSubscription = null;
  }

  if (activeWorldInfoSubscription) {
    activeWorldInfoSubscription();
    activeWorldInfoSubscription = null;
  }
}
