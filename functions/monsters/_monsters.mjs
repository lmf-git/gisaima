/**
 * Centralized utility functions for monster processing in Gisaima
 * Contains shared functions used across monster modules
 */

import { getChunkKey } from "gisaima-shared/map/cartography.js";

// =============================================
// COMBAT UTILITIES
// =============================================

/**
 * Find player groups on the current tile
 * @param {object} tileData - Data for the current tile
 * @returns {Array} Array of player group objects
 */
export function findPlayerGroupsOnTile(tileData) {
  const playerGroups = [];
  
  if (tileData.groups) {
    Object.entries(tileData.groups).forEach(([groupId, groupData]) => {
      // Check if it's a player group (has owner, not a monster, and is idle)
      if (groupData.owner && 
          groupData.status === 'idle' && 
          !groupData.inBattle &&
          groupData.type !== 'monster') {
        playerGroups.push({
          id: groupId,
          ...groupData
        });
      }
    });
  }
  
  return playerGroups;
}

/**
 * Find other monster groups on the same tile that could be merged with
 * @param {object} tileData - Data for the current tile
 * @param {string} currentGroupId - ID of the current monster group
 * @returns {Array} Array of mergeable monster groups
 */
export function findMergeableMonsterGroups(tileData, currentGroupId) {
  const monsterGroups = [];
  
  if (tileData.groups) {
    Object.entries(tileData.groups).forEach(([groupId, groupData]) => {
      // Check if it's another monster group (and not the current one) that's idle and not in battle
      if (groupId !== currentGroupId && 
          groupData.type === 'monster' && 
          groupData.status === 'idle' && 
          !groupData.inBattle) {
        monsterGroups.push({
          id: groupId,
          ...groupData
        });
      }
    });
  }
  
  return monsterGroups;
}

// =============================================
// MOVEMENT UTILITIES
// =============================================

/**
 * Calculate a simple path between two points using a modified Bresenham's line algorithm
 * @param {number} startX - Starting X coordinate
 * @param {number} startY - Starting Y coordinate
 * @param {number} endX - Target X coordinate
 * @param {number} endY - Target Y coordinate
 * @param {number} maxSteps - Maximum number of steps to include in the path (default: 20)
 * @returns {Array<{x: number, y: number}>} Array of coordinates representing the path
 */
export function calculateSimplePath(startX, startY, endX, endY, maxSteps = 20) {
  // Ensure inputs are integers
  startX = Math.round(startX);
  startY = Math.round(startY);
  endX = Math.round(endX);
  endY = Math.round(endY);
  
  // Create path array with starting point
  const path = [{x: startX, y: startY}];
  
  // If start and end are the same, return just the start point
  if (startX === endX && startY === endY) {
    return path;
  }
  
  // Calculate absolute differences and direction signs
  const dx = Math.abs(endX - startX);
  const dy = Math.abs(endY - startY);
  const sx = startX < endX ? 1 : -1;
  const sy = startY < endY ? 1 : -1;
  
  // Determine error for Bresenham's algorithm
  let err = dx - dy;
  let x = startX;
  let y = startY;
  
  // Limit path length to avoid excessive computation
  let stepsLeft = Math.min(maxSteps, dx + dy);
  
  while ((x !== endX || y !== endY) && stepsLeft > 0) {
    const e2 = 2 * err;
    
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    
    // Add current position to path
    path.push({x, y});
    stepsLeft--;
  }
  
  // If path is too short, ensure the end point is included
  if (path.length < maxSteps && (path[path.length-1].x !== endX || path[path.length-1].y !== endY)) {
    path.push({x: endX, y: endY});
  }
  
  return path;
}

/**
 * Calculate distance between two locations
 * @param {object} loc1 - First location with x,y coordinates
 * @param {object} loc2 - Second location with x,y coordinates
 * @returns {number} Distance between the locations
 */
export function calculateDistance(loc1, loc2) {
  const dx = loc1.x - loc2.x;
  const dy = loc1.y - loc2.y;
  return Math.sqrt(dx*dx + dy*dy);
}

/**
 * Find structures on adjacent tiles for potential attacking
 * @param {object} db - Firebase database reference
 * @param {string} worldId - The world ID
 * @param {object} location - Current location {x, y}
 * @returns {Promise<object|null>} Adjacent tile with structure or null if none found
 */
export async function findAdjacentStructures(db, worldId, location) {
  // Define adjacent directions (including diagonals)
  const directions = [
    {dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1},
    {dx: 1, dy: 1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}, {dx: -1, dy: -1}
  ];
  
  // Randomly shuffle directions for more unpredictable behavior
  directions.sort(() => Math.random() - 0.5);
  
  for (const dir of directions) {
    const adjX = location.x + dir.dx;
    const adjY = location.y + dir.dy;
    
    // Get chunk key for this tile
    const chunkKey = getChunkKey(adjX, adjY);
    const tileKey = `${adjX},${adjY}`;
    
    // Check if tile exists and has a structure
    try {
      const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
      const tileSnapshot = await tileRef.once('value');
      const tileData = tileSnapshot.val();
      
      if (tileData) {
        // If there's a player structure, this is a good target
        if (tileData.structure && tileData.structure.owner !== 'monster') {
          return {
            x: adjX,
            y: adjY,
            structure: tileData.structure
          };
        }
        
        // Also target tiles with player groups
        if (tileData.groups) {
          const hasPlayerGroups = Object.values(tileData.groups).some(
            group => group.owner && group.owner !== 'monster'
          );
          
          if (hasPlayerGroups) {
            return {
              x: adjX,
              y: adjY,
              hasPlayerGroups: true
            };
          }
        }
      }
    } catch (error) {
      // Silently continue to next direction on error
      continue;
    }
  }
  
  return null; // No adjacent structures or player groups found
}

// =============================================
// GROUP IDENTIFICATION UTILITIES
// =============================================

/**
 * Check if a group is a monster group
 * @param {object} groupData - Group data to check
 * @returns {boolean} True if this is a monster group
 */
export function isMonsterGroup(groupData) {
  return groupData.type === 'monster';
}

/**
 * Check if a group is available for action (idle and not in battle)
 * @param {object} groupData - Group data to check
 * @returns {boolean} True if group is available for action
 */
export function isAvailableForAction(groupData) {
  return groupData.status === 'idle' && !groupData.inBattle;
}

/**
 * Count units in a group
 * @param {object} group - Group object
 * @returns {number} Unit count
 */
export function countUnits(group) {
  if (!group.units) return 1;
  return Array.isArray(group.units) ? 
    group.units.length : 
    Object.keys(group.units).length;
}

// =============================================
// RESOURCE UTILITIES
// =============================================

/**
 * Count total resources in a group's inventory
 * @param {Array} items - Array of item objects
 * @returns {number} Total resource count
 */
export function countTotalResources(items) {
  if (!items || !Array.isArray(items)) return 0;
  
  return items.reduce((total, item) => {
    return total + (item.quantity || 1);
  }, 0);
}

// =============================================
// UNIT GENERATION UTILITIES
// =============================================

/**
 * Generate individual monster unit objects for a monster group
 * @param {string} type - Type of monster
 * @param {number} qty - Number of units to generate
 * @returns {Object} Monster units with ID keys
 */
export function generateMonsterUnits(type, qty) {
  const units = {};
  
  for (let i = 0; i < qty; i++) {
    const unitId = `monster_unit_${Date.now()}_${Math.floor(Math.random() * 10000)}_${i}`;
    units[unitId] = {
      id: unitId,
      type: type
    };
  }
  
  return units;
}

// =============================================
// MESSAGE CREATION UTILITIES
// =============================================

/**
 * Create a descriptive message for monster spawns
 * @param {string} monsterName - Name of the monster type
 * @param {number} count - Number of monsters
 * @param {string} location - Location string
 * @param {object} personality - Optional personality data
 * @returns {string} Formatted message
 */
export function createMonsterSpawnMessage(monsterName, count, location, personality = null) {
  const locationText = location.replace(',', ', ');
  const personalityDesc = personality ? ` ${personality.emoji} ${personality.name}` : '';
  
  // Varied messages based on monster count and personality
  if (count <= 2) {
    return `A small group of${personalityDesc} ${monsterName} has been spotted at (${locationText})`;
  } else if (count <= 5) {
    return `A band of${personalityDesc} ${monsterName} has appeared at (${locationText})`;
  } else {
    return `A large horde of${personalityDesc} ${monsterName} has emerged at (${locationText})`;
  }
}

/**
 * Create a descriptive message for monster group growth
 * @param {string} monsterName - Name of the monster type
 * @param {number} oldCount - Previous count
 * @param {number} newCount - New count after growth
 * @param {string} location - Location string
 * @returns {string} Formatted message
 */
export function createMonsterGrowthMessage(monsterName, oldCount, newCount, location) {
  const locationText = location.replace(',', ', ');
  const addedUnits = newCount - oldCount;
  
  // Different messages based on how many joined
  if (addedUnits === 1) {
    return `Another creature has joined the ${monsterName} at (${locationText})`;
  } else {
    return `${addedUnits} more creatures have joined the ${monsterName} at (${locationText})`;
  }
}

/**
 * Create a descriptive message for monster movement
 * @param {object} monsterGroup - Monster group data
 * @param {string} targetType - Type of target
 * @param {object} targetLocation - Target location
 * @returns {string} Formatted message
 */
export function createMonsterMoveMessage(monsterGroup, targetType, targetLocation) {
  const groupName = monsterGroup.name || "Monster group";
  const size = monsterGroup.units && Object.keys(monsterGroup.units).length <= 3 ? "small" : 
               monsterGroup.units && Object.keys(monsterGroup.units).length <= 8 ? "medium-sized" : "large";
  
  // Add personality to message if available
  const personalityText = monsterGroup.personality?.emoji ? 
    ` ${monsterGroup.personality.emoji}` : '';
  
  switch (targetType) {
    case 'player_spawn':
      return `A ${size}${personalityText} ${groupName} is marching toward the settlement at (${targetLocation.x}, ${targetLocation.y})!`;
    case 'monster_structure':
      return `${personalityText} ${groupName} is moving toward their lair at (${targetLocation.x}, ${targetLocation.y}).`;
    case 'resource_hotspot':
      return `${personalityText} ${groupName} is searching for resources near (${targetLocation.x}, ${targetLocation.y}).`;
    case 'monster_home':
      return `${personalityText} ${groupName} is returning to their home at (${targetLocation.x}, ${targetLocation.y}).`;
    case 'territory_return':
      return `The territorial ${personalityText} ${groupName} is returning to their claimed area at (${targetLocation.x}, ${targetLocation.y}).`;
    default:
      return `${personalityText} ${groupName} is on the move.`;
  }
}

// =============================================
// WORLD SCANNING UTILITIES 
// =============================================

/**
 * Scan the world map for important locations
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} chunks - Chunks data
 * @returns {object} Object containing player spawns, monster structures, and resource hotspots
 */
export async function scanWorldMap(db, worldId, chunks) {
  const playerSpawns = [];
  const monsterStructures = [];
  const resourceHotspots = [];
  
  // Scan through all chunks and tiles
  for (const [chunkKey, chunkData] of Object.entries(chunks)) {
    if (!chunkData) continue;
    
    // Process each tile in the chunk
    for (const [tileKey, tileData] of Object.entries(chunkData)) {
      if (!tileData) continue;
      
      const [x, y] = tileKey.split(',').map(Number);
      const location = { x, y, chunkKey, tileKey };
      
      // Check for player spawn structures
      if (tileData.structure && tileData.structure.type === 'spawn') {
        playerSpawns.push({
          ...location,
          structure: tileData.structure
        });
      }
      
      // Check for monster structures - Updated to also check owner field
      if (tileData.structure && 
         (tileData.structure.monster === true || 
          tileData.structure.owner === 'monster' ||
          (tileData.structure.type && tileData.structure.type.includes('monster')))) {
        monsterStructures.push({
          ...location,
          structure: tileData.structure
        });
      }
      
      // Identify resource hotspots (tiles with resources)
      if (tileData.resources && Object.keys(tileData.resources).length > 0) {
        resourceHotspots.push({
          ...location,
          resources: tileData.resources
        });
      }
    }
  }
  
  return {
    playerSpawns,
    monsterStructures,
    resourceHotspots
  };
}
