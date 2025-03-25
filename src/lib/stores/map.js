import { writable, derived, get } from 'svelte/store';
import { TerrainGenerator } from '../map/noise.js';
import { ref, onValue } from "firebase/database";
import { db } from '../firebase/database.js';
import { replaceState } from '$app/navigation'; // Import from SvelteKit instead of using history directly

// Keep a reference to the terrain generator for grid creation
let terrain;

// Configuration constants
const CHUNK_SIZE = 20;
export const TILE_SIZE = 5;
export const EXPANDED_COLS_FACTOR = 2.6;
export const EXPANDED_ROWS_FACTOR = 2;

const chunkSubscriptions = new Map();

// Initialize map without accessing game store initially
export const map = writable({
  ready: false,
  cols: 0,
  rows: 0,
  target: { x: 0, y: 0 },
  minimap: true,
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
  players: {}
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

// Update chunks to avoid game store dependency
export const chunks = derived(
  [map],
  ([$map], set) => {
    const worldId = $map.world || 'default';
    
    // Skip if map is not ready
    if (!$map.ready) return set(new Set());
    
    // Calculate visible area chunk bounds
    const expandedFactor = $map.minimap ? 1 : 0;
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
    
    // Process visible chunks
    for (let y = minChunkY; y <= maxChunkY; y++) {
      for (let x = minChunkX; x <= maxChunkX; x++) {
        const chunkKey = `${x},${y}`;
        visibleChunks.add(chunkKey);
        
        // Keep if already active, add if new
        if (chunkSubscriptions.has(chunkKey)) {
          chunksToRemove.delete(chunkKey);
        } else {
          // Subscribe with updated path using worldId
          const chunkRef = ref(db, `worlds/${worldId}/chunks/${chunkKey}`);
          const unsubscribe = onValue(chunkRef, snapshot => {
            if (snapshot.exists()) {
              const data = snapshot.val();
              processChunkData(data);
            }
          });
          
          chunkSubscriptions.set(chunkKey, unsubscribe);
        }
      }
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
      }
    }
    
    // Return visible chunks set
    return visibleChunks;
  },
  new Set()
);

// Helper function to process chunk data
function processChunkData(data = {}) {
  // Structure for batch entity updates
  const updates = {
    structure: {},
    groups: {},
    players: {}
  };
  
  let entitiesChanged = false;
  
  // Skip lastUpdated metadata field
  Object.entries(data).forEach(([tileKey, tileData]) => {
    if (tileKey === 'lastUpdated') return;
    
    const [x, y] = tileKey.split(',').map(Number);
    
    // Process structure
    if (tileData.structure) {
      updates.structure[tileKey] = { ...tileData.structure, x, y };
      entitiesChanged = true;
    }
    
    // Process player groups (multiple per tile)
    if (tileData.players) {
      updates.players[tileKey] = Object.entries(tileData.players)
        .map(([id, data]) => ({ ...data, id, x, y }));
      entitiesChanged = true;
    }
    
    // Process unit groups (multiple per tile)
    if (tileData.groups) {
      updates.groups[tileKey] = Object.entries(tileData.groups)
        .map(([id, data]) => ({ ...data, id, x, y }));
      entitiesChanged = true;
    }
  });
  
  // Only update if entities changed
  if (entitiesChanged) {
    entities.update(current => ({
      structure: { ...current.structure, ...updates.structure },
      groups: { ...current.groups, ...updates.groups },
      players: { ...current.players, ...updates.players }
    }));
  }
}

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
    
    const useExpanded = $map.minimap;
    const gridCols = useExpanded ? Math.floor($map.cols * EXPANDED_COLS_FACTOR) : $map.cols;
    const gridRows = useExpanded ? Math.floor($map.rows * EXPANDED_ROWS_FACTOR) : $map.rows;
    
    const viewportCenterX = Math.floor(gridCols / 2);
    const viewportCenterY = Math.floor(gridRows / 2);
    const targetX = $map.target.x;
    const targetY = $map.target.y;

    const result = [];
    const highlightedX = $highlightedCoords?.x;
    const highlightedY = $highlightedCoords?.y;

    // Precompute main view boundaries
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
        
        const isInMainView = !useExpanded || (
          x >= mainViewMinX && x <= mainViewMaxX && 
          y >= mainViewMinY && y <= mainViewMaxY
        );
        
        const chunkKey = getChunkKey(globalX, globalY);
        const terrainData = terrain.getTerrainData(globalX, globalY);
        
        const structure = $entities.structure[locationKey];
        const groups = $entities.groups[locationKey] || [];
        const players = $entities.players[locationKey] || [];
        
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
          terrain: terrainData
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

// Enhance the moveTarget function with better debouncing
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

// Get chunk key for coordinates
export function getChunkKey(x, y) {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
}

// Unified initialization function
export function initialize(options = {}) {
  // SSR guard - don't initialize terrain on server
  if (typeof window === 'undefined') {
    console.log('Skipping map setup in SSR environment');
    return false;
  }

  // Don't reinitialize if already ready with the same world
  const currentMapState = get(map);
  let worldId = options.world || options.worldId || 'default';
  
  // Handle different input formats for extracting worldId
  if (options.gameStore) {
    try {
      const gameState = get(options.gameStore);
      if (gameState && gameState.currentWorld) {
        worldId = gameState.currentWorld;
      }
    } catch (err) {
      console.warn('Error extracting world ID from game store:', err);
    }
  }
  
  // Early return if already initialized with same world
  if (currentMapState.ready && currentMapState.world === worldId) {
    console.log(`Map already initialized for world ${worldId}, skipping redundant setup`);
    
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

  // Handle different input formats
  if (options.gameStore) {
    // Case 1: GameStore provided - extract data from it
    try {
      const gameState = get(options.gameStore);
      if (!gameState || !gameState.currentWorld) {
        console.log('No current world in game state');
        return false;
      }
      
      worldId = gameState.currentWorld;
      
      if (!gameState.worldInfo || !gameState.worldInfo[worldId]) {
        console.log(`No world info for world: ${worldId}`);
        return false;
      }
      
      seed = gameState.worldInfo[worldId].seed;
    } catch (err) {
      console.error('Error extracting data from game store:', err);
      return false;
    }
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
    return false;
  }

  // Ensure seed is a valid number
  const seedNumber = typeof seed === 'string' ? Number(seed) : seed;
  if (isNaN(seedNumber)) {
    console.error(`Invalid seed value provided: ${seed}`);
    return false;
  }

  try {
    // Get current map state
    const currentState = get(map);
    const initialCols = currentState.cols || 20;
    const initialRows = currentState.rows || 15;

    // Set initial target position
    let targetPosition = { x: 0, y: 0 };
    const hasInitialCoords = initialX !== undefined && initialY !== undefined;
    
    if (hasInitialCoords) {
      targetPosition.x = Math.round(initialX);
      targetPosition.y = Math.round(initialY);
      console.log(`Initializing map with target position: ${targetPosition.x},${targetPosition.y}`);
    } else {
      // Use existing target or default to 0,0
      targetPosition = currentState.target.x !== 0 || currentState.target.y !== 0 
        ? currentState.target 
        : { x: 0, y: 0 };
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
    
    return true;
  } catch (err) {
    console.error('Error in terrain setup:', err);
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
    players: {}
  });
}

// Initialize map for world
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
  
  // Initialize with world data if available
  if (worldData && worldData.seed !== undefined) {
    console.log(`Initializing map with provided worldData, seed: ${worldData.seed}`);
    setup({
      seed: worldData.seed,
      world: worldId
    });
    return;
  }
  
  console.log(`Cannot initialize map for world ${worldId} - no seed data available`);
}