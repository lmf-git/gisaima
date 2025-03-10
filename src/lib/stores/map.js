import { writable, derived, get } from 'svelte/store';
import { TerrainGenerator } from '../map/noise.js';

// Initialize the terrain generator with a fixed seed
const WORLD_SEED = 454232;
const terrain = new TerrainGenerator(WORLD_SEED);

// Configuration constants
export const KEYBOARD_MOVE_SPEED = 200;
export const CHUNK_SIZE = 20;
export const TILE_SIZE = 7.5;
export const DRAG_CHECK_INTERVAL = 500;

// Expansion factor for calculating larger grid area
export const GRID_EXPANSION_FACTOR = 3;

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
  centerTileData: null,
  
  // Hover state for highlighting tiles
  hoveredTile: null
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

// Improved terrain caching and update system
const TARGET_TILE_STORE = writable({
  coordinates: { x: 0, y: 0 },
  data: null
});

// Create a derived store specifically for the target tile data
// This only updates when coordinates change
export const targetTileStore = derived(
  [mapState, TARGET_TILE_STORE],
  ([$mapState, $targetTileStore]) => {
    const { x, y } = $mapState.targetCoord;
    
    // Only recalculate if coordinates changed
    if (x !== $targetTileStore.coordinates.x || y !== $targetTileStore.coordinates.y) {
      const tileData = getTerrainData(x, y);
      
      // Update the store behind the scenes
      TARGET_TILE_STORE.set({
        coordinates: { x, y },
        data: tileData
      });
      
      return {
        x, y,
        ...tileData
      };
    }
    
    // Return cached data if coordinates haven't changed
    return {
      x, y,
      ...$targetTileStore.data
    };
  }
);

// Optimize terrain data fetching
export function getTerrainData(x, y) {
  // Create a cache key
  const cacheKey = `${x},${y}`;
  
  // Check if result is in cache
  if (terrainCache.has(cacheKey)) {
    return terrainCache.get(cacheKey);
  }
  
  // Reduce logging frequency even further
  if (Math.random() < 0.01) {
    console.log(`Computing new terrain data for: (${x}, ${y})`);
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
    if (state.keysPressed.has("a") || state.keysPressed.has("arrowleft")) xChange += 1;
    if (state.keysPressed.has("d") || state.keysPressed.has("arrowright")) xChange -= 1;
    if (state.keysPressed.has("w") || state.keysPressed.has("arrowup")) yChange += 1;
    if (state.keysPressed.has("s") || state.keysPressed.has("arrowdown")) yChange -= 1;

    if (xChange === 0 && yChange === 0) return state;
    
    // Round the coordinates for consistent movement, especially diagonal
    const newTargetX = Math.round(state.targetCoord.x - xChange);
    const newTargetY = Math.round(state.targetCoord.y - yChange);
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
    dragStartY: event.clientY,
    // Track accumulated sub-tile movements for smoother dragging
    dragAccumX: 0,
    dragAccumY: 0
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
    
    // Calculate movement with increased sensitivity (60% of original tile size)
    const sensitivity = 0.6; 
    const adjustedTileSize = tileSizePx * sensitivity;
    
    // Add current movement to accumulated sub-tile movements
    const dragAccumX = (state.dragAccumX || 0) + deltaX;
    const dragAccumY = (state.dragAccumY || 0) + deltaY;
    
    // Calculate cells moved including fractional movement
    const cellsMovedX = Math.round(dragAccumX / adjustedTileSize);
    const cellsMovedY = Math.round(dragAccumY / adjustedTileSize);
    
    // Only update if we've accumulated enough movement
    if (cellsMovedX === 0 && cellsMovedY === 0) {
      return {
        ...state,
        dragStartX: event.clientX,
        dragStartY: event.clientY,
        dragAccumX,
        dragAccumY
      };
    }
    
    result = true;
    // Round the coordinates for consistent movement, especially diagonal
    const newTargetX = Math.round(state.targetCoord.x - cellsMovedX);
    const newTargetY = Math.round(state.targetCoord.y - cellsMovedY);
    
    // Keep remaining sub-tile movement for next drag event
    const remainderX = dragAccumX - (cellsMovedX * adjustedTileSize);
    const remainderY = dragAccumY - (cellsMovedY * adjustedTileSize);
    
    return {
      ...state,
      targetCoord: { x: newTargetX, y: newTargetY },
      offsetX: state.centerX + newTargetX,
      offsetY: state.centerY + newTargetY,
      dragStartX: event.clientX,
      dragStartY: event.clientY,
      dragAccumX: remainderX,
      dragAccumY: remainderY
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
      isDragging: false,
      dragAccumX: 0, // Reset accumulated movement
      dragAccumY: 0
    };
  });
  
  if (wasDragging) {
    document.body.style.cursor = "default";
    return true;
  }
  
  return false;
}

// Open details modal - simplify and make more reliable
export function openDetailsModal() {
  console.log("openDetailsModal called with more direct implementation");
  
  const state = get(mapState);
  const { x, y } = state.targetCoord;
  
  console.log(`Opening details for (${x}, ${y})`);
  
  // Set it directly without complex conditionals
  mapState.set({
    ...state,
    showDetailsModal: true
  });
}

// Close details modal
export function closeDetailsModal() {
  console.log("closeDetailsModal called");
  
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

// Replace expandedGridArray with a more reliable implementation
export const expandedGridArray = derived(
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
    if (expandedGridArray.lastKey === currentKey) {
      return; // Skip update if nothing changed
    }
    expandedGridArray.lastKey = currentKey;

    // Calculate expanded dimensions (ensure odd numbers for center tile)
    const expandedCols = Math.min($mapState.cols * GRID_EXPANSION_FACTOR, 51); // Limit to reasonable size
    const expandedRows = Math.min($mapState.rows * GRID_EXPANSION_FACTOR, 51); // Limit to reasonable size
    
    // Calculate offset for the larger grid
    const centerOffsetX = Math.floor(expandedCols / 2);
    const centerOffsetY = Math.floor(expandedRows / 2);
    
    console.log(`Calculating expanded grid: ${expandedCols}x${expandedRows}`);
    
    try {
      const result = [];
      
      for (let y = 0; y < expandedRows; y++) {
        for (let x = 0; x < expandedCols; x++) {
          const globalX = x - centerOffsetX + $mapState.targetCoord.x;
          const globalY = y - centerOffsetY + $mapState.targetCoord.y;
          const terrainData = getTerrainData(globalX, globalY);
          
          // Check if this cell is visible in the main grid view
          const isInMainView = 
            x >= centerOffsetX - Math.floor($mapState.cols / 2) && 
            x <= centerOffsetX + Math.floor($mapState.cols / 2) &&
            y >= centerOffsetY - Math.floor($mapState.rows / 2) && 
            y <= centerOffsetY + Math.floor($mapState.rows / 2);
            
          const isCenter = x === centerOffsetX && y === centerOffsetY;
          
          result.push({
            x: globalX,
            y: globalY,
            isCenter,
            isInMainView,
            ...terrainData
          });
        }
      }
      
      console.log(`Generated expanded grid with ${result.length} tiles`);
      set(result);
    } catch (error) {
      console.error("Error generating expanded grid:", error);
      set([]);
    }
  },
  []
);

// Optimize the grid array generation with better memoization
export const gridArray = (() => {
  let lastOffsetX = null;
  let lastOffsetY = null;
  let lastCols = null;
  let lastRows = null;
  let cachedResult = [];

  return derived(
    expandedGridArray,
    ($expandedGrid) => {
      const state = get(mapState);
      
      // Check if we really need to recalculate
      if (lastOffsetX === state.offsetX && 
          lastOffsetY === state.offsetY && 
          lastCols === state.cols &&
          lastRows === state.rows &&
          cachedResult.length > 0) {
        return cachedResult;
      }
      
      // Update our tracking variables
      lastOffsetX = state.offsetX;
      lastOffsetY = state.offsetY;
      lastCols = state.cols;
      lastRows = state.rows;
      
      // Filter the grid
      cachedResult = $expandedGrid.filter(cell => cell.isInMainView);
      return cachedResult;
    }
  );
})();

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

// Add a new function to handle hover state updates
export function updateHoveredTile(x, y) {
  mapState.update(state => ({
    ...state,
    hoveredTile: x !== null && y !== null ? { x, y } : null
  }));
}

// Add a function to clear hover state
export function clearHoveredTile() {
  mapState.update(state => ({
    ...state,
    hoveredTile: null
  }));
}
