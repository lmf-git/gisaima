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
  ready: false, // Renamed from isReady
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
  keysPressed: new Set(),
  keyboardNavigationInterval: null,
  minimapVisible: true,
});

// Add a derived store for active chunks (for components that need this info)
export const activeChunks = derived(
  map, 
  () => new Set(activeChunkSubscriptions.keys())
);

// Export mapReady derived store for use across components
export const mapReady = derived(
  map,
  $map => $map.ready // Renamed from isReady
);

// Chunk utilities
export function getChunkKey(x, y) {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
}

// Firebase interaction
function subscribeToChunk(chunkKey) {
  if (activeChunkSubscriptions.has(chunkKey)) return;

  try {
    const chunkRef = ref(db, `chunks/${chunkKey}`);

    const unsubscribe = onValue(chunkRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        handleChunkData(chunkKey, data);
      }
    },
      (error) => {
        console.error(`Error subscribing to chunk ${chunkKey}:`, error);
      });

    activeChunkSubscriptions.set(chunkKey, unsubscribe);
  } catch (err) {
    console.error(`Failed to subscribe to chunk ${chunkKey}:`, err);
  }
}

function unsubscribeFromChunk(chunkKey) {
  if (!activeChunkSubscriptions.has(chunkKey)) return false;

  try {
    const unsubscribe = activeChunkSubscriptions.get(chunkKey);
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
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

    let structureUpdates = {};
    let groupUpdates = {};
    let playerUpdates = {};
    let entitiesChanged = false;

    Object.entries(data).forEach(([tileKey, tileData]) => {
      if (tileKey === 'lastUpdated') return;

      const [tileX, tileY] = tileKey.split(',').map(Number);

      if (tileData.structure) {
        structureUpdates[tileKey] = {
          ...tileData.structure,
          chunkKey,
          x: tileX,
          y: tileY
        };
        entitiesChanged = true;
      }

      if (tileData.players) {
        const playerIds = Object.keys(tileData.players);
        if (playerIds.length > 0) {
          const playerId = playerIds[0];
          playerUpdates[tileKey] = {
            ...tileData.players[playerId],
            id: playerId,
            chunkKey,
            x: tileX,
            y: tileY
          };
          entitiesChanged = true;
        }
      }

      if (tileData.groups) {
        const groupIds = Object.keys(tileData.groups);
        if (groupIds.length > 0) {
          const groupId = groupIds[0];
          groupUpdates[tileKey] = {
            ...tileData.groups[groupId],
            id: groupId,
            chunkKey,
            x: tileX,
            y: tileY
          };
          entitiesChanged = true;
        }
      }
    });

    if (entitiesChanged) {
      // Update the entityStore instead of map
      entityStore.update(entities => {
        return {
          structure: { ...entities.structure, ...structureUpdates },
          groups: { ...entities.groups, ...groupUpdates },
          players: { ...entities.players, ...playerUpdates }
        };
      });
    }
  };
})();

function cleanEntitiesForChunk(chunkKey) {
  // Update entityStore instead of map
  entityStore.update(entities => {
    const newEntities = {
      structure: { ...entities.structure },
      groups: { ...entities.groups },
      players: { ...entities.players }
    };

    // Remove entities belonging to this chunk
    Object.keys(newEntities.structure).forEach(locationKey => {
      if (newEntities.structure[locationKey]?.chunkKey === chunkKey) {
        delete newEntities.structure[locationKey];
      }
    });

    Object.keys(newEntities.groups).forEach(locationKey => {
      if (newEntities.groups[locationKey]?.chunkKey === chunkKey) {
        delete newEntities.groups[locationKey];
      }
    });

    Object.keys(newEntities.players).forEach(locationKey => {
      if (newEntities.players[locationKey]?.chunkKey === chunkKey) {
        delete newEntities.players[locationKey];
      }
    });

    return newEntities;
  });
}

// Chunk management
export function updateChunks(gridArray) {
  if (!gridArray || gridArray.length === 0) return;

  const newChunkKeys = new Set();
  gridArray.forEach(cell => {
    newChunkKeys.add(getChunkKey(cell.x, cell.y));
  });

  // Get current chunks directly from activeChunkSubscriptions
  const currentChunks = new Set(activeChunkSubscriptions.keys());
  
  // Simple comparison using Sets
  const added = [...newChunkKeys].filter(key => !currentChunks.has(key));
  const removed = [...currentChunks].filter(key => !newChunkKeys.has(key));
  
  // Quick check if there's any change
  if (added.length === 0 && removed.length === 0) return;

  // Process additions and removals
  added.forEach(subscribeToChunk);
  removed.forEach(unsubscribeFromChunk);
}

// Entity access functions - simplified to use entityStore
export function getEntitiesAt(x, y) {
  const entities = get(entityStore);
  const locationKey = `${x},${y}`;

  return {
    structure: entities.structure[locationKey],
    unitGroup: entities.groups[locationKey],
    player: entities.players[locationKey]
  };
}

// Cleanup function - simplified to use only activeChunkSubscriptions
export function cleanupChunkSubscriptions() {
  const chunks = Array.from(activeChunkSubscriptions.keys());

  chunks.forEach(chunkKey => {
    try {
      const unsubscribe = activeChunkSubscriptions.get(chunkKey);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      activeChunkSubscriptions.delete(chunkKey);
    } catch (err) {
      console.error(`Error unsubscribing from chunk ${chunkKey}:`, err);
    }
  });
}

// This is the public exported store that components use - simplified without cache
export const targetStore = derived(
  map,
  ($map) => {
    const { x, y } = $map.target;
    const tileData = terrain.getTerrainData(x, y);
    return { x, y, ...tileData };
  }
);

// Map dimensions and positioning - simplified to remove chunk loading
export function resizeMap(mapElement) {
  map.update(state => {
    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const tileSizePx = TILE_SIZE * baseFontSize;
    const width = mapElement.clientWidth;
    const height = mapElement.clientHeight;

    let cols = Math.ceil(width / tileSizePx);
    cols = cols % 2 === 0 ? cols - 1 : cols;

    let rows = Math.ceil(height / tileSizePx);
    rows = rows % 2 === 0 ? rows - 1 : rows;

    cols = Math.max(cols, 5);
    rows = Math.max(rows, 5);

    // Calculate center directly - no need to store as separate state properties
    const viewportCenterX = Math.floor(cols / 2);
    const viewportCenterY = Math.floor(rows / 2);

    const offsetX = viewportCenterX + state.target.x;
    const offsetY = viewportCenterY + state.target.y;

    // Remove loadInitialChunksForCenter call - not needed
    return {
      ...state,
      cols,
      rows,
      offsetX,
      offsetY,
    };
  });
}

// Renamed from initializeMap - setup the map once
export function setup() {
  map.update(state => {
    if (state.ready) return state; // Renamed from isReady
    
    // Set initial ready state
    return {
      ...state,
      ready: true // Renamed from isReady
    };
    // Coordinates derived store will automatically trigger chunk loading
  });
}

// Movement functions - renamed for clarity
export function moveTarget(newX, newY) { // Renamed from moveCenterTo
  map.update(prev => {
    const roundedX = newX !== undefined ? Math.round(newX) : prev.target.x; // Renamed from centerCoord
    const roundedY = newY !== undefined ? Math.round(newY) : prev.target.y; // Renamed from centerCoord

    // Calculate viewport center directly when needed
    const viewportCenterX = Math.floor(prev.cols / 2);
    const viewportCenterY = Math.floor(prev.rows / 2);

    const newOffsetX = viewportCenterX + roundedX;
    const newOffsetY = viewportCenterY + roundedY;

    return {
      ...prev,
      target: { x: roundedX, y: roundedY }, // Renamed from centerCoord
      offsetX: newOffsetX,
      offsetY: newOffsetY,
      hoveredTile: null
    };
  });
}

// Update all other functions that use target to use target instead
export function moveMapByKeys() {
  let xChange = 0;
  let yChange = 0;

  const state = get(map);
  if (state.keysPressed.has("a") || state.keysPressed.has("arrowleft")) xChange += 1;
  if (state.keysPressed.has("d") || state.keysPressed.has("arrowright")) xChange -= 1;
  if (state.keysPressed.has("w") || state.keysPressed.has("arrowup")) yChange += 1;
  if (state.keysPressed.has("s") || state.keysPressed.has("arrowdown")) yChange -= 1;

  if (xChange === 0 && yChange === 0) return;

  moveTarget(state.target.x - xChange, state.target.y - yChange); // Renamed from centerCoord and moveCenterTo
}

// Drag functionality
export function startDrag(event) {
  if (event.button !== 0) return false;

  map.update(state => ({
    ...state,
    isDragging: true,
    dragStartX: event.clientX,
    dragStartY: event.clientY,
    dragAccumX: 0,
    dragAccumY: 0
  }));

  document.body.style.cursor = "grabbing";
  return true;
}

export function drag(event) {
  const state = get(map);
  if (!state.isDragging) return false;

  const deltaX = event.clientX - state.dragStartX;
  const deltaY = event.clientY - state.dragStartY;

  const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const tileSizePx = TILE_SIZE * baseFontSize;

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const sensitivity = isTouchDevice ? 0.8 : 0.6;
  const adjustedTileSize = tileSizePx * sensitivity;

  const dragAccumX = (state.dragAccumX || 0) + deltaX;
  const dragAccumY = (state.dragAccumY || 0) + deltaY;

  const cellsMovedX = Math.round(dragAccumX / adjustedTileSize);
  const cellsMovedY = Math.round(dragAccumY / adjustedTileSize);

  if (cellsMovedX === 0 && cellsMovedY === 0) {
    map.update(state => ({
      ...state,
      dragStartX: event.clientX,
      dragStartY: event.clientY,
      dragAccumX,
      dragAccumY
    }));
    return false;
  }

  const newX = state.target.x - cellsMovedX; // Renamed from centerCoord
  const newY = state.target.y - cellsMovedY; // Renamed from centerCoord

  const remainderX = dragAccumX - (cellsMovedX * adjustedTileSize);
  const remainderY = dragAccumY - (cellsMovedY * adjustedTileSize);

  moveTarget(newX, newY); // Renamed from moveCenterTo

  map.update(state => ({
    ...state,
    dragStartX: event.clientX,
    dragStartY: event.clientY,
    dragAccumX: remainderX,
    dragAccumY: remainderY
  }));

  return true;
}

export function stopDrag() {
  let wasDragging = false;

  map.update(state => {
    if (!state.isDragging) return state;

    wasDragging = true;
    return {
      ...state,
      isDragging: false,
      dragAccumX: 0,
      dragAccumY: 0
    };
  });

  if (wasDragging) {
    document.body.style.cursor = "default";
    return true;
  }

  return false;
}

// Grid generation with entities integrated
export const coordinates = derived(
  [map, entityStore],
  ([$map, $entities], set) => {
    const useExpanded = $map.minimapVisible;

    const gridCols = useExpanded
      ? Math.min($map.cols * GRID_COLS_FACTOR)
      : $map.cols;
    const gridRows = useExpanded
      ? Math.min($map.rows * GRID_ROWS_FACTOR)
      : $map.rows;

    // Calculate viewport center directly when needed
    const viewportCenterX = Math.floor(gridCols / 2);
    const viewportCenterY = Math.floor(gridRows / 2);

    const result = [];

    for (let y = 0; y < gridRows; y++) {
      for (let x = 0; x < gridCols; x++) {
        const globalX = x - viewportCenterX + $map.target.x; // Renamed from centerCoord
        const globalY = y - viewportCenterY + $map.target.y; // Renamed from centerCoord
        const locationKey = `${globalX},${globalY}`;

        const chunkKey = getChunkKey(globalX, globalY);
        const terrainData = terrain.getTerrainData(globalX, globalY);

        let isInMainView = true;

        if (useExpanded) {
          isInMainView =
            x >= viewportCenterX - Math.floor($map.cols / 2) &&
            x <= viewportCenterX + Math.floor($map.cols / 2) &&
            y >= viewportCenterY - Math.floor($map.rows / 2) &&
            y <= viewportCenterY + Math.floor($map.rows / 2);
        }
        
        // Add highlighted property directly
        const highlighted = $map.hoveredTile && 
          globalX === $map.hoveredTile.x && 
          globalY === $map.hoveredTile.y;
        
        // Add entity information directly
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
          highlighted,
          // Entity flags for easy rendering
          hasStructure: !!structure,
          hasUnitGroup: !!unitGroup,
          hasPlayer: !!player,
          // Include actual entity data if needed
          structure, 
          unitGroup,
          player
        });
      }
    }

    updateChunks(result);
    set(result);
  },
  []
);

// Hover state management
export function updateHoveredTile(x, y) {
  map.update(state => ({
    ...state,
    hoveredTile: x !== null && y !== null ? { x, y } : null
  }));
}

// Entity loading - simplified to use only activeChunkSubscriptions
export function loadInitialChunksForCenter() {
  const state = get(map);
  if (!state.ready || !state.target) return; // Renamed from isReady

  const halfWidth = Math.floor(state.cols / 2) + 1;
  const halfHeight = Math.floor(state.rows / 2) + 1;

  const minX = state.target.x - halfWidth; // Renamed from centerCoord
  const maxX = state.target.x + halfWidth; // Renamed from centerCoord
  const minY = state.target.y - halfHeight; // Renamed from centerCoord
  const maxY = state.target.y + halfHeight; // Renamed from centerCoord

  const chunkKeys = new Set();

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      chunkKeys.add(getChunkKey(x, y));
    }
  }

  // Process chunks directly without updating map state
  chunkKeys.forEach(chunkKey => {
    if (!activeChunkSubscriptions.has(chunkKey)) {
      subscribeToChunk(chunkKey);
    }
  });

  return chunkKeys.size;
}