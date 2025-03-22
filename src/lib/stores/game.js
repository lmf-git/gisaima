import { writable, derived, get as getStore } from 'svelte/store';
import { browser } from '$app/environment';
import { ref, onValue, get as dbGet, set, runTransaction } from "firebase/database";
import { db } from '../firebase/database.js';
import { user } from './user.js';

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

// Create a derived store that combines user data with player world-specific data
export const currentPlayer = derived(
  [user, game],
  ([$user, $game]) => {
    if (!$user || !$game.currentWorld || !$game.playerWorldData) {
      return null;
    }
    
    // Get appropriate display name based on auth status
    let displayName;
    if ($user.isAnonymous) {
      displayName = `Guest ${$user.uid.substring(0, 4)}`;
    } else {
      displayName = $user.displayName || $user.email?.split('@')[0] || `Player ${$user.uid.substring(0, 4)}`;
    }
    
    // Base player info from user auth data
    const playerInfo = {
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
    
    return playerInfo;
  }
);

// Create a derived store for player's spawn status in the current world
export const needsSpawn = derived(
  currentPlayer,
  $player => !$player || $player.spawned === false
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
      
      // Also load the player data for the current world if it exists
      if (currentState.currentWorld) {
        loadPlayerWorldData(userId, currentState.currentWorld);
      }
    } else {
      game.update(state => ({ ...state, joinedWorlds: [], loading: false }));
    }
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

// Set the current world with info caching and auto-loading
export function setCurrentWorld(worldId, worldInfo = null) {
  if (!worldId) return Promise.resolve(null);
  
  // Update the store with the new world ID
  game.update(state => {
    // If worldInfo was passed, store it
    const updatedWorldInfo = { ...state.worldInfo };
    if (worldInfo) {
      updatedWorldInfo[worldId] = worldInfo;
      
      return { 
        ...state, 
        currentWorld: worldId,
        worldInfo: updatedWorldInfo,
        worldLoading: false,
        error: null,
        playerWorldData: null // Reset player data when changing worlds
      };
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
    
    game.update(state => ({ ...state, worldLoading: false }));
    return Promise.resolve(currentGameState.worldInfo[worldId]);
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
        
        // If there's already a current world, load the player data for it
        const currentState = getStore(game);
        if (currentState.currentWorld) {
          loadPlayerWorldData($user.uid, currentState.currentWorld);
        }
      } else if ($user === null) {
        // User is definitely not logged in (not just undefined/loading)
        isAuthReady.set(true);
        game.update(state => ({ 
          ...state, 
          joinedWorlds: [], 
          playerWorldData: null,
          loading: false,
          worldLoading: false
        }));
      }
    });
    
    return unsubscribe;
  }
}
