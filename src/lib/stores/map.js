import { writable, derived, get } from 'svelte/store';
import { TerrainGenerator } from '../map/noise.js';
import { ref, onValue } from "firebase/database";
import { db } from '../firebase/database.js';
// Remove imports for game - we'll handle this differently

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
  // Remove highlighted from map store as we'll manage it separately
  minimap: true,
  world: 'default', // Use default as initial value, don't rely on game store
});

// New separate store for highlighted coordinates
export const highlightedCoords = writable(null);

export const entities = writable({
  structure: {},
  groups: {},
  players: {}
});

export const ready = derived(map, $map => $map.ready);

// Update chunks to avoid game store dependency
export const chunks = derived(
  [map],
  ([$map], set) => {
    const worldId = $map.world || 'default';
    
    // Simplified check - if map is ready, terrain must exist
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
    if (terrain) { // Add safety check for terrain
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
        if (terrain) { // Add safety check for terrain
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

export const coordinates = derived(
  [map, entities, chunks],
  ([$map, $entities], set) => {
    // Simplified check - if map is ready, terrain must exist
    if (!$map.ready) {
      return set([]);
    }
    
    // Additional validation to catch edge cases
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
    const highlightedX = $map.highlighted?.x;
    const highlightedY = $map.highlighted?.y;

    // Precompute main view boundaries for faster checks
    const mainViewMinX = viewportCenterX - Math.floor($map.cols / 2);
    const mainViewMaxX = viewportCenterX + Math.floor($map.cols / 2);
    const mainViewMinY = viewportCenterY - Math.floor($map.rows / 2);
    const mainViewMaxY = viewportCenterY + Math.floor($map.rows / 2);

    // Build entire grid in one pass
    for (let y = 0; y < gridRows; y++) {
      for (let x = 0; x < gridCols; x++) {
        const globalX = x - viewportCenterX + targetX;
        const globalY = y - viewportCenterY + targetY;
        const locationKey = `${globalX},${globalY}`;
        
        // Only check isInMainView when using expanded view
        const isInMainView = !useExpanded || (
          x >= mainViewMinX && x <= mainViewMaxX && 
          y >= mainViewMinY && y <= mainViewMaxY
        );
        
        // Get tile properties
        const chunkKey = getChunkKey(globalX, globalY);
        const terrainData = terrain.getTerrainData(globalX, globalY);
        
        // Add entity information - make sure to access from entities store
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

// 5. TARGET STORE DEPENDS ON COORDINATES
export const targetStore = derived(
  [map, coordinates],
  ([$map, $coordinates]) => {
    // Find the center tile in coordinates
    const targetTile = $coordinates.find(c => c.x === $map.target.x && c.y === $map.target.y);
    
    // If found, return complete data; if not, return minimal location data
    return targetTile || { x: $map.target.x, y: $map.target.y };
  }
);

// UPDATED: Use highlightedCoords instead of map.highlighted
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

// Unified initialization function that handles all setup scenarios
export function initialize(options = {}) {
  // SSR guard - don't initialize terrain on server
  if (typeof window === 'undefined') {
    console.log('Skipping map setup in SSR environment');
    return false;
  }

  let seed, worldId;

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
    worldId = options.world || options.worldId || 'default';
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
    // Get current map state to calculate initial cache size
    const currentState = get(map);
    const initialCols = currentState.cols || 20;
    const initialRows = currentState.rows || 15;
    
    // Calculate an appropriate initial cache size explicitly
    const initialCacheSize = Math.ceil(initialCols * initialRows * 1.5);
    
    // Initialize the terrain generator with explicit seed and cache size
    terrain = new TerrainGenerator(seedNumber, initialCacheSize);
    
    // Update the map store with ready state AFTER terrain is initialized
    map.update(state => {
      return {
        ...state,
        ready: true,
        world: worldId,
        cols: initialCols,
        rows: initialRows
      };
    });
    
    return true;
  } catch (err) {
    console.error('Error in terrain setup:', err);
    return false;
  }
}

// Keep original functions for backward compatibility
export function setup(options = {}) {
  return initialize(options);
}

export function setupFromWorldInfo(worldId, worldInfo) {
  return initialize({ worldId, worldInfo });
}

export function setupFromGameStore(gameStore) {
  return initialize({ gameStore });
}

// Get the current world ID - fixed to avoid circular references
export function getCurrentWorld() {
  // Don't access game store here to avoid circular dependency
  return get(map).world || 'default';
}

// Switch to a different world
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

// Unified map movement function
export function moveTarget(newX, newY) {
  map.update(prev => {
    const x = newX !== undefined ? Math.round(newX) : prev.target.x;
    const y = newY !== undefined ? Math.round(newY) : prev.target.y;

    return {
      ...prev,
      target: { x, y },
    };
  });
  
  // Clear highlighted tile when moving
  highlightedCoords.set(null);
};

// UPDATED: Use highlightedCoords store directly
export function setHighlighted(x, y) {
  if (x !== null && y !== null) {
    highlightedCoords.set({ x, y });
  } else {
    highlightedCoords.set(null);
  }
};

// Simplified chunk key utility
export function getChunkKey(x, y) {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
};

// Add a cleanup function that resets the map store and clears caches
export function cleanup() {
  // Clear terrain cache if terrain generator exists
  if (terrain) {
    terrain.clearCache();
    terrain = null; // Explicitly set terrain to null when cleaning up
  }
  
  // Clear all chunk subscriptions
  for (const [_, unsubscribe] of chunkSubscriptions.entries()) {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  }
  chunkSubscriptions.clear();
  
  // Reset the map store to initial state - this must happen AFTER nulling terrain
  map.set({
    ready: false, // Reset ready state to false when terrain is cleaned up
    cols: 0,
    rows: 0,
    target: { x: 0, y: 0 },
    minimap: true,
    world: null,
  });
  
  // Reset highlighted coordinates store
  highlightedCoords.set(null);
  
  // Reset entities store
  entities.set({
    structure: {},
    groups: {},
    players: {}
  });
}

// Add this function or modify the existing initialization function

// Make sure the map correctly initializes when a world is loaded without dynamic imports
export function initializeMapForWorld(worldId, worldData = null) {
  if (!worldId) return;
  
  console.log(`Initializing map for world: ${worldId}`);
  
  // Get current map state
  const currentMapState = get(map);
  
  // If the map is already set up for this world, don't reinitialize
  if (currentMapState.ready && currentMapState.world === worldId) {
    console.log(`Map already initialized for world ${worldId}`);
    return;
  }
  
  // Clean up existing map if needed
  if (currentMapState.ready) {
    cleanup();
  }
  
  // If we have worldData with a seed, use it to initialize
  if (worldData && worldData.seed !== undefined) {
    console.log(`Initializing map with provided worldData, seed: ${worldData.seed}`);
    setup({
      seed: worldData.seed,
      world: worldId
    });
    return;
  }
  
  // We'll rely on the external initialization via setupFromGameStore or setupFromWorldInfo
  // rather than importing game directly
  console.log(`Cannot initialize map for world ${worldId} - no seed data available`);
  // We'll keep the map not ready until proper data is loaded
}