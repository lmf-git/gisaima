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
export const DRAG_CHECK_INTERVAL = 500;

// Expansion factor for calculating larger grid area
export const GRID_EXPANSION_FACTOR = 3;

// Track active chunk subscriptions
const activeChunkSubscriptions = new Map();

// Add flag to prevent concurrent cleanup operations
let isCleaningUp = false;

// Remove DEBUG_MODE flag and directly set to false
const DEBUG_MODE = false;

// Create a store using Svelte's store API since $state is only for component scripts
export const mapState = writable({ 
  isReady: false,
  cols: 0, 
  rows: 0,
  offsetX: 0, 
  offsetY: 0,
  centerX: 0,
  centerY: 0,
  targetCoord: { x: 0, y: 0 },
  chunks: new Set(),
  hoveredTile: null,
  showDetails: false,
  isDragging: false,
  isMouseActuallyDown: false,
  dragStartX: 0,
  dragStartY: 0,
  dragStateCheckInterval: null,
  keysPressed: new Set(),
  keyboardNavigationInterval: null,
  
  // Entity data from Firebase chunks - updated to use singular structure
  entities: {
    structure: {},   // key: "x,y", value: structure data - Changed from structures to structure
    groups: {},      // key: "x,y", value: unit group data
    players: {},     // key: "x,y", value: player data
    test: null       // Store test value if present
  },

  // Add minimapVisible property
  minimapVisible: true,
});

// Map computation functions
export function getChunkKey(x, y) {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
}

// Function to get world coordinates from chunk key - FIX THE BUG HERE
export function getChunkCoordinates(chunkKey) {
  const [chunkX, chunkY] = chunkKey.split(',').map(Number);
  return {
    minX: chunkX * CHUNK_SIZE,
    minY: chunkY * CHUNK_SIZE, // Fixed: was using chunkX instead of chunkY
    maxX: (chunkX + 1) * CHUNK_SIZE - 1,
    maxY: (chunkY + 1) * CHUNK_SIZE - 1  // Fixed: was using chunkX instead of chunkY
  };
}

// Remove the checkForTestData function completely and replace with a more specific function that doesn't subscribe to root
export function getTestData() {
  console.log("Checking for test data");
  // Just return current test data from store without subscription
  const state = get(mapState);
  return state.entities.test;
}

// Store raw chunk data for debugging
const rawChunkData = new Map();
export function storeRawChunkData(chunkKey, data) {
  rawChunkData.set(chunkKey, data);
}

// Get raw chunk data for debugging
export function getRawChunkData(chunkKey) {
  return rawChunkData.get(chunkKey);
}

// Subscribe to a chunk in Firebase - remove logging
function subscribeToChunk(chunkKey) {
  // Don't create duplicate subscriptions
  if (activeChunkSubscriptions.has(chunkKey)) {
    return;
  }
  
  try {
    // Create reference to this chunk
    const chunkRef = ref(db, `chunks/${chunkKey}`);
    
    const unsubscribe = onValue(chunkRef, (snapshot) => {
      const exists = snapshot.exists();
      
      if (exists) {
        const data = snapshot.val();
        storeRawChunkData(chunkKey, data); // Store raw data for debugging
        
        // Process chunk data immediately
        handleChunkData(chunkKey, data);
      }
    }, 
    (error) => {
      console.error(`⚠️ Error subscribing to chunk ${chunkKey}:`, error);
    });
    
    // Store the unsubscribe function itself
    activeChunkSubscriptions.set(chunkKey, unsubscribe);
  } catch (err) {
    console.error(`⚠️ Failed to subscribe to chunk ${chunkKey}:`, err);
  }
}

// Unsubscribe from a chunk
function unsubscribeFromChunk(chunkKey) {
  if (!activeChunkSubscriptions.has(chunkKey)) return false;
  
  try {
    const unsubscribe = activeChunkSubscriptions.get(chunkKey);
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    } else {
      console.warn(`Invalid unsubscribe function for chunk ${chunkKey}`);
    }
    activeChunkSubscriptions.delete(chunkKey);
    
    // Clean up entity data for this chunk
    cleanEntitiesForChunk(chunkKey);
    return true;
  } catch (err) {
    console.error(`Error unsubscribing from chunk ${chunkKey}:`, err);
    // Still remove from active subscriptions to prevent leaks
    activeChunkSubscriptions.delete(chunkKey);
  }
  return false;
}

// Simplify handleChunkData but add an event emitter for data changes
const chunkLastUpdated = new Map();
function handleChunkData(chunkKey, data) {
  if (!data) return;
  
  // Skip processing if this is a redundant update
  const lastUpdated = data.lastUpdated || Date.now();
  const prevUpdated = chunkLastUpdated.get(chunkKey) || 0;
  if (lastUpdated <= prevUpdated && lastUpdated !== 0) return;
  chunkLastUpdated.set(chunkKey, lastUpdated);
  
  // Process all entities in one batch with high priority
  let structureUpdates = {};
  let groupUpdates = {};
  let playerUpdates = {};
  let entitiesChanged = false;
  
  // Process each tile without creating new objects for each one
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
  
  // Only update the store once with all changes
  if (entitiesChanged) {
    // Use a Promise.resolve().then to move this update to the next microtask
    // This ensures that data is processed and rendered as soon as it's available
    Promise.resolve().then(() => {
      mapState.update(state => {
        // Create new entity objects only once
        const newStructure = { ...state.entities.structure, ...structureUpdates };
        const newGroups = { ...state.entities.groups, ...groupUpdates };
        const newPlayers = { ...state.entities.players, ...playerUpdates };
        
        console.log(`Loaded entities from chunk ${chunkKey}: ${Object.keys(structureUpdates).length} structures, ${Object.keys(groupUpdates).length} groups, ${Object.keys(playerUpdates).length} players`);
        
        return {
          ...state,
          entities: {
            structure: newStructure,
            groups: newGroups,
            players: newPlayers,
            test: state.entities.test
          },
          _entityChangeCounter: (state._entityChangeCounter || 0) + 1
        };
      });
    });
  }
}

// Function to clean entities when chunks are unloaded
function cleanEntitiesForChunk(chunkKey) {
  mapState.update(state => {
    // Create a new entities object to avoid direct mutation
    const newEntities = {
      structure: { ...state.entities.structure }, // Changed from structures to structure
      groups: { ...state.entities.groups },
      players: { ...state.entities.players }
    };
    
    // Remove all entities belonging to this chunk
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
  
  console.log(`Cleaned entities for chunk ${chunkKey}`);
}

// Enhanced updateChunks function - more efficient
let lastGridHash = '';
let lastUpdateTime = 0;
const UPDATE_THROTTLE = 300; // ms between chunk updates

export function updateChunks(gridArray) {
  // Skip empty grid updates
  if (!gridArray || gridArray.length === 0) return;
  
  // Throttle updates by time
  const now = Date.now();
  if (now - lastUpdateTime < UPDATE_THROTTLE) return;
  lastUpdateTime = now;
  
  // Calculate a hash of the involved chunks to detect changes
  const chunkKeys = new Set();
  gridArray.forEach(cell => {
    const chunkKey = getChunkKey(cell.x, cell.y);
    chunkKeys.add(chunkKey);
  });
  
  const newGridHash = [...chunkKeys].sort().join(',');
  
  // Skip redundant updates if chunks haven't changed
  if (newGridHash === lastGridHash) return;
  
  lastGridHash = newGridHash;
  
  mapState.update(state => {
    const newVisibleChunks = chunkKeys;
    
    // Track changes to handle Firebase subscriptions
    const added = [...newVisibleChunks].filter(key => !state.chunks.has(key));
    const removed = [...state.chunks].filter(key => !newVisibleChunks.has(key));
    
    // Subscribe to new chunks immediately
    if (added.length > 0) {
      added.forEach(chunkKey => {
        subscribeToChunk(chunkKey);
      });
    }
    
    // Unsubscribe from old chunks and clean up entity data
    if (removed.length > 0) {
      removed.forEach(chunkKey => {
        unsubscribeFromChunk(chunkKey);
      });
    }

    return {
      ...state,
      chunks: newVisibleChunks
    };
  });
}

// Get entities for a specific coordinate - Add more debugging
export function getEntitiesAt(x, y) {
  const state = get(mapState);
  const locationKey = `${x},${y}`;
  
  // Check if we have any entities at this location
  const structure = state.entities.structure[locationKey]; // Changed from structures to structure
  const unitGroup = state.entities.groups[locationKey];
  const player = state.entities.players[locationKey];
  
  // Always log when checking center coordinates for debugging
  const centerCoord = state.targetCoord;
  const isCenter = centerCoord && centerCoord.x === x && centerCoord.y === y;

  if (isCenter || structure || unitGroup || player) {
    console.log(`Checking entities at ${locationKey}:`, {
      hasStructure: !!structure,
      hasUnitGroup: !!unitGroup,
      hasPlayer: !!player,
      isCenter
    });
    
    // Log details if entities exist
    if (structure) console.log(`  Structure: ${JSON.stringify(structure)}`);
    if (unitGroup) console.log(`  UnitGroup: ${JSON.stringify(unitGroup)}`);
    if (player) console.log(`  Player: ${JSON.stringify(player)}`);
  }
  
  return { structure, unitGroup, player };
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
    structure: {}, // Changed from structures to structure
    groups: {},
    players: {}
  };
  
  // Filter entities by chunk key
  Object.entries(state.entities.structure).forEach(([locationKey, data]) => {
    if (data?.chunkKey === chunkKey) {
      result.structure[locationKey] = data;
    }
  });
  
  Object.entries(state.entities.groups).forEach(([locationKey, data]) => {
    if (data?.chunkKey === chunkKey) {
      result.groups[locationKey] = data;
    }
  });
  
  Object.entries(state.entities.players).forEach(([locationKey, data]) => {
    if (data?.chunkKey === chunkKey) {
      result.players[locationKey] = data;
    }
  });
  
  return result;
}

// Add cleanup function to be called when the grid component is destroyed
export function cleanupChunkSubscriptions() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  
  try {
    const activeChunkKeys = Array.from(activeChunkSubscriptions.keys());
    
    // First unsubscribe from all Firebase listeners to prevent incoming updates
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
    
    // Then update the store state once, not for each chunk
    mapState.update(state => ({
      ...state,
      chunks: new Set() // Reset chunks set
    }));
    
    // Clear caches but don't update the store again
    rawChunkData.clear();
    
    console.log(`Cleaned up ${activeChunkKeys.length} chunk subscriptions`);
  } finally {
    isCleaningUp = false;
  }
}

// Get terrain data for a specific coordinate - with logging throttling
// Create a cache to prevent redundant terrain calculations
let terrainCache = new Map();
// Removed unused CACHE_SIZE_LIMIT constant

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

// Resize the map grid
export function resizeMap(mapElement) {
  mapState.update(state => {
    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const tileSizePx = TILE_SIZE * baseFontSize;
    const width = mapElement.clientWidth;
    const height = mapElement.clientHeight;
    
    // Calculate responsive grid size
    let cols = Math.ceil(width / tileSizePx);
    cols = cols % 2 === 0 ? cols - 1 : cols;
    
    let rows = Math.ceil(height / tileSizePx);
    rows = rows % 2 === 0 ? rows - 1 : rows;
    
    // Make sure we have at least a 5x5 grid on small screens
    cols = Math.max(cols, 5);
    rows = Math.max(rows, 5);
    
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
    
    // After updating map state, trigger loading initial entity data
    // by scheduling it after the state update
    setTimeout(() => {
      if (state.isReady) {
        loadInitialChunksForTarget();
      }
    }, 0);
    
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
  mapState.update(prev => {
    // Use current values when coordinates are undefined
    const roundedX = newX !== undefined ? Math.round(newX) : prev.targetCoord.x;
    const roundedY = newY !== undefined ? Math.round(newY) : prev.targetCoord.y;
    
    // Calculate new offsets
    const newOffsetX = prev.centerX + roundedX;
    const newOffsetY = prev.centerY + roundedY;
    
    const biome = getTerrainData(roundedX, roundedY).biome;
    console.log(`Moving to (${roundedX}, ${roundedY}) - Biome: ${biome.name}`);
    
    return {
      ...prev,
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
  // Use higher sensitivity for touch events (detected by checking userAgent)
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const sensitivity = isTouchDevice ? 0.8 : 0.6; 
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
      showDetails: true
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
    showDetails: false
  }));
}

// This is a minimap function primarily and should be moved there.
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

// Update function to toggle minimap visibility in the store
export function setMinimapVisibility(isVisible) {
  mapState.update(state => ({
    ...state,
    minimapVisible: isVisible
  }));
}

// Greatly improved expandedGridArray with better caching and change detection
let lastMapStateHash = '';
let lastGridGenTime = 0;
const GRID_GEN_THROTTLE = 200; // ms between grid generations
let expandedGridCache = [];
let lastTargetX = 0;
let lastTargetY = 0;
let lastGridCols = 0;
let lastGridRows = 0;
let lastMinimapVisible = true;

export const expandedGridArray = derived(
  [mapState],
  ([$mapState], set) => {
    // Skip if map isn't ready
    if (!$mapState.isReady) {
      set([]);
      return;
    }

    // Throttle grid generation by time 
    const now = Date.now();
    if (now - lastGridGenTime < GRID_GEN_THROTTLE) return;

    // Specific change detection - only regenerate when these values actually change
    const targetChanged = $mapState.targetCoord.x !== lastTargetX || $mapState.targetCoord.y !== lastTargetY;
    const sizeChanged = $mapState.cols !== lastGridCols || $mapState.rows !== lastGridRows;
    const minimapToggled = $mapState.minimapVisible !== lastMinimapVisible;

    // Skip update if nothing significant has changed
    if (!targetChanged && !sizeChanged && !minimapToggled && expandedGridCache.length > 0) {
      set(expandedGridCache);
      return;
    }

    // Update tracking values for next comparison
    lastTargetX = $mapState.targetCoord.x;
    lastTargetY = $mapState.targetCoord.y;
    lastGridCols = $mapState.cols;
    lastGridRows = $mapState.rows;
    lastMinimapVisible = $mapState.minimapVisible;
    lastGridGenTime = now;
    
    try {
      // Determine grid dimensions based on minimap visibility
      const useExpanded = $mapState.minimapVisible;
      const gridCols = useExpanded 
        ? Math.min($mapState.cols * GRID_EXPANSION_FACTOR, 51)
        : $mapState.cols;
      const gridRows = useExpanded 
        ? Math.min($mapState.rows * GRID_EXPANSION_FACTOR, 51)
        : $mapState.rows;
      
      const centerOffsetX = Math.floor(gridCols / 2);
      const centerOffsetY = Math.floor(gridRows / 2);
      
      const result = [];
      const involvedChunks = new Set();
      
      for (let y = 0; y < gridRows; y++) {
        for (let x = 0; x < gridCols; x++) {
          const globalX = x - centerOffsetX + $mapState.targetCoord.x;
          const globalY = y - centerOffsetY + $mapState.targetCoord.y;
          
          // Track which chunks are involved
          const chunkKey = getChunkKey(globalX, globalY);
          involvedChunks.add(chunkKey);
          
          const terrainData = getTerrainData(globalX, globalY);
          
          // Calculate isInMainView properly based on whether we're using expanded view
          let isInMainView = true; // Default for non-expanded grid
          
          if (useExpanded) {
            // For expanded grid, check if the cell is within main view bounds
            isInMainView = 
              x >= centerOffsetX - Math.floor($mapState.cols / 2) && 
              x <= centerOffsetX + Math.floor($mapState.cols / 2) &&
              y >= centerOffsetY - Math.floor($mapState.rows / 2) && 
              y <= centerOffsetY + Math.floor($mapState.rows / 2);
          }
          
          // Only include needed properties directly
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
      
      // Update the active chunks based on this grid - move before caching
      updateChunks(result);
      
      // Store in cache before setting
      expandedGridCache = result;
      
      set(result);
    } catch (error) {
      console.error("⚠️ Error generating grid:", error);
      set([]);
    }
  },
  []
)

// Optimized gridArray with better caching
export const gridArray = (() => {
  let lastOffsetX = null;
  let lastOffsetY = null;
  let lastCols = null;
  let lastRows = null;
  let lastExpandedRef = null;
  let cachedResult = [];
  let isGenerating = false;

  return derived(
    expandedGridArray,
    ($expandedGrid, set) => {
      // Prevent concurrent generation
      if (isGenerating) return;
      
      const state = get(mapState);
      
      // Skip calculation if expanded grid reference hasn't changed
      // This prevents triggering on the same data
      if ($expandedGrid === lastExpandedRef && cachedResult.length > 0) {
        return;
      }
      
      // Check if we really need to recalculate
      const sizeChanged = lastCols !== state.cols || lastRows !== state.rows;
      const positionChanged = lastOffsetX !== state.offsetX || lastOffsetY !== state.offsetY;
      
      if (!sizeChanged && !positionChanged && $expandedGrid === lastExpandedRef && cachedResult.length > 0) {
        // Nothing important has changed, just return
        return;
      }
      
      // Update tracking variables
      lastOffsetX = state.offsetX;
      lastOffsetY = state.offsetY;
      lastCols = state.cols;
      lastRows = state.rows;
      lastExpandedRef = $expandedGrid;
      
      // Set generation flag
      isGenerating = true;
      
      try {
        // Filter the grid but only if there is data to filter
        if ($expandedGrid && $expandedGrid.length > 0) {
          const mainViewCells = $expandedGrid.filter(cell => cell.isInMainView);
          cachedResult = mainViewCells;
          
          // Only log if we have meaningful data
          if (mainViewCells.length > 0) {
            console.log(`⚡ Main grid filtered to ${mainViewCells.length} cells`);
          }
          
          set(mainViewCells);
        } else {
          // Set empty array for no data
          cachedResult = [];
          set([]);
        }
      } catch (error) {
        console.error("Error filtering grid array:", error);
        cachedResult = [];
        set([]);
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
  ($mapState) => {
    if (!$mapState.isReady) return [];
    return Array.from({ length: $mapState.cols }, (_, x) => ({
      // Fix the direction by inverting the calculation
      value: $mapState.targetCoord.x - ($mapState.centerX - x),
      isCenter: x === $mapState.centerX
    }));
  }
);

export const yAxisArray = derived(
  mapState,
  ($mapState) => {
    if (!$mapState.isReady) return [];
    return Array.from({ length: $mapState.rows }, (_, y) => ({
      // Also fix the y-axis for consistency
      value: $mapState.targetCoord.y - ($mapState.centerY - y),
      isCenter: y === $mapState.centerY
    }));
  }
);

// Add a new function to handle hover state updates
export function updateHoveredTile(x, y) {
  mapState.update(state => ({
    ...state,
    hoveredTile: x !== null && y !== null ? { x, y } : null
  }));
}

// Add a function to manually force chunk loading for testing
export function forceLoadChunk(chunkKey) {
  console.log(`⚡ Manually loading chunk: ${chunkKey}`);
  subscribeToChunk(chunkKey);
  
  mapState.update(state => {
    const newChunks = new Set([...state.chunks, chunkKey]);
    console.log(`Chunks after manual load: ${[...newChunks].join(', ')}`);
    return {
      ...state,
      chunks: newChunks
    };
  });
}

// Add function to manually load and parse a specific tile - Updated for correct path
export function inspectTile(chunkKey, tileX, tileY) {
  console.log(`🔍 Inspecting tile (${tileX},${tileY}) in chunk ${chunkKey}`);
  
  const tileCoord = `${tileX},${tileY}`;
  const tilePath = `chunks/${chunkKey}/${tileCoord}`;
  const tileRef = ref(db, tilePath);
  
  onValue(tileRef, (snapshot) => {
    const data = snapshot.exists() ? snapshot.val() : null;
    console.log(`Tile data for (${tileX},${tileY}) in chunk ${chunkKey}:`, data);
    
    if (data) {
      // Create a structure that mimics chunk data with just this tile
      const processedData = {};
      processedData[tileCoord] = data;
      
      // Process this single tile through the standard pipeline
      handleChunkData(chunkKey, processedData);
    } else {
      console.log(`No data found for tile (${tileX},${tileY}) in chunk ${chunkKey}`);
    }
  }, (error) => {
    console.error(`Error fetching tile (${tileX},${tileY}) in chunk ${chunkKey}:`, error);
  });
}

// Add quick debug check for loaded entities on specific coordinates
export function debugCheckEntityAt(x, y) {
  const locationKey = `${x},${y}`;
  const state = get(mapState);
  
  console.log(`DEBUG CHECK for ${locationKey}:`);
  console.log(` - Structure:`, state.entities.structure[locationKey]); // Changed from structures to structure
  console.log(` - Unit Group:`, state.entities.groups[locationKey]);
  console.log(` - Player:`, state.entities.players[locationKey]);
  
  return !!state.entities.structure[locationKey] || 
         !!state.entities.groups[locationKey] || 
         !!state.entities.players[locationKey];
}

// Add a flag for disabling debug logs in Grid.svelte
export const ENABLE_DEBUG_LOGS = false;
// Function to log all entity data for debugging - add to help debug entities
export function logAllEntities() {
  const state = get(mapState);
  const structures = Object.entries(state.entities.structure); // Changed from structures to structure
  const groups = Object.entries(state.entities.groups);
  const players = Object.entries(state.entities.players);
  
  console.log("========== ALL ENTITIES DUMP ==========");
  console.log(`Total structures: ${structures.length}`);
  structures.forEach(([key, data]) => {
    console.log(`Structure at ${key}: ${data.name || data.type || "Unknown"}`);
  });
  
  console.log(`\nTotal unit groups: ${groups.length}`);
  groups.forEach(([key, data]) => {
    console.log(`Group at ${key}: ${data.type || "Unknown"}`);
  });
  
  console.log(`\nTotal players: ${players.length}`);
  players.forEach(([key, data]) => {
    console.log(`Player at ${key}: ${data.displayName || "Unknown"}`);
  });
  
  console.log("=======================================");
  
  return {
    structures: structures.length,
    groups: groups.length,
    players: players.length
  };
}

// Optimize terrain data fetching - fix redundant calculations
let logThrottleTime = 0;
const LOG_THROTTLE_INTERVAL = 5000; // Only log every 5 seconds max

export function getTerrainData(x, y) {
  const cacheKey = `${x},${y}`;
  
  if (terrainCache.has(cacheKey)) {
    return terrainCache.get(cacheKey);
  }
  
  const result = terrain.getTerrainData(x, y);
  terrainCache.set(cacheKey, result);
  
  return result;
}

// Add a function to detect structure format in database for debugging purposes
export function detectStructureFormat() {
  console.log("🔍 Analyzing database structure format...");
  
  mapState.update(state => {
    let hasFoundData = false;
    
    // Iterate through active chunks to find structures
    [...state.chunks].forEach(chunkKey => {
      const chunkData = getRawChunkData(chunkKey);
      if (!chunkData) return;
      
      // Iterate through tile coordinates
      Object.entries(chunkData).forEach(([tileKey, tileData]) => {
        if (tileKey === 'lastUpdated') return;
        
        // Check for structure at tile level
        if (tileData.structure) {
          console.log(`Found correct SINGULAR 'structure' at ${chunkKey}:${tileKey}`);
          console.log(`Structure data:`, tileData.structure);
          hasFoundData = true;
        }
        
        // Check for legacy/incorrect format (shouldn't exist)
        if (tileData.structures) {
          console.log(`Found INCORRECT PLURAL 'structures' at ${chunkKey}:${tileKey}`);
          console.log(`Structures data:`, tileData.structures);
          hasFoundData = true;
        }
        
        // Log players and groups too for completeness
        if (tileData.players) {
          console.log(`Found players at ${chunkKey}:${tileKey}`);
          console.log(`Player IDs:`, Object.keys(tileData.players));
          hasFoundData = true;
        }
        
        if (tileData.groups) {
          console.log(`Found groups at ${chunkKey}:${tileKey}`);
          console.log(`Group IDs:`, Object.keys(tileData.groups));
          hasFoundData = true;
        }
      });
    });
    
    if (!hasFoundData) {
      console.log("No entity data found in active chunks. Try loading more areas.");
    }
    
    return state;
  });
}

// Add new function to clean up intervals with additional safety
export function cleanupInternalIntervals() {
  try {
    const state = get(mapState);
    
    // Clear any timers or intervals that may be running
    if (state.dragStateCheckInterval) {
      clearInterval(state.dragStateCheckInterval);
      mapState.update(state => ({ ...state, dragStateCheckInterval: null }));
    }
    
    if (state.keyboardNavigationInterval) {
      clearInterval(state.keyboardNavigationInterval);
      mapState.update(state => ({ ...state, keyboardNavigationInterval: null }));
    }
    
    console.log("Cleaned up internal intervals");
    return true;
  } catch (err) {
    console.error("Error cleaning up intervals:", err);
    return false;
  }
}

// Add new function to load chunks for initial view without waiting for expandedGridArray
export function loadInitialChunksForTarget() {
  const state = get(mapState);
  if (!state.isReady || !state.targetCoord) return;
  
  console.log("Loading initial chunks for target coordinates:", state.targetCoord);
  
  // Calculate visible range based on grid size
  const halfWidth = Math.floor(state.cols / 2) + 1; // Add buffer
  const halfHeight = Math.floor(state.rows / 2) + 1; // Add buffer
  
  const minX = state.targetCoord.x - halfWidth;
  const maxX = state.targetCoord.x + halfWidth;
  const minY = state.targetCoord.y - halfHeight;
  const maxY = state.targetCoord.y + halfHeight;
  
  // Track all chunk keys that should be loaded
  const chunkKeys = new Set();
  
  // Calculate all chunk keys within view
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const chunkKey = getChunkKey(x, y);
      chunkKeys.add(chunkKey);
    }
  }
  
  // Subscribe to all chunks in view
  const chunksArray = Array.from(chunkKeys);
  console.log(`Loading ${chunksArray.length} initial chunks`);
  
  // First update the map state to track these chunks
  mapState.update(state => ({
    ...state,
    chunks: chunkKeys
  }));
  
  // Then subscribe to each chunk - do this synchronously to ensure immediate loading
  chunksArray.forEach(chunkKey => {
    subscribeToChunk(chunkKey);
  });
  
  // Force entity display after loading chunks
  setTimeout(forceEntityDisplay, 50);
  
  return chunksArray.length;
}

// Add function to force entity display refresh
export function forceEntityDisplay() {
  // Trigger reactivity by incrementing the entity counter
  mapState.update(state => ({
    ...state,
    _entityChangeCounter: (state._entityChangeCounter || 0) + 1
  }));
}
