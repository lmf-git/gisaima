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
