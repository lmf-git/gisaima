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
  
  // Get monster data to access motion capabilities
  const monsterData = Units.getUnit(monsterType, 'monster');
  
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
 * Check if a tile is a water tile
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} terrainGenerator - Instance of TerrainGenerator
 * @returns {boolean} True if the tile is water
 */
export function isWaterTile(x, y, terrainGenerator) {
  if (!terrainGenerator) return false;
  
  const terrainData = terrainGenerator.getTerrainData(x, y);
  
  // Add debug log for water tile checking in development environments
  if (process.env.NODE_ENV === 'development' && x % 100 === 0 && y % 100 === 0) {
    console.log(`[BIOME_DEBUG] Checking if (${x}, ${y}) is water | Biome: ${terrainData?.biome?.name || 'unknown'} | Water flag: ${terrainData?.biome?.water || false}`);
  }
  
  // Use the simplified check that relies on biome.water property
  return terrainData?.biome?.water === true;
}

/**
 * Check if a monster is compatible with a specific biome
 * @param {Object} monsterData - Monster unit data
 * @param {String} biomeName - Name of the biome to check
 * @param {Boolean} isWaterTile - Whether the tile is a water tile
 * @returns {Boolean} True if the monster can spawn in this biome
 */
export function isBiomeCompatible(monsterData, biomeName, isWaterTile) {
  // Debug log start of compatibility check
  const debugLogs = [];
  debugLogs.push(`Checking biome compatibility for monster '${monsterData.id || monsterData.name}' in biome '${biomeName}' (Water: ${isWaterTile ? 'Yes' : 'No'})`);
  
  // If monster has no biome preference, it can spawn anywhere
  if (!monsterData.biomePreference) {
    debugLogs.push(`- No biome preference defined, checking only water/land compatibility`);
    
    // But still respect water/land restrictions
    if (isWaterTile) {
      const canTraverse = canTraverseWater(monsterData);
      debugLogs.push(`- Water tile check: ${canTraverse ? 'PASS' : 'FAIL'} (Can traverse water: ${canTraverse})`);
      
      // Log all debug messages at once
      console.log(`[BIOME_DEBUG] ${debugLogs.join('\n')}`);
      return canTraverse;
    }
    
    const canTraverse = canTraverseLand(monsterData);
    debugLogs.push(`- Land tile check: ${canTraverse ? 'PASS' : 'FAIL'} (Can traverse land: ${canTraverse})`);
    
    // Log all debug messages at once
    console.log(`[BIOME_DEBUG] ${debugLogs.join('\n')}`);
    return canTraverse;
  }
  
  debugLogs.push(`- Biome preferences: ${monsterData.biomePreference.join(', ')}`);
  
  // First enforce water/land compatibility as a hard requirement
  if (isWaterTile && !canTraverseWater(monsterData)) {
    debugLogs.push(`- FAILED: Monster cannot traverse water`);
    console.log(`[BIOME_DEBUG] ${debugLogs.join('\n')}`);
    return false;
  }
  
  if (!isWaterTile && !canTraverseLand(monsterData)) {
    debugLogs.push(`- FAILED: Monster cannot traverse land`);
    console.log(`[BIOME_DEBUG] ${debugLogs.join('\n')}`);
    return false;
  }
  
  // Match biome categories to monster preferences
  const biomeLower = biomeName.toLowerCase();
  
  // Define biome categories that match to preference types
  const biomeCategories = {
    'forest': ['forest', 'woodland', 'grove', 'jungle', 'rainforest', 'enchanted_grove', 'deep_forest'],
    'mountain': ['mountain', 'peak', 'highland', 'hill', 'cliff', 'ridge', 'slope'],
    'plains': ['plain', 'grassland', 'meadow', 'savanna', 'prairie'],
    'desert': ['desert', 'dune', 'arid', 'dry', 'sand', 'barren'],
    'swamp': ['swamp', 'marsh', 'bog', 'wetland', 'mudflat', 'moor'],
    'tundra': ['tundra', 'snow', 'ice', 'frozen', 'glacier', 'arctic'],
    'ocean': ['ocean', 'sea', 'shallows', 'deep_ocean'],
    'river': ['river', 'stream', 'lake', 'water_channel', 'rivulet'],
    'ruins': ['ruins', 'ancient', 'abandoned', 'scorched', 'caldera', 'volcanic']
  };
  
  // Check if any of the monster's biome preferences match the biome categories that apply to this biome
  for (const preference of monsterData.biomePreference) {
    // Direct match with preference
    if (biomeLower.includes(preference.toLowerCase())) {
      debugLogs.push(`- MATCHED: Direct match with preference '${preference}'`);
      console.log(`[BIOME_DEBUG] ${debugLogs.join('\n')}`);
      return true;
    }
    
    // Check for category match
    for (const [category, biomeTypes] of Object.entries(biomeCategories)) {
      if (preference.toLowerCase() === category) {
        // If monster prefers this category, check if biome belongs to it
        const matchingBiomeTypes = biomeTypes.filter(type => biomeLower.includes(type));
        if (matchingBiomeTypes.length > 0) {
          debugLogs.push(`- MATCHED: Category '${category}' via biome types: ${matchingBiomeTypes.join(', ')}`);
          console.log(`[BIOME_DEBUG] ${debugLogs.join('\n')}`);
          return true;
        }
      }
    }
  }
  
  // If water-specific monster and this is water, allow it (special case)
  if (isWaterTile && monsterData.motion && 
      (monsterData.motion.includes('water') || monsterData.motion.includes('aquatic')) &&
      monsterData.biomePreference.some(pref => 
        pref.toLowerCase() === 'ocean' || pref.toLowerCase() === 'sea' || pref.toLowerCase() === 'river'
      )) {
    debugLogs.push(`- MATCHED: Water monster in water tile with matching water biome preference`);
    console.log(`[BIOME_DEBUG] ${debugLogs.join('\n')}`);
    return true;
  }
  
  debugLogs.push(`- NO MATCH: Monster biome preferences don't match this biome`);
  console.log(`[BIOME_DEBUG] ${debugLogs.join('\n')}`);
  return false;
}

/**
 * Check if a group can traverse water tiles
 * @param {object} group - The group to check
 * @returns {boolean} True if the group can traverse water
 */
export function canTraverseWater(group) {
  if (!group) return false;
  
  // Check if group has motion property from unit definition
  if (group.motion) {
    return group.motion.includes('water') || 
           group.motion.includes('aquatic') || 
           group.motion.includes('flying');
  }
  
  // Backwards compatibility for older groups
  return group.motion?.includes('water') || 
         group.motion?.includes('aquatic') || 
         group.motion?.includes('flying');
}

/**
 * Check if a group can traverse land (non-water) tiles
 * @param {object} group - The group to check
 * @returns {boolean} True if the group can traverse land
 */
export function canTraverseLand(group) {
  if (!group) return true; // Default to true for backwards compatibility
  
  // Check if group has motion capabilities defined
  if (group.motion) {
    // If the group ONLY has water motion and no other capabilities, it can't traverse land
    if (group.motion.length === 1 && 
       (group.motion.includes('water') || group.motion.includes('aquatic'))) {
      return false;
    }
  }
  
  // All other groups can traverse land
  return true;
}

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
 * @param {object} chunks - Pre-loaded chunks data
 * @returns {Promise<object|null>} Adjacent tile with structure or null if none found
 */
export async function findAdjacentStructures(db, worldId, location, chunks) {
  // Define adjacent directions (including diagonals)
  const directions = [
    {dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1},
    {dx: 1, dy: 1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}, {dx: -1, dy: -1}
  ];
  
  // Randomly shuffle directions for more unpredictable behavior
  directions.sort(() => Math.random() - 0.5);
  
  // Require chunks data
  if (!chunks) return null;
  
  for (const dir of directions) {
    const adjX = location.x + dir.dx;
    const adjY = location.y + dir.dy;
    
    // Get chunk key for this tile
    const chunkKey = getChunkKey(adjX, adjY);
    const tileKey = `${adjX},${adjY}`;
    
    // Check if this location exists in chunks data
    if (chunks[chunkKey] && chunks[chunkKey][tileKey]) {
      const tileData = chunks[chunkKey][tileKey];
      
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
    }
    // No fallback to database reads - simply continue to next direction
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
  // Only idle groups are available for new actions
  // Explicitly check that group is not in any of these states:
  // - fighting (in battle)
  // - moving (already moving)
  // - gathering (collecting resources)
  // - building (constructing something)
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
 * @param {Array|Object} monsterItems - Monster group's items (array or object format)
 * @param {Array} requiredResources - Required resources array of {id, quantity} or {name, quantity}
 * @returns {boolean} True if sufficient resources are available
 */
export function hasSufficientResources(monsterItems, requiredResources) {
  if (!monsterItems || !requiredResources || !requiredResources.length) {
    return false;
  }
  
  // Create a map of available resources
  const availableResources = {};
  
  // Handle items as object (new format)
  if (!Array.isArray(monsterItems) && typeof monsterItems === 'object') {
    // Simply copy the object since it's already in {itemCode: quantity} format
    // Also normalize keys to uppercase for consistent matching
    Object.entries(monsterItems).forEach(([itemCode, quantity]) => {
      const upperItemCode = itemCode.toUpperCase();
      availableResources[upperItemCode] = quantity;
      
      // Also index by lowercase for backward compatibility
      availableResources[itemCode.toLowerCase()] = quantity;
    });
  } 
  // Handle items as array (legacy format)
  else if (Array.isArray(monsterItems)) {
    monsterItems.forEach(item => {
      // Handle items that might have either id or name
      const itemId = (item.id || item.name || '').toUpperCase();
      const itemName = (item.name || '').toUpperCase();
      
      if (itemId) {
        availableResources[itemId] = (availableResources[itemId] || 0) + (item.quantity || 1);
      }
      
      // Also index by name for backward compatibility
      if (itemName && itemName !== itemId) {
        availableResources[itemName] = (availableResources[itemName] || 0) + (item.quantity || 1);
      }
    });
  }
  
  // Check if all requirements are met
  for (const required of requiredResources) {
    // Support both id and name for backward compatibility
    const resourceId = ((required.id || required.name) || '').toUpperCase();
    const resourceName = (required.name || '').toUpperCase();
    
    // Check by ID
    if (resourceId && availableResources[resourceId] >= required.quantity) {
      continue; // This requirement is met
    }
    
    // Check by name as fallback
    if (resourceName && resourceName !== resourceId && 
        availableResources[resourceName] >= required.quantity) {
      continue; // This requirement is met
    }
    
    // If we get here, the requirement is not met
    return false;
  }
  
  return true;
}

/**
 * Consume resources from a monster group
 * @param {Array|Object} monsterItems - Monster group's items (array or object format)
 * @param {Array} requiredResources - Resources to consume {id, quantity} or {name, quantity}
 * @returns {Array|Object|null} New array or object of remaining items or null if insufficient resources
 */
export function consumeResourcesFromItems(monsterItems, requiredResources) {
  if (!hasSufficientResources(monsterItems, requiredResources)) {
    return null;
  }
  
  // Check format type
  const isObjectFormat = !Array.isArray(monsterItems) && typeof monsterItems === 'object';
  
  if (isObjectFormat) {
    // Work with object format (new)
    const remainingItems = {...monsterItems};
    
    // Process each required resource
    for (const required of requiredResources) {
      // Get resource ID or name (prefer ID if available)
      const resourceId = (required.id || required.name || '').toUpperCase();
      const requiredQuantity = required.quantity || 1;
      
      // Try to find this resource in the items
      if (remainingItems[resourceId]) {
        // Directly reduce the quantity
        const remaining = remainingItems[resourceId] - requiredQuantity;
        if (remaining > 0) {
          remainingItems[resourceId] = remaining;
        } else {
          delete remainingItems[resourceId];
        }
      } else {
        // Try with lowercase as fallback
        const lowercaseId = resourceId.toLowerCase();
        if (remainingItems[lowercaseId]) {
          const remaining = remainingItems[lowercaseId] - requiredQuantity;
          if (remaining > 0) {
            remainingItems[lowercaseId] = remaining;
          } else {
            delete remainingItems[lowercaseId];
          }
        }
        // If not found, try any other case variations in the object
        else {
          const matchingKey = Object.keys(remainingItems).find(key => 
            key.toUpperCase() === resourceId);
          
          if (matchingKey) {
            const remaining = remainingItems[matchingKey] - requiredQuantity;
            if (remaining > 0) {
              remainingItems[matchingKey] = remaining;
            } else {
              delete remainingItems[matchingKey];
            }
          }
        }
      }
    }
    
    return remainingItems;
  } else {
    // Work with array format (legacy)
    // Create a copy of the monster's items
    const remainingItems = [...(monsterItems || [])];
    
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
    case 'resources':
      return `${personalityText} ${groupName} is investigating signs of resources at (${targetLocation.x}, ${targetLocation.y}).`;
    case 'water_feature':
      return `${personalityText} ${groupName} is heading toward water at (${targetLocation.x}, ${targetLocation.y}).`;
    case 'biome_transition':
      return `${personalityText} ${groupName} is exploring the changing landscape at (${targetLocation.x}, ${targetLocation.y}).`;
    case 'exploration':
      return `${personalityText} ${groupName} is scouting the area around (${targetLocation.x}, ${targetLocation.y}).`;
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
 * @param {object} chunks - Chunks data
 * @returns {object} Object containing player spawns, monster structures, player structures, and resource hotspots
 */
export function scanWorldMap(chunks) {
  const playerSpawns = [];
  const monsterStructures = [];
  const resourceHotspots = [];
  const playerStructures = []; // Added player structures collection
  
  // Check if chunks is null or undefined to prevent Object.entries() error
  if (!chunks) {
    console.log("Warning: No chunks data provided to scanWorldMap");
    return {
      playerSpawns,
      monsterStructures,
      resourceHotspots,
      playerStructures // Add to return
    };
  }
  
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
      
      // Check for player structures (any non-monster structure that isn't a spawn)
      else if (tileData.structure && 
          tileData.structure.type !== 'spawn' && 
          !tileData.structure.monster) {
        playerStructures.push({
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
    resourceHotspots,
    playerStructures // Include in return value
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
export const PLAYER_STRUCTURE_SEARCH_RADIUS = 40; // Search radius for player structures in tiles (increased from 25)
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
 * Create a new monster group from a structure
 * @param {string} worldId World ID
 * @param {Object} structure Structure data
 * @param {Object} location Location {x, y}
 * @param {string} monsterType Type of monster to create
 * @param {Object} updates Reference to updates object
 * @param {number} now Current timestamp
 * @param {Object} targetStructure Optional target structure
 * @returns {string|null} New group ID or null if failed
 */
export async function createMonsterGroupFromStructure(
  worldId,
  structure,
  location,
  monsterType,
  updates,
  now,
  targetStructure = null
) {
  // Safety check - need monsterCount to mobilize
  if (!structure.monsterCount || structure.monsterCount <= 0) {
    return null;
  }

  const chunkX = Math.floor(location.x / 20);
  const chunkY = Math.floor(location.y / 20);
  const chunkKey = `${chunkX},${chunkY}`;
  const tileKey = `${location.x},${location.y}`;
  
  // Generate a group ID
  const groupId = `monster_${now}_${Math.floor(Math.random() * 10000)}`;
  
  // ENHANCED: Scale mobilization percentage based on total monster count
  // Small structures mobilize 25-40%, medium 30-50%, large 40-60%
  let mobilizeBasePercent, mobilizeRangePercent;
  
  if (structure.monsterCount < 20) {
    mobilizeBasePercent = 0.25;
    mobilizeRangePercent = 0.15;
  } else if (structure.monsterCount < 50) {
    mobilizeBasePercent = 0.3;
    mobilizeRangePercent = 0.2;
  } else {
    mobilizeBasePercent = 0.4;
    mobilizeRangePercent = 0.2;
  }
  
  const mobilizePercent = mobilizeBasePercent + (Math.random() * mobilizeRangePercent);
  
  // Calculate raw count, and apply min/max limits based on structure size
  let mobilizeCount = Math.floor(structure.monsterCount * mobilizePercent);
  
  // Ensure minimum viable group size based on structure size
  let minGroupSize = 3; // Default minimum
  
  if (structure.monsterCount >= 30) minGroupSize = 5;
  if (structure.monsterCount >= 60) minGroupSize = 8;
  
  // Also enforce maximum group size to prevent massive armies
  const maxGroupSize = Math.min(30, Math.ceil(structure.monsterCount * 0.7));
  
  // Apply limits
  mobilizeCount = Math.max(minGroupSize, Math.min(mobilizeCount, maxGroupSize));
  
  // ENHANCED: Select monster type based on structure's monster count
  // Stronger monster types become available with higher monster counts
  const availableTypes = getAvailableMonsterTypes(structure);
  
  // Select monster type with weighting toward appropriate power level
  monsterType = selectMonsterTypeByPower(availableTypes, structure.monsterCount);
  
  // Get monster data
  const monsterData = Units.getUnit(monsterType, 'monster');
  if (!monsterData) {
    return null;
  }
  
  // Generate individual monster units
  const units = generateMonsterUnits(monsterType, mobilizeCount);
  
  // Assign a personality to the monster group - prefer same as structure if available
  const structurePersonality = structure.personality?.id;
  const personality = structurePersonality ? 
    MONSTER_PERSONALITIES[structurePersonality] || getRandomPersonality() : 
    getRandomPersonality();
  
  // Create the monster group object
  const monsterGroup = {
    id: groupId,
    name: monsterData.name,
    type: 'monster',
    status: 'idle',
    units: units,
    x: location.x,
    y: location.y,
    // Add motion capabilities from monster type
    motion: monsterData.motion || ['ground'], // Default to ground if not specified
    // Track which structure this group came from
    mobilizedFromStructure: structure.id,
    preferredStructureId: structure.id,
    // Add personality data
    personality: {
      id: personality.id,
      name: personality.name,
      emoji: personality.emoji
    }
  };
  
  // If targeting a player structure, add target info
  if (targetStructure) {
    monsterGroup.targetStructure = {
      x: targetStructure.x,
      y: targetStructure.y
    };
  }
  
  // Set the complete monster group
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  updates[groupPath] = monsterGroup;
  
  // Add message about monsters mobilizing - use strength-appropriate language
  let mobilizationStrength = "A group of";
  if (mobilizeCount >= 15) mobilizationStrength = "A large horde of";
  else if (mobilizeCount >= 8) mobilizationStrength = "A sizeable force of";
  else if (structure.monsterCount >= 50) mobilizationStrength = "A powerful contingent of";
  
  const chatMessageKey = `chat_monster_mobilize_${now}_${Math.floor(Math.random() * 1000)}`;
  updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
    text: `${mobilizationStrength} ${mobilizeCount} ${personality.emoji || ''} ${monsterData.name} have mobilized from the ${structure.name || 'monster structure'} at (${location.x}, ${location.y})!${targetStructure ? ' They appear to be heading toward a player structure.' : ''}`,
    type: 'event',
    timestamp: now,
    location: {
      x: location.x,
      y: location.y
    }
  };
  
  // IMPORTANT: Reduce the monster count in the structure
  const structurePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`;
  const newMonsterCount = Math.max(0, structure.monsterCount - mobilizeCount);
  updates[`${structurePath}/monsterCount`] = newMonsterCount;
  
  // Update last mobilized timestamp
  updates[`${structurePath}/lastMobilized`] = now;
  
  return groupId;
}

/**
 * Get available monster types based on structure type and monster count
 * @param {Object} structure The monster structure
 * @returns {Array} Array of available monster types
 */
function getAvailableMonsterTypes(structure) {
  // Use power values from UNITS.js to categorize monsters
  const monsterTypes = {
    // Basic monsters (power < 1.0)
    basic: ['ork', 'skeleton'],
    
    // Standard monsters (power 1.0-1.9)
    standard: ['bandit', 'wolf', 'spider'],
    
    // Elite monsters (power 2.0+)
    elite: ['troll', 'elemental']
  };
  
  let availableTypes = [...monsterTypes.basic];
  
  // Add standard monsters if structure has enough monsters
  if (structure.monsterCount >= 20) {
    availableTypes = availableTypes.concat(monsterTypes.standard);
  }
  
  // Add elite monsters if structure has enough monsters
  if (structure.monsterCount >= 40) {
    availableTypes = availableTypes.concat(monsterTypes.elite);
  }
  
  // Structure type can influence available types
  if (structure.type) {
    if (structure.type === 'monster_hive') {
      availableTypes.push('spider'); // Ensure spiders are available in hives
    } else if (structure.type === 'monster_fortress') {
      // Fortresses should have higher-tier monsters
      availableTypes.push('troll', 'skeleton'); 
      
      // Very strong fortresses can spawn elite monsters regardless of count
      if (structure.level >= 3 || structure.monsterCount >= 30) {
        availableTypes.push(...monsterTypes.elite);
      }
    } else if (structure.type === 'monster_lair') {
      availableTypes.push('wolf', 'bandit'); 
    } else if (structure.type === 'monster_den') {
      availableTypes.push('elemental'); 
    }
  }
  
  // If structure has monsterTypes data (tracking types that demobilized into it)
  // We use that to prioritize those types
  if (structure.monsterTypes) {
    const structureTypes = Object.keys(structure.monsterTypes);
    // Add any new types from the structure's tracked types
    availableTypes = availableTypes.concat(
      structureTypes.filter(type => !availableTypes.includes(type))
    );
  }
  
  return [...new Set(availableTypes)]; // Remove duplicates
}

/**
 * Select a monster type appropriate for the structure's power level
 * @param {Array} availableTypes Array of available monster types
 * @param {number} monsterCount Total monsters in the structure
 * @returns {string} Selected monster type
 */
function selectMonsterTypeByPower(availableTypes, monsterCount) {
  // Default to basic type if no types available
  if (!availableTypes || availableTypes.length === 0) {
    return 'ork';
  }
  
  // Get power data for all monster types
  const monsterPowerMap = {};
  for (const type of availableTypes) {
    const unitData = Units.getUnit(type, 'monster');
    if (unitData && unitData.power) {
      monsterPowerMap[type] = unitData.power;
    } else {
      monsterPowerMap[type] = 1.0; // Default power if not found
    }
  }
  
  // Calculate target power based on structure size
  // Larger structures send out more powerful monsters
  let targetPower;
  if (monsterCount < 15) {
    targetPower = 0.9; // Low power
  } else if (monsterCount < 30) {
    targetPower = 1.1; // Medium power
  } else if (monsterCount < 50) {
    targetPower = 1.5; // High power
  } else {
    targetPower = 2.0; // Maximum power
  }
  
  // Add some randomness to target power (+/- 30%)
  targetPower *= (0.7 + (Math.random() * 0.6));
  
  // For very large structures (60+ monsters), prioritize elite monsters
  if (monsterCount >= 60) {
    // Higher chance for elite monsters (30% chance)
    if (Math.random() < 0.3) {
      // Elite monsters have power >= 2.0
      const eliteTypes = availableTypes.filter(type => {
        return monsterPowerMap[type] >= 2.0;
      });
      
      if (eliteTypes.length > 0) {
        // Return random elite monster type
        return eliteTypes[Math.floor(Math.random() * eliteTypes.length)];
      }
    }
  }
  
  // Find closest match to target power
  let selectedType = availableTypes[0];
  let minPowerDiff = Math.abs(monsterPowerMap[selectedType] - targetPower);
  
  for (const type of availableTypes) {
    const powerDiff = Math.abs(monsterPowerMap[type] - targetPower);
    if (powerDiff < minPowerDiff) {
      minPowerDiff = powerDiff;
      selectedType = type;
    }
  }
  
  return selectedType;
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
