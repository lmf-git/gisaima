import { writable, derived, get } from 'svelte/store';
import { TerrainGenerator } from '../map/noise.js';
import { ref, onValue } from "firebase/database";
import { db } from '../firebase/database.js';

// Initialize the terrain generator with a fixed seed
const WORLD_SEED = 454232;
const terrain = new TerrainGenerator(WORLD_SEED);

// Configuration constants
export const CHUNK_SIZE = 20;
export const TILE_SIZE = 5;
export const GRID_COLS_FACTOR = 3.5;
export const GRID_ROWS_FACTOR = 2.85;

// Track active chunk subscriptions
const activeChunkSubscriptions = new Map();

// Move entity state to a separate writable store to trigger coordinates updates
export const entityStore = writable({
  structure: {},
  groups: {},
  players: {},
});

// Create a store using Svelte's store API - remove chunks from map state
export const map = writable({
  ready: false,
  cols: 0,
  rows: 0,
  offsetX: 0,
  offsetY: 0,
  target: { x: 0, y: 0 },
  hoveredTile: null,
  showDetails: false,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  minimapVisible: true,
});

// Add a derived store for active chunks (for components that need this info)
export const activeChunks = derived(
  map, 
  () => new Set(activeChunkSubscriptions.keys())
);

// Export mapReady derived store for use across components
export const mapReady = derived(map, $map => $map.ready);

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
    cleanEntitiesForChunk(chunkKey);
    return true;
  } catch (err) {
    console.error(`Error unsubscribing from chunk ${chunkKey}:`, err);
    activeChunkSubscriptions.delete(chunkKey);
  }
  return false;
}

// Simplified chunk data handling with closure - update to use entityStore
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
      
      // Process structure
      if (tileData.structure) {
        updates.structure[tileKey] = {
          ...tileData.structure,
          chunkKey, x: tileX, y: tileY
        };
        entitiesChanged = true;
      }

      // Process players (take first one only)
      if (tileData.players) {
        const playerIds = Object.keys(tileData.players);
        if (playerIds.length > 0) {
          updates.players[tileKey] = {
            ...tileData.players[playerIds[0]],
            id: playerIds[0], chunkKey, x: tileX, y: tileY
          };
          entitiesChanged = true;
        }
      }

      // Process groups (take first one only)
      if (tileData.groups) {
        const groupIds = Object.keys(tileData.groups);
        if (groupIds.length > 0) {
          updates.groups[tileKey] = {
            ...tileData.groups[groupIds[0]],
            id: groupIds[0], chunkKey, x: tileX, y: tileY
          };
          entitiesChanged = true;
        }
      }
    });

    // Apply batch updates to avoid unnecessary store updates
    if (entitiesChanged) {
      entityStore.update(entities => ({
        structure: { ...entities.structure, ...updates.structure },
        groups: { ...entities.groups, ...updates.groups },
        players: { ...entities.players, ...updates.players }
      }));
    }
  };
})();

// Simplified entity cleanup function
function cleanEntitiesForChunk(chunkKey) {
  entityStore.update(entities => {
    // Create a cleanup function to reuse for each entity type
    const removeChunkEntities = (entityMap) => {
      const result = { ...entityMap };
      Object.keys(result).forEach(key => {
        if (result[key]?.chunkKey === chunkKey) delete result[key];
      });
      return result;
    };
    
    return {
      structure: removeChunkEntities(entities.structure),
      groups: removeChunkEntities(entities.groups),
      players: removeChunkEntities(entities.players)
    };
  });
}

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
}

// Simplified entity access function
export function getEntitiesAt(x, y) {
  const entities = get(entityStore);
  const locationKey = `${x},${y}`;

  return {
    structure: entities.structure[locationKey],
    unitGroup: entities.groups[locationKey],
    player: entities.players[locationKey]
  };
}

// Unified cleanup function
export function cleanupChunkSubscriptions() {
  for (const [chunkKey, unsubscribe] of activeChunkSubscriptions.entries()) {
    if (typeof unsubscribe === 'function') unsubscribe();
    activeChunkSubscriptions.delete(chunkKey);
  }
}

// Simplified derived store
export const targetStore = derived(
  map,
  $map => {
    const { x, y } = $map.target;
    return { x, y, ...terrain.getTerrainData(x, y) };
  }
);

// Simplified map resizing function
export function resizeMap(mapElement) {
  if (!mapElement) return;
  
  map.update(state => {
    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const tileSizePx = TILE_SIZE * baseFontSize;
    const width = mapElement.clientWidth;
    const height = mapElement.clientHeight;

    // Ensure odd numbers for centered positioning
    let cols = Math.ceil(width / tileSizePx);
    cols = cols % 2 === 0 ? cols - 1 : cols;

    let rows = Math.ceil(height / tileSizePx);
    rows = rows % 2 === 0 ? rows - 1 : rows;

    cols = Math.max(cols, 5);
    rows = Math.max(rows, 5);

    // Calculate center position directly
    const viewportCenterX = Math.floor(cols / 2);
    const viewportCenterY = Math.floor(rows / 2);

    return {
      ...state,
      cols,
      rows,
      offsetX: viewportCenterX + state.target.x,
      offsetY: viewportCenterY + state.target.y,
    };
  });
}

// Simplified setup function
export function setup() {
  map.update(state => state.ready ? state : { ...state, ready: true });
}

// Unified map movement function
export function moveTarget(newX, newY) {
  map.update(prev => {
    const x = newX !== undefined ? Math.round(newX) : prev.target.x;
    const y = newY !== undefined ? Math.round(newY) : prev.target.y;

    // Calculate viewport offset
    const viewportCenterX = Math.floor(prev.cols / 2);
    const viewportCenterY = Math.floor(prev.rows / 2);

    return {
      ...prev,
      target: { x, y },
      offsetX: viewportCenterX + x,
      offsetY: viewportCenterY + y,
      hoveredTile: null // Reset hover when moving
    };
  });
}

// Unified drag handling
export function handleDragAction(event, sensitivity = 1, dragSource = 'map') {
  const state = get(map);
  
  // Start drag
  if (event.type === 'dragstart' || event.type === 'touchstart') {
    const clientX = event.clientX || event.touches?.[0]?.clientX || 0;
    const clientY = event.clientY || event.touches?.[0]?.clientY || 0;
    
    map.update(state => ({
      ...state,
      isDragging: true,
      dragStartX: clientX,
      dragStartY: clientY,
      dragAccumX: 0,
      dragAccumY: 0,
      dragSource
    }));
    
    return true;
  }
  
  // Process drag
  else if (event.type === 'dragmove' || event.type === 'touchmove') {
    if (!state.isDragging || state.dragSource !== dragSource) return false;
    
    const clientX = event.clientX || event.touches?.[0]?.clientX || 0;
    const clientY = event.clientY || event.touches?.[0]?.clientY || 0;
    
    const deltaX = clientX - state.dragStartX;
    const deltaY = clientY - state.dragStartY;

    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const tileSizePx = TILE_SIZE * baseFontSize;
    const adjustedTileSize = tileSizePx * sensitivity;

    const dragAccumX = (state.dragAccumX || 0) + deltaX;
    const dragAccumY = (state.dragAccumY || 0) + deltaY;

    const cellsMovedX = Math.round(dragAccumX / adjustedTileSize);
    const cellsMovedY = Math.round(dragAccumY / adjustedTileSize);

    if (cellsMovedX === 0 && cellsMovedY === 0) {
      map.update(state => ({
        ...state,
        dragStartX: clientX,
        dragStartY: clientY,
        dragAccumX,
        dragAccumY
      }));
      return false;
    }

    const newX = state.target.x - cellsMovedX;
    const newY = state.target.y - cellsMovedY;
    const remainderX = dragAccumX - (cellsMovedX * adjustedTileSize);
    const remainderY = dragAccumY - (cellsMovedY * adjustedTileSize);

    moveTarget(newX, newY);

    map.update(state => ({
      ...state,
      dragStartX: clientX,
      dragStartY: clientY,
      dragAccumX: remainderX,
      dragAccumY: remainderY
    }));

    return true;
  }
  
  // End drag
  else if (event.type === 'dragend' || event.type === 'touchend' || event.type === 'touchcancel') {
    if (!state.isDragging || state.dragSource !== dragSource) return false;
    
    map.update(state => ({
      ...state,
      isDragging: false,
      dragAccumX: 0,
      dragAccumY: 0,
      dragSource: null
    }));
    
    return true;
  }
  
  return false;
}

// Simple hover state management
export function updateHoveredTile(x, y) {
  map.update(state => ({
    ...state,
    hoveredTile: x !== null && y !== null ? { x, y } : null
  }));
}

// Unified grid generation
export const coordinates = derived(
  [map, entityStore],
  ([$map, $entities], set) => {
    // Check if map is ready before computing
    if (!$map.ready) {
      set([]);
      return;
    }
    
    const useExpanded = $map.minimapVisible;
    const gridCols = useExpanded ? Math.min($map.cols * GRID_COLS_FACTOR) : $map.cols;
    const gridRows = useExpanded ? Math.min($map.rows * GRID_ROWS_FACTOR) : $map.rows;
    const viewportCenterX = Math.floor(gridCols / 2);
    const viewportCenterY = Math.floor(gridRows / 2);
    const targetX = $map.target.x;
    const targetY = $map.target.y;

    const result = [];
    const hoveredX = $map.hoveredTile?.x;
    const hoveredY = $map.hoveredTile?.y;

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
        
        // Add entity information
        const structure = $entities.structure[locationKey];
        const unitGroup = $entities.groups[locationKey];
        const player = $entities.players[locationKey];
        
        result.push({
          x: globalX,
          y: globalY,
          isCenter: x === viewportCenterX && y === viewportCenterY,
          isInMainView,
          chunkKey,
          biome: terrainData.biome,
          color: terrainData.color,
          highlighted: hoveredX === globalX && hoveredY === globalY,
          hasStructure: !!structure,
          hasUnitGroup: !!unitGroup,
          hasPlayer: !!player,
          structure,
          unitGroup,
          player
        });
      }
    }

    // Only update chunks when map is ready
    if ($map.ready) updateChunks(result);
    set(result);
  },
  []
);