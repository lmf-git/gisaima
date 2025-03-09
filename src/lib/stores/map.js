import { writable, derived, get } from 'svelte/store';
import { TerrainGenerator } from '../map/noise.js';

// Initialize the terrain generator with a fixed seed
const WORLD_SEED = 12345;
const terrain = new TerrainGenerator(WORLD_SEED);

// Configuration constants
export const KEYBOARD_MOVE_SPEED = 200;
export const CHUNK_SIZE = 20;
export const TILE_SIZE = 7.5;
export const DRAG_CHECK_INTERVAL = 500;

// Create a store using Svelte's store API since $state is only for component scripts
export const mapState = writable({
  // Position and drag state
  isDragging: false,
  isMouseActuallyDown: false,
  dragStartX: 0,
  dragStartY: 0,
  targetCoord: { x: 0, y: 0 },
  
  // UI state
  showDetailsModal: false,
  keysPressed: new Set(),
  keyboardNavigationInterval: null,
  
  // Map elements
  cols: 0, 
  rows: 0,
  isReady: false,
  offsetX: 0, 
  offsetY: 0,
  visibleChunks: new Set(),
  dragStateCheckInterval: null,
  centerX: 0,
  centerY: 0,
  
  // Center tile data for Details component
  centerTileData: null
});

// Helper function to update state
function updateMapState(updates) {
  mapState.update(state => ({ ...state, ...updates }));
}

// Map computation functions
export function getChunkKey(x, y) {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
}

// Use a more functional approach for the updateChunks function
export function updateChunks(gridArray) {
  mapState.update(state => {
    const newVisibleChunks = new Set(
      gridArray.map(cell => getChunkKey(cell.x, cell.y))
    );

    // Log only the changes for better performance
    const added = [...newVisibleChunks].filter(key => !state.visibleChunks.has(key));
    const removed = [...state.visibleChunks].filter(key => !newVisibleChunks.has(key));
    
    if (added.length > 0) console.log(`Chunks loaded: ${added.join(', ')}`);
    if (removed.length > 0) console.log(`Chunks unloaded: ${removed.join(', ')}`);

    return {
      ...state,
      visibleChunks: newVisibleChunks
    };
  });
}

// Get terrain data for a specific coordinate - with logging throttling
// Create a cache to prevent redundant terrain calculations
let terrainCache = new Map();
const CACHE_SIZE_LIMIT = 1000; // Limit cache size to prevent memory issues

// Get terrain data for a specific coordinate
export function getTerrainData(x, y) {
  // Create a cache key
  const cacheKey = `${x},${y}`;
  
  // Check if result is in cache
  if (terrainCache.has(cacheKey)) {
    return terrainCache.get(cacheKey);
  }
  
  // Throttle logging - only log every 10th call or on specific events
  if (Math.random() < 0.1) {
    console.log(`Fetching terrain data for: (${x}, ${y})`);
  }
  
  // Calculate the terrain data
  const result = terrain.getTerrainData(x, y);
  
  // Cache the result
  terrainCache.set(cacheKey, result);
  
  // If cache gets too large, delete oldest entries
  if (terrainCache.size > CACHE_SIZE_LIMIT) {
    const keysToRemove = Array.from(terrainCache.keys()).slice(0, 100);
    keysToRemove.forEach(key => terrainCache.delete(key));
  }
  
  return result;
}

// Resize the map grid
export function resizeMap(mapElement) {
  if (!mapElement) return;
  
  mapState.update(state => {
    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const tileSizePx = TILE_SIZE * baseFontSize;
    const width = mapElement.clientWidth;
    const height = mapElement.clientHeight;
    
    let cols = Math.ceil(width / tileSizePx);
    cols = cols % 2 === 0 ? cols - 1 : cols;
    
    let rows = Math.ceil(height / tileSizePx);
    rows = rows % 2 === 0 ? rows - 1 : rows;
    
    const centerX = Math.floor(cols / 2);
    const centerY = Math.floor(rows / 2);
    
    const offsetX = centerX + state.targetCoord.x;
    const offsetY = centerY + state.targetCoord.y;
    
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

// Move map via keyboard
export function moveMapByKeys() {
  let xChange = 0;
  let yChange = 0;

  mapState.update(state => {
    if (state.keysPressed.has("a") || state.keysPressed.has("arrowleft")) xChange -= 1;
    if (state.keysPressed.has("d") || state.keysPressed.has("arrowright")) xChange += 1;
    if (state.keysPressed.has("w") || state.keysPressed.has("arrowup")) yChange -= 1;
    if (state.keysPressed.has("s") || state.keysPressed.has("arrowdown")) yChange += 1;

    if (xChange === 0 && yChange === 0) return state;
    
    const newTargetX = state.targetCoord.x - xChange;
    const newTargetY = state.targetCoord.y - yChange;
    const newOffsetX = state.centerX + newTargetX;
    const newOffsetY = state.centerY + newTargetY;
    
    // Get fresh terrain data for the new target coordinates
    const centerTileData = getTerrainData(newTargetX, newTargetY);
    console.log(`Keyboard movement to (${newTargetX}, ${newTargetY}) - Biome: ${centerTileData.biome.name}`);
    
    return {
      ...state,
      targetCoord: { x: newTargetX, y: newTargetY },
      offsetX: newOffsetX,
      offsetY: newOffsetY,
      centerTileData
    };
  });
}

// Simplify the drag functionality
export function startDrag(event) {
  if (event.button !== 0) return false;
  
  mapState.update(state => ({
    ...state,
    isDragging: true,
    isMouseActuallyDown: true,
    dragStartX: event.clientX,
    dragStartY: event.clientY
  }));
  
  document.body.style.cursor = "grabbing";
  return true;
}

export function drag(event) {
  let result = false;
  
  mapState.update(state => {
    if (!state.isDragging) return state;

    const deltaX = event.clientX - state.dragStartX;
    const deltaY = event.clientY - state.dragStartY;
    
    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const tileSizePx = TILE_SIZE * baseFontSize;
    
    const cellsMovedX = Math.round(deltaX / tileSizePx);
    const cellsMovedY = Math.round(deltaY / tileSizePx);
    
    // Only update if we've moved at least one cell
    if (cellsMovedX === 0 && cellsMovedY === 0) return state;
    
    result = true;
    const newTargetX = state.targetCoord.x - cellsMovedX;
    const newTargetY = state.targetCoord.y - cellsMovedY;
    
    return {
      ...state,
      targetCoord: { x: newTargetX, y: newTargetY },
      offsetX: state.centerX + newTargetX,
      offsetY: state.centerY + newTargetY,
      dragStartX: event.clientX,
      dragStartY: event.clientY
    };
  });
  
  // Get terrain data outside of the state update to reduce redraws
  if (result) {
    const state = get(mapState);
    const { x, y } = state.targetCoord;
    const freshTerrainData = getTerrainData(x, y);
    mapState.update(state => ({
      ...state,
      centerTileData: freshTerrainData
    }));
  }
  
  return result;
}

export function stopDrag() {
  let wasDragging = false;
  
  mapState.update(state => {
    if (!state.isDragging) return state;
    
    wasDragging = true;
    return {
      ...state,
      isDragging: false
    };
  });
  
  if (wasDragging) {
    document.body.style.cursor = "default";
    return true;
  }
  
  return false;
}

// Open details modal - fixing target tile to match details
export function openDetailsModal() {
  mapState.update(state => {
    if (state.isReady) {
      const targetX = state.targetCoord.x;
      const targetY = state.targetCoord.y;
      
      const centerTileData = getTerrainData(targetX, targetY);
      console.log(`Opening Details modal for coordinates: (${targetX}, ${targetY}) - Biome: ${centerTileData.biome.name}`);
      
      return {
        ...state,
        showDetailsModal: true,
        centerTileData: { ...centerTileData, x: targetX, y: targetY }
      };
    }
    return {
      ...state,
      showDetailsModal: true
    };
  });
}

// Close details modal
export function closeDetailsModal() {
  mapState.update(state => ({
    ...state,
    showDetailsModal: false
  }));
}

// Check if drag state is consistent
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

// Create derived stores for grid and axis arrays - with optimization
// Add debounce helper at the top with other helpers
function debounce(fn, ms) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

// Add new helper for grid state comparison
function gridStateChanged($mapState, prevState) {
  return !prevState || 
    prevState.cols !== $mapState.cols ||
    prevState.rows !== $mapState.rows ||
    prevState.offsetX !== $mapState.offsetX ||
    prevState.offsetY !== $mapState.offsetY;
}

// Add memoization helper
function memoize(fn) {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (!cache.has(key)) {
      cache.set(key, fn(...args));
    }
    return cache.get(key);
  };
}

// Replace gridArray with memoized version
export const gridArray = derived(
  [mapState],
  ([$mapState], set) => {
    if (!$mapState.isReady) {
      set([]);
      return;
    }

    const getGridKey = () => {
      const { cols, rows, offsetX, offsetY } = $mapState;
      return `${cols}:${rows}:${offsetX}:${offsetY}`;
    };

    const currentKey = getGridKey();
    if (gridArray.lastKey === currentKey) {
      return; // Skip update if nothing changed
    }
    gridArray.lastKey = currentKey;

    const result = Array.from({ length: $mapState.rows }, (_, y) =>
      Array.from({ length: $mapState.cols }, (_, x) => {
        const globalX = x - $mapState.offsetX;
        const globalY = y - $mapState.offsetY;
        const terrainData = getTerrainData(globalX, globalY);
        const isCenter = x === $mapState.centerX && y === $mapState.centerY;
        
        return {
          x: globalX,
          y: globalY,
          isCenter,
          ...terrainData
        };
      })
    ).flat();
    
    set(result);
  },
  []
);

// Replace axis arrays with memoized versions
export const xAxisArray = derived(
  mapState,
  memoize(($mapState) => {
    if (!$mapState.isReady) return [];
    return Array.from({ length: $mapState.cols }, (_, x) => ({
      value: x - $mapState.offsetX,
      isCenter: x === $mapState.centerX
    }));
  })
);

export const yAxisArray = derived(
  mapState,
  memoize(($mapState) => {
    if (!$mapState.isReady) return [];
    return Array.from({ length: $mapState.rows }, (_, y) => ({
      value: y - $mapState.offsetY,
      isCenter: y === $mapState.centerY
    }));
  })
);

// Cleanup function to be called when the app unmounts
export function cleanupMapResources() {
  terrainCache.clear();
  terrainCache = null;
}
