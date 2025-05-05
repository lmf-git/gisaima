import { writable, derived, get } from 'svelte/store';
import { TerrainGenerator } from 'gisaima-shared/map/noise';

import { ref, onValue } from "firebase/database";
import { db } from '$lib/firebase';
import { replaceState } from '$app/navigation'; // Import from SvelteKit instead of using history directly
// Import getWorldCenterCoordinates function from game store
import { getWorldCenterCoordinates, game } from './game.js';
// Import getChunkKey from the shared module
import { getChunkKey, CHUNK_SIZE } from 'gisaima-shared/map/cartography.js';

// New constants for controlling debug output
const DEBUG_MODE = false; // Set to true to enable verbose logging
const debugLog = (...args) => DEBUG_MODE && console.log(...args);

// Keep a reference to the terrain generator for grid creation
let terrain;

// Configuration constants
export const TILE_SIZE = 5;
export const EXPANDED_COLS_FACTOR = 2.6;
export const EXPANDED_ROWS_FACTOR = 2;

// LocalStorage key prefixes for target coordinates
const TARGET_X_PREFIX = '-targetX';
const TARGET_Y_PREFIX = '-targetY';

// Add utility functions for localStorage persistence
function saveTargetToLocalStorage(worldId, x, y) {
  if (typeof window === 'undefined' || !worldId) return;

  try {
    localStorage.setItem(`${worldId}${TARGET_X_PREFIX}`, x.toString());
    localStorage.setItem(`${worldId}${TARGET_Y_PREFIX}`, y.toString());
  } catch (err) {
    console.warn('Failed to save target coordinates to localStorage:', err);
  }
}

function loadTargetFromLocalStorage(worldId) {
  if (typeof window === 'undefined' || !worldId) return null;

  try {
    const x = localStorage.getItem(`${worldId}${TARGET_X_PREFIX}`);
    const y = localStorage.getItem(`${worldId}${TARGET_Y_PREFIX}`);

    if (x !== null && y !== null) {
      const parsedX = parseInt(x, 10);
      const parsedY = parseInt(y, 10);

      if (!isNaN(parsedX) && !isNaN(parsedY)) {
        console.log(`Loaded saved position for world ${worldId}: ${parsedX},${parsedY}`);
        return { x: parsedX, y: parsedY };
      }
    }
  } catch (err) {
    console.warn('Failed to load target coordinates from localStorage:', err);
  }

  return null;
}

// Add this new function to clear saved target position
export function clearSavedTargetPosition(worldId) {
  if (typeof window === 'undefined' || !worldId) return;
  
  try {
    localStorage.removeItem(`${worldId}${TARGET_X_PREFIX}`);
    localStorage.removeItem(`${worldId}${TARGET_Y_PREFIX}`);
    console.log(`Cleared saved position for world ${worldId}`);
  } catch (err) {
    console.warn('Failed to clear target coordinates from localStorage:', err);
  }
}

const chunkSubscriptions = new Map();

// Initialize map without accessing game store initially
export const map = writable({
  ready: false,
  initializing: false,
  initializationAttempted: false,
  cols: 0,
  rows: 0,
  target: { x: 0, y: 0 },
  minimap: true, // Controls only UI visibility
  world: 'default',
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragAccumX: 0,
  dragAccumY: 0,
  dragSource: null
});

// New separate store for highlighted coordinates
export const highlightedCoords = writable(null);

// Initialize the entities store with battles included
export const entities = writable({
  structure: {},
  groups: {},
  players: {},
  items: {},
  battles: {}
});

export const ready = derived(map, $map => $map.ready);

// Create a derived store that efficiently tracks target position changes
export const targetPosition = derived(map, ($map) => {
  return {
    x: $map.target.x,
    y: $map.target.y
  };
}, { x: 0, y: 0 });

// Simplified URL update tracking
let isInternalUrlUpdate = false;
let urlUpdateTimeout = null;
const URL_UPDATE_DEBOUNCE = 300; // Reduced from 750ms for better responsiveness

// Simplified function to update URL with current coordinates
function updateUrlWithCoordinates(x, y) {
  if (typeof window === 'undefined') return;

  // Cancel any pending updates
  if (urlUpdateTimeout) {
    clearTimeout(urlUpdateTimeout);
  }

  // Debounce URL updates
  urlUpdateTimeout = setTimeout(() => {
    try {
      // Mark this as an internal update
      isInternalUrlUpdate = true;

      // Create updated URL
      const url = new URL(window.location);
      url.searchParams.set('x', Math.round(x).toString());
      url.searchParams.set('y', Math.round(y).toString());

      // Use SvelteKit's replaceState
      replaceState(url, {});

      // Reset flag after a short delay
      setTimeout(() => {
        isInternalUrlUpdate = false;
      }, 50);
    } catch (err) {
      console.error('Error updating URL:', err);
      isInternalUrlUpdate = false;
    }
  }, URL_UPDATE_DEBOUNCE);
}

// Export function to check if URL update is internal
export function isInternalUrlChange() {
  return isInternalUrlUpdate;
}

// Add exported utility function to check if a tile has content to display
export function hasTileContent(tile) {
  return (
    tile && (
      (tile.structure) || 
      (tile.groups && tile.groups.length > 0) || 
      (tile.items && tile.items.length > 0) ||
      (tile.players && tile.players.length > 0) ||
      (tile.battles && tile.battles.length > 0)
    )
  );
}

// Track modal hierarchies for keyboard handling
export const modalHierarchy = writable({
  structureOverview: false,
  details: false, 
  pathDrawing: false,
  anyOtherModal: false,
  minimap: true,
  overview: true
});

// Process keyboard events with hierarchy
export function handleKeyboardEvent(event, componentState) {
  if (event.key !== 'Escape') return false;
  
  // Update component hierarchy state
  modalHierarchy.update(state => ({
    ...state,
    ...componentState
  }));
  
  const hierarchy = get(modalHierarchy);
  
  // Check component visibility in priority order
  if (hierarchy.structureOverview) return false; // Let StructureOverview handle it
  if (hierarchy.details) return false; // Let Details handle it  
  if (hierarchy.pathDrawing) return false; // Let pathDrawing handle it
  if (hierarchy.anyOtherModal) return false; // Let other modals handle it
  
  // If no higher priority components are visible, handle minimap and overview
  if (hierarchy.minimap) return 'minimap';
  if (hierarchy.overview) return 'overview';
  
  return false;
}

// Update modal hierarchy state
export function updateModalState(componentState) {
  modalHierarchy.update(state => ({
    ...state,
    ...componentState
  }));
}

// Simplified function to process chunk data with proper update sequencing
function processChunkData(data = {}, chunkKey) {
  // Structure for batch entity updates
  const updates = {
    structure: {},
    groups: {},
    players: {},
    items: {},
    battles: {}  // Add battles to updates
  };

  // Set of all valid entity keys in this chunk update
  const validGroupKeys = new Set();
  const validPlayerKeys = new Set();
  const validItemKeys = new Set();
  const validBattleKeys = new Set();  // Track valid battle keys

  let entitiesChanged = false;

  Object.entries(data).forEach(([tileKey, tileData]) => {
    const [x, y] = tileKey.split(',').map(Number);
    const fullTileKey = `${x},${y}`;

    // Process structure - prioritize these
    if (tileData.structure) {
      updates.structure[fullTileKey] = { ...tileData.structure, x, y };
      entitiesChanged = true;
    }

    // Process player groups (multiple per tile)
    if (tileData.players) {
      updates.players[fullTileKey] = Object.entries(tileData.players)
        .map(([id, data]) => ({
          ...data,
          id: id,
          x, y
        }));
      validPlayerKeys.add(fullTileKey);
      entitiesChanged = true;
    } else {
      // Explicitly mark as empty if no players
      updates.players[fullTileKey] = [];
    }

    // Process unit groups
    if (tileData.groups) {
      updates.groups[fullTileKey] = Object.entries(tileData.groups)
        .map(([id, data]) => ({ ...data, id, x, y }));
      validGroupKeys.add(fullTileKey);
      entitiesChanged = true;
    } else {
      // Explicitly mark as empty if no groups
      updates.groups[fullTileKey] = [];
    }

    // Process battles directly from tileData.battles (simplified)
    if (tileData.battles) {
      updates.battles[fullTileKey] = Object.entries(tileData.battles).map(([battleId, battleData]) => ({
        ...battleData,
        id: battleId,
        x: parseInt(x),
        y: parseInt(y),
        distance: Math.sqrt(Math.pow(x - get(map).target.x, 2) + Math.pow(y - get(map).target.y, 2))
      }));
      validBattleKeys.add(fullTileKey);
      entitiesChanged = true;
    } else {
      // Explicitly mark as empty if no battles
      updates.battles[fullTileKey] = [];
    }

    // Process items (multiple per tile)
    if (tileData.items) {
      // FIX: Handle both array and object formats for items
      let itemsArray;
      if (Array.isArray(tileData.items)) {
        // If it's already an array, use it directly
        itemsArray = tileData.items;
      } else if (typeof tileData.items === 'object') {
        // If it's an object, convert it to an array
        itemsArray = Object.values(tileData.items);
      } else {
        // Fallback if neither array nor object
        itemsArray = [];
      }
      
      updates.items[fullTileKey] = itemsArray.map(item => ({ ...item, x, y }));
      validItemKeys.add(fullTileKey);
      entitiesChanged = true;
    } else {
      // Explicitly mark as empty if no items
      updates.items[fullTileKey] = [];
    }
  });

  // Only update if entities changed - do it in one atomic update
  if (entitiesChanged) {
    entities.update(current => {
      const newState = {
        structure: { ...current.structure, ...updates.structure },
        players: { ...current.players },
        groups: { ...current.groups },
        items: { ...current.items },
        battles: { ...current.battles }  // Include battles in state update
      };

      // Process all entity types in one update

      // Clean up missing groups in this chunk
      Object.keys(current.groups).forEach(key => {
        if (getChunkKey(parseInt(key.split(',')[0]), parseInt(key.split(',')[1])) === chunkKey) {
          if (!validGroupKeys.has(key)) {
            newState.groups[key] = [];
          }
        }
      });

      // Clean up missing players in this chunk
      Object.keys(current.players).forEach(key => {
        if (getChunkKey(parseInt(key.split(',')[0]), parseInt(key.split(',')[1])) === chunkKey) {
          if (!validPlayerKeys.has(key)) {
            newState.players[key] = [];
          }
        }
      });

      // Clean up missing battles in this chunk
      Object.keys(current.battles).forEach(key => {
        if (getChunkKey(parseInt(key.split(',')[0]), parseInt(key.split(',')[1])) === chunkKey) {
          if (!validBattleKeys.has(key)) {
            newState.battles[key] = [];
          }
        }
      });

      // Handle updates for all entity types
      Object.entries(updates.players).forEach(([key, value]) => {
        newState.players[key] = value;
      });

      Object.entries(updates.groups).forEach(([key, value]) => {
        newState.groups[key] = value;
      });

      Object.entries(updates.items).forEach(([key, value]) => {
        newState.items[key] = value;
      });

      Object.entries(updates.battles).forEach(([key, value]) => {
        newState.battles[key] = value;
      });

      return newState;
    });
  }
}

// Prioritize loading the most visible chunks first and ensure immediate rendering
export const chunks = derived(
  [map],
  ([$map], set) => {
    // Ensure worldId is a valid string
    const gameStore = get(game);
    const worldId = gameStore?.worldKey || 'default';

    // Skip if map is not ready
    if (!$map.ready) return set(new Set());

    // Always load expanded chunks regardless of minimap UI state
    // This ensures entities in main view are loaded properly
    const expandedFactor = 1;
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
    if (terrain) {
      const visibleCols = $map.cols * (1 + expandedFactor * (EXPANDED_COLS_FACTOR - 1));
      const visibleRows = $map.rows * (1 + expandedFactor * (EXPANDED_ROWS_FACTOR - 1));
      terrain.updateCacheSize(visibleCols, visibleRows, CHUNK_SIZE);
    }

    // Track chunks to remove
    const chunksToRemove = new Set(chunkSubscriptions.keys());
    const visibleChunks = new Set();

    // Create an array of chunks ordered by distance from center
    const chunksToLoad = [];
    for (let y = minChunkY; y <= maxChunkY; y++) {
      for (let x = minChunkX; x <= maxChunkX; x++) {
        const chunkKey = `${x},${y}`;
        visibleChunks.add(chunkKey);

        // Calculate distance from target chunk
        const targetChunkX = Math.floor($map.target.x / CHUNK_SIZE);
        const targetChunkY = Math.floor($map.target.y / CHUNK_SIZE);
        const distSq = (x - targetChunkX) ** 2 + (y - targetChunkY) ** 2;

        // If already subscribed, keep it
        if (chunkSubscriptions.has(chunkKey)) {
          chunksToRemove.delete(chunkKey);
        } else {
          // Otherwise queue for loading
          chunksToLoad.push({
            x, y, chunkKey, distSq,
            isCenter: x === targetChunkX && y === targetChunkY
          });
        }
      }
    }

    // Sort chunks by distance, with center chunk first
    chunksToLoad.sort((a, b) => {
      if (a.isCenter) return -1;
      if (b.isCenter) return 1;
      return a.distSq - b.distSq;
    });

    // Process chunks in order of priority
    for (const chunk of chunksToLoad) {
      try {
        // Use worldId directly when creating Firebase reference
        const chunkRef = ref(db, `worlds/${worldId}/chunks/${chunk.chunkKey}`);
        const unsubscribe = onValue(chunkRef, snapshot => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            processChunkData(data, chunk.chunkKey);
          }
        }, error => {
          console.error(`Error loading chunk ${chunk.chunkKey}:`, error);
        });

        chunkSubscriptions.set(chunk.chunkKey, unsubscribe);
      } catch (err) {
        console.error(`Failed to subscribe to chunk ${chunk.chunkKey}:`, err);
      }
    }

    // Unsubscribe from any chunks that are no longer visible
    for (const chunkKey of chunksToRemove) {
      const unsubscribe = chunkSubscriptions.get(chunkKey);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
        chunkSubscriptions.delete(chunkKey);

        // Clear cache entries for this chunk
        if (terrain) {
          const [chunkX, chunkY] = chunkKey.split(',').map(Number);
          terrain.clearChunkFromCache(chunkX, chunkY, CHUNK_SIZE);
        }

        // Clear entity data for this chunk
        entities.update(current => {
          const newState = {
            structure: { ...current.structure },
            groups: { ...current.groups },
            players: { ...current.players },
            items: { ...current.items },
            battles: { ...current.battles }
          };

          // Remove entities from this chunk
          Object.keys(current.structure).forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (getChunkKey(x, y) === chunkKey) {
              delete newState.structure[key];
            }
          });

          Object.keys(current.groups).forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (getChunkKey(x, y) === chunkKey) {
              delete newState.groups[key];
            }
          });

          Object.keys(current.players).forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (getChunkKey(x, y) === chunkKey) {
              delete newState.players[key];
            }
          });

          Object.keys(current.items).forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (getChunkKey(x, y) === chunkKey) {
              delete newState.items[key];
            }
          });

          Object.keys(current.battles).forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (getChunkKey(x, y) === chunkKey) {
              delete newState.battles[key];
            }
          });

          return newState;
        });
      }
    }

    // Return visible chunks set
    return visibleChunks;
  },
  new Set()
);

export const coordinates = derived(
  [map, entities, chunks, highlightedCoords],
  ([$map, $entities, $chunks, $highlightedCoords], set) => {
    // Skip if map not ready
    if (!$map.ready) {
      return set([]);
    }

    // Additional validation
    if ($map.cols <= 0 || $map.rows <= 0) {
      console.error('Invalid grid dimensions');
      return set([]);
    }

    // Always calculate the expanded grid regardless of minimap UI state
    // This ensures entities are always loaded and available
    const gridCols = Math.floor($map.cols * EXPANDED_COLS_FACTOR);
    const gridRows = Math.floor($map.rows * EXPANDED_ROWS_FACTOR);

    const viewportCenterX = Math.floor(gridCols / 2);
    const viewportCenterY = Math.floor(gridRows / 2);
    const tx = $map.target.x;
    const ty = $map.target.y;

    const result = [];
    const highlightedX = $highlightedCoords?.x;
    const highlightedY = $highlightedCoords?.y;

    // Calculate main view boundaries for display purposes
    const mainViewMinX = viewportCenterX - Math.floor($map.cols / 2);
    const mainViewMaxX = viewportCenterX + Math.floor($map.cols / 2);
    const mainViewMinY = viewportCenterY - Math.floor($map.rows / 2);
    const mainViewMaxY = viewportCenterY + Math.floor($map.rows / 2);

    // Build grid in one pass
    for (let y = 0; y < gridRows; y++) {
      for (let x = 0; x < gridCols; x++) {
        const globalX = x - viewportCenterX + tx;
        const globalY = y - viewportCenterY + ty;
        const locationKey = `${globalX},${globalY}`;

        // Calculate distance from target position
        const distance = Math.sqrt(
          Math.pow(globalX - tx, 2) +
          Math.pow(globalY - ty, 2)
        );

        // Keep isInMainView calculation consistent regardless of minimap state
        const isInMainView = (
          x >= mainViewMinX && x <= mainViewMaxX &&
          y >= mainViewMinY && y <= mainViewMaxY
        );

        const chunkKey = getChunkKey(globalX, globalY);
        const terrainData = terrain.getTerrainData(globalX, globalY);

        // Always include entity data regardless of minimap state
        const structure = $entities.structure[locationKey];
        const groups = $entities.groups[locationKey] || [];
        const players = $entities.players[locationKey] || [];
        const items = $entities.items[locationKey] || [];
        const battles = $entities.battles[locationKey] || [];  // Add battles

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
          items,
          battles,  // Include battles in the coordinate data
          terrain: terrainData,
          distance
        });
      }
    }

    set(result);
  },
  []
);

// Target store depends on coordinates
export const targetStore = derived(
  [map, coordinates],
  ([$map, $coordinates]) => {
    // Find the center tile in coordinates
    const targetTile = $coordinates.find(c => c.x === $map.target.x && c.y === $map.target.y);

    // If found, return complete data; if not, return minimal location data
    return targetTile || { x: $map.target.x, y: $map.target.y };
  }
);

// Highlighted store depends on coordinates
export const highlightedStore = derived(
  [highlightedCoords, coordinates],
  ([$highlightedCoords, $coordinates]) => {
    // If no tile is highlighted, return null
    if (!$highlightedCoords) return null;

    // Find the highlighted tile with full data from coordinates
    const highlightedTile = $coordinates.find(
      c => c.x === $highlightedCoords.x && c.y === $highlightedCoords.y
    );

    // Return the found tile with complete data, or fall back to basic coords
    return highlightedTile || $highlightedCoords;
  }
);

// Simplified moveTarget function with improved debouncing
export function moveTarget(newX, newY, updateUrl = false) {
  if (newX === undefined || newY === undefined) {
    console.warn('Invalid coordinates passed to moveTarget:', { newX, newY });
    return;
  }

  const x = Math.round(newX);
  const y = Math.round(newY);
  
  // Quick check to avoid unnecessary updates
  const currentState = get(map);
  if (currentState.target.x === x && currentState.target.y === y) {
    return; // No change needed
  }

  // Update map position immediately for responsive UI
  map.update(prev => ({
    ...prev,
    target: { x, y },
  }));

  // Only update URL if explicitly requested
  if (updateUrl && !isInternalUrlUpdate) updateUrlWithCoordinates(x, y);

  // Save target position to localStorage
  const worldId = currentState.worlds;
  if (worldId) saveTargetToLocalStorage(worldId, x, y);
}

// Set highlighted coordinates
export function setHighlighted(x, y) {
  if (x !== null && y !== null) {
    highlightedCoords.set({ x, y });
  } else {
    highlightedCoords.set(null);
  }
}

// Enhanced function to handle spawn data in various formats
export function getSpawnPointsFromWorld(worldData) {
  if (!worldData) return [];
  
  // Case 1: info.spawns format (as in backup.json)
  if (worldData.info?.spawns) {
    return Object.values(worldData.info.spawns);
  }
  
  // Case 2: direct spawns property
  if (worldData.spawns) {
    return Object.values(worldData.spawns);
  }
  
  // Case 3: check for structures with type=spawn in chunks
  if (worldData.chunks) {
    const spawnsFromChunks = [];
    
    try {
      Object.entries(worldData.chunks).forEach(([chunkKey, chunk]) => {
        if (!chunk) return;
        
        Object.entries(chunk).forEach(([tileKey, tile]) => {
          if (tile?.structure?.type === 'spawn') {
            const [x, y] = tileKey.split(',').map(Number);
            spawnsFromChunks.push({
              ...tile.structure,
              position: { x, y },
              id: tile.structure.id || `spawn_${x}_${y}`
            });
          }
        });
      });
      
      if (spawnsFromChunks.length > 0) {
        return spawnsFromChunks;
      }
    } catch (e) {
      console.error('Error searching for spawns in chunks:', e);
    }
  }
  
  return [];
}

// Improved initialize function with better validation
export function initialize(options = {}) {
  // SSR guard - don't initialize terrain on server
  if (typeof window === 'undefined') {
    debugLog('Skipping map setup in SSR environment');
    return false;
  }

  try {
    // Extra validation on options to prevent common issues
    if (!options) {
      console.error('No options provided to initialize()');
      return false;
    }
    
    // Don't reinitialize if already ready with the same world
    const currentMapState = get(map);
    
    // Extract worldId with better validation
    // First check game store for current worldKey
    const gameStore = get(game);
    let worldId = gameStore && gameStore.worldKey ? gameStore.worldKey : 'default';
    
    // Handle multiple ways worldId might be provided - only override if explicitly specified
    if (typeof options.worldId === 'string' && options.worldId.length > 0) {
      worldId = options.worldId;
    } else if (options.world && typeof options.world === 'string' && options.world.length > 0) {
      worldId = options.world;
    } else if (options.world && options.world.id && typeof options.world.id === 'string') {
      worldId = options.world.id;
    }
    
    debugLog(`Using worldId: ${worldId}`);
    
    // Validate world object to ensure it has required properties
    if (options.world && typeof options.world === 'object') {
      if (options.world.seed === undefined) {
        console.error('World object is missing seed property:', options.world);
        return false;
      }
    }
    
    // Mark that we're starting initialization
    map.update(state => ({ 
      ...state, 
      initializing: true, 
      initializationAttempted: true 
    }));

    let seed;
    let initialX = options.initialX;
    let initialY = options.initialY;
    let playerLocation = options.playerLocation || null;

    // Extract seed properly regardless of input format
    if (options.world && typeof options.world === 'object') {
      seed = options.world.seed;
    } else if (typeof options.seed !== 'undefined') {
      seed = options.seed;
    }

    // Validate we have the required seed
    if (seed === undefined || seed === null) {
      console.error('No seed provided for map initialization');
      map.update(state => ({ ...state, initializing: false }));
      return false;
    }

    // Ensure seed is a valid number
    const seedNumber = typeof seed === 'string' ? Number(seed) : seed;
    if (isNaN(seedNumber)) {
      console.error(`Invalid seed value provided: ${seed}`);
      map.update(state => ({ ...state, initializing: false }));
      return false;
    }

    // Get current map state
    const currentState = get(map);
    const initialCols = currentState.cols || 20;
    const initialRows = currentState.rows || 15;

    // Set initial target position - updated priority order:
    // 1. URL parameters (initialX/Y)
    // 2. Player's last location from game store
    // 3. localStorage saved position
    // 4. World center coordinates
    // 5. Current target position in store
    // 6. Default (0,0)
    let targetPosition = { x: 0, y: 0 };
    const hasInitialCoords = initialX !== undefined && initialY !== undefined;

    if (hasInitialCoords) {
      // 1. URL parameters take highest priority
      targetPosition = { x: Math.round(initialX), y: Math.round(initialY) };
      debugLog(`Initializing map with URL position: ${targetPosition.x},${targetPosition.y}`);
    } 
    // 2. Player's last known position has higher priority than localStorage
    else if (playerLocation && typeof playerLocation.x === 'number' && typeof playerLocation.y === 'number') {
      targetPosition = { x: Math.round(playerLocation.x), y: Math.round(playerLocation.y) };
      debugLog(`Initializing map with player's last position: ${targetPosition.x},${targetPosition.y}`);
    }
    else {
      // 3. Try to load from localStorage
      const savedPosition = loadTargetFromLocalStorage(worldId);
      if (savedPosition) {
        targetPosition = savedPosition;
        debugLog(`Initializing map with saved position: ${targetPosition.x},${targetPosition.y}`);
      } else {
        // 4. Try to use world center coordinates
        const worldCenter = getWorldCenterCoordinates(worldId, options.world);
        if (worldCenter.x !== 0 || worldCenter.y !== 0) {
          targetPosition = worldCenter;
          debugLog(`Initializing map with world center: ${targetPosition.x},${targetPosition.y}`);
        } else if (currentState.target.x !== 0 || currentState.target.y !== 0) {
          // 5. Use existing target
          targetPosition = currentState.target;
          debugLog(`Initializing map with existing position: ${targetPosition.x},${targetPosition.y}`);
        } else {
          // 6. Default to 0,0
          debugLog('Initializing map with default position (0,0)');
        }
      }
    }

    // Calculate optimal cache size
    const visibleTiles = initialCols * initialRows;
    const cacheMultiplier = Math.max(1.2, Math.min(1.5, window.innerWidth / 1000));
    const initialCacheSize = Math.ceil(visibleTiles * cacheMultiplier);

    // Initialize the terrain generator
    terrain = new TerrainGenerator(seedNumber, initialCacheSize);

    // Update the map store - explicitly use the validated worldId
    map.update(state => {
      return {
        ...state,
        ready: true,
        initializing: false,
        world: worldId,  // Make sure to set this to the validated worldId
        cols: initialCols,
        rows: initialRows,
        target: targetPosition
      };
    });

    // Update URL if initial coordinates were provided (but only if they're non-zero for cleaner URLs)
    /* Remove URL updates on initialization
    if (hasInitialCoords && (initialX !== 0 || initialY !== 0)) {
      updateUrlWithCoordinates(targetPosition.x, targetPosition.y);
    }
    */

    // Always save the initial position to localStorage
    saveTargetToLocalStorage(worldId, targetPosition.x, targetPosition.y);

    console.log(`Map successfully initialized for world ${worldId}`);
    return true;
  } catch (err) {
    console.error('Error in map initialization:', err);
    map.update(state => ({ ...state, initializing: false }));
    return false;
  }
}

// Backward compatibility functions
export function setup(options = {}) {
  return initialize(options);
}

// Get current world ID
export function getCurrentWorld() {
  return get(map).world || 'default';
}

// Switch to different world
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

// Cleanup resources
export function cleanup() {
  // Reset the internal URL update flag
  isInternalUrlUpdate = false;

  // Clear any pending timeouts
  if (urlUpdateTimeout) {
    clearTimeout(urlUpdateTimeout);
    urlUpdateTimeout = null;
  }

  // Clear terrain cache
  if (terrain) {
    terrain.clearCache();
    terrain = null;
  }

  // Clear all subscriptions
  for (const [_, unsubscribe] of chunkSubscriptions.entries()) {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  }
  chunkSubscriptions.clear();

  // Reset stores
  map.set({
    ready: false,
    initializing: false,
    initializationAttempted: false,
    cols: 0,
    rows: 0,
    target: { x: 0, y: 0 },
    minimap: true,
    world: null,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragAccumX: 0,
    dragAccumY: 0,
    dragSource: null
  });

  highlightedCoords.set(null);

  entities.set({
    structure: {},
    groups: {},
    players: {},
    items: {},
    battles: {}  // Include battles in the reset
  });
}