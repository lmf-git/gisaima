/**
 * Centralized utility functions for monster processing in Gisaima
 * Contains shared functions used across monster modules
 */

import { getChunkKey } from "gisaima-shared/map/cartography.js";
import { MONSTER_PERSONALITIES } from "gisaima-shared/definitions/MONSTER_PERSONALITIES.js";
import { Units } from 'gisaima-shared/units/units.js';

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
          groupData.status === 'idle') {
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
// UNIT GENERATION UTILITIES
// =============================================

/**
 * Generate monster units for a group based on type and quantity
 * @param {string} monsterType - Type of monster to generate
 * @param {number} quantity - Number of units to generate
 * @returns {Object} Object of generated monster units with IDs as keys
 */
export function generateMonsterUnits(monsterType, quantity) {
  const units = {};
  
  for (let i = 0; i < quantity; i++) {
    const unitId = `monster_unit_${Date.now()}_${Math.floor(Math.random() * 10000)}_${i}`;
    
    units[unitId] = {
      id: unitId,
      type: monsterType
      // We don't need to add other properties since they'll come from the monster type definition
    };
  }
  
  return units;
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
  
  // Limit path to avoid excessive computation
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
        // If there's ANY structure (including spawn), this is a good target
        if (tileData.structure) {
          return {
            x: adjX,
            y: adjY,
            structure: tileData.structure
          };
        }
        
        // Also target tiles with player groups
        if (tileData.groups) {
          const hasPlayerGroups = Object.values(tileData.groups).some(
            group => group.owner && group.type !== 'monster'
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
  return groupData.status === 'idle';
}

/**
 * Count units in a group
 * @param {object} group - Group object
 * @returns {number} Unit count
 */
export function countUnits(group) {
  if (!group.units) return 0;
  return Array.isArray(group.units) ? 
    group.units.length : 
    Object.keys(group.units).length;
}

// =============================================
// STRUCTURE UTILITIES
// =============================================


/**
 * Check if a structure can be upgraded further
 * @param {object} structure - Structure to check
 * @param {number} maxLevel - Maximum level (default: 3)
 * @returns {boolean} True if structure can be upgraded
 */
export function canStructureBeUpgraded(structure, maxLevel = 3) {
  if (!structure) return false;
  const currentLevel = structure.level || 1;
  return currentLevel < maxLevel;
}

// =============================================
// RESOURCE UTILITIES
// =============================================

/**
 * Check if a monster group has sufficient resources for a specific requirement
 * @param {Array} monsterItems - Monster group's items
 * @param {Array} requiredResources - Required resources array of {id, quantity} or {name, quantity}
 * @returns {boolean} True if sufficient resources are available
 */
export function hasSufficientResources(monsterItems, requiredResources) {
  if (!monsterItems || !monsterItems.length || !requiredResources || !requiredResources.length) {
    return false;
  }
  
  // Create a map of available resources
  const availableResources = monsterItems.reduce((acc, item) => {
    // Handle items that might have either id or name
    const itemId = item.id || item.name;
    acc[itemId] = (acc[itemId] || 0) + (item.quantity || 1);
    return acc;
  }, {});
  
  // Check if all requirements are met
  for (const required of requiredResources) {
    // Support both id and name for backward compatibility
    const resourceId = required.id || required.name;
    if (!availableResources[resourceId] || availableResources[resourceId] < required.quantity) {
      return false;
    }
  }
  
  return true;
}

/**
 * Consume resources from a monster group
 * @param {Array} monsterItems - Monster group's items
 * @param {Array} requiredResources - Resources to consume {id, quantity} or {name, quantity}
 * @returns {Array|null} New array of remaining items or null if insufficient resources
 */
export function consumeResourcesFromItems(monsterItems, requiredResources) {
  if (!hasSufficientResources(monsterItems, requiredResources)) {
    return null;
  }
  
  // Create a copy of the monster's items
  const remainingItems = [...monsterItems];
  
  // Consume each required resource
  for (const required of requiredResources) {
    // Support both id and name for backward compatibility
    const resourceId = required.id || required.name;
    let remainingQuantity = required.quantity;
    
    // Find items that match this resource
    for (let i = 0; i < remainingItems.length; i++) {
      // Check if this item matches the required resource by id or name
      const itemId = remainingItems[i].id || remainingItems[i].name;
      if (itemId === resourceId) {
        const available = remainingItems[i].quantity || 1;
        
        if (available <= remainingQuantity) {
          // Use the entire item
          remainingQuantity -= available;
          remainingItems.splice(i, 1);
          i--; // Adjust index after removal
        } else {
          // Use part of the item
          remainingItems[i].quantity -= remainingQuantity;
          remainingQuantity = 0;
        }
        
        if (remainingQuantity === 0) break;
      }
    }
  }
  
  return remainingItems;
}

// =============================================
// MESSAGE CREATION UTILITIES (ENHANCED)
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
      return `A ${size}${personalityText} ${groupName} is marching toward the settlement spawn at (${targetLocation.x}, ${targetLocation.y})! Players beware!`;
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

/**
 * Create a message about monster construction activity
 * @param {object} monsterGroup - Monster group data
 * @param {string} activityType - Type of activity (build, upgrade, etc)
 * @param {string} structureName - Name of the structure
 * @param {object} location - Location coordinates
 * @returns {string} Formatted message
 */
export function createMonsterConstructionMessage(monsterGroup, activityType, structureName, location) {
  const groupName = monsterGroup.name || 'Monster group';
  const personalityEmoji = monsterGroup.personality?.emoji || '';
  
  let actionVerb = 'building';
  if (activityType === 'upgrade') actionVerb = 'upgrading';
  else if (activityType === 'repair') actionVerb = 'repairing';
  
  return `${personalityEmoji} ${groupName} is ${actionVerb} ${
    structureName ? 'a ' + structureName : 'a structure'
  } at (${location.x}, ${location.y})!`;
}

/**
 * Create a message about monster depositing resources
 * @param {object} monsterGroup - Monster group data
 * @param {string} structureName - Name of the structure
 * @param {number} itemCount - Number of items deposited
 * @param {object} location - Location coordinates 
 * @returns {string} Formatted message
 */
export function createResourceDepositMessage(monsterGroup, structureName, itemCount, location) {
  const groupName = monsterGroup.name || 'Monster group';
  const personalityEmoji = monsterGroup.personality?.emoji || '';
  const structureDesc = structureName || 'their structure';
  
  return `${personalityEmoji} ${groupName} ${itemCount > 1 ? 'have' : 'has'} deposited resources at ${structureDesc} at (${location.x}, ${location.y}).`;
}

/**
 * Create a message about monster group battle actions
 * @param {object} monsterGroup - Monster group data
 * @param {string} battleAction - Type of battle action (attack, join)
 * @param {string} targetType - Type of target (player, monster, structure)
 * @param {string} targetName - Name of the target
 * @param {object} location - Location coordinates
 * @returns {string} Formatted message
 */
export function createBattleActionMessage(monsterGroup, battleAction, targetType, targetName, location) {
  const groupName = monsterGroup.name || 'Monster group';
  const personalityEmoji = monsterGroup.personality?.emoji ? `${monsterGroup.personality.emoji} ` : '';
  
  if (battleAction === 'attack') {
    if (targetType === 'monster') {
      return `The ${personalityEmoji}${groupName} have turned on ${targetName} at (${location.x}, ${location.y})!`;
    } else if (targetType === 'structure') {
      return `${personalityEmoji}${groupName} are attacking ${targetName} at (${location.x}, ${location.y})!`;
    } else {
      return `${personalityEmoji}${groupName} have attacked ${targetName} at (${location.x}, ${location.y})!`;
    }
  } else if (battleAction === 'join') {
    const side = targetType || 'defenders';
    return `${personalityEmoji}${groupName} has joined the battle at (${location.x}, ${location.y}) on the side of the ${side}!`;
  }
  
  return `${personalityEmoji}${groupName} has engaged in combat at (${location.x}, ${location.y}).`;
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

/**
 * Create a database path for a tile
 * @param {string} worldId - World ID
 * @param {string} chunkKey - Chunk key
 * @param {string} tileKey - Tile key
 * @returns {string} Database path for the tile
 */
export function createTilePath(worldId, chunkKey, tileKey) {
  return `worlds/${worldId}/chunks/${chunkKey}/${tileKey}`;
}

/**
 * Create a database path for a monster group
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - Monster group with chunkKey, tileKey, and id
 * @returns {string} Database path for the monster group
 */
export function createGroupPath(worldId, monsterGroup) {
  return `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
}

/**
 * Create a database path for a structure
 * @param {string} worldId - World ID
 * @param {string} chunkKey - Chunk key
 * @param {string} tileKey - Tile key
 * @returns {string} Database path for the structure
 */
export function createStructurePath(worldId, chunkKey, tileKey) {
  return `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`;
}

/**
 * Create a database path for a chat message
 * @param {string} worldId - World ID
 * @param {string} messageId - Message ID
 * @returns {string} Database path for the chat message
 */
export function createChatMessagePath(worldId, messageId) {
  return `worlds/${worldId}/chat/${messageId}`;
}

/**
 * Generate a unique monster-related ID
 * @param {string} prefix - ID prefix
 * @param {number} now - Current timestamp
 * @returns {string} Generated ID
 */
export function generateMonsterId(prefix, now) {
  return `${prefix}_${now}_${Math.floor(Math.random() * 10000)}`;
}

// =============================================
// MOBILIZATION/DEMOBILIZATION UTILITIES
// =============================================

/**
 * Generate a message for monster group mobilization
 * @param {object} monsterGroup - Monster group data
 * @param {string} structureName - Name of the structure
 * @param {object} location - Location coordinates
 * @returns {string} Formatted mobilization message
 */
export function createMonsterMobilizationMessage(monsterGroup, structureName, location) {
  const groupName = monsterGroup.name || "Monster group";
  const personalityEmoji = monsterGroup.personality?.emoji || '';
  const unitCount = monsterGroup.units ? Object.keys(monsterGroup.units).length : 0;
  
  let sizeDesc = unitCount <= 3 ? "small" : 
                 unitCount <= 6 ? "sizeable" : "large";
  
  return `A ${sizeDesc} ${personalityEmoji} ${groupName} has mobilized from ${structureName} at (${location.x}, ${location.y})!`;
}

// Constants for mobilization/demobilization
export const MIN_UNITS_TO_MOBILIZE = 4; // Minimum units needed to mobilize
export const MOBILIZATION_CHANCE = .10; // 8% chance per tick for eligible structures
export const EXPLORATION_TICKS = 15; // Exploration phase lasts 5 ticks
export const PLAYER_STRUCTURE_ATTACK_CHANCE = 0.15; // 5% chance to target player structures
export const PLAYER_STRUCTURE_SEARCH_RADIUS = 25; // Search radius for player structures in tiles
export const MIN_DISTANCE_FROM_SPAWN = 6; // Minimum tiles away from spawn to allow building

/**
 * Check if a monster structure can mobilize units
 * @param {object} structure - The structure data
 * @param {object} tileData - Full tile data
 * @returns {boolean} True if structure can mobilize
 */
export function canStructureMobilize(structure, tileData) {
  // Must be a monster structure
  if (!structure.monster) return false;
  
  // Check if enough units available in structure
  const unitCount = getAvailableStructureUnitCount(structure);
  if (unitCount < MIN_UNITS_TO_MOBILIZE) return false;
  
  return true;
}

/**
 * Get the count of available units in a monster structure
 * @param {object} structure - The structure data
 * @returns {number} Number of available units
 */
export function getAvailableStructureUnitCount(structure) {
  if (!structure || !structure.units) {
    return 0;
  }
  
  // Handle array or object format for units
  return Array.isArray(structure.units) ? 
    structure.units.length : 
    Object.keys(structure.units).length;
}

/**
 * Create a new monster group from structure units
 * @param {string} worldId - World ID
 * @param {object} structure - Source structure
 * @param {object} location - Location coordinates
 * @param {string} monsterType - Type of monsters to mobilize
 * @param {object} updates - Updates object to modify
 * @param {number} now - Current timestamp
 * @param {object} targetStructure - Optional player structure to target
 * @returns {string|null} New group ID or null if failed
 */
export async function createMonsterGroupFromStructure(worldId, structure, location, monsterType, updates, now, targetStructure = null) {
  // Generate group ID
  const groupId = generateMonsterId('monster', now);
  const chunkKey = getChunkKey(location.x, location.y);
  const tileKey = `${location.x},${location.y}`;
  
  // Create units for the new group
  const unitCount = Math.floor(Math.random() * 3) + 2; // 2-4 units
  const units = generateMonsterUnits(monsterType, unitCount);
  
  // Get a personality - use more aggressive one if targeting a player structure
  const personality = targetStructure ? 
    MONSTER_PERSONALITIES.AGGRESSIVE : 
    getRandomPersonality(monsterType);
  
  // Create the monster group object
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  const groupData = {
    id: groupId,
    name: Units.getUnit(monsterType, 'monster')?.name || "Monster Group",
    type: 'monster',
    status: 'mobilizing',
    mobilizedFromStructure: structure.id,
    preferredStructureId: structure.id,
    personality: {
      id: personality.id,
      name: personality.name,
      emoji: personality.emoji
    },
    explorationPhase: true,
    explorationTicks: EXPLORATION_TICKS, // Use ticks instead of duration
    units: units,
    x: location.x,
    y: location.y
  };
  
  // If targeting a player structure, add targeting info
  if (targetStructure) {
    groupData.targetStructure = {
      x: targetStructure.x,
      y: targetStructure.y,
      id: targetStructure.structure.id,
      type: targetStructure.structure.type
    };
    // Set status directly to moving if we have a target
    groupData.status = 'idle'; // Will be set to moving by the strategy tick
    // Add intent for strategy processing
    groupData.attackIntent = 'player_structure';
  }
  
  updates[groupPath] = groupData;
  
  // Add chat message
  const chatMessageId = generateMonsterId('monster_mobilize', now);
  let messageText = createMonsterMobilizationMessage(
    { name: Units.getUnit(monsterType, 'monster')?.name, personality, units }, 
    structure.name || "Monster Structure", 
    location
  );
  
  // Add targeting info to message if applicable
  if (targetStructure) {
    messageText += ` They appear to be heading toward the ${targetStructure.structure.name || 'settlement'} at (${targetStructure.x}, ${targetStructure.y})!`;
  }
  
  updates[createChatMessagePath(worldId, chatMessageId)] = {
    text: messageText,
    type: 'event',
    timestamp: now,
    location: { x: location.x, y: location.y }
  };
  
  return groupId;
}

// =============================================
// NAMING UTILITIES
// =============================================

/**
 * Generate a size-based name for merged monster groups
 * @param {number} unitCount - Total number of units in the group
 * @param {string|object} monsterType - Base monster type or object with multiple types and counts
 * @param {string} originalName - Original name of largest group (used as fallback)
 * @returns {string} Size-appropriate group name
 */
export function generateMergedGroupName(unitCount, monsterType, originalName = null) {
  // Default name if we can't determine a better one
  if (!unitCount || unitCount <= 0) {
    return originalName || "Monster Group";
  }
  
  // Create size-based name prefix
  let sizePrefix;
  if (unitCount <= 3) {
    sizePrefix = "Small Band of";
  } else if (unitCount <= 7) {
    sizePrefix = "Raiding Party of";
  } else if (unitCount <= 12) {
    sizePrefix = "Warband of";
  } else if (unitCount <= 20) {
    sizePrefix = "Horde of";
  } else if (unitCount <= 30) {
    sizePrefix = "Legion of";
  } else {
    sizePrefix = "Massive Swarm of";
  }
  
  // Check if this is a mixed monster group (monsterType is an object with multiple types)
  if (monsterType && typeof monsterType === 'object') {
    // Get the top 2 most common monster types
    const sortedTypes = Object.entries(monsterType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);
    
    // If we have at least 2 types with significant numbers, create a mixed name
    if (sortedTypes.length >= 2 && sortedTypes[1][1] >= 2) {
      // Get first two dominant types - capitalize first letter
      const type1 = sortedTypes[0][0].charAt(0).toUpperCase() + sortedTypes[0][0].slice(1) + 's';
      const type2 = sortedTypes[1][0].charAt(0).toUpperCase() + sortedTypes[1][0].slice(1) + 's';
      
      // For very mixed groups with 3+ types
      if (Object.keys(monsterType).length >= 3) {
        return `${sizePrefix} Mixed Creatures`;
      } else {
        return `${sizePrefix} ${type1} and ${type2}`;
      }
    } else {
      // If one type is dominant, just use that
      const dominantType = sortedTypes[0][0].charAt(0).toUpperCase() + sortedTypes[0][0].slice(1);
      return `${sizePrefix} ${dominantType}s`;
    }
  }
  
  // Handle simple string monsterType (single type)
  if (typeof monsterType === 'string') {
    // Extract just the main monster name without modifiers
    const baseTypeName = monsterType.replace(/^(.*?)(?:\s|$)/, '$1');
    // Capitalize first letter
    const capitalizedType = baseTypeName.charAt(0).toUpperCase() + baseTypeName.slice(1);
    
    // Check if this is already a plural form
    const isAlreadyPlural = capitalizedType.endsWith('s');
    const typeNameToUse = isAlreadyPlural ? capitalizedType : `${capitalizedType}s`;
    
    return `${sizePrefix} ${typeNameToUse}`;
  }
  
  // If we couldn't determine a type, try to extract from original name
  if (originalName) {
    // Try to extract from original name
    const nameParts = originalName.split(' ');
    if (nameParts.length > 0) {
      const baseTypeName = nameParts[nameParts.length - 1];
      return `${sizePrefix} ${baseTypeName}`;
    }
  }
  
  // Ultimate fallback
  return `${sizePrefix} Creatures`;
}

/**
 * Get a random monster personality
 * @param {string} monsterType - Type of monster (can influence personality selection)
 * @returns {Object} Selected personality object
 */
export function getRandomPersonality(monsterType) {
  const personalities = Object.values(MONSTER_PERSONALITIES);
  
  // Some monster types might have personality preferences
  if (monsterType) {
    const unitDefinition = Units.getUnit(monsterType, 'monster');
    
    // If this monster type has preferred personalities defined in UNITS.js
    if (unitDefinition && unitDefinition.personalityPreferences && unitDefinition.personalityPreferences.length > 0) {
      const preferredTypes = unitDefinition.personalityPreferences
        .map(id => MONSTER_PERSONALITIES[id])
        .filter(Boolean); // Filter out any undefined entries
      
      // Return a random preferred personality if any are found
      if (preferredTypes.length > 0) {
        return preferredTypes[Math.floor(Math.random() * preferredTypes.length)];
      }
    }
  }
  
  // Default random selection
  return personalities[Math.floor(Math.random() * personalities.length)];
}

/**
 * Check if a tile is suitable for monster building
 * @param {object} tileData - Tile data to check
 * @returns {boolean} True if suitable for building
 */
export function isSuitableForMonsterBuilding(tileData) {
  // Don't build on tiles with any existing structures
  if (tileData.structure) {
    return false;
  }
  
  // Check for any groups (including monsters) that are building or in other incompatible states
  if (tileData.groups) {
    for (const groupId in tileData.groups) {
      const group = tileData.groups[groupId];
      
      // Don't build if any group is already building
      if (group.status === 'building') {
        return false;
      }
      
      // Don't build if any non-monster group is present
      if (group.type !== 'monster') {
        return false;
      }
      
      // Don't build if any group is in battle
      if (group.status === 'fighting') {
        return false;
      }
    }
  }
  
  // Don't build on tiles with ongoing battles
  if (tileData.battles && Object.keys(tileData.battles).length > 0) {
    return false;
  }
  
  return true;
}
