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
export const EXPANDED_COLS_FACTOR = 3.5;
export const EXPANDED_ROWS_FACTOR = 2.85;

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
    
    if (!$map.ready || !terrain) return set(new Set());
    
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
    // FIX: chunksToRemove is a Set of keys, not a Map of entries
    for (const chunkKey of chunksToRemove) {
      const unsubscribe = chunkSubscriptions.get(chunkKey);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
        chunkSubscriptions.delete(chunkKey);
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
    // Check if map is ready before computing
    if (!$map.ready || !terrain) {
      console.log('Map not ready or terrain not initialized:', { mapReady: $map.ready, terrainExists: !!terrain });
      return set([]);
    }
    
    // Additional validation to catch edge cases
    if ($map.cols <= 0 || $map.rows <= 0) {
      console.error('Invalid grid dimensions:', { cols: $map.cols, rows: $map.rows });
      return set([]);
    }
    
    const useExpanded = $map.minimap;
    // Fix: Math.min without a second argument doesn't work properly
    const gridCols = useExpanded ? Math.floor($map.cols * EXPANDED_COLS_FACTOR) : $map.cols;
    const gridRows = useExpanded ? Math.floor($map.rows * EXPANDED_ROWS_FACTOR) : $map.rows;
    
    console.log('Calculating coordinates grid:', { 
      cols: gridCols, 
      rows: gridRows, 
      target: $map.target,
      expanded: useExpanded
    });
    
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

    // Add debug info at end
    console.log(`Generated ${result.length} coordinates`);
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
  
  console.log('Setting up map with:', { seed, worldId });
  
  // Validate seed - it's required and must be a valid number
  if (seed === undefined || seed === null) {
    throw new Error('No seed provided for map setup - seed is required');
  }
  
  // Ensure seed is a valid number
  const seedNumber = typeof seed === 'string' ? Number(seed) : seed;
  if (isNaN(seedNumber)) {
    throw new Error(`Invalid seed value provided: ${seed}`);
  }
  
  // Initialize the terrain generator with seed
  terrain = new TerrainGenerator(seedNumber);
  console.log('Terrain generator initialized with seed:', seedNumber);
  
  // Update the map store with ready state, world ID, AND INITIAL DIMENSIONS
  map.update(state => {
    console.log('Setting map ready state to true with initial dimensions');
    return {
      ...state,
      ready: true,
      world: worldId,
      // Add initial dimensions to avoid circular dependency
      cols: state.cols || 20,  // Default to 20 if not set
      rows: state.rows || 15   // Default to 15 if not set
    };
  });
  
  // Verify the update took effect
  const mapState = get(map);
  console.log('Map state after update:', { ready: mapState.ready, world: mapState.world, cols: mapState.cols, rows: mapState.rows });
}

// New function to initialize map directly from game store
export function setupFromGameStore() {
  const gameState = get(game);
  
  // Check for current world and wait if not available
  if (!gameState.currentWorld || !gameState.worldInfo) {
    console.warn('World information not yet loaded. Map setup will be delayed.');
    // Return a promise that resolves when the world is ready
    return new Promise((resolve, reject) => {
      const unsubscribe = game.subscribe(($game) => {
        if ($game.currentWorld && $game.worldInfo && $game.worldInfo[$game.currentWorld]?.seed !== undefined) {
          unsubscribe();
          console.log('World information now available. Proceeding with map setup.');
          try {
            const result = setup({
              seed: $game.worldInfo[$game.currentWorld].seed,
              world: $game.currentWorld
            });
            resolve(result);
          } catch (err) {
            reject(err);
          }
        }
      });
      
      // Set a timeout to prevent hanging forever
      setTimeout(() => {
        unsubscribe();
        reject(new Error('Timed out waiting for world information'));
      }, 10000); // 10 second timeout
    });
  }
  
  if (!gameState.worldInfo[gameState.currentWorld] || gameState.worldInfo[gameState.currentWorld].seed === undefined) {
    throw new Error(`World info or seed not available for ${gameState.currentWorld}`);
  }
  
  return setup({
    seed: gameState.worldInfo[gameState.currentWorld].seed,
    world: gameState.currentWorld
  });
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