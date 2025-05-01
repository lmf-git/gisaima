/**
 * Monster Spawn processing for Gisaima
 * Handles spawning monster groups near player activity
 */

import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Constants for monster spawning
const SPAWN_CHANCE = 0.4; // 40% chance to spawn monsters in an active area
const MAX_SPAWN_DISTANCE = 5; // Maximum distance from player activity to spawn
const MIN_SPAWN_DISTANCE = 2; // Minimum distance from player activity to spawn
const MAX_ACTIVE_AGE = 15 * 60 * 1000; // Consider player activity from last 15 minutes
const MAX_MONSTERS_PER_CHUNK = 5; // Maximum monster groups per chunk

// Monster types with their probabilities and properties
const MONSTER_TYPES = {
  goblin: { 
    probability: 0.3,
    name: "Goblin Raiders",
    unitCountRange: [1, 4],
    itemChance: 0.6,
    mergeLimit: 8
  },
  wolf: { 
    probability: 0.2,
    name: "Wild Wolves",
    unitCountRange: [2, 5],
    itemChance: 0.4,
    mergeLimit: 10
  },
  bandit: { 
    probability: 0.15,
    name: "Bandits",
    unitCountRange: [2, 4],
    itemChance: 0.8,
    mergeLimit: 6
  },
  spider: { 
    probability: 0.15,
    name: "Giant Spiders",
    unitCountRange: [1, 6],
    itemChance: 0.5,
    mergeLimit: 12
  },
  skeleton: { 
    probability: 0.1,
    name: "Undead Skeletons",
    unitCountRange: [3, 7],
    itemChance: 0.7,
    mergeLimit: 15
  },
  troll: { 
    probability: 0.05,
    name: "Mountain Troll",
    unitCountRange: [1, 2],
    itemChance: 0.9,
    mergeLimit: 3
  },
  elemental: { 
    probability: 0.05,
    name: "Wild Elemental",
    unitCountRange: [1, 3],
    itemChance: 0.8,
    mergeLimit: 5
  }
};

// Add a new constant for mixed monster groups
const MIXED_MONSTER_TYPE = {
  name: "Mixed Monster Pack",
  unitCountRange: [3, 10],
  itemChance: 0.7,
  mergeLimit: 20
};

// Biome-specific monster weights (keep for future use once biome data is available)
// Currently not used as we don't have access to biome data yet
const BIOME_MONSTERS = {
  plains: ['goblin', 'bandit', 'wolf'],
  forest: ['wolf', 'spider', 'bandit', 'elemental'],
  mountain: ['troll', 'goblin', 'skeleton'],
  desert: ['skeleton', 'bandit', 'elemental'],
  swamp: ['spider', 'skeleton', 'elemental'],
  tundra: ['wolf', 'elemental', 'skeleton'],
  default: ['goblin', 'wolf', 'bandit', 'spider']
};

// Possible monster items
const POSSIBLE_ITEMS = [
  { name: "Wooden Sticks", rarity: "common", type: "resource", quantityRange: [1, 5] },
  { name: "Stone Pieces", rarity: "common", type: "resource", quantityRange: [1, 4] },
  { name: "Bone Fragment", rarity: "common", type: "resource", quantityRange: [1, 3] },
  { name: "Monster Hide", rarity: "uncommon", type: "resource", quantityRange: [1, 2] },
  { name: "Shiny Gem", rarity: "rare", type: "gem", quantityRange: [1, 1] },
  { name: "Ancient Coin", rarity: "uncommon", type: "treasure", quantityRange: [1, 3] },
  { name: "Crude Weapon", rarity: "common", type: "weapon", quantityRange: [1, 1] },
  { name: "Monster Tooth", rarity: "uncommon", type: "trophy", quantityRange: [1, 2] },
  { name: "Mysterious Herb", rarity: "uncommon", type: "alchemy", quantityRange: [1, 2] },
];

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
      if (!chunkData || chunkKey === 'lastUpdated') continue;
      
      let monsterCount = 0;
      
      // Look through tiles in this chunk
      for (const [tileKey, tileData] of Object.entries(chunkData)) {
        if (!tileData || tileKey === 'lastUpdated') continue;
        
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
        
        // Check for recent player activity (groups or players)
        let hasRecentActivity = false;
        
        // Check player groups with recent updates
        if (tileData.groups) {
          for (const [groupId, groupData] of Object.entries(tileData.groups)) {
            if (groupData.owner && groupData.lastUpdated && 
                (now - groupData.lastUpdated) < MAX_ACTIVE_AGE) {
              hasRecentActivity = true;
              break;
            }
          }
        }
        
        // Check individual players with recent activity
        if (!hasRecentActivity && tileData.players) {
          for (const [playerId, playerData] of Object.entries(tileData.players)) {
            if (playerData.lastActive && (now - playerData.lastActive) < MAX_ACTIVE_AGE) {
              hasRecentActivity = true;
              break;
            }
          }
        }
        
        if (hasRecentActivity) {
          // Store this as an active location
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
        await mergeWithExistingMonster(worldId, spawnChunkKey, spawnTileKey, existingMonster, updates, tileBiome);
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
  
  // Choose a random monster type (ignoring biome for now)
  const monsterType = chooseMonsterType();
  const monsterData = MONSTER_TYPES[monsterType];
  
  // Generate a group ID
  const groupId = `monster_${now}_${Math.floor(Math.random() * 10000)}`;
  
  // Determine unit count within range
  const unitCount = Math.floor(
    Math.random() * (monsterData.unitCountRange[1] - monsterData.unitCountRange[0] + 1)
  ) + monsterData.unitCountRange[0];
  
  // Create the monster group object, including items if needed
  const monsterGroup = {
    id: groupId,
    name: monsterData.name,
    type: 'monster',
    monsterType: monsterType,
    status: 'idle',
    unitCount: unitCount,
    x: location.x,
    y: location.y,
    createdAt: now,
    lastUpdated: now
  };
  
  // Maybe add items to the monster group object directly (not as a separate update)
  if (Math.random() < monsterData.itemChance) {
    monsterGroup.items = generateMonsterItems(monsterType, unitCount);
  }
  
  // Set the complete monster group at once
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  updates[groupPath] = monsterGroup;
  
  // Add a message about monster sighting
  const chatMessageKey = `chat_monster_spawn_${now}_${Math.floor(Math.random() * 1000)}`;
  updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
    text: createMonsterSpawnMessage(monsterData.name, unitCount, tileKey),
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
async function mergeWithExistingMonster(worldId, chunkKey, tileKey, existingMonster, updates, biome) {
  const now = Date.now();
  const monsterType = existingMonster.monsterType || 
                      Object.keys(MONSTER_TYPES).find(type => 
                        existingMonster.name?.includes(MONSTER_TYPES[type].name)
                      ) || 'goblin';
  
  const monsterData = MONSTER_TYPES[monsterType];
  const currentCount = existingMonster.unitCount || 1;
  
  // Don't grow beyond the merge limit
  if (currentCount >= monsterData.mergeLimit) {
    return;
  }
  
  // Add 1-3 more units to the group
  const addedUnits = Math.floor(Math.random() * 3) + 1;
  const newCount = Math.min(currentCount + addedUnits, monsterData.mergeLimit);
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${existingMonster.id}`;
  
  // Create partial update for the monster
  const monsterUpdates = {
    unitCount: newCount,
    lastUpdated: now
  };
  
  // Maybe add more items
  if (Math.random() < monsterData.itemChance) {
    // Get existing items
    const existingItems = existingMonster.items || [];
    // Generate new items and merge
    const newItems = generateMonsterItems(monsterType, addedUnits);
    
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
    monsterUpdates.items = mergedItems;
  }
  
  // Update the monster group with all changes at once
  updates[groupPath] = monsterUpdates;
  
  // Add a message about monster reinforcements
  if (newCount > currentCount) {
    const chatMessageKey = `chat_monster_grow_${now}_${Math.floor(Math.random() * 1000)}`;
    updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
      text: createMonsterGrowthMessage(existingMonster.name, currentCount, newCount, tileKey),
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
 * Choose a monster type randomly (without considering biome for now)
 */
function chooseMonsterType() {
  // Get all available monster types
  const monsterTypes = Object.keys(MONSTER_TYPES);
  
  // Create weighted probability list based on each monster's probability
  const weightedList = [];
  for (const type of monsterTypes) {
    const probability = MONSTER_TYPES[type].probability * 100;
    for (let i = 0; i < probability; i++) {
      weightedList.push(type);
    }
  }
  
  // Pick randomly from the weighted list
  const randomIndex = Math.floor(Math.random() * weightedList.length);
  return weightedList[randomIndex];
}

/**
 * Generate random items for monster groups
 */
function generateMonsterItems(monsterType, unitCount) {
  const items = [];
  const itemCount = Math.min(Math.ceil(unitCount / 2), 3); // At most 3 items
  
  for (let i = 0; i < itemCount; i++) {
    // Only add an item with some probability
    if (Math.random() < 0.7) {
      const randomItem = POSSIBLE_ITEMS[Math.floor(Math.random() * POSSIBLE_ITEMS.length)];
      
      // Generate quantity within range
      const minQuantity = randomItem.quantityRange[0];
      const maxQuantity = randomItem.quantityRange[1];
      const quantity = Math.floor(Math.random() * (maxQuantity - minQuantity + 1)) + minQuantity;
      
      items.push({
        id: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: randomItem.name,
        type: randomItem.type,
        rarity: randomItem.rarity,
        quantity: quantity
      });
    }
  }
  
  return items;
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
 * New function to check and merge monster groups
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
      if (!chunkData || chunkKey === 'lastUpdated') continue;
      
      for (const [tileKey, tileData] of Object.entries(chunkData)) {
        if (!tileData || tileKey === 'lastUpdated') continue;
        
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
          groups.sort((a, b) => (b.unitCount || 0) - (a.unitCount || 0));
          
          // Take the largest group as the base
          const baseGroup = groups[0];
          const mergedGroups = groups.slice(1);
          
          // Calculate total units
          let totalUnits = baseGroup.unitCount || 1;
          for (const group of mergedGroups) {
            totalUnits += group.unitCount || 1;
          }
          
          // Add bonus units for merging (10-30% bonus)
          const bonusUnits = Math.floor(totalUnits * (0.1 + Math.random() * 0.2));
          totalUnits += bonusUnits;
          
          // Get monster type data
          const monsterTypeData = MONSTER_TYPES[monsterType] || MONSTER_TYPES.goblin;
          
          // Cap at merge limit
          totalUnits = Math.min(totalUnits, monsterTypeData.mergeLimit || 15);
          
          // Determine new name based on size
          const newName = getMonsterGroupName(monsterType, totalUnits);
          
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
              mergedItems.push(generateBonusItem(monsterType, totalUnits));
            }
          }
          
          // Update the base group
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/unitCount`] = totalUnits;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/name`] = newName;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/items`] = mergedItems;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/lastUpdated`] = now;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/merged`] = true;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/mergeCount`] = 
              (baseGroup.mergeCount || 0) + mergedGroups.length;
              
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

/**
 * Create a mixed monster group from different monster types
 * @param {string} worldId - World ID
 * @param {string} chunkKey - Chunk key
 * @param {string} tileKey - Tile key
 * @param {Array} groupsToMerge - Array of groups to merge
 * @param {Object} updates - Updates object to modify
 * @param {number} now - Current timestamp
 */
async function createMixedMonsterGroup(worldId, chunkKey, tileKey, groupsToMerge, updates, now) {
  // Sort by unit count to use the largest as the base
  groupsToMerge.sort((a, b) => (b.unitCount || 1) - (a.unitCount || 1));
  
  const baseGroup = groupsToMerge[0];
  const mergingGroups = groupsToMerge.slice(1);
  
  // Calculate total units
  let totalUnits = baseGroup.unitCount || 1;
  for (const group of mergingGroups) {
    totalUnits += group.unitCount || 1;
  }
  
  // Add merger bonus (10-30%)
  const bonusUnits = Math.floor(totalUnits * (0.1 + Math.random() * 0.2));
  totalUnits += bonusUnits;
  
  // Cap at a reasonable maximum
  totalUnits = Math.min(totalUnits, MIXED_MONSTER_TYPE.mergeLimit);
  
  // Create a composition object to track the monster types
  const composition = {};
  
  // Add the base group to composition
  const baseType = baseGroup.monsterType || 'unknown';
  composition[baseType] = baseGroup.unitCount || 1;
  
  // Add other groups to composition
  for (const group of mergingGroups) {
    const type = group.monsterType || 'unknown';
    composition[type] = (composition[type] || 0) + (group.unitCount || 1);
  }
  
  // Calculate percentages for each type
  const typePercents = {};
  let dominantType = '';
  let highestCount = 0;
  
  for (const [type, count] of Object.entries(composition)) {
    const percent = Math.round((count / totalUnits) * 100);
    typePercents[type] = percent;
    
    if (count > highestCount) {
      highestCount = count;
      dominantType = type;
    }
  }
  
  // Generate a name for the mixed group
  const mixedName = generateMixedGroupName(composition, totalUnits);
  
  // Merge all items
  const allItems = [];
  
  // Process all groups' items
  for (const group of groupsToMerge) {
    if (group.items) {
      if (Array.isArray(group.items)) {
        allItems.push(...group.items);
      } else {
        allItems.push(...Object.values(group.items));
      }
    }
  }
  
  // Add bonus items
  const bonusItemCount = Math.min(Math.ceil(totalUnits / 5), 4);
  for (let i = 0; i < bonusItemCount; i++) {
    if (Math.random() < 0.7) {
      allItems.push(generateBonusItem(dominantType, totalUnits));
    }
  }
  
  // Update the base group with the merged data
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/unitCount`] = totalUnits;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/name`] = mixedName;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/items`] = allItems;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/lastUpdated`] = now;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/merged`] = true;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/isMixed`] = true;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/composition`] = composition;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/typePercents`] = typePercents;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/dominantType`] = dominantType;
  
  // Preserve these critical properties
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/type`] = 'monster';
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}/monsterType`] = dominantType;
  
  // Remove the other groups
  for (const group of mergingGroups) {
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${group.id}`] = null;
  }
  
  // Add a chat message about the mixed group formation
  const chatMessageKey = `chat_mixed_monster_merge_${now}_${Math.floor(Math.random() * 1000)}`;
  const [x, y] = tileKey.split(',').map(Number);
  
  const typeNames = Object.keys(composition).map(type => 
    MONSTER_TYPES[type]?.name.split(' ')[0] || type
  ).join(', ');
  
  updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
    text: `A mixed horde of ${typeNames} has formed at (${x}, ${y})!`,
    type: 'event',
    timestamp: now,
    location: { x, y }
  };
}

/**
 * Generate a name for a mixed monster group
 * @param {Object} composition - Composition of monster types
 * @param {number} totalUnits - Total unit count
 * @returns {string} Group name
 */
function generateMixedGroupName(composition, totalUnits) {
  // Get the top two types by count
  const sortedTypes = Object.entries(composition)
    .sort(([,a], [,b]) => b - a)
    .map(([type]) => type);
  
  let prefix, suffix;
  
  // Determine size prefix
  if (totalUnits <= 4) {
    prefix = "Small";
  } else if (totalUnits <= 8) {
    prefix = "";
  } else if (totalUnits <= 12) {
    prefix = "Large";
  } else {
    prefix = "Massive";
  }
  
  // Determine group type suffix
  if (totalUnits <= 4) {
    suffix = "Band";
  } else if (totalUnits <= 8) {
    suffix = "Pack";
  } else if (totalUnits <= 12) {
    suffix = "Horde";
  } else {
    suffix = "Legion";
  }
  
  // Format name based on composition complexity
  if (Object.keys(composition).length > 2) {
    return `${prefix} Mixed Monster ${suffix}`.trim();
  } else {
    // Get display names for the top types
    const typeNames = sortedTypes.slice(0, 2).map(type => 
      MONSTER_TYPES[type]?.name.split(' ')[0] || capitalizeFirstLetter(type)
    );
    
    return `${prefix} ${typeNames.join('-')} ${suffix}`.trim();
  }
}

/**
 * Helper function to capitalize first letter of a string
 */
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Helper function to generate a monster group name based on size
function getMonsterGroupName(monsterType, unitCount) {
  const monsterData = MONSTER_TYPES[monsterType] || MONSTER_TYPES.goblin;
  const baseName = monsterData.name || 'Monster';
  
  // Different names based on size
  if (unitCount <= 2) {
    return `Small ${baseName}`;
  } else if (unitCount <= 5) {
    return baseName;
  } else if (unitCount <= 8) {
    return `${baseName} Warband`;
  } else if (unitCount <= 12) {
    return `${baseName} Horde`;
  } else {
    return `Massive ${baseName} Legion`;
  }
}

// Helper function to generate a bonus item for merged groups
function generateBonusItem(monsterType, unitCount) {
  const rarityRoll = Math.random();
  let rarity = 'common';
  
  // Better items for larger groups
  if (unitCount > 10 && rarityRoll > 0.9) {
    rarity = 'epic';
  } else if ((unitCount > 7 && rarityRoll > 0.85) || rarityRoll > 0.95) {
    rarity = 'rare';
  } else if ((unitCount > 5 && rarityRoll > 0.7) || rarityRoll > 0.8) {
    rarity = 'uncommon';
  }
  
  // Choose item type based on monster type and rarity
  const itemTypes = {
    goblin: ['resource', 'weapon', 'treasure'],
    wolf: ['resource', 'trophy', 'alchemy'],
    bandit: ['weapon', 'treasure', 'resource'],
    spider: ['alchemy', 'resource', 'trophy'],
    skeleton: ['weapon', 'treasure', 'gem'],
    troll: ['trophy', 'resource', 'gem'],
    elemental: ['gem', 'alchemy', 'trophy']
  };
  
  const possibleTypes = itemTypes[monsterType] || ['resource', 'treasure', 'weapon'];
  const itemType = possibleTypes[Math.floor(Math.random() * possibleTypes.length)];
  
  // Define items based on type and rarity
  const items = {
    resource: {
      common: ['Wooden Sticks', 'Stone Pieces', 'Bone Fragment'],
      uncommon: ['Monster Hide', 'Quality Wood', 'Pure Stone'],
      rare: ['Rare Metals', 'Monster Core', 'Precious Wood'],
      epic: ['Primal Essence', 'Ancient Materials', 'Dimensional Fragment']
    },
    weapon: {
      common: ['Crude Weapon', 'Rusty Blade', 'Simple Mace'],
      uncommon: ['Monster Blade', 'Hunter\'s Bow', 'War Axe'],
      rare: ['Enchanted Weapon', 'Beast Slayer', 'Warrior\'s Edge'],
      epic: ['Legendary Weapon', 'Ancient Warblade', 'Soul Harvester']
    },
    treasure: {
      common: ['Ancient Coin', 'Minor Relic', 'Trinket'],
      uncommon: ['Gold Coins', 'Valuable Relic', 'Silver Medallion'],
      rare: ['Gold Medallion', 'Treasure Chest', 'Ancient Artifact'],
      epic: ['Royal Treasure', 'King\'s Ransom', 'Legendary Hoard']
    },
    trophy: {
      common: ['Monster Tooth', 'Beast Claw', 'Small Horn'],
      uncommon: ['Monster Trophy', 'Beast Pelt', 'Creature Heart'],
      rare: ['Champion\'s Trophy', 'Apex Predator Hide', 'Monster King Head'],
      epic: ['Ancient Beast Skull', 'Legendary Creature Part', 'Ultimate Trophy']
    },
    alchemy: {
      common: ['Mysterious Herb', 'Monster Blood', 'Odd Mushroom'],
      uncommon: ['Potent Herb', 'Magical Essence', 'Creature Extract'],
      rare: ['Rare Ingredient', 'Arcane Compound', 'Mythical Herb'],
      epic: ['Philosopher\'s Element', 'Immortality Essence', 'Divine Extract']
    },
    gem: {
      common: ['Shiny Gem', 'Crystal Fragment', 'Glowing Stone'],
      uncommon: ['Semi-Precious Gem', 'Mana Crystal', 'Elemental Stone'],
      rare: ['Precious Gem', 'Power Crystal', 'Soul Stone'],
      epic: ['Legendary Gem', 'Wish Stone', 'God\'s Tear']
    }
  };
  
  // Select from available names
  const itemOptions = items[itemType]?.[rarity] || ['Mysterious Item'];
  const itemName = itemOptions[Math.floor(Math.random() * itemOptions.length)];
  
  // Determine quantity based on rarity
  let quantity = 1;
  if (rarity === 'common') {
    quantity = Math.floor(Math.random() * 3) + 1;
  } else if (rarity === 'uncommon') {
    quantity = Math.floor(Math.random() * 2) + 1;
  }
  
  // Create the item
  return {
    id: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: itemName,
    type: itemType,
    rarity: rarity,
    quantity: quantity
  };
}
