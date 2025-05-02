/**
 * Monster Spawn processing for Gisaima
 * Handles spawning monster groups near player activity
 */

import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";
import { Units } from 'gisaima-shared/units/units.js';

// Constants for monster spawning
const SPAWN_CHANCE = .1; // 40% chance to spawn monsters in an active area
const MAX_SPAWN_DISTANCE = 9; // Maximum distance from player activity to spawn
const MIN_SPAWN_DISTANCE = 4; // Minimum distance from player activity to spawn
const MAX_MONSTERS_PER_CHUNK = 10; // Maximum monster groups per chunk

/**
 * Generate individual monster unit objects for a monster group
 * @param {string} monsterType - Type of monster
 * @param {number} qty - Number of units to generate
 * @returns {Object} Monster units with ID keys
 */
function generateMonsterUnits(monsterType, qty) {
  const units = {};
  
  for (let i = 0; i < qty; i++) {
    const unitId = `monster_unit_${Date.now()}_${Math.floor(Math.random() * 10000)}_${i}`;
    units[unitId] = {
      id: unitId,
      type: monsterType
    };
  }
  
  return units;
}

/**
 * Spawn monsters near player activity
 * @param {string} worldId - The world ID
 * @returns {Promise<number>} - Number of monster groups spawned
 */
export async function spawnMonsters(worldId) {
  const db = getDatabase();
  let monstersSpawned = 0;
  
  try {
    // Get all chunks for this world
    const chunksRef = db.ref(`worlds/${worldId}/chunks`);
    const chunksSnapshot = await chunksRef.once('value');
    const chunks = chunksSnapshot.val();
    
    if (!chunks) {
      logger.info(`No chunks found in world ${worldId}`);
      return 0;
    }

    // Track locations with recent player activity and existing monsters
    const activeLocations = [];
    const existingMonsterLocations = {};
    
    // Scan chunks for player activity
    for (const [chunkKey, chunkData] of Object.entries(chunks)) {
      if (!chunkData) continue;
      
      let monsterCount = 0;
      
      // Look through tiles in this chunk
      for (const [tileKey, tileData] of Object.entries(chunkData)) {
        if (!tileData) continue;
        
        const [x, y] = tileKey.split(',').map(Number);
        
        // Check for existing monsters
        if (tileData.groups) {
          for (const [groupId, groupData] of Object.entries(tileData.groups)) {
            // Count monster (NPC) groups
            if (groupData.type === 'monster' || groupData.monsterType) {
              monsterCount++;
              
              // Store monster location for reference
              if (!existingMonsterLocations[chunkKey]) {
                existingMonsterLocations[chunkKey] = [];
              }
              existingMonsterLocations[chunkKey].push({
                x, y, groupId, groupData
              });
            }
          }
        }
        
        // Only consider this location active if it has player activity, not just monster groups
        const hasPlayerGroups = tileData.groups && Object.values(tileData.groups)
          .some(group => !(group.type === 'monster' || group.monsterType));
          
        const hasPlayerActivity = hasPlayerGroups || 
                               tileData.battles || 
                               tileData.structure || 
                               tileData.players || 
                               tileData.items;
                               
        if (hasPlayerActivity) {
          activeLocations.push({
            chunkKey,
            tileKey,
            x,
            y,
            // Store biome info if available, but we won't use it for monster selection yet
            biome: tileData.biome?.name || tileData.terrain?.biome || 'unknown'
          });
        }
      }
    }
    
    logger.info(`Found ${activeLocations.length} active locations with player activity in world ${worldId}`);
    
    // Process each active location to potentially spawn monsters
    for (const location of activeLocations) {
      // Skip if we've already hit the monster limit for this chunk
      const chunkMonsterCount = existingMonsterLocations[location.chunkKey]?.length || 0;
      if (chunkMonsterCount >= MAX_MONSTERS_PER_CHUNK) {
        continue; 
      }
      
      // Random chance to spawn monsters
      if (Math.random() > SPAWN_CHANCE) {
        continue;
      }
      
      // Find a suitable nearby tile to spawn monsters
      const spawnLocation = findSpawnLocation(
        location, 
        activeLocations, 
        existingMonsterLocations,
        MIN_SPAWN_DISTANCE,
        MAX_SPAWN_DISTANCE
      );
      
      // If no suitable location was found, skip
      if (!spawnLocation) {
        continue;
      }
      
      // Get chunk and tile for spawn location
      const spawnChunkX = Math.floor(spawnLocation.x / 20);
      const spawnChunkY = Math.floor(spawnLocation.y / 20);
      const spawnChunkKey = `${spawnChunkX},${spawnChunkY}`;
      const spawnTileKey = `${spawnLocation.x},${spawnLocation.y}`;
      
      // Get the tile data for this location
      const spawnTileRef = db.ref(`worlds/${worldId}/chunks/${spawnChunkKey}/${spawnTileKey}`);
      const spawnTileSnapshot = await spawnTileRef.once('value');
      const spawnTileData = spawnTileSnapshot.val() || {};
      
      // Store the biome for future use (not used for monster selection yet)
      const tileBiome = spawnTileData.biome?.name || 
                         spawnTileData.terrain?.biome ||
                         'unknown';
      
      // Either create a new monster group or merge with an existing one
      const updates = {};
      
      // Check for existing monster on this tile
      let existingMonster = null;
      if (spawnTileData.groups) {
        for (const [groupId, groupData] of Object.entries(spawnTileData.groups)) {
          if (groupData.type === 'monster' || groupData.monsterType) {
            existingMonster = { id: groupId, ...groupData };
            break;
          }
        }
      }
      
      if (existingMonster) {
        // Merge with existing monster group (make it stronger)
        await mergeWithExistingMonsterGroup(worldId, spawnChunkKey, spawnTileKey, existingMonster, updates, tileBiome);
      } else {
        // Create a new monster group
        await createNewMonsterGroup(worldId, spawnChunkKey, spawnTileKey, spawnLocation, updates, tileBiome);
      }
      
      // Apply all updates
      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
        monstersSpawned++;
        
        logger.info(`Spawned monster at ${spawnLocation.x},${spawnLocation.y} in world ${worldId}`);
      }
    }
    
    return monstersSpawned;
    
  } catch (error) {
    logger.error(`Error spawning monsters in world ${worldId}:`, error);
    return 0;
  }
}

/**
 * Find a suitable location to spawn monsters near player activity
 */
function findSpawnLocation(playerLocation, allActiveLocations, existingMonsterLocations, minDistance, maxDistance) {
  // Try several random locations
  for (let attempt = 0; attempt < 10; attempt++) {
    // Generate random angle and distance
    const angle = Math.random() * 2 * Math.PI;
    const distance = minDistance + Math.random() * (maxDistance - minDistance);
    
    // Calculate coordinates
    const spawnX = Math.round(playerLocation.x + Math.cos(angle) * distance);
    const spawnY = Math.round(playerLocation.y + Math.sin(angle) * distance);
    
    // Calculate chunk for these coordinates
    const spawnChunkX = Math.floor(spawnX / 20);
    const spawnChunkY = Math.floor(spawnY / 20);
    const spawnChunkKey = `${spawnChunkX},${spawnChunkY}`;
    
    // Check if this location is too close to another active location
    const tooCloseToPlayer = allActiveLocations.some(loc => {
      const dx = loc.x - spawnX;
      const dy = loc.y - spawnY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      return dist < minDistance;
    });
    
    if (tooCloseToPlayer) {
      continue; // Try another location
    }
    
    return { x: spawnX, y: spawnY };
  }
  
  // If we tried 10 times and couldn't find a spot, return null
  return null;
}

/**
 * Create a new monster group
 */
async function createNewMonsterGroup(worldId, chunkKey, tileKey, location, updates, biome) {
  const now = Date.now();
  
  // Choose a random monster type using biome info
  const monsterType = Units.chooseMonsterTypeForBiome(biome);
  const monsterData = Units.getUnit(monsterType, 'monster');
  
  if (!monsterData) {
    logger.error(`Invalid monster type: ${monsterType}`);
    return null;
  }
  
  // Generate a group ID
  const groupId = `monster_${now}_${Math.floor(Math.random() * 10000)}`;
  
  // Determine unit count within range
  const qty = Math.floor(
    Math.random() * (monsterData.unitCountRange[1] - monsterData.unitCountRange[0] + 1)
  ) + monsterData.unitCountRange[0];
  
  // Generate individual monster units
  const units = generateMonsterUnits(monsterType, qty);
  
  // Create the monster group object
  const monsterGroup = {
    id: groupId,
    name: monsterData.name,
    type: 'monster',
    monsterType: monsterType,
    status: 'idle',
    units: units,
    x: location.x,
    y: location.y
  };
  
  // Maybe add items to the monster group
  if (Math.random() < monsterData.itemChance) {
    monsterGroup.items = Units.generateItems(monsterType, qty);
  }
  
  // Set the complete monster group at once
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  updates[groupPath] = monsterGroup;
  
  // Add a message about monster sighting
  const chatMessageKey = `chat_monster_spawn_${now}_${Math.floor(Math.random() * 1000)}`;
  updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
    text: createMonsterSpawnMessage(monsterData.name, qty, tileKey),
    type: 'event',
    timestamp: now,
    location: {
      x: location.x,
      y: location.y
    }
  };
  
  return groupId;
}

/**
 * Merge with an existing monster group
 */
async function mergeWithExistingMonsterGroup(worldId, chunkKey, tileKey, existingGroup, updates, biome) {
  // Don't merge with groups that are not idle
  if (existingGroup.status !== 'idle') {
    return;
  }

  const now = Date.now();
  const monsterType = existingGroup.monsterType;
  
  // Get monster data from the shared Units class
  const monsterData = Units.getUnit(monsterType, 'monster');
  if (!monsterData) {
    logger.error(`Invalid monster type: ${monsterType}`);
    return;
  }
  
  // Count the current units instead of relying on existingGroup.units.length
  const currentUnitCount = existingGroup.units ? 
    (Array.isArray(existingGroup.units) ? existingGroup.units.length : Object.keys(existingGroup.units).length) : 1;
  
  // Don't grow beyond the merge limit
  if (currentUnitCount >= monsterData.mergeLimit) {
    return;
  }
  
  // Add 1-3 more units to the group
  const addedUnits = Math.floor(Math.random() * 3) + 1;
  const newCount = Math.min(currentUnitCount + addedUnits, monsterData.mergeLimit);
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${existingGroup.id}`;
  
  // Create partial update for the monster
  const monsterUpdates = {
    name: Units.getUnitGroupName(monsterType, 'monster', newCount),
    // We're preserving all other properties by only updating specific ones
  };
  
  // Add units for the added monsters
  // Handle both array and object formats
  const existingUnits = existingGroup.units || {};
  const newUnits = generateMonsterUnits(monsterType, addedUnits);
  
  // Add units rather than replacing them
  if (Array.isArray(existingUnits)) {
    // Convert to object format for consistency
    const combinedUnits = {};
    existingUnits.forEach((unit, index) => {
      combinedUnits[unit.id || `existing_${index}`] = unit;
    });
    Object.entries(newUnits).forEach(([id, unit]) => {
      combinedUnits[id] = unit;
    });
    updates[`${groupPath}/units`] = combinedUnits;
  } else {
    // Just add new units to the existing object
    updates[`${groupPath}/units`] = { ...existingUnits, ...newUnits };
  }
  
  updates[`${groupPath}/name`] = monsterUpdates.name;
  
  // Maybe add more items
  if (Math.random() < monsterData.itemChance) {
    // Get existing items, properly handling both array and object formats
    let existingItems = existingGroup.items || [];
    if (!Array.isArray(existingItems)) {
      existingItems = Object.values(existingItems);
    }
    
    // Generate new items
    const newItems = Units.generateItems(monsterType, addedUnits);
    
    // Combine items as an array for consistency
    const mergedItems = [...existingItems, ...newItems];
    
    // Include items directly in the monster update
    updates[`${groupPath}/items`] = mergedItems;
  }
  
  // Add a message about monster reinforcements
  if (newCount > currentUnitCount) {
    const chatMessageKey = `chat_monster_grow_${now}_${Math.floor(Math.random() * 1000)}`;
    updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
      text: createMonsterGrowthMessage(existingGroup.name, currentUnitCount, newCount, tileKey),
      type: 'event',
      timestamp: now,
      location: {
        x: parseInt(tileKey.split(',')[0]),
        y: parseInt(tileKey.split(',')[1])
      }
    };
  }
}

/**
 * Create a descriptive message for monster spawns
 */
function createMonsterSpawnMessage(monsterName, count, location) {
  const locationText = location.replace(',', ', ');
  
  // Varied messages based on monster count
  if (count <= 2) {
    return `A small group of ${monsterName} has been spotted at (${locationText})`;
  } else if (count <= 5) {
    return `A band of ${monsterName} has appeared at (${locationText})`;
  } else {
    return `A large horde of ${monsterName} has emerged at (${locationText})`;
  }
}

/**
 * Create a descriptive message for monster group growth
 */
function createMonsterGrowthMessage(monsterName, oldCount, newCount, location) {
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
 * Monster Group Merging and Enhancement
 * Simplified function to handle merging monster groups of any type
 */
export async function mergeMonsterGroups(worldId) {
  const db = getDatabase();
  const now = Date.now();
  let mergesPerformed = 0;
  
  try {
    // Get all chunks for this world
    const chunksRef = db.ref(`worlds/${worldId}/chunks`);
    const chunksSnapshot = await chunksRef.once('value');
    const chunks = chunksSnapshot.val();
    
    if (!chunks) {
      logger.info(`No chunks found in world ${worldId}`);
      return 0;
    }

    // Track updates to apply
    const updates = {};
    
    // Check each tile for multiple monster groups
    for (const [chunkKey, chunkData] of Object.entries(chunks)) {
      if (!chunkData) continue;
      
      for (const [tileKey, tileData] of Object.entries(chunkData)) {
        if (!tileData || !tileData.groups) continue;
        
        // Find all idle monster groups on this tile
        const monsterGroups = Object.entries(tileData.groups)
          .filter(([_, g]) => g.type === 'monster' || g.monsterType)
          .filter(([_, g]) => g.status === 'idle' && !g.inBattle)
          .map(([id, data]) => ({id, ...data}));
        
        // Need at least 2 monster groups to merge
        if (monsterGroups.length < 2) continue;
        
        // Group monsters by type
        const groupsByType = {};
        monsterGroups.forEach(group => {
          const type = group.monsterType || 'unknown';
          if (!groupsByType[type]) groupsByType[type] = [];
          groupsByType[type].push(group);
        });
        
        // Check if we have multiple types and should create a mixed group
        const types = Object.keys(groupsByType);
        const multipleTypes = types.length > 1;
        const allowMixing = Math.random() < 0.2; // 20% chance to mix different types
        
        if (multipleTypes && allowMixing) {
          // Create a mixed group from different monster types
          if (mergeGroups(worldId, chunkKey, tileKey, monsterGroups, updates, now, true)) {
            mergesPerformed++;
          }
        } else {
          // Process each monster type separately
          for (const type of types) {
            const groups = groupsByType[type];
            if (groups.length >= 2) {
              if (mergeGroups(worldId, chunkKey, tileKey, groups, updates, now, false)) {
                mergesPerformed++;
              }
            }
          }
        }
      }
    }
    
    // Apply all updates
    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
      logger.info(`Performed ${mergesPerformed} monster group merges in world ${worldId}`);
    }
    
    return mergesPerformed;
  } catch (error) {
    logger.error(`Error merging monster groups in world ${worldId}:`, error);
    return 0;
  }
}

/**
 * Helper function to merge monster groups
 * @param {string} worldId - World ID
 * @param {string} chunkKey - Chunk key
 * @param {string} tileKey - Tile key
 * @param {Array} groups - Groups to merge
 * @param {Object} updates - Updates object to modify
 * @param {number} now - Current timestamp
 * @returns {boolean} Success status
 */
function mergeGroups(worldId, chunkKey, tileKey, groups, updates, now) {
  if (groups.length < 2) return false;
  
  // For mixed groups, use all provided groups
  // For same-type merges, sort by size and use largest as base
  let baseGroup, mergedGroups;

  // Sort by unit count, descending
  groups.sort((a, b) => countUnits(b) - countUnits(a));
  
  // Use largest as base, rest as merged
  baseGroup = groups[0];
  mergedGroups = groups.slice(1);
  
  // Calculate total units from all groups being merged
  let totalUnits = groups.reduce((total, group) => total + countUnits(group), 0);
  
  // Add a bonus 10-30% more units
  const bonusUnits = Math.floor(totalUnits * (0.1 + Math.random() * 0.2));
  totalUnits += bonusUnits;
  
  // Cap at merge limit for the monster type
  const monsterType = baseGroup.monsterType;
  const monsterData = Units.getUnit(monsterType, 'monster');
  if (monsterData && monsterData.mergeLimit) {
    totalUnits = Math.min(totalUnits, monsterData.mergeLimit);
  } else {
    totalUnits = Math.min(totalUnits, 15); // Default merge limit
  }
  
  // Collect all items from groups
  const allItems = [];
  for (const group of groups) {
    if (group.items) {
      const items = Array.isArray(group.items) ? group.items : Object.values(group.items);
      allItems.push(...items);
    }
  }
  
  // Merge units
  const mergedUnits = {};
  
  // Process each group's units
  for (const group of groups) {
    if (!group.units) continue;
    
    if (Array.isArray(group.units)) {
      // If units are in array format, convert to object format
      group.units.forEach((unit, index) => {
        const unitId = unit.id || `unit_${now}_${index}_${Math.random().toString(36).substr(2, 5)}`;
        mergedUnits[unitId] = { ...unit, id: unitId };
      });
    } else {
      // Merge object format units
      Object.entries(group.units).forEach(([id, unit]) => {
        mergedUnits[id] = unit;
      });
    }
  }
  
  // If we need more units to meet the target, generate them
  const currentUnitCount = Object.keys(mergedUnits).length;
  if (currentUnitCount < totalUnits) {
    const neededUnits = totalUnits - currentUnitCount;
    // For mixed groups, use the base group's monster type
    const dominantType = baseGroup.monsterType;
    const newUnits = generateMonsterUnits(dominantType, neededUnits);
    Object.assign(mergedUnits, newUnits);
  }
  
  // Determine group info
  let groupPath, groupName;
  const [x, y] = tileKey.split(',').map(Number);
  
  // Regular merge to base group
  groupName = monsterData ? monsterData.name : "Monster Group";
  if (totalUnits > 1) {
    groupName = Units.getUnitGroupName(monsterType, 'monster', totalUnits) || `${groupName} (${totalUnits})`;
  }
  
  groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}`;
  
  // Update the base group
  updates[`${groupPath}/name`] = groupName;
  updates[`${groupPath}/items`] = allItems;
  updates[`${groupPath}/units`] = mergedUnits;
  updates[`${groupPath}/x`] = x;
  updates[`${groupPath}/y`] = y;
  updates[`${groupPath}/status`] = 'idle';
  updates[`${groupPath}/type`] = 'monster'; // Ensure type is set
  updates[`${groupPath}/monsterType`] = monsterType; // Ensure monsterType is set
  updates[`${groupPath}/originalMonsterType`] = monsterType;
  
  // Delete other groups
  for (const group of mergedGroups) {
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${group.id}`] = null;
  }
  
  // Add chat message about the merger
  const chatMessageKey = `chat_monster_merge_${now}_${Math.floor(Math.random() * 1000)}`;
  updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
    text: `Monster groups have merged at (${x}, ${y}) forming a ${groupName}!`,
    type: 'event',
    timestamp: now,
    location: { x, y }
  };
  
  return true;
}

/**
 * Helper function to count units in a group
 * @param {Object} group - Group object
 * @returns {number} Unit count
 */
function countUnits(group) {
  if (!group.units) return 1;
  return Array.isArray(group.units) ? 
    group.units.length : 
    Object.keys(group.units).length;
}
