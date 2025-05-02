/**
 * Monster Spawn processing for Gisaima
 * Handles spawning monster groups near player activity
 */

import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";
import { Units } from 'gisaima-shared/units/units.js';

// Constants for monster spawning
const SPAWN_CHANCE = 0.4; // 40% chance to spawn monsters in an active area
const MAX_SPAWN_DISTANCE = 5; // Maximum distance from player activity to spawn
const MIN_SPAWN_DISTANCE = 2; // Minimum distance from player activity to spawn
const MAX_ACTIVE_AGE = 15 * 60 * 1000; // Consider player activity from last 15 minutes
const MAX_MONSTERS_PER_CHUNK = 5; // Maximum monster groups per chunk

// Add a new constant for mixed monster groups
const MIXED_MONSTER_TYPE = {
  name: "Mixed Monster Pack",
  unitCountRange: [3, 10],
  itemChance: 0.7,
  mergeLimit: 20
};

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
  const now = Date.now();
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
        
        // Tiles that would make the most sense for spawning monsters to prioritise.
        if (tileData.groups || tileData.battles || tileData.structure || tileData.players || tileData.items) {
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
    
    logger.info(`Found ${activeLocations.length} active locations in world ${worldId}`);
    
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
  const now = Date.now();
  const monsterType = existingGroup.monsterType;
  
  // Get monster data from the shared Units class
  const monsterData = Units.getUnit(monsterType, 'monster');
  if (!monsterData) {
    logger.error(`Invalid monster type: ${monsterType}`);
    return;
  }
  
  const currentCount = existingGroup.units?.length || 1;
  
  // Don't grow beyond the merge limit
  if (currentCount >= monsterData.mergeLimit) {
    return;
  }
  
  // Add 1-3 more units to the group
  const addedUnits = Math.floor(Math.random() * 3) + 1;
  const newCount = Math.min(currentCount + addedUnits, monsterData.mergeLimit);
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${existingGroup.id}`;
  
  // Create partial update for the monster
  const monsterUpdates = {
    name: Units.getUnitGroupName(monsterType, 'monster', newCount),
    // We're preserving all other properties by only updating specific ones
  };
  
  // Add units for the added monsters
  const existingUnits = existingGroup.units || {};
  const newUnits = generateMonsterUnits(monsterType, addedUnits);
  
  // Add units rather than replacing them
  updates[`${groupPath}/units`] = { ...existingUnits, ...newUnits };
  updates[`${groupPath}/name`] = monsterUpdates.name;
  
  // Maybe add more items
  if (Math.random() < monsterData.itemChance) {
    // Get existing items
    const existingItems = existingGroup.items || [];
    // Generate new items
    const newItems = Units.generateItems(monsterType, addedUnits);
    
    // Combine items (need to handle both array and object formats)
    let mergedItems;
    if (Array.isArray(existingItems)) {
      mergedItems = [...existingItems, ...newItems];
    } else {
      // Convert from object format if needed
      const existingItemsArray = Object.values(existingItems);
      mergedItems = [...existingItemsArray, ...newItems];
    }
    
    // Include items directly in the monster update
    updates[`${groupPath}/items`] = mergedItems;
  }
  
  // Add a message about monster reinforcements
  if (newCount > currentCount) {
    const chatMessageKey = `chat_monster_grow_${now}_${Math.floor(Math.random() * 1000)}`;
    updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
      text: createMonsterGrowthMessage(existingGroup.name, currentCount, newCount, tileKey),
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
 * Create a mixed monster group
 */
async function createMixedMonsterGroup(worldId, chunkKey, tileKey, groupsToMerge, updates, now) {
  // Calculate total units from all groups
  const totalUnits = groupsToMerge.reduce((total, group) => total + (group.units?.length || 1), 0);
  
  // Track composition of monster types
  const composition = {};
  
  // Process each group to be merged
  for (const group of groupsToMerge) {
    const monsterType = group.monsterType;
    if (!composition[monsterType]) {
      composition[monsterType] = 0;
    }
    composition[monsterType] += group.units?.length || 1;
  }
  
  // Create a new group ID
  const newGroupId = `mixed_monster_${now}_${Math.floor(Math.random() * 10000)}`;
  
  // Get a name for this mixed group
  const groupName = Units.getUnitGroupName(null, 'monster', totalUnits, { composition });
  
  // Collect all items from the groups
  const allItems = [];
  for (const group of groupsToMerge) {
    if (group.items) {
      if (Array.isArray(group.items)) {
        allItems.push(...group.items);
      } else {
        allItems.push(...Object.values(group.items));
      }
    }
  }
  
  // Create units for each monster type in the composition
  const mixedUnits = {};
  
  for (const [monsterType, count] of Object.entries(composition)) {
    const typeUnits = generateMonsterUnits(monsterType, count);
    Object.assign(mixedUnits, typeUnits);
  }
  
  // Create the new mixed monster group
  const mixedGroup = {
    id: newGroupId,
    name: groupName,
    type: 'monster',
    monsterType: 'mixed', // Special type for mixed groups
    status: 'idle',
    units: mixedUnits,
    x: parseInt(tileKey.split(',')[0]),
    y: parseInt(tileKey.split(',')[1]),
    composition: composition, // Store the composition
    items: allItems,
    isMixed: true
  };
  
  // Set the new group
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${newGroupId}`] = mixedGroup;
  
  // Remove all the original groups
  for (const group of groupsToMerge) {
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${group.id}`] = null;
  }
  
  // Add a chat message about the mixed group formation
  const chatMessageKey = `chat_monster_mixed_${now}_${Math.floor(Math.random() * 1000)}`;
  updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
    text: `Different monster groups have combined at (${mixedGroup.x}, ${mixedGroup.y}) forming a dangerous ${groupName}!`,
    type: 'event',
    timestamp: now,
    location: {
      x: mixedGroup.x,
      y: mixedGroup.y
    }
  };
  
  return newGroupId;
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
        if (!tileData) continue;
        
        // Skip if no groups on this tile
        if (!tileData.groups) continue;
        
        // Find all monster groups on this tile
        const monsterGroups = [];
        for (const [groupId, groupData] of Object.entries(tileData.groups)) {
          // Only consider idle monster groups that aren't in battle
          if ((groupData.type === 'monster' || groupData.monsterType) && 
              groupData.status === 'idle' && 
              !groupData.inBattle) {
            monsterGroups.push({...groupData, id: groupId});
          }
        }
        
        // Need at least 2 monster groups to merge
        if (monsterGroups.length < 2) continue;
        
        // Randomly decide whether to allow cross-type merging (20% chance)
        const allowCrossTypeMerge = Math.random() < 0.2;
        
        if (allowCrossTypeMerge && monsterGroups.length >= 2) {
          // Select a random subset of groups to merge (between 2 and all)
          const groupCount = Math.min(monsterGroups.length, 2 + Math.floor(Math.random() * (monsterGroups.length - 1)));
          
          // Shuffle the groups for random selection
          monsterGroups.sort(() => Math.random() - 0.5);
          const groupsToMerge = monsterGroups.slice(0, groupCount);
          
          // Create a mixed monster group
          await createMixedMonsterGroup(worldId, chunkKey, tileKey, groupsToMerge, updates, now);
          mergesPerformed++;
          
          // Skip the standard type-based merging for this tile
          continue;
        }
        
        // Standard group-by-type merging
        const groupsByType = {};
        for (const group of monsterGroups) {
          const monsterType = group.monsterType || 'unknown';
          if (!groupsByType[monsterType]) {
            groupsByType[monsterType] = [];
          }
          groupsByType[monsterType].push(group);
        }
        
        // Process each monster type group
        for (const [monsterType, groups] of Object.entries(groupsByType)) {
          if (groups.length < 2) continue;
          
          // Sort by unit count, descending
          groups.sort((a, b) => (b.units?.length || 0) - (a.units?.length || 0));
          
          // Take the largest group as the base
          const baseGroup = groups[0];
          const mergedGroups = groups.slice(1);
          
          // Calculate total units
          let totalUnits = baseGroup.units?.length || 1;
          for (const group of mergedGroups) {
            totalUnits += group.units?.length || 1;
          }
          
          // Add bonus units for merging (10-30% bonus)
          const bonusUnits = Math.floor(totalUnits * (0.1 + Math.random() * 0.2));
          totalUnits += bonusUnits;
          
          // Get monster type data
          const monsterTypeData = Units.getUnit(monsterType);
          
          // Cap at merge limit
          totalUnits = Math.min(totalUnits, monsterTypeData.mergeLimit || 15);
          
          // Determine new name based on size
          const newName = Units.getMonsterGroupName(monsterType, totalUnits);
          
          // Merge items from all groups
          const mergedItems = [];
          
          // Add items from base group
          if (baseGroup.items) {
            if (Array.isArray(baseGroup.items)) {
              mergedItems.push(...baseGroup.items);
            } else {
              mergedItems.push(...Object.values(baseGroup.items));
            }
          }
          
          // Add items from other groups
          for (const group of mergedGroups) {
            if (group.items) {
              if (Array.isArray(group.items)) {
                mergedItems.push(...group.items);
              } else {
                mergedItems.push(...Object.values(group.items));
              }
            }
          }
          
          // Add bonus items (1-3 based on size)
          const bonusItemCount = Math.min(Math.ceil(totalUnits / 5), 3);
          for (let i = 0; i < bonusItemCount; i++) {
            if (Math.random() < 0.7) { // 70% chance for each bonus item
              mergedItems.push(...Units.generateMonsterItems(monsterType, totalUnits));
            }
          }
          
          // Generate units for the merged group
          const mergedUnits = {};
          
          // Add units from base group
          if (baseGroup.units) {
            Object.assign(mergedUnits, baseGroup.units);
          }
          
          // Add units from other groups (keeping distinct IDs)
          for (const group of mergedGroups) {
            if (group.units) {
              Object.assign(mergedUnits, group.units);
            }
          }
          
          // If not enough units, generate new ones
          if (Object.keys(mergedUnits).length < totalUnits) {
            const neededUnits = totalUnits - Object.keys(mergedUnits).length;
            const newUnits = generateMonsterUnits(monsterType, neededUnits);
            Object.assign(mergedUnits, newUnits);
          }
          
          // Update the base group
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/name`] = newName;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/items`] = mergedItems;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/merged`] = true;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/mergeCount`] = 
              (baseGroup.mergeCount || 0) + mergedGroups.length;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/units`] = mergedUnits;
          
          // Preserve location and status properties
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/x`] = parseInt(tileKey.split(',')[0]);
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/y`] = parseInt(tileKey.split(',')[1]);
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/status`] = 'idle';
          
          // Explicitly preserve these critical properties
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/type`] = 'monster';
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/monsterType`] = monsterType;
          
          // Remove the other groups
          for (const group of mergedGroups) {
            updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${group.id}`] = null;
          }
          
          // Add a chat message about the merger
          const chatMessageKey = `chat_monster_merge_${now}_${Math.floor(Math.random() * 1000)}`;
          const [x, y] = tileKey.split(',').map(Number);
          
          updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
            text: `Monster groups have merged at (${x}, ${y}) forming a larger ${newName} horde!`,
            type: 'event',
            timestamp: now,
            location: { x, y }
          };
          
          mergesPerformed++;
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
