import { writable, derived, get } from 'svelte/store';
import { TerrainGenerator } from '../map/noise.js';
import { ref, onValue } from "firebase/database";
import { db } from '../firebase/database.js';

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
});

export const entities = writable({
  structure: {},
  groups: {},
  players: {}
});

export const ready = derived(map, $map => $map.ready);

export const chunks = derived(
  map,
  ($map, set) => {
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
          // Subscribe directly
          const chunkRef = ref(db, `chunks/${chunkKey}`);
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
    for (const [chunkKey, unsubscribe] of chunksToRemove) {
      unsubscribe();
      chunkSubscriptions.delete(chunkKey);
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
    if (!$map.ready || !terrain) return set([]);
    
    const useExpanded = $map.minimap;
    const gridCols = useExpanded ? Math.min($map.cols * EXPANDED_COLS_FACTOR) : $map.cols;
    const gridRows = useExpanded ? Math.min($map.rows * EXPANDED_ROWS_FACTOR) : $map.rows;
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
    if (tileKey === 'lastUpdated') return;
    
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

// Enhanced setup function that accepts an optional seed
export function setup(seed = 52532532523) {
  terrain = new TerrainGenerator(seed);
  
  map.update(state => state.ready ? state : { ...state, ready: true });
};

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