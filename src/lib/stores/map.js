import { writable, derived, get } from 'svelte/store';
import { TerrainGenerator } from '../map/noise.js';
// Remove unused Firebase imports and use database from our database.js file
import { ref, onValue } from "firebase/database";
import { db } from "../firebase/database.js";

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

// Track active chunk subscriptions
const activeChunkSubscriptions = new Map();

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
  
  // Remove centerTileData as it's now maintained in TARGET_TILE_STORE
  
  // Hover state for highlighting tiles
  hoveredTile: null,
  
  // Entity data from Firebase chunks
  loadedEntities: {
    structures: {}, // key: "x,y", value: structure data
    unitGroups: {}, // key: "x,y", value: unit group data
    players: {}     // key: "x,y", value: player data
  }
});

// Map computation functions
export function getChunkKey(x, y) {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
}

// Function to get world coordinates from chunk key
export function getChunkCoordinates(chunkKey) {
  const [chunkX, chunkY] = chunkKey.split(',').map(Number);
  return {
    minX: chunkX * CHUNK_SIZE,
    minY: chunkY * CHUNK_SIZE,
    maxX: (chunkX + 1) * CHUNK_SIZE - 1,
    maxY: (chunkX + 1) * CHUNK_SIZE - 1
  };
}

// Subscribe to a chunk in Firebase
function subscribeToChunk(chunkKey) {
  // Don't create duplicate subscriptions
  if (activeChunkSubscriptions.has(chunkKey)) {
    return;
  }
  
  console.log(`Subscribing to chunk: ${chunkKey}`);
  
  // Create reference to this chunk
  const chunkRef = ref(db, `chunks/${chunkKey}`);
  
  // Fix: Create the listener function properly
  const unsubscribe = onValue(chunkRef, (snapshot) => {
    const data = snapshot.exists() ? snapshot.val() : {};
    
    // Process chunk data
    const processedData = {
      structures: data.structures || {},
      unitGroups: data.unitGroups || {},
      players: data.players || {},
      lastUpdated: data.lastUpdated || Date.now()
    };
    
    handleChunkData(chunkKey, processedData);
  }, 
  (error) => {
    console.error(`Error subscribing to chunk ${chunkKey}:`, error);
  });
  
  // Store the unsubscribe function itself
  activeChunkSubscriptions.set(chunkKey, unsubscribe);
}

// Unsubscribe from a chunk
function unsubscribeFromChunk(chunkKey) {
  if (activeChunkSubscriptions.has(chunkKey)) {
    console.log(`Unsubscribing from chunk: ${chunkKey}`);
    const unsubscribe = activeChunkSubscriptions.get(chunkKey);
    unsubscribe(); // Just call the unsubscribe function directly
    activeChunkSubscriptions.delete(chunkKey);
    
    // Clean up entity data for this chunk
    cleanEntitiesForChunk(chunkKey);
    
    return true;
  }
  return false;
}

// Handler for chunk data updates from Firebase
function handleChunkData(chunkKey, data) {
  mapState.update(state => {
    // Create a new entities object to avoid direct mutation
    const newEntities = {
      structures: { ...state.loadedEntities.structures },
      unitGroups: { ...state.loadedEntities.unitGroups },
      players: { ...state.loadedEntities.players }
    };
    
    // Get the coordinates for this chunk
    const { minX, minY, maxX, maxY } = getChunkCoordinates(chunkKey);
    
    // Process and merge structures
    if (data.structures) {
      Object.entries(data.structures).forEach(([locationKey, structureData]) => {
        // Parse the location key "x,y" to validate it's in this chunk
        const [x, y] = locationKey.split(',').map(Number);
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          newEntities.structures[locationKey] = {
            ...structureData,
            chunkKey // Add reference to parent chunk
          };
        }
      });
    }
    
    // Process and merge unit groups
    if (data.unitGroups) {
      Object.entries(data.unitGroups).forEach(([locationKey, unitData]) => {
        const [x, y] = locationKey.split(',').map(Number);
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          newEntities.unitGroups[locationKey] = {
            ...unitData,
            chunkKey
          };
        }
      });
    }
    
    // Process and merge players
    if (data.players) {
      Object.entries(data.players).forEach(([locationKey, playerData]) => {
        const [x, y] = locationKey.split(',').map(Number);
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          newEntities.players[locationKey] = {
            ...playerData,
            chunkKey
          };
        }
      });
    }
    
    return {
      ...state,
      loadedEntities: newEntities
    };
  });
  
  console.log(`Updated data for chunk ${chunkKey}`);
}

// Function to clean entities when chunks are unloaded
function cleanEntitiesForChunk(chunkKey) {
  mapState.update(state => {
    // Create a new entities object to avoid direct mutation
    const newEntities = {
      structures: { ...state.loadedEntities.structures },
      unitGroups: { ...state.loadedEntities.unitGroups },
      players: { ...state.loadedEntities.players }
    };
    
    // Remove all entities belonging to this chunk
    Object.keys(newEntities.structures).forEach(locationKey => {
      if (newEntities.structures[locationKey]?.chunkKey === chunkKey) {
        delete newEntities.structures[locationKey];
      }
    });
    
    Object.keys(newEntities.unitGroups).forEach(locationKey => {
      if (newEntities.unitGroups[locationKey]?.chunkKey === chunkKey) {
        delete newEntities.unitGroups[locationKey];
      }
    });
    
    Object.keys(newEntities.players).forEach(locationKey => {
      if (newEntities.players[locationKey]?.chunkKey === chunkKey) {
        delete newEntities.players[locationKey];
      }
    });
    
    return {
      ...state,
      loadedEntities: newEntities
    };
  });
  
  console.log(`Cleaned entities for chunk ${chunkKey}`);
}

// Enhanced updateChunks function that syncs with Firebase
export function updateChunks(gridArray) {
  mapState.update(state => {
    const newVisibleChunks = new Set(
      gridArray.map(cell => getChunkKey(cell.x, cell.y))
    );

    // Track changes to handle Firebase subscriptions
    const added = [...newVisibleChunks].filter(key => !state.visibleChunks.has(key));
    const removed = [...state.visibleChunks].filter(key => !newVisibleChunks.has(key));
    
    // Log changes
    if (added.length > 0) console.log(`Chunks loaded: ${added.join(', ')}`);
    if (removed.length > 0) console.log(`Chunks unloaded: ${removed.join(', ')}`);
    
    // Subscribe to new chunks
    added.forEach(chunkKey => {
      subscribeToChunk(chunkKey);
    });
    
    // Unsubscribe from old chunks and clean up entity data
    removed.forEach(chunkKey => {
      unsubscribeFromChunk(chunkKey);
    });

    return {
      ...state,
      visibleChunks: newVisibleChunks
    };
  });
}

// Get entities for a specific coordinate
export function getEntitiesAt(x, y) {
  const state = get(mapState);
  const locationKey = `${x},${y}`;
  
  return {
    structure: state.loadedEntities.structures[locationKey],
    unitGroup: state.loadedEntities.unitGroups[locationKey],
    player: state.loadedEntities.players[locationKey]
  };
}

// Check if a coordinate has any entity
export function hasEntityAt(x, y) {
  const entities = getEntitiesAt(x, y);
  return !!(entities.structure || entities.unitGroup || entities.player);
}

// Get all entities within a chunk
export function getEntitiesInChunk(chunkKey) {
  const state = get(mapState);
  const result = {
    structures: {},
    unitGroups: {},
    players: {}
  };
  
  // Filter entities by chunk key
  Object.entries(state.loadedEntities.structures).forEach(([locationKey, data]) => {
    if (data?.chunkKey === chunkKey) {
      result.structures[locationKey] = data;
    }
  });
  
  Object.entries(state.loadedEntities.unitGroups).forEach(([locationKey, data]) => {
    if (data?.chunkKey === chunkKey) {
      result.unitGroups[locationKey] = data;
    }
  });
  
  Object.entries(state.loadedEntities.players).forEach(([locationKey, data]) => {
    if (data?.chunkKey === chunkKey) {
      result.players[locationKey] = data;
    }
  });
  
  return result;
}

// Add cleanup function to be called when the grid component is destroyed
export function cleanupChunkSubscriptions() {
  // Get all active subscription keys
  const activeChunkKeys = Array.from(activeChunkSubscriptions.keys());
  
  // Unsubscribe from all chunks
  activeChunkKeys.forEach(chunkKey => {
    unsubscribeFromChunk(chunkKey);
  });
  
  console.log(`Cleaned up ${activeChunkKeys.length} chunk subscriptions`);
}

// Get terrain data for a specific coordinate - with logging throttling
// Create a cache to prevent redundant terrain calculations
let terrainCache = new Map();
const CACHE_SIZE_LIMIT = 1000; // Limit cache size to prevent memory issues

// Improved terrain caching and update system
// Renamed to be more descriptive of its role as the central source of target tile data
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

// Define minimap range to prevent duplicate terrain generation
let minimapRange = {
  centerX: 0,
  centerY: 0,
  rangeX: 24,  // Default based on minimap width (matches MINIMAP_WIDTH_EM / MINI_TILE_SIZE_EM)
  rangeY: 16   // Default based on minimap height (matches MINIMAP_HEIGHT_EM / MINI_TILE_SIZE_EM)
};

// Track if minimap has been initialized with terrain data
let isMinimapTerrainsLoaded = false;

// Add a function to update the minimap range
export function updateMinimapRange(centerX, centerY, rangeX, rangeY) {
  minimapRange = { centerX, centerY, rangeX, rangeY };
  isMinimapTerrainsLoaded = true;
}

// Optimize terrain data fetching
let logThrottleTime = 0;
const LOG_THROTTLE_INTERVAL = 5000; // Only log every 5 seconds max

export function getTerrainData(x, y) {
  // Create a cache key
  const cacheKey = `${x},${y}`;
  
  // Check if result is in cache
  if (terrainCache.has(cacheKey)) {
    return terrainCache.get(cacheKey);
  }
  
  // Check if we're within minimap range and minimap has generated terrain already
  // If so, we can assume the terrain will be loaded soon to reduce duplication
  if (isMinimapTerrainsLoaded) {
    const inMinimapRangeX = Math.abs(x - minimapRange.centerX) <= minimapRange.rangeX;
    const inMinimapRangeY = Math.abs(y - minimapRange.centerY) <= minimapRange.rangeY;
    
    if (inMinimapRangeX && inMinimapRangeY) {
      // Skip logging for coordinates that will be handled by minimap
      // Just generate the terrain data without logging
      const result = terrain.getTerrainData(x, y);
      terrainCache.set(cacheKey, result);
      return result;
    }
  }
  
  // Only log when generating terrain outside minimap range
  const now = Date.now();
  if (now - logThrottleTime > LOG_THROTTLE_INTERVAL) {
    console.log(`Computing terrain for coordinates outside minimap range: (${x}, ${y})`);
    logThrottleTime = now;
  }
  
  // Calculate the terrain data
  const result = terrain.getTerrainData(x, y);
  
  // Cache the result
  terrainCache.set(cacheKey, result);
  
  // If cache gets too large, delete oldest entries
  if (terrainCache.size > CACHE_SIZE_LIMIT) {
    const keysToRemove = Array.from(terrainCache.keys()).slice(0, 200); // Remove more at once
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
    
    // Initialize terrain data for the target coordinates
    // This ensures targetTileStore has data as soon as map is ready
    const initialTileData = getTerrainData(state.targetCoord.x, state.targetCoord.y);
    
    // Update TARGET_TILE_STORE directly - this will make data available via targetTileStore
    TARGET_TILE_STORE.set({
      coordinates: { x: state.targetCoord.x, y: state.targetCoord.y },
      data: initialTileData
    });
    
    return {
      ...state,
      cols,
      rows,
      centerX,
      centerY,
      offsetX,
      offsetY,
      // Removed centerTileData since we're now using targetTileStore
      isReady: true
    };
  });
}

// Create a centralized movement function that all navigation methods will use
export function moveMapTo(newX, newY) {
  // Always clear hover state during any movement
  clearHoveredTile();
  
  mapState.update(state => {
    // Use current values when coordinates are undefined
    const roundedX = newX !== undefined ? Math.round(newX) : state.targetCoord.x;
    const roundedY = newY !== undefined ? Math.round(newY) : state.targetCoord.y;
    
    // Calculate new offsets
    const newOffsetX = state.centerX + roundedX;
    const newOffsetY = state.centerY + roundedY;
    
    const biome = getTerrainData(roundedX, roundedY).biome;
    console.log(`Moving to (${roundedX}, ${roundedY}) - Biome: ${biome.name}`);
    
    return {
      ...state,
      targetCoord: { x: roundedX, y: roundedY },
      offsetX: newOffsetX,
      offsetY: newOffsetY,
      hoveredTile: null // Explicitly clear hover state
    };
  });
  
  // The targetTileStore will automatically update via its derived subscription
  // when it detects the change to targetCoord
}

// Refactor moveMapByKeys to use the central movement function
export function moveMapByKeys() {
  let xChange = 0;
  let yChange = 0;
  
  // Calculate movement direction based on pressed keys
  const state = get(mapState);
  if (state.keysPressed.has("a") || state.keysPressed.has("arrowleft")) xChange += 1;
  if (state.keysPressed.has("d") || state.keysPressed.has("arrowright")) xChange -= 1;
  if (state.keysPressed.has("w") || state.keysPressed.has("arrowup")) yChange += 1;
  if (state.keysPressed.has("s") || state.keysPressed.has("arrowdown")) yChange -= 1;

  // Skip if no movement
  if (xChange === 0 && yChange === 0) return;
  
  // Calculate new coordinates
  const newX = state.targetCoord.x - xChange;
  const newY = state.targetCoord.y - yChange;
  
  // Use the centralized movement function
  moveMapTo(newX, newY);
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

// Update drag function to use the central movement function
export function drag(event) {
  let result = false;
  
  const state = get(mapState);
  if (!state.isDragging) return result;

  const deltaX = event.clientX - state.dragStartX;
  const deltaY = event.clientY - state.dragStartY;
  
  const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const tileSizePx = TILE_SIZE * baseFontSize;
  
  // Calculate movement with increased sensitivity
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
    // Update drag start position but don't move
    mapState.update(state => ({
      ...state,
      dragStartX: event.clientX,
      dragStartY: event.clientY,
      dragAccumX,
      dragAccumY
    }));
    return result;
  }
  
  result = true;
  
  // Calculate new position
  const newX = state.targetCoord.x - cellsMovedX;
  const newY = state.targetCoord.y - cellsMovedY;
  
  // Keep remaining sub-tile movement
  const remainderX = dragAccumX - (cellsMovedX * adjustedTileSize);
  const remainderY = dragAccumY - (cellsMovedY * adjustedTileSize);
  
  // Use the central move function
  moveMapTo(newX, newY);
  
  // Update drag state separately
  mapState.update(state => ({
    ...state,
    dragStartX: event.clientX,
    dragStartY: event.clientY,
    dragAccumX: remainderX,
    dragAccumY: remainderY
  }));
  
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
  console.log("openDetailsModal called");
  
  // Get current state and use targetTileStore to ensure we have the most current data
  const state = get(mapState);
  const tileData = get(targetTileStore);
  const { x, y } = state.targetCoord;
  
  console.log(`Opening details for (${x}, ${y}), biome: ${tileData.biome?.name || 'unknown'}`);
  
  // First make sure we have valid coordinates
  if (x !== undefined && y !== undefined) {
    // Set the modal state to true (open)
    mapState.update(state => ({
      ...state,
      showDetailsModal: true
    }));
  } else {
    console.error("Cannot open details: Invalid coordinates");
  }
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
      
      // Skip logging for most terrain generations
      const oldLogTime = logThrottleTime;
      logThrottleTime = Date.now() + LOG_THROTTLE_INTERVAL; // Temporarily suppress logs
      
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
      
      // Restore log throttling
      logThrottleTime = oldLogTime;
      
      console.log(`Generated expanded grid with ${result.length} tiles`);
      set(result);
    } catch (error) {
      console.error("Error generating expanded grid:", error);
      set([]);
    }
  },
  []
);

// Optimize the grid array generation
export const gridArray = (() => {
  let lastOffsetX = null;
  let lastOffsetY = null;
  let lastCols = null;
  let lastRows = null;
  let cachedResult = [];
  let isGenerating = false;

  return derived(
    expandedGridArray,
    ($expandedGrid, set) => {
      // Prevent concurrent generation
      if (isGenerating) return;
      
      const state = get(mapState);
      
      // Check if we really need to recalculate
      if (lastOffsetX === state.offsetX && 
          lastOffsetY === state.offsetY && 
          lastCols === state.cols &&
          lastRows === state.rows &&
          cachedResult.length > 0) {
        return cachedResult;
      }
      
      // Set generation flag
      isGenerating = true;
      
      try {
        // Update tracking variables
        lastOffsetX = state.offsetX;
        lastOffsetY = state.offsetY;
        lastCols = state.cols;
        lastRows = state.rows;
        
        // Filter the grid
        cachedResult = $expandedGrid.filter(cell => cell.isInMainView);
        set(cachedResult);
      } finally {
        isGenerating = false;
      }
    },
    []
  );
})();

// Replace axis arrays with memoized versions
export const xAxisArray = derived(
  mapState,
  memoize(($mapState) => {
    if (!$mapState.isReady) return [];
    return Array.from({ length: $mapState.cols }, (_, x) => ({
      // Fix the direction by inverting the calculation
      value: $mapState.targetCoord.x - ($mapState.centerX - x),
      isCenter: x === $mapState.centerX
    }));
  })
);

export const yAxisArray = derived(
  mapState,
  memoize(($mapState) => {
    if (!$mapState.isReady) return [];
    return Array.from({ length: $mapState.rows }, (_, y) => ({
      // Also fix the y-axis for consistency
      value: $mapState.targetCoord.y - ($mapState.centerY - y),
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
