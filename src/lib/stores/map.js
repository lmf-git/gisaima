import { writable, derived, get } from 'svelte/store';
import { TerrainGenerator } from '../map/noise.js';
import { ref, onValue } from "firebase/database";
import { db } from '../firebase/database.js';
import { replaceState } from '$app/navigation'; // Import from SvelteKit instead of using history directly
// Import getWorldCenterCoordinates function from game store
import { getWorldCenterCoordinates } from './game.js';

// Keep a reference to the terrain generator for grid creation
let terrain;

// Configuration constants
const CHUNK_SIZE = 20;
export const TILE_SIZE = 5;
export const EXPANDED_COLS_FACTOR = 2.6;
export const EXPANDED_ROWS_FACTOR = 2;

// LocalStorage key prefixes for target coordinates
const TARGET_X_PREFIX = '-targetX';
const TARGET_Y_PREFIX = '-targetY';

// Add utility functions for localStorage persistence
function saveTargetToLocalStorage(worldId, x, y) {
  if (typeof window === 'undefined' || !worldId) return;
  
  try {
    localStorage.setItem(`${worldId}${TARGET_X_PREFIX}`, x.toString());
    localStorage.setItem(`${worldId}${TARGET_Y_PREFIX}`, y.toString());
  } catch (err) {
    console.warn('Failed to save target coordinates to localStorage:', err);
  }
}

function loadTargetFromLocalStorage(worldId) {
  if (typeof window === 'undefined' || !worldId) return null;
  
  try {
    const x = localStorage.getItem(`${worldId}${TARGET_X_PREFIX}`);
    const y = localStorage.getItem(`${worldId}${TARGET_Y_PREFIX}`);
    
    if (x !== null && y !== null) {
      const parsedX = parseInt(x, 10);
      const parsedY = parseInt(y, 10);
      
      if (!isNaN(parsedX) && !isNaN(parsedY)) {
        console.log(`Loaded saved position for world ${worldId}: ${parsedX},${parsedY}`);
        return { x: parsedX, y: parsedY };
      }
    }
  } catch (err) {
    console.warn('Failed to load target coordinates from localStorage:', err);
  }
  
  return null;
}

const chunkSubscriptions = new Map();

// Initialize map without accessing game store initially
export const map = writable({
  ready: false,
  initializing: false,
  initializationAttempted: false,
  cols: 0,
  rows: 0,
  target: { x: 0, y: 0 },
  minimap: true, // Controls only UI visibility
  world: 'default',
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragAccumX: 0,
  dragAccumY: 0,
  dragSource: null
});

// New separate store for highlighted coordinates
export const highlightedCoords = writable(null);

export const entities = writable({
  structure: {},
  groups: {},
  players: {},
  items: {}  // Add items to initial state
});

export const ready = derived(map, $map => $map.ready);

// Create a derived store that efficiently tracks target position changes
export const targetPosition = derived(map, ($map) => {
  return { 
    x: $map.target.x, 
    y: $map.target.y 
  };
}, { x: 0, y: 0 });

// Debounce URL updates to prevent performance issues
let urlUpdateTimeout = null;
const URL_UPDATE_DEBOUNCE = 500; // Increase from 300ms to 500ms for better performance

// Flag to track if the URL is being updated by us or externally
let isInternalUrlUpdate = false;
let lastUrlUpdate = { x: null, y: null }; // Track last updated coordinates

// Improved function to update URL with current coordinates
function updateUrlWithCoordinates(x, y) {
  if (typeof window === 'undefined') return;
  
  // Skip if coordinates match the last ones we updated (prevent redundancy)
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  if (lastUrlUpdate.x === roundedX && lastUrlUpdate.y === roundedY) {
    return;
  }
  
  // Cancel any pending updates
  if (urlUpdateTimeout) {
    clearTimeout(urlUpdateTimeout);
  }
  
  // Debounce URL updates to prevent performance issues
  urlUpdateTimeout = setTimeout(() => {
    try {
      // Mark this as an internal update
      isInternalUrlUpdate = true;
      
      // Create updated URL
      const url = new URL(window.location);
      url.searchParams.set('x', roundedX.toString());
      url.searchParams.set('y', roundedY.toString());
      
      // Store the coordinates we're updating to
      lastUrlUpdate = { x: roundedX, y: roundedY };
      
      // Use SvelteKit's replaceState instead of history.replaceState
      replaceState(url, {});
      
      // Reset flag after a short delay to allow for popstate event to be processed
      setTimeout(() => {
        isInternalUrlUpdate = false;
      }, 50);
    } catch (err) {
      console.error('Error updating URL:', err);
      isInternalUrlUpdate = false;
    }
    urlUpdateTimeout = null;
  }, URL_UPDATE_DEBOUNCE);
}

// Export function to check if URL update is internal
export function isInternalUrlChange() {
  return isInternalUrlUpdate;
}

// Simplified function to process chunk data with proper update sequencing
function processChunkData(data = {}, chunkKey) {
  // Structure for batch entity updates
  const updates = {
    structure: {},
    groups: {},
    players: {},
    items: {}
  };
  
  // Set of all valid entity keys in this chunk update
  const validGroupKeys = new Set();
  const validPlayerKeys = new Set();
  const validItemKeys = new Set();
  
  let entitiesChanged = false;
  
  // Skip lastUpdated metadata field
  Object.entries(data).forEach(([tileKey, tileData]) => {
    if (tileKey === 'lastUpdated') return;
    
    const [x, y] = tileKey.split(',').map(Number);
    const fullTileKey = `${x},${y}`;
    
    // Process structure - prioritize these
    if (tileData.structure) {
      updates.structure[fullTileKey] = { ...tileData.structure, x, y };
      entitiesChanged = true;
    }
    
    // Process player groups (multiple per tile)
    if (tileData.players) {
      updates.players[fullTileKey] = Object.entries(tileData.players)
        .map(([id, data]) => ({ 
          ...data, 
          id: data.uid || id,  // Prioritize existing uid if available
          x, y 
        }));
      validPlayerKeys.add(fullTileKey);
      entitiesChanged = true;
    } else {
      // Explicitly mark as empty if no players
      updates.players[fullTileKey] = [];
    }
    
    // Process unit groups (multiple per tile)
    if (tileData.groups) {
      updates.groups[fullTileKey] = Object.entries(tileData.groups)
        .map(([id, data]) => ({ ...data, id, x, y }));
      validGroupKeys.add(fullTileKey);
      entitiesChanged = true;
    } else {
      // Explicitly mark as empty if no groups
      updates.groups[fullTileKey] = [];
    }
    
    // Process items (multiple per tile)
    if (tileData.items) {
      updates.items[fullTileKey] = tileData.items.map(item => ({ ...item, x, y }));
      validItemKeys.add(fullTileKey);
      entitiesChanged = true;
    } else {
      // Explicitly mark as empty if no items
      updates.items[fullTileKey] = [];
    }
  });
  
  // Only update if entities changed - do it in one atomic update
  if (entitiesChanged) {
    entities.update(current => {
      const newState = {
        structure: { ...current.structure, ...updates.structure },
        players: { ...current.players },
        groups: { ...current.groups },
        items: { ...current.items }
      };
      
      // Process all entity types in one update
      
      // Clean up missing groups in this chunk
      Object.keys(current.groups).forEach(key => {
        if (getChunkKey(parseInt(key.split(',')[0]), parseInt(key.split(',')[1])) === chunkKey) {
          if (!validGroupKeys.has(key)) {
            newState.groups[key] = [];
          }
        }
      });
      
      // Clean up missing players in this chunk
      Object.keys(current.players).forEach(key => {
        if (getChunkKey(parseInt(key.split(',')[0]), parseInt(key.split(',')[1])) === chunkKey) {
          if (!validPlayerKeys.has(key)) {
            newState.players[key] = [];
          }
        }
      });
      
      // Handle updates for all entity types
      Object.entries(updates.players).forEach(([key, value]) => {
        newState.players[key] = value;
      });
      
      Object.entries(updates.groups).forEach(([key, value]) => {
        newState.groups[key] = value;
      });
      
      Object.entries(updates.items).forEach(([key, value]) => {
        newState.items[key] = value;
      });
      
      return newState;
    });
  }
}

// Prioritize loading the most visible chunks first and ensure immediate rendering
export const chunks = derived(
  [map],
  ([$map], set) => {
    const worldId = $map.world || 'default';
    
    // Skip if map is not ready
    if (!$map.ready) return set(new Set());
    
    // Always load expanded chunks regardless of minimap UI state
    // This ensures entities in main view are loaded properly
    const expandedFactor = 1;
    const colsRadius = Math.ceil($map.cols * (1 + expandedFactor * (EXPANDED_COLS_FACTOR - 1)) / 2);
    const rowsRadius = Math.ceil($map.rows * (1 + expandedFactor * (EXPANDED_ROWS_FACTOR - 1)) / 2);
    
    const minX = $map.target.x - colsRadius;
    const maxX = $map.target.x + colsRadius;
    const minY = $map.target.y - rowsRadius;
    const maxY = $map.target.y + rowsRadius;
    
    const minChunkX = Math.floor(minX / CHUNK_SIZE);
    const maxChunkX = Math.floor(maxX / CHUNK_SIZE);
    const minChunkY = Math.floor(minY / CHUNK_SIZE);
    const maxChunkY = Math.floor(maxY / CHUNK_SIZE);
    
    // Update cache size based on visible area
    if (terrain) {
      const visibleCols = $map.cols * (1 + expandedFactor * (EXPANDED_COLS_FACTOR - 1));
      const visibleRows = $map.rows * (1 + expandedFactor * (EXPANDED_ROWS_FACTOR - 1));
      terrain.updateCacheSize(visibleCols, visibleRows, CHUNK_SIZE);
    }
    
    // Track chunks to remove
    const chunksToRemove = new Set(chunkSubscriptions.keys());
    const visibleChunks = new Set();
    
    // Create an array of chunks ordered by distance from center
    const chunksToLoad = [];
    for (let y = minChunkY; y <= maxChunkY; y++) {
      for (let x = minChunkX; x <= maxChunkX; x++) {
        const chunkKey = `${x},${y}`;
        visibleChunks.add(chunkKey);
        
        // Calculate distance from target chunk
        const targetChunkX = Math.floor($map.target.x / CHUNK_SIZE);
        const targetChunkY = Math.floor($map.target.y / CHUNK_SIZE);
        const distSq = (x - targetChunkX) ** 2 + (y - targetChunkY) ** 2;
        
        // If already subscribed, keep it
        if (chunkSubscriptions.has(chunkKey)) {
          chunksToRemove.delete(chunkKey);
        } else {
          // Otherwise queue for loading
          chunksToLoad.push({
            x, y, chunkKey, distSq,
            isCenter: x === targetChunkX && y === targetChunkY
          });
        }
      }
    }
    
    // Sort chunks by distance, with center chunk first
    chunksToLoad.sort((a, b) => {
      if (a.isCenter) return -1;
      if (b.isCenter) return 1;
      return a.distSq - b.distSq;
    });

    // Process chunks in order of priority
    for (const chunk of chunksToLoad) {
      const chunkRef = ref(db, `worlds/${worldId}/chunks/${chunk.chunkKey}`);
      const unsubscribe = onValue(chunkRef, snapshot => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          processChunkData(data, chunk.chunkKey);
        }
      });
      
      chunkSubscriptions.set(chunk.chunkKey, unsubscribe);
    }
    
    // Unsubscribe from any chunks that are no longer visible
    for (const chunkKey of chunksToRemove) {
      const unsubscribe = chunkSubscriptions.get(chunkKey);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
        chunkSubscriptions.delete(chunkKey);
        
        // Clear cache entries for this chunk
        if (terrain) {
          const [chunkX, chunkY] = chunkKey.split(',').map(Number);
          terrain.clearChunkFromCache(chunkX, chunkY, CHUNK_SIZE);
        }
        
        // Clear entity data for this chunk
        entities.update(current => {
          const newState = {
            structure: { ...current.structure },
            groups: { ...current.groups },
            players: { ...current.players },
            items: { ...current.items }
          };
          
          // Remove entities from this chunk
          Object.keys(current.structure).forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (getChunkKey(x, y) === chunkKey) {
              delete newState.structure[key];
            }
          });
          
          Object.keys(current.groups).forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (getChunkKey(x, y) === chunkKey) {
              delete newState.groups[key];
            }
          });
          
          Object.keys(current.players).forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (getChunkKey(x, y) === chunkKey) {
              delete newState.players[key];
            }
          });
          
          Object.keys(current.items).forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (getChunkKey(x, y) === chunkKey) {
              delete newState.items[key];
            }
          });
          
          return newState;
        });
      }
    }
    
    // Return visible chunks set
    return visibleChunks;
  },
  new Set()
);

export const coordinates = derived(
  [map, entities, chunks, highlightedCoords],
  ([$map, $entities, $chunks, $highlightedCoords], set) => {
    // Skip if map not ready
    if (!$map.ready) {
      return set([]);
    }
    
    // Additional validation
    if ($map.cols <= 0 || $map.rows <= 0) {
      console.error('Invalid grid dimensions');
      return set([]);
    }
    
    // Always calculate the expanded grid regardless of minimap UI state
    // This ensures entities are always loaded and available
    const gridCols = Math.floor($map.cols * EXPANDED_COLS_FACTOR);
    const gridRows = Math.floor($map.rows * EXPANDED_ROWS_FACTOR);
    
    const viewportCenterX = Math.floor(gridCols / 2);
    const viewportCenterY = Math.floor(gridRows / 2);
    const targetX = $map.target.x;
    const targetY = $map.target.y;

    const result = [];
    const highlightedX = $highlightedCoords?.x;
    const highlightedY = $highlightedCoords?.y;

    // Calculate main view boundaries for display purposes
    const mainViewMinX = viewportCenterX - Math.floor($map.cols / 2);
    const mainViewMaxX = viewportCenterX + Math.floor($map.cols / 2);
    const mainViewMinY = viewportCenterY - Math.floor($map.rows / 2);
    const mainViewMaxY = viewportCenterY + Math.floor($map.rows / 2);

    // Build grid in one pass
    for (let y = 0; y < gridRows; y++) {
      for (let x = 0; x < gridCols; x++) {
        const globalX = x - viewportCenterX + targetX;
        const globalY = y - viewportCenterY + targetY;
        const locationKey = `${globalX},${globalY}`;
        
        // Calculate distance from target position
        const distance = Math.sqrt(
          Math.pow(globalX - targetX, 2) + 
          Math.pow(globalY - targetY, 2)
        );
        
        // Keep isInMainView calculation consistent regardless of minimap state
        const isInMainView = (
          x >= mainViewMinX && x <= mainViewMaxX && 
          y >= mainViewMinY && y <= mainViewMaxY
        );
        
        const chunkKey = getChunkKey(globalX, globalY);
        const terrainData = terrain.getTerrainData(globalX, globalY);
        
        // Always include entity data regardless of minimap state
        const structure = $entities.structure[locationKey];
        const groups = $entities.groups[locationKey] || [];
        const players = $entities.players[locationKey] || [];
        const items = $entities.items[locationKey] || [];
        
        result.push({
          x: globalX,
          y: globalY,
          isCenter: x === viewportCenterX && y === viewportCenterY,
          isInMainView,
          chunkKey,
          biome: terrainData.biome,
          color: terrainData.color,
          highlighted: highlightedX === globalX && highlightedY === globalY,
          structure,
          groups,
          players,
          items,
          terrain: terrainData,
          distance
        });
      }
    }

    set(result);
  },
  []
);

// Target store depends on coordinates
export const targetStore = derived(
  [map, coordinates],
  ([$map, $coordinates]) => {
    // Find the center tile in coordinates
    const targetTile = $coordinates.find(c => c.x === $map.target.x && c.y === $map.target.y);
    
    // If found, return complete data; if not, return minimal location data
    return targetTile || { x: $map.target.x, y: $map.target.y };
  }
);

// Highlighted store depends on coordinates
export const highlightedStore = derived(
  [highlightedCoords, coordinates],
  ([$highlightedCoords, $coordinates]) => {
    // If no tile is highlighted, return null
    if (!$highlightedCoords) return null;
    
    // Find the highlighted tile with full data from coordinates
    const highlightedTile = $coordinates.find(
      c => c.x === $highlightedCoords.x && c.y === $highlightedCoords.y
    );
    
    // Return the found tile with complete data, or fall back to basic coords
    return highlightedTile || $highlightedCoords;
  }
);

// Enhance the moveTarget function with better debouncing and localStorage persistence
let moveTargetTimeout = null;
const MOVE_TARGET_DEBOUNCE = 30; // Increase from 20ms to 30ms

// Unified map movement function with improved URL handling
export function moveTarget(newX, newY) {
  if (newX === undefined || newY === undefined) {
    console.warn('Invalid coordinates passed to moveTarget:', { newX, newY });
    return;
  }

  const x = Math.round(newX);
  const y = Math.round(newY);
  
  // Quick check to avoid unnecessary updates
  const currentState = get(map);
  if (currentState.target.x === x && currentState.target.y === y) {
    return; // No change needed
  }
  
  // Clear any pending timeout
  if (moveTargetTimeout) {
    clearTimeout(moveTargetTimeout);
  }
  
  // Debounce rapid updates
  moveTargetTimeout = setTimeout(() => {
    // Update map position immediately for responsive UI
    map.update(prev => ({
      ...prev,
      target: { x, y },
    }));
    
    // Clear highlighted tile when moving
    highlightedCoords.set(null);
    
    // Update URL to reflect the new position - with a lower priority
    if (!isInternalUrlUpdate) {
      updateUrlWithCoordinates(x, y);
    }
    
    // Save target position to localStorage
    const worldId = currentState.world;
    if (worldId) {
      saveTargetToLocalStorage(worldId, x, y);
    }
    
    moveTargetTimeout = null;
  }, MOVE_TARGET_DEBOUNCE);
}

// Set highlighted coordinates
export function setHighlighted(x, y) {
  if (x !== null && y !== null) {
    highlightedCoords.set({ x, y });
  } else {
    highlightedCoords.set(null);
  }
}

// Get chunk key for coordinates - matches database structure
export function getChunkKey(x, y) {
  // Handle negative coordinates correctly by adjusting division for negative values
  const chunkX = Math.floor((x >= 0 ? x : x - CHUNK_SIZE + 1) / CHUNK_SIZE);
  const chunkY = Math.floor((y >= 0 ? y : y - CHUNK_SIZE + 1) / CHUNK_SIZE);
  
  return `${chunkX},${chunkY}`;
}

// Unified initialization function with localStorage support and better error handling
export function initialize(options = {}) {
  // SSR guard - don't initialize terrain on server
  if (typeof window === 'undefined') {
    console.log('Skipping map setup in SSR environment');
    return false;
  }

  // Don't reinitialize if already ready with the same world
  const currentMapState = get(map);
  
  // Return early if already initializing to prevent redundant attempts
  if (currentMapState.initializing) {
    console.log('Map initialization already in progress, skipping redundant attempt');
    return false;
  }
  
  // Mark that we're starting initialization
  map.update(state => ({...state, initializing: true, initializationAttempted: true}));
  
  let worldId = options.world || options.worldId || 'default';
  
  try {
    // Handle different input formats for extracting worldId
    if (options.gameStore) {
      const gameState = get(options.gameStore);
      if (gameState && gameState.currentWorld) {
        worldId = gameState.currentWorld;
      }
    }
    
    // Early return if already initialized with same world
    if (currentMapState.ready && currentMapState.world === worldId) {
      console.log(`Map already initialized for world ${worldId}, skipping redundant setup`);
      
      // Update initializing flag
      map.update(state => ({...state, initializing: false}));
      
      // Still process URL coordinates if needed
      const urlX = options.initialX;
      const urlY = options.initialY;
      if (urlX !== undefined && urlY !== undefined) {
        moveTarget(urlX, urlY);
      }
      
      return true;
    }

    let seed;
    let initialX = options.initialX;
    let initialY = options.initialY;

    // Handle different input formats for seed extraction
    if (options.gameStore) {
      // Case 1: GameStore provided - extract data from it
      const gameState = get(options.gameStore);
      if (!gameState || !gameState.currentWorld) {
        console.log('No current world in game state');
        map.update(state => ({...state, initializing: false}));
        return false;
      }
      
      worldId = gameState.currentWorld;
      
      if (!gameState.worldInfo || !gameState.worldInfo[worldId]) {
        console.log(`No world info for world: ${worldId}`);
        map.update(state => ({...state, initializing: false}));
        return false;
      }
      
      seed = gameState.worldInfo[worldId].seed;
    } else if (options.worldInfo) {
      // Case 2: Direct worldInfo object provided
      worldId = options.worldId || 'default';
      seed = options.worldInfo.seed;
    } else {
      // Case 3: Direct seed and world values
      seed = options.seed;
    }

    // Validate we have the required seed
    if (seed === undefined || seed === null) {
      console.error('No seed provided for map initialization');
      map.update(state => ({...state, initializing: false}));
      return false;
    }

    // Ensure seed is a valid number
    const seedNumber = typeof seed === 'string' ? Number(seed) : seed;
    if (isNaN(seedNumber)) {
      console.error(`Invalid seed value provided: ${seed}`);
      map.update(state => ({...state, initializing: false}));
      return false;
    }

    // Get current map state
    const currentState = get(map);
    const initialCols = currentState.cols || 20;
    const initialRows = currentState.rows || 15;

    // Set initial target position - priority order:
    // 1. URL parameters (initialX/Y)
    // 2. localStorage saved position
    // 3. World center coordinates
    // 4. Current target position in store
    // 5. Default (0,0)
    let targetPosition = { x: 0, y: 0 };
    const hasInitialCoords = initialX !== undefined && initialY !== undefined;
    
    if (hasInitialCoords) {
      // 1. URL parameters take highest priority
      targetPosition = { x: Math.round(initialX), y: Math.round(initialY) };
      console.log(`Initializing map with URL position: ${targetPosition.x},${targetPosition.y}`);
    } else {
      // 2. Try to load from localStorage
      const savedPosition = loadTargetFromLocalStorage(worldId);
      if (savedPosition) {
        targetPosition = savedPosition;
        console.log(`Initializing map with saved position: ${targetPosition.x},${targetPosition.y}`);
      } else {
        // 3. Try to use world center coordinates
        const worldCenter = getWorldCenterCoordinates(worldId, options.worldInfo);
        if (worldCenter.x !== 0 || worldCenter.y !== 0) {
          targetPosition = worldCenter;
          console.log(`Initializing map with world center: ${targetPosition.x},${targetPosition.y}`);
        } else if (currentState.target.x !== 0 || currentState.target.y !== 0) {
          // 4. Use existing target
          targetPosition = currentState.target;
          console.log(`Initializing map with existing position: ${targetPosition.x},${targetPosition.y}`);
        } else {
          // 5. Default to 0,0
          console.log('Initializing map with default position (0,0)');
        }
      }
    }
    
    // Calculate optimal cache size
    const visibleTiles = initialCols * initialRows;
    const cacheMultiplier = Math.max(1.2, Math.min(1.5, window.innerWidth / 1000));
    const initialCacheSize = Math.ceil(visibleTiles * cacheMultiplier);
    
    // Initialize the terrain generator
    terrain = new TerrainGenerator(seedNumber, initialCacheSize);
    
    // Update the map store
    map.update(state => {
      return {
        ...state,
        ready: true,
        initializing: false,
        world: worldId,
        cols: initialCols,
        rows: initialRows,
        target: targetPosition
      };
    });
    
    // Update URL if initial coordinates were provided
    if (hasInitialCoords) {
      updateUrlWithCoordinates(targetPosition.x, targetPosition.y);
    }
    
    // Always save the initial position to localStorage
    saveTargetToLocalStorage(worldId, targetPosition.x, targetPosition.y);
    
    console.log(`Map successfully initialized for world ${worldId}`);
    return true;
  } catch (err) {
    console.error('Error in map initialization:', err);
    map.update(state => ({...state, initializing: false}));
    return false;
  }
}

// Backward compatibility functions
export function setup(options = {}) {
  return initialize(options);
}

export function setupFromWorldInfo(worldId, worldInfo) {
  return initialize({ worldId, worldInfo });
}

export function setupFromGameStore(gameStore) {
  return initialize({ gameStore });
}

// Get current world ID
export function getCurrentWorld() {
  return get(map).world || 'default';
}

// Switch to different world
export function switchWorld(worldId) {
  const currentWorldId = get(map).world;
  
  if (worldId && worldId !== currentWorldId) {
    // Clear existing subscriptions
    for (const [_, unsubscribe] of chunkSubscriptions.entries()) {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
    chunkSubscriptions.clear();
    
    // Update map store with new world ID
    map.update(state => ({ ...state, world: worldId }));
  }
}

// Cleanup resources
export function cleanup() {
  // Reset the internal URL update flag
  isInternalUrlUpdate = false;
  
  // Clear any pending timeouts
  if (moveTargetTimeout) {
    clearTimeout(moveTargetTimeout);
    moveTargetTimeout = null;
  }
  
  if (urlUpdateTimeout) {
    clearTimeout(urlUpdateTimeout);
    urlUpdateTimeout = null;
  }

  // Clear terrain cache
  if (terrain) {
    terrain.clearCache();
    terrain = null;
  }
  
  // Clear all subscriptions
  for (const [_, unsubscribe] of chunkSubscriptions.entries()) {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  }
  chunkSubscriptions.clear();
  
  // Reset stores
  map.set({
    ready: false,
    initializing: false,
    initializationAttempted: false,
    cols: 0,
    rows: 0,
    target: { x: 0, y: 0 },
    minimap: true,
    world: null,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragAccumX: 0,
    dragAccumY: 0,
    dragSource: null
  });
  
  highlightedCoords.set(null);
  
  entities.set({
    structure: {},
    groups: {},
    players: {},
    items: {}  // Include items in the reset
  });
}

// Initialize map for world with localStorage support
export function initializeMapForWorld(worldId, worldData = null) {
  if (!worldId) return;
  
  console.log(`Initializing map for world: ${worldId}`);
  
  // Get current map state
  const currentMapState = get(map);
  
  // Don't reinitialize if already set up
  if (currentMapState.ready && currentMapState.world === worldId) {
    console.log(`Map already initialized for world ${worldId}`);
    return;
  }
  
  // Clean up existing map if needed
  if (currentMapState.ready) {
    cleanup();
  }
  
  // Try to load saved position for this world
  const savedPosition = loadTargetFromLocalStorage(worldId);
  
  // Get world center coordinates
  const worldCenter = getWorldCenterCoordinates(worldId, worldData);
  
  // Initialize with world data if available
  if (worldData && worldData.seed !== undefined) {
    console.log(`Initializing map with provided worldData, seed: ${worldData.seed}`);
    
    // If we have saved coordinates, include them in setup
    if (savedPosition) {
      setup({
        seed: worldData.seed,
        world: worldId,
        initialX: savedPosition.x,
        initialY: savedPosition.y
      });
    } else {
      // Use world center if no saved position
      setup({
        seed: worldData.seed,
        world: worldId,
        initialX: worldCenter.x,
        initialY: worldCenter.y
      });
    }
    return;
  }
  
  console.log(`Cannot initialize map for world ${worldId} - no seed data available`);
}