import { writable, derived, get } from 'svelte/store';
import { TerrainGenerator } from '../map/noise.js';
import { ref, onValue } from "firebase/database";
import { db } from '../firebase/database.js';

// Initialize the terrain generator with a fixed seed
const WORLD_SEED = 454232;
const terrain = new TerrainGenerator(WORLD_SEED);

// Configuration constants
export const KEYBOARD_MOVE_SPEED = 200;
export const CHUNK_SIZE = 20;
export const TILE_SIZE = 5;
// Replace single expansion factor with separate factors for columns and rows
export const GRID_COLS_FACTOR = 3.5;
export const GRID_ROWS_FACTOR = 2.85;

// Track active chunk subscriptions
const activeChunkSubscriptions = new Map();
let isCleaningUp = false;

// Create a store using Svelte's store API
export const mapState = writable({ 
  isReady: false,
  cols: 0, 
  rows: 0,
  offsetX: 0, 
  offsetY: 0,
  centerX: 0,
  centerY: 0,
  centerCoord: { x: 0, y: 0 }, // Renamed from targetCoord for clarity
  chunks: new Set(),
  hoveredTile: null,
  showDetails: false,
  isDragging: false,
  isMouseActuallyDown: false,
  dragStartX: 0,
  dragStartY: 0,
  keysPressed: new Set(),
  keyboardNavigationInterval: null,
  
  entities: {
    structure: {},
    groups: {},   
    players: {},  
  },

  _entityChangeCounter: 0,
  minimapVisible: true,
});

// Export mapReady derived store for use across components
export const mapReady = derived(
  mapState,
  $mapState => $mapState.isReady
);

// Centralized cache for terrain data
const terrainCache = new Map();

// Chunk utilities
export function getChunkKey(x, y) {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
}

// Store raw chunk data for debugging
const rawChunkData = new Map();

// Firebase interaction
function subscribeToChunk(chunkKey) {
  if (activeChunkSubscriptions.has(chunkKey)) return;
  
  try {
    const chunkRef = ref(db, `chunks/${chunkKey}`);
    
    const unsubscribe = onValue(chunkRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        rawChunkData.set(chunkKey, data);
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

// Simplified chunk data handling
const chunkLastUpdated = new Map();
function handleChunkData(chunkKey, data) {
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
    Promise.resolve().then(() => {
      mapState.update(state => {
        return {
          ...state,
          entities: {
            structure: { ...state.entities.structure, ...structureUpdates },
            groups: { ...state.entities.groups, ...groupUpdates },
            players: { ...state.entities.players, ...playerUpdates }
          },
          _entityChangeCounter: state._entityChangeCounter + 1
        };
      });
    });
  }
}

function cleanEntitiesForChunk(chunkKey) {
  mapState.update(state => {
    const newEntities = {
      structure: { ...state.entities.structure },
      groups: { ...state.entities.groups },
      players: { ...state.entities.players }
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
    
    return {
      ...state,
      entities: newEntities
    };
  });
}

// Chunk management
let lastGridHash = '';
let lastUpdateTime = 0;
const UPDATE_THROTTLE = 300; // ms between chunk updates

export function updateChunks(gridArray) {
  if (!gridArray || gridArray.length === 0) return;
  
  const chunkKeys = new Set();
  gridArray.forEach(cell => {
    chunkKeys.add(getChunkKey(cell.x, cell.y));
  });
  
  // Simple comparison without hash
  const state = get(mapState);
  const currentKeys = [...state.chunks].sort().join(',');
  const newKeys = [...chunkKeys].sort().join(',');
  if (currentKeys === newKeys) return;
  
  mapState.update(state => {
    const added = [...chunkKeys].filter(key => !state.chunks.has(key));
    const removed = [...state.chunks].filter(key => !chunkKeys.has(key));
    
    added.forEach(subscribeToChunk);
    removed.forEach(unsubscribeFromChunk);

    return {
      ...state,
      chunks: chunkKeys
    };
  });
}

// Entity access functions
export function getEntitiesAt(x, y) {
  const state = get(mapState);
  const locationKey = `${x},${y}`;
  
  const structure = state.entities.structure[locationKey];
  const unitGroup = state.entities.groups[locationKey];
  const player = state.entities.players[locationKey];
  
  return { structure, unitGroup, player };
}

// Cleanup function
export function cleanupChunkSubscriptions() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  
  try {
    const activeChunkKeys = Array.from(activeChunkSubscriptions.keys());
    
    activeChunkKeys.forEach(chunkKey => {
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
    
    mapState.update(state => ({
      ...state,
      chunks: new Set()
    }));
    
    rawChunkData.clear();
  } finally {
    isCleaningUp = false;
  }
}

// Simplify the TARGET_TILE_STORE to CENTERED_TILE_STORE for clarity
const CENTERED_TILE_STORE = writable({
  coordinates: { x: 0, y: 0 },
  data: null
});

export const centerTileStore = derived(
  [mapState, CENTERED_TILE_STORE],
  ([$mapState, $centeredTileStore]) => {
    const { x, y } = $mapState.centerCoord;
    
    if (x !== $centeredTileStore.coordinates.x || y !== $centeredTileStore.coordinates.y) {
      const tileData = getTerrainData(x, y);
      
      CENTERED_TILE_STORE.set({
        coordinates: { x, y },
        data: tileData
      });
      
      return { x, y, ...tileData };
    }
    
    return { x, y, ...$centeredTileStore.data };
  }
);

// Map dimensions and positioning
export function resizeMap(mapElement) {
  mapState.update(state => {
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
    
    const centerX = Math.floor(cols / 2);
    const centerY = Math.floor(rows / 2);
    
    const offsetX = centerX + state.centerCoord.x;
    const offsetY = centerY + state.centerCoord.y;
    
    const initialTileData = getTerrainData(state.centerCoord.x, state.centerCoord.y);
    
    CENTERED_TILE_STORE.set({
      coordinates: { x: state.centerCoord.x, y: state.centerCoord.y },
      data: initialTileData
    });
    
    // Load chunks directly if ready instead of using setTimeout
    if (state.isReady) {
      loadInitialChunksForCenter();
    }
    
    return {
      ...state,
      cols,
      rows,
      centerX,
      centerY,
      offsetX,
      offsetY,
      isReady: true
    };
  });
}

// Movement functions - rename moveMapTo for clarity
export function moveCenterTo(newX, newY) {  
  mapState.update(prev => {
    const roundedX = newX !== undefined ? Math.round(newX) : prev.centerCoord.x;
    const roundedY = newY !== undefined ? Math.round(newY) : prev.centerCoord.y;
    
    const newOffsetX = prev.centerX + roundedX;
    const newOffsetY = prev.centerY + roundedY;
    
    return {
      ...prev,
      centerCoord: { x: roundedX, y: roundedY },
      offsetX: newOffsetX,
      offsetY: newOffsetY,
      hoveredTile: null
    };
  });
}

// Keep moveMapTo for backward compatibility
export const moveMapTo = moveCenterTo;

// Update all other functions that use targetCoord to use centerCoord instead
export function moveMapByKeys() {
  let xChange = 0;
  let yChange = 0;
  
  const state = get(mapState);
  if (state.keysPressed.has("a") || state.keysPressed.has("arrowleft")) xChange += 1;
  if (state.keysPressed.has("d") || state.keysPressed.has("arrowright")) xChange -= 1;
  if (state.keysPressed.has("w") || state.keysPressed.has("arrowup")) yChange += 1;
  if (state.keysPressed.has("s") || state.keysPressed.has("arrowdown")) yChange -= 1;

  if (xChange === 0 && yChange === 0) return;
  
  moveCenterTo(state.centerCoord.x - xChange, state.centerCoord.y - yChange);
}

// Drag functionality
export function startDrag(event) {
  if (event.button !== 0) return false;
  
  mapState.update(state => ({
    ...state,
    isDragging: true,
    isMouseActuallyDown: true,
    dragStartX: event.clientX,
    dragStartY: event.clientY,
    dragAccumX: 0,
    dragAccumY: 0
  }));
  
  document.body.style.cursor = "grabbing";
  return true;
}

export function drag(event) {
  const state = get(mapState);
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
    mapState.update(state => ({
      ...state,
      dragStartX: event.clientX,
      dragStartY: event.clientY,
      dragAccumX,
      dragAccumY
    }));
    return false;
  }
  
  const newX = state.centerCoord.x - cellsMovedX;
  const newY = state.centerCoord.y - cellsMovedY;
  
  const remainderX = dragAccumX - (cellsMovedX * adjustedTileSize);
  const remainderY = dragAccumY - (cellsMovedY * adjustedTileSize);
  
  moveCenterTo(newX, newY);
  
  mapState.update(state => ({
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
  
  mapState.update(state => {
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

// Modal functionality
export function openDetailsModal() {
  mapState.update(state => ({
    ...state,
    showDetails: true
  }));
}

export function closeDetailsModal() {
  mapState.update(state => ({
    ...state,
    showDetails: false
  }));
}

// Misc utilities
export function checkDragState() {
  let fixed = false;
  
  mapState.update(state => {
    if (!state.isMouseActuallyDown && state.isDragging) {
      fixed = true;
      return {
        ...state,
        isDragging: false
      };
    }
    return state;
  });
  
  if (fixed) {
    document.body.style.cursor = "default";
    return true;
  }
  
  return false;
}

export function setMinimapVisibility(isVisible) {
  mapState.update(state => ({
    ...state,
    minimapVisible: isVisible
  }));
}

// Grid generation with better caching
let lastGridGenTime = 0;
const GRID_GEN_THROTTLE = 200; // ms between grid generations
let expandedGridCache = [];

export const expandedGridArray = derived(
  mapState,
  ($mapState, set) => {
    // Early return if not ready
    if (!$mapState.isReady) {
      set([]);
      return;
    }

    try {
      const useExpanded = $mapState.minimapVisible;
      
      // Use separate factors for columns and rows
      const gridCols = useExpanded 
        ? Math.min($mapState.cols * GRID_COLS_FACTOR, 51)
        : $mapState.cols;
      const gridRows = useExpanded 
        ? Math.min($mapState.rows * GRID_ROWS_FACTOR, 51)
        : $mapState.rows;
      
      const centerOffsetX = Math.floor(gridCols / 2);
      const centerOffsetY = Math.floor(gridRows / 2);
      
      const result = [];
      
      for (let y = 0; y < gridRows; y++) {
        for (let x = 0; x < gridCols; x++) {
          const globalX = x - centerOffsetX + $mapState.centerCoord.x;
          const globalY = y - centerOffsetY + $mapState.centerCoord.y;
          
          const chunkKey = getChunkKey(globalX, globalY);
          const terrainData = getTerrainData(globalX, globalY);
          
          let isInMainView = true;
          
          if (useExpanded) {
            isInMainView = 
              x >= centerOffsetX - Math.floor($mapState.cols / 2) && 
              x <= centerOffsetX + Math.floor($mapState.cols / 2) &&
              y >= centerOffsetY - Math.floor($mapState.rows / 2) && 
              y <= centerOffsetY + Math.floor($mapState.rows / 2);
          }
          
          result.push({
            x: globalX,
            y: globalY,
            isCenter: x === centerOffsetX && y === centerOffsetY,
            isInMainView,
            chunkKey,
            biome: terrainData.biome,
            color: terrainData.color
          });
        }
      }
      
      updateChunks(result);
      set(result);
    } catch (error) {
      console.error("Error generating grid:", error);
      set([]);
    }
  },
  []
);

// Simplified grid array derived store
export const gridArray = derived(
  expandedGridArray,
  ($expandedGrid) => $expandedGrid?.filter(cell => cell.isInMainView) || []
);

// Axis arrays
export const xAxisArray = derived(
  mapState,
  ($mapState) => {
    if (!$mapState.isReady) return [];
    return Array.from({ length: $mapState.cols }, (_, x) => ({
      value: $mapState.centerCoord.x - ($mapState.centerX - x),
      isCenter: x === $mapState.centerX
    }));
  }
);

export const yAxisArray = derived(
  mapState,
  ($mapState) => {
    if (!$mapState.isReady) return [];
    return Array.from({ length: $mapState.rows }, (_, y) => ({
      value: $mapState.centerCoord.y - ($mapState.centerY - y),
      isCenter: y === $mapState.centerY
    }));
  }
);

// Hover state management
export function updateHoveredTile(x, y) {
  mapState.update(state => ({
    ...state,
    hoveredTile: x !== null && y !== null ? { x, y } : null
  }));
}

// Terrain data with better caching
export function getTerrainData(x, y) {
  const cacheKey = `${x},${y}`;
  
  if (terrainCache.has(cacheKey)) {
    return terrainCache.get(cacheKey);
  }
  
  const result = terrain.getTerrainData(x, y);
  terrainCache.set(cacheKey, result);
  
  return result;
}

// Minimap range tracking
const minimapRange = {
  centerX: 0,
  centerY: 0,
  rangeX: 0,
  rangeY: 0
};

export function updateMinimapRange(centerX, centerY, rangeX, rangeY) {
  Object.assign(minimapRange, {
    centerX,
    centerY,
    rangeX,
    rangeY
  });
  
  return minimapRange;
}

export function getMinimapRange() {
  return minimapRange;
}

// Entity loading
export function loadInitialChunksForCenter() {
  const state = get(mapState);
  if (!state.isReady || !state.centerCoord) return;
  
  const halfWidth = Math.floor(state.cols / 2) + 1;
  const halfHeight = Math.floor(state.rows / 2) + 1;
  
  const minX = state.centerCoord.x - halfWidth;
  const maxX = state.centerCoord.x + halfWidth;
  const minY = state.centerCoord.y - halfHeight;
  const maxY = state.centerCoord.y + halfHeight;
  
  const chunkKeys = new Set();
  
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      chunkKeys.add(getChunkKey(x, y));
    }
  }
  
  const chunksArray = Array.from(chunkKeys);
  
  mapState.update(state => ({
    ...state,
    chunks: chunkKeys
  }));
  
  // Process existing chunks immediately
  chunksArray.forEach(chunkKey => {
    subscribeToChunk(chunkKey);
    
    const existingData = rawChunkData.get(chunkKey);
    if (existingData) {
      handleChunkData(chunkKey, existingData);
    }
  });
  
  // Force entity display immediately instead of using setTimeout
  forceEntityDisplay();
  
  return chunksArray.length;
}

export function forceEntityDisplay() {
  mapState.update(state => {
    const chunks = [...state.chunks];
    
    chunks.forEach(chunkKey => {
      const data = rawChunkData.get(chunkKey);
      if (data) {
        handleChunkData(chunkKey, data);
      }
    });
    
    return {
      ...state,
      _entityChangeCounter: state._entityChangeCounter + 1
    };
  });
}

export function cleanupInternalIntervals() {
  try {
    const state = get(mapState);
    
    if (state.keyboardNavigationInterval) {
      clearInterval(state.keyboardNavigationInterval);
      mapState.update(state => ({ ...state, keyboardNavigationInterval: null }));
    }
    
    return true;
  } catch (err) {
    console.error("Error cleaning up intervals:", err);
    return false;
  }
}
