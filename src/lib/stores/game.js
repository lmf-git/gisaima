import { writable, derived, get as getStore } from 'svelte/store';
import { browser } from '$app/environment';
import { ref, onValue, get as dbGet, set, runTransaction } from "firebase/database";
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
  error: null
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

// Load player's joined worlds
export function loadJoinedWorlds(userId) {
  if (!userId) {
    console.log('Cannot load joined worlds: no userId provided');
    return;
  }
  
  console.log(`Loading joined worlds for user: ${userId}`);
  
  const userWorldsRef = ref(db, `players/${userId}/worlds`);
  console.log('User worlds path:', `players/${userId}/worlds`);
  
  return onValue(userWorldsRef, (snapshot) => {
    console.log('User worlds snapshot received:', snapshot.exists() ? 'Data exists' : 'No data');
    
    if (snapshot.exists()) {
      const joinedWorlds = Object.keys(snapshot.val());
      console.log('User joined worlds:', joinedWorlds);
      
      game.update(state => ({ ...state, joinedWorlds, loading: false }));
      
      // If we have a currentWorld but no info for it, load it
      const currentState = getStore(game);
      if (currentState.currentWorld && !currentState.worldInfo[currentState.currentWorld]) {
        console.log('Loading info for current world:', currentState.currentWorld);
        loadCurrentWorldInfo(currentState.currentWorld);
      }
      
      // Also load the player data for the current world if it exists
      if (currentState.currentWorld) {
        loadPlayerWorldData(userId, currentState.currentWorld);
      }
    } else {
      console.log('No joined worlds found for user');
      game.update(state => ({ ...state, joinedWorlds: [], loading: false }));
    }
  }, error => {
    console.error('Error loading joined worlds:', error);
    game.update(state => ({ ...state, loading: false, error: error.message }));
  });
}

// Load player-specific data for the current world
export function loadPlayerWorldData(userId, worldId) {
  if (!userId || !worldId) return;
  
  const playerWorldRef = ref(db, `players/${userId}/worlds/${worldId}`);
  return onValue(playerWorldRef, (snapshot) => {
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

// Join a world
export function joinWorld(worldId, userId, race) {
  if (!worldId || !userId) return Promise.reject('Missing worldId or userId');
  
  // Ensure race is stored as lowercase string
  const raceCode = typeof race === 'string' ? race.toLowerCase() : 
                   race?.id ? race.id.toLowerCase() : 'human';
  
  // First check if player has already joined this world to avoid double counting
  const userWorldRef = ref(db, `players/${userId}/worlds/${worldId}`);
  
  return dbGet(userWorldRef).then(snapshot => {
    const alreadyJoined = snapshot.exists();
    
    // Update database to mark player as joined to this world
    return set(userWorldRef, { 
      joined: Date.now(),
      spawned: false,  // Add spawned flag, defaulting to false
      race: raceCode   // Store race as lowercase code
    }).then(() => {
      // Only update the player counter if this is a new join
      if (!alreadyJoined) {
        const worldPlayerCountRef = ref(db, `worlds/${worldId}/info/playerCount`);
        // Use a transaction to safely increment the counter
        return runTransaction(worldPlayerCountRef, (currentCount) => {
          return (currentCount || 0) + 1;
        }).then(() => {
          console.log(`Incremented player count for world ${worldId}`);
          
          // Update local store
          game.update(state => ({
            ...state,
            currentWorld: worldId,
            joinedWorlds: state.joinedWorlds.includes(worldId) ? 
              state.joinedWorlds : 
              [...state.joinedWorlds, worldId]
          }));
          
          // Save to localStorage
          if (browser) {
            localStorage.setItem(CURRENT_WORLD_KEY, worldId);
            console.log(`Saved joined world ${worldId} to localStorage`);
          }
          
          // Also load the player's world data into the store
          loadPlayerWorldData(userId, worldId);
          
          // Load world info if needed, with a refresh to get the updated player count
          return getWorldInfo(worldId, true);
        });
      } else {
        // Player already joined, just update the local store
        game.update(state => ({
          ...state,
          currentWorld: worldId,
          joinedWorlds: state.joinedWorlds.includes(worldId) ? 
            state.joinedWorlds : 
            [...state.joinedWorlds, worldId]
        }));
        
        // Save to localStorage
        if (browser) {
          localStorage.setItem(CURRENT_WORLD_KEY, worldId);
          console.log(`Saved existing world ${worldId} to localStorage`);
        }
        
        // Also load the player's world data into the store
        loadPlayerWorldData(userId, worldId);
        
        // Load world info if needed
        const currentState = getStore(game);
        if (!currentState.worldInfo[worldId]) {
          return loadCurrentWorldInfo(worldId);
        }
        
        return worldId;
      }
    });
  });
}

// Get world information including seed with caching
export function getWorldInfo(worldId, forceRefresh = false) {
  if (!worldId) return Promise.reject(new Error('Missing worldId'));
  
  console.log(`Getting world info for: ${worldId}, force refresh: ${forceRefresh}`);
  
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
    
    console.log(`Using cached world info for ${worldId}`);
    game.update(state => ({ ...state, worldLoading: false }));
    return Promise.resolve(currentGameState.worldInfo[worldId]);
  }
  
  // No valid cache, fetch from database with direct path to ensure we get the seed
  console.log(`Fetching world info from database for ${worldId}`);
  const worldRef = ref(db, `worlds/${worldId}/info`);
  
  return dbGet(worldRef)
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
        
        // Update store with the world info
        game.update(state => ({
          ...state,
          worldLoading: false,
          worldInfo: {
            ...state.worldInfo,
            [worldId]: worldInfo
          }
        }));
        
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
    });
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

// Initialize the store on app start - with improved startup handling
export function initGameStore() {
  if (!browser) return () => {};
  
  console.log('Initializing game store');
  
  try {
    // Set initial loading state
    game.update(state => ({ ...state, loading: true }));
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
        
        // Load world info asynchronously
        loadCurrentWorldInfo(savedWorldId)
          .catch(err => console.error('Error loading saved world info:', err));
      } else {
        console.log('No saved world found in localStorage');
      }
    } catch (e) {
      console.error('Error loading world from localStorage:', e);
    }
    
    // Subscribe to auth changes to load joined worlds
    const unsubscribe = user.subscribe($user => {
      console.log('Auth state changed in game store:', $user ? 'User present' : 'No user');
      try {
        if ($user?.uid) {
          console.log('User authenticated, loading joined worlds for:', $user.uid);
          // Set auth as ready once we have a user
          isAuthReady.set(true);
          loadJoinedWorlds($user.uid);
          
          // If there's already a current world, load the player data for it
          const currentState = getStore(game);
          if (currentState.currentWorld) {
            loadPlayerWorldData($user.uid, currentState.currentWorld);
            loadCurrentWorldInfo(currentState.currentWorld).catch(err => 
              console.error('Error loading current world info:', err)
            );
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
            worldLoading: false
          }));
        }
      } catch (e) {
        console.error('Error in user subscription handler:', e);
        // Make sure auth ready flag is set even if there's an error
        isAuthReady.set(true);
      }
    });
    
    return unsubscribe;
  } catch (e) {
    console.error('Error initializing game store:', e);
    // Set auth ready flag even if initialization fails
    isAuthReady.set(true);
    // Return empty function to prevent errors when calling the unsubscribe
    return () => {};
  }
}
