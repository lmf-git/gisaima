import { writable, derived, get } from 'svelte/store';
import { TerrainGenerator } from '../map/noise.js';
import { ref, onValue } from "firebase/database";
import { db } from '../firebase/database.js';
import { game } from './game.js';

// Keep a reference to the terrain generator for grid creation
let terrain;

// Configuration constants
const CHUNK_SIZE = 20;
export const TILE_SIZE = 5;
export const EXPANDED_COLS_FACTOR = 2.6;
export const EXPANDED_ROWS_FACTOR = 2;

const chunkSubscriptions = new Map();

export const map = writable({
  ready: false,
  cols: 0,
  rows: 0,
  target: { x: 0, y: 0 },
  highlighted: null,
  minimap: true,
  world: get(game).currentWorld || 'default', // Initialize from game store
});

export const entities = writable({
  structure: {},
  groups: {},
  players: {}
});

export const ready = derived(map, $map => $map.ready);

export const chunks = derived(
  [map, game],
  ([$map, $game], set) => {
    // Use the world from game store if available
    const worldId = $map.world || $game.currentWorld || 'default';
    
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
    const visibleCols = $map.cols * (1 + expandedFactor * (EXPANDED_COLS_FACTOR - 1));
    const visibleRows = $map.rows * (1 + expandedFactor * (EXPANDED_ROWS_FACTOR - 1));
    terrain.updateCacheSize(visibleCols, visibleRows, CHUNK_SIZE);
    
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
          // Subscribe with updated path using worldId from game store when available
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
        const [chunkX, chunkY] = chunkKey.split(',').map(Number);
        terrain.clearChunkFromCache(chunkX, chunkY, CHUNK_SIZE);
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

// Enhanced setup function that uses game store data
export function setup({ seed, world = null } = {}) {
  // Get world ID from game store if not provided
  const worldId = world || get(game).currentWorld || 'default';
  
  // Validate seed - it's required and must be a valid number
  if (seed === undefined || seed === null) {
    throw new Error('No seed provided for map setup - seed is required');
  }
  
  // Ensure seed is a valid number
  const seedNumber = typeof seed === 'string' ? Number(seed) : seed;
  if (isNaN(seedNumber)) {
    throw new Error(`Invalid seed value provided: ${seed}`);
  }
  
  // Get current map state to calculate initial cache size
  const currentState = get(map);
  const initialCols = currentState.cols || 20;
  const initialRows = currentState.rows || 15;
  const initialCacheSize = Math.ceil(initialCols * initialRows * 1.5);
  
  // Initialize the terrain generator with seed and appropriate cache size
  terrain = new TerrainGenerator(seedNumber, initialCacheSize);
  
  // Update the map store with ready state AFTER terrain is initialized
  // This ensures map.ready is only true when terrain exists
  map.update(state => {
    return {
      ...state,
      ready: true, // Only set ready to true after terrain is initialized
      world: worldId,
      cols: initialCols,
      rows: initialRows
    };
  });
  
  return true;
}

// New function to initialize map directly from game store
export function setupFromGameStore() {
  const gameState = get(game);
  
  // More detailed checks with specific error messages
  if (!gameState.currentWorld) {
    return false;
  }
  
  if (!gameState.worldInfo || Object.keys(gameState.worldInfo).length === 0) {
    return false;
  }
  
  const worldInfo = gameState.worldInfo[gameState.currentWorld];
  if (!worldInfo) {
    return false;
  }
  
  if (worldInfo.seed === undefined) {
    return false;
  }
  
  // Get seed value and ensure it's a proper number
  const seedValue = worldInfo.seed;
  if (isNaN(Number(seedValue))) {
    return false;
  }
  
  // If the map is already set up for this world, don't reinitialize
  const mapState = get(map);
  if (mapState.ready && mapState.world === gameState.currentWorld) {
    return true;
  }
  
  // We have all required data, proceed with setup
  try {
    return setup({
      seed: seedValue,
      world: gameState.currentWorld
    });
  } catch (err) {
    console.error('Error in map setup:', err);
    return false;
  }
}

// Get the current world ID
export function getCurrentWorld() {
  return get(map).world || get(game).currentWorld || 'default';
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
      highlighted: null  // Renamed from hoveredTile
    };
  });
};

// Renamed from updateHoveredTile
export function setHighlighted(x, y) {
  map.update(state => ({
    ...state,
    highlighted: x !== null && y !== null ? { x, y } : null
  }));
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
    highlighted: null,
    minimap: true,
    world: null,
  });
  
  // Reset entities store
  entities.set({
    structure: {},
    groups: {},
    players: {}
  });
}