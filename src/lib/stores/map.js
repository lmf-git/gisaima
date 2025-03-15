import { writable, derived } from 'svelte/store';
import { TerrainGenerator } from '../map/noise.js';
import { ref, onValue } from "firebase/database";
import { db } from '../firebase/database.js';

// Keep a referance to the terrain generator for grid creation.
let terrain;

// Configuration constants
const CHUNK_SIZE = 20;
export const TILE_SIZE = 5;
export const EXPANDED_COLS_FACTOR = 3.5;
export const EXPANDED_ROWS_FACTOR = 2.85;

// Move entity state to a separate writable store to trigger coordinates updates
export const entities = writable({
  structure: {},
  groups: {},
  players: {}
});

// Create a store using Svelte's store API - remove chunks from map state
export const map = writable({
  ready: false,
  cols: 0,
  rows: 0,
  target: { x: 0, y: 0 },
  highlighted: null,  // Renamed from hoveredTile
  minimap: true,
});

// Export ready derived store for use across components
export const ready = derived(map, $map => $map.ready);

// Unified grid generation
export const coordinates = derived(
  [map, entities],
  ([$map, $entities], set) => {
    // Check if map is ready before computing.
    if (!$map.ready) return set([]);
    
    const useExpanded = $map.minimap;
    const gridCols = useExpanded ? Math.min($map.cols * EXPANDED_COLS_FACTOR) : $map.cols;
    const gridRows = useExpanded ? Math.min($map.rows * EXPANDED_ROWS_FACTOR) : $map.rows;
    const viewportCenterX = Math.floor(gridCols / 2);
    const viewportCenterY = Math.floor(gridRows / 2);
    const targetX = $map.target.x;
    const targetY = $map.target.y;

    const result = [];
    const highlightedX = $map.highlighted?.x;  // Renamed from hoveredX/hoveredTile
    const highlightedY = $map.highlighted?.y;  // Renamed from hoveredY/hoveredTile

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
        
        // Add entity information - renamed unitGroups to groups for consistency
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

    // Only update chunks when map is ready
    if ($map.ready) updateChunks(result);
    set(result);
  },
  []
);

// Modified derived store to use coordinates instead of calling terrain separately
export const targetStore = derived(
  [map, coordinates],
  ([$map, $coordinates]) => {
    if (!$coordinates.length) return { x: $map.target.x, y: $map.target.y };
    
    // Find the center tile in coordinates
    const targetTile = $coordinates.find(c => c.x === $map.target.x && c.y === $map.target.y);
    
    // If found, return complete data; if not, return minimal location data
    return targetTile || { x: $map.target.x, y: $map.target.y };
  }
);

// Enhanced setup function that accepts an optional seed
export function setup(seed = 52532532523) {
  terrain = new TerrainGenerator(seed);
  
  map.update(state => state.ready ? state : { ...state, ready: true });
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
}

// Renamed from updateHoveredTile
export function setHighlighted(x, y) {
  map.update(state => ({
    ...state,
    highlighted: x !== null && y !== null ? { x, y } : null
  }));
}

// Track active chunk subscriptions
const activeChunkSubscriptions = new Map();

// Add a derived store for active chunks (for components that need this info)
export const activeChunks = derived(
  map, 
  () => new Set(activeChunkSubscriptions.keys())
);

// Chunk utilities
export function getChunkKey(x, y) {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
}

// Simplified Firebase interaction
function subscribeToChunk(chunkKey) {
  if (activeChunkSubscriptions.has(chunkKey)) return;

  try {
    const chunkRef = ref(db, `chunks/${chunkKey}`);
    const unsubscribe = onValue(
      chunkRef, 
      (snapshot) => {
        if (snapshot.exists()) handleChunkData(chunkKey, snapshot.val());
      },
      (error) => console.error(`Error subscribing to chunk ${chunkKey}:`, error)
    );
    
    activeChunkSubscriptions.set(chunkKey, unsubscribe);
  } catch (err) {
    console.error(`Failed to subscribe to chunk ${chunkKey}:`, err);
  }
}

function unsubscribeFromChunk(chunkKey) {
  if (!activeChunkSubscriptions.has(chunkKey)) return false;

  try {
    const unsubscribe = activeChunkSubscriptions.get(chunkKey);
    if (typeof unsubscribe === 'function') unsubscribe();
    
    activeChunkSubscriptions.delete(chunkKey);

    return true;
  } catch (err) {
    console.error(`Error unsubscribing from chunk ${chunkKey}:`, err);
    activeChunkSubscriptions.delete(chunkKey);
  }
  return false;
}

// Simplified chunk data handling with closure - update to support multiple entities per location
const handleChunkData = (() => {
  // Private state within closure
  const chunkLastUpdated = new Map();
  
  return (chunkKey, data) => {
    if (!data) return;

    const lastUpdated = data.lastUpdated || Date.now();
    const prevUpdated = chunkLastUpdated.get(chunkKey) || 0;
    if (lastUpdated <= prevUpdated && lastUpdated !== 0) return;
    
    chunkLastUpdated.set(chunkKey, lastUpdated);
    
    // Create single batch update objects
    const updates = {
      structure: {},
      groups: {},
      players: {}
    };
    
    let entitiesChanged = false;

    // Process all tile data at once
    Object.entries(data).forEach(([tileKey, tileData]) => {
      if (tileKey === 'lastUpdated') return;

      const [tileX, tileY] = tileKey.split(',').map(Number);
      
      // Process structure (still only one structure per tile)
      if (tileData.structure) {
        updates.structure[tileKey] = {
          ...tileData.structure,
          chunkKey, x: tileX, y: tileY
        };
        entitiesChanged = true;
      }

      // Process all players at this location
      if (tileData.players) {
        updates.players[tileKey] = [];
        Object.entries(tileData.players).forEach(([playerId, playerData]) => {
          updates.players[tileKey].push({
            ...playerData,
            id: playerId,
            chunkKey, 
            x: tileX, 
            y: tileY
          });
        });
        entitiesChanged = true;
      }

      // Process all unit groups at this location
      if (tileData.groups) {
        updates.groups[tileKey] = [];
        Object.entries(tileData.groups).forEach(([groupId, groupData]) => {
          updates.groups[tileKey].push({
            ...groupData,
            id: groupId,
            chunkKey, 
            x: tileX, 
            y: tileY
          });
        });
        entitiesChanged = true;
      }
    });

    // Apply batch updates to avoid unnecessary store updates
    if (entitiesChanged) {
      entities.update(entities => ({
        structure: { ...entities.structure, ...updates.structure },
        groups: { ...entities.groups, ...updates.groups },
        players: { ...entities.players, ...updates.players }
      }));
    }
  };
})();

// Simplified chunk management
export function updateChunks(gridArray) {
  if (!gridArray?.length) return;

  const newChunkKeys = new Set(
    gridArray.map(cell => getChunkKey(cell.x, cell.y))
  );
  
  // Get current chunks directly from activeChunkSubscriptions
  const currentChunks = new Set(activeChunkSubscriptions.keys());
  
  // Process additions and removals only when needed
  for (const key of newChunkKeys) {
    if (!currentChunks.has(key)) subscribeToChunk(key);
  }
  
  for (const key of currentChunks) {
    if (!newChunkKeys.has(key)) unsubscribeFromChunk(key);
  }
};