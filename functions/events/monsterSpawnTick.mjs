/**
 * Monster Spawn Tick for Gisaima
 * Handles spawning of new monster groups and management of monster structures
 */

import { logger } from "firebase-functions";
import { getDatabase } from "firebase-admin/database";
import { 
  canStructureMobilize, 
  MOBILIZATION_CHANCE,
  createMonsterGroupFromStructure,
  createMonsterSpawnMessage,
  PLAYER_STRUCTURE_SEARCH_RADIUS,
  generateMonsterUnits,
  PLAYER_STRUCTURE_ATTACK_CHANCE,
} from "../monsters/_monsters.mjs";

import { getRandomPersonality } from "../monsters/_monsters.mjs";
import { Units } from 'gisaima-shared/units/units.js';

// Constants for monster spawning
const SPAWN_CHANCE = .1; // 10% chance to spawn monsters in an active area
const MAX_SPAWN_DISTANCE = 9; // Maximum distance from player activity to spawn
const MIN_SPAWN_DISTANCE = 4; // Minimum distance from player activity to spawn
const MAX_MONSTERS_PER_CHUNK = 10; // Maximum monster groups per chunk
const STRUCTURE_SPAWN_CHANCE = 0.03; // 3% chance for a monster structure to spawn a monster group per tick

/**
 * Spawn monsters near player activity
 * @param {string} worldId - The world ID
 * @param {Object} chunks - Pre-loaded chunks data
 * @returns {Promise<number>} - Number of monster groups spawned
 */
export async function spawnMonsters(worldId, chunks) {
  const db = getDatabase();
  let monstersSpawned = 0;
  
  try {
    if (!chunks) {
      logger.info(`No chunks found in world ${worldId}`);
      return 0;
    }

    // Track locations with recent player activity and existing monsters
    const activeLocations = [];
    const existingMonsterLocations = {};
    const monsterStructures = [];
    
    // Scan chunks for player activity and monster structures
    for (const [chunkKey, chunkData] of Object.entries(chunks)) {
      if (!chunkData) continue;
      
      let monsterCount = 0;
      
      // Look through tiles in this chunk
      for (const [tileKey, tileData] of Object.entries(chunkData)) {
        if (!tileData) continue;
        
        const [x, y] = tileKey.split(',').map(Number);
        
        // Track monster structures
        if (tileData.structure && tileData.structure?.monster) {
          monsterStructures.push({
            chunkKey,
            tileKey,
            x,
            y,
            structure: tileData.structure
          });
        }
        
        // Check for existing monsters
        if (tileData.groups) {
          for (const [groupId, groupData] of Object.entries(tileData.groups)) {
            // Count monster (NPC) groups
            if (groupData.type === 'monster') {
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
          .some(group => !(group.type === 'monster'));
          
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
    
    logger.info(`Found ${activeLocations.length} active locations and ${monsterStructures.length} monster structures in world ${worldId}`);
    
    // Process monster spawns at structures first
    const structureSpawns = await spawnMonstersAtStructures(worldId, monsterStructures, existingMonsterLocations);
    monstersSpawned += structureSpawns;
    
    // Process structure mobilizations - NEW FUNCTIONALITY
    const mobilizedGroups = await mobilizeFromMonsterStructures(worldId, monsterStructures, chunks);
    monstersSpawned += mobilizedGroups;
    
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
      
      await createNewMonsterGroup(worldId, spawnChunkKey, spawnTileKey, spawnLocation, updates, tileBiome);
      
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
 * Spawn monsters at monster structures with a chance per tick
 * @param {string} worldId - World ID
 * @param {Array} monsterStructures - Array of monster structures
 * @param {Object} existingMonsterLocations - Map of existing monster locations
 * @returns {Promise<number>} - Number of monster groups spawned
 */
async function spawnMonstersAtStructures(worldId, monsterStructures, existingMonsterLocations) {
  if (!monsterStructures.length) return 0;
  
  const db = getDatabase();
  let monstersSpawned = 0;
  const updates = {};
  const now = Date.now();
  
  // Process each monster structure
  for (const structureData of monsterStructures) {
    // Skip if we've already hit the monster limit for this chunk
    const chunkMonsterCount = existingMonsterLocations[structureData.chunkKey]?.length || 0;
    if (chunkMonsterCount >= MAX_MONSTERS_PER_CHUNK) {
      continue; 
    }
    
    // 3% chance to spawn per tick per structure
    if (Math.random() > STRUCTURE_SPAWN_CHANCE) {
      continue;
    }
    
    // Check if there's room for spawning (no groups already on the tile)
    const tileRef = db.ref(`worlds/${worldId}/chunks/${structureData.chunkKey}/${structureData.tileKey}`);
    const tileSnapshot = await tileRef.once('value');
    const tileData = tileSnapshot.val();
    
    // Skip if tile has groups already to prevent overcrowding
    if (tileData?.groups && Object.keys(tileData.groups).length > 0) {
      continue;
    }
    
    // Determine monster type based on structure
    let monsterType = 'goblin'; // Default
    
    // Use structure type to influence monster type
    if (structureData.structure.type) {
      if (structureData.structure.type === 'monster_hive') {
        monsterType = Math.random() > 0.5 ? 'spider' : 'goblin';
      } else if (structureData.structure.type === 'monster_fortress') {
        monsterType = Math.random() > 0.5 ? 'troll' : 'skeleton';
      } else if (structureData.structure.type === 'monster_lair') {
        monsterType = Math.random() > 0.5 ? 'wolf' : 'bandit';
      } else if (structureData.structure.type === 'monster_den') {
        monsterType = Math.random() > 0.5 ? 'elemental' : 'wolf';
      }
    }
    
    // Use structure level to determine strength
    const structureLevel = structureData.structure.level || 1;
    
    // Create a new monster group at this structure
    const monsterData = Units.getUnit(monsterType, 'monster');
    
    if (!monsterData) {
      logger.error(`Invalid monster type: ${monsterType}`);
      continue;
    }
    
    // Generate a group ID
    const groupId = `monster_${now}_${Math.floor(Math.random() * 10000)}`;
    
    // Determine unit count based on structure level
    const baseQty = Math.floor(
      Math.random() * (monsterData.unitCountRange[1] - monsterData.unitCountRange[0] + 1)
    ) + monsterData.unitCountRange[0];
    
    // Add bonus units based on structure level
    const bonusUnits = (structureLevel - 1) * Math.floor(Math.random() * 2 + 1);
    const qty = baseQty + bonusUnits;
    
    // Generate individual monster units
    const units = generateMonsterUnits(monsterType, qty);
    
    // Assign a personality to the monster group
    const tileBiome = tileData?.biome?.name || tileData?.terrain?.biome || 'unknown';
    const personality = getRandomPersonality(monsterType, tileBiome);
    
    // Create the monster group object
    const monsterGroup = {
      id: groupId,
      name: monsterData.name,
      type: 'monster',
      status: 'idle',
      units: units,
      x: structureData.x,
      y: structureData.y,
      // Add personality data
      personality: {
        id: personality.id,
        name: personality.name,
        emoji: personality.emoji
      },
      // Link to spawning structure
      spawnedFromStructure: structureData.structure.id,
      preferredStructureId: structureData.structure.id
    };
    
    // Maybe add items to the monster group - higher chance for structure spawns
    if (Math.random() < (monsterData.itemChance * 1.5)) {
      monsterGroup.items = Units.generateItems(monsterType, qty);
    }
    
    // Set the complete monster group at once
    const groupPath = `worlds/${worldId}/chunks/${structureData.chunkKey}/${structureData.tileKey}/groups/${groupId}`;
    updates[groupPath] = monsterGroup;
    
    // Add a message about monster sighting - special message for structure spawns
    const chatMessageKey = `chat_monster_spawn_${now}_${Math.floor(Math.random() * 1000)}`;
    updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
      text: `A group of ${personality.emoji || ''} ${monsterData.name} has emerged from the ${structureData.structure.name} at (${structureData.x}, ${structureData.y})!`,
      type: 'event',
      timestamp: now,
      location: {
        x: structureData.x,
        y: structureData.y
      }
    };
    
    monstersSpawned++;
  }
  
  // Apply all updates
  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
    logger.info(`Spawned ${monstersSpawned} monster groups at structures in world ${worldId}`);
  }
  
  return monstersSpawned;
}

/**
 * Mobilize monster groups from monster structures
 * @param {string} worldId - World ID
 * @param {Array} monsterStructures - Array of monster structures
 * @param {Object} chunks - All world chunks data
 * @returns {Promise<number>} - Number of groups mobilized
 */
async function mobilizeFromMonsterStructures(worldId, monsterStructures, chunks) {
  if (!monsterStructures.length) return 0;
  
  const db = getDatabase();
  let groupsMobilized = 0;
  const updates = {};
  const now = Date.now();
  
  // Find all player structures and spawns
  const playerStructures = [];
  const playerSpawns = []; // Separate array just for spawns
  
  for (const [chunkKey, chunkData] of Object.entries(chunks)) {
    if (!chunkData) continue;
    
    for (const [tileKey, tileData] of Object.entries(chunkData)) {
      if (!tileData || !tileData.structure) continue;
      
      const structure = tileData.structure;
      const [x, y] = tileKey.split(',').map(Number);
      
      // Separate spawns from other structures
      if (structure.type === 'spawn') {
        playerSpawns.push({
          x, y,
          chunkKey,
          tileKey,
          structure
        });
      }
      else if (structure.owner && structure.owner !== 'monster') {
        playerStructures.push({
          x, y,
          chunkKey,
          tileKey,
          structure
        });
      }
    }
  }
  
  // Process each monster structure for potential mobilization
  for (const structureData of monsterStructures) {
    // Only a chance to mobilize each tick
    if (Math.random() > MOBILIZATION_CHANCE) {
      continue;
    }
    
    // Check if the structure is valid for mobilization
    const tileRef = db.ref(`worlds/${worldId}/chunks/${structureData.chunkKey}/${structureData.tileKey}`);
    const tileSnapshot = await tileRef.once('value');
    const tileData = tileSnapshot.val();
    
    // Skip if no tile data or structure
    if (!tileData || !tileData.structure) {
      continue;
    }
    
    const structure = tileData.structure;
    
    // Check if structure can mobilize
    if (!canStructureMobilize(structure, tileData)) {
      continue;
    }
    
    // NEW: Prioritize targeting player spawns (40% chance)
    let targetPlayerStructure = null;
    
    // First check for player spawns with higher probability
    if (Math.random() < 0.4 && playerSpawns.length > 0) {
      // Find player spawns within range
      const nearbySpawns = playerSpawns.filter(ps => {
        const distance = Math.sqrt(
          Math.pow(ps.x - structureData.x, 2) + 
          Math.pow(ps.y - structureData.y, 2)
        );
        return distance <= PLAYER_STRUCTURE_SEARCH_RADIUS;
      });
      
      if (nearbySpawns.length > 0) {
        // Pick a random spawn to target from those in range
        targetPlayerStructure = nearbySpawns[Math.floor(Math.random() * nearbySpawns.length)];
        logger.info(`Monster structure at (${structureData.x}, ${structureData.y}) targeting player spawn at (${targetPlayerStructure.x}, ${targetPlayerStructure.y})`);
      }
    }
    
    // If no spawn was targeted, check other player structures with regular chance
    if (!targetPlayerStructure && Math.random() < PLAYER_STRUCTURE_ATTACK_CHANCE && playerStructures.length > 0) {
      // Find player structures within range
      const nearbyStructures = playerStructures.filter(ps => {
        const distance = Math.sqrt(
          Math.pow(ps.x - structureData.x, 2) + 
          Math.pow(ps.y - structureData.y, 2)
        );
        return distance <= PLAYER_STRUCTURE_SEARCH_RADIUS;
      });
      
      if (nearbyStructures.length > 0) {
        // Pick a random structure to target from those in range
        targetPlayerStructure = nearbyStructures[Math.floor(Math.random() * nearbyStructures.length)];
      }
    }

    // Determine monster type to mobilize
    let monsterType = 'goblin'; // Default
    
    // Use structure type to determine monster type
    if (structure.type) {
      if (structure.type === 'monster_hive') {
        monsterType = Math.random() > 0.5 ? 'spider' : 'goblin';
      } else if (structure.type === 'monster_fortress') {
        monsterType = Math.random() > 0.5 ? 'troll' : 'skeleton';
      } else if (structure.type === 'monster_lair') {
        monsterType = Math.random() > 0.5 ? 'wolf' : 'bandit';
      } else if (structure.type === 'monster_den') {
        monsterType = Math.random() > 0.5 ? 'elemental' : 'wolf';
      }
    }
    
    // Create a new monster group from structure
    const newGroupId = await createMonsterGroupFromStructure(
      worldId,
      structure,
      { x: structureData.x, y: structureData.y },
      monsterType,
      updates,
      now,
      targetPlayerStructure  // Pass the target if available
    );
    
    if (newGroupId) {
      groupsMobilized++;
      logger.info(`Monster structure at (${structureData.x}, ${structureData.y}) mobilized a new group${targetPlayerStructure ? " targeting " + (targetPlayerStructure.structure.type === "spawn" ? "player spawn" : "player structure") : ""}`);
    }
  }
  
  // Apply all updates
  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
    logger.info(`Mobilized ${groupsMobilized} monster groups from structures in world ${worldId}`);
  }
  
  return groupsMobilized;
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
  const type = Units.chooseMonsterTypeForBiome(biome);
  const monsterData = Units.getUnit(type, 'monster');
  
  if (!monsterData) {
    logger.error(`Invalid monster type: ${type}`);
    return null;
  }
  
  // Generate a group ID
  const groupId = `monster_${now}_${Math.floor(Math.random() * 10000)}`;
  
  // Determine unit count within range
  const qty = Math.floor(
    Math.random() * (monsterData.unitCountRange[1] - monsterData.unitCountRange[0] + 1)
  ) + monsterData.unitCountRange[0];
  
  // Generate individual monster units using shared function
  const units = generateMonsterUnits(type, qty);
  
  // Assign a personality to the monster group
  const personality = getRandomPersonality(type, biome);
  
  // Create the monster group object
  const monsterGroup = {
    id: groupId,
    name: monsterData.name,
    type: 'monster',
    status: 'idle',
    units: units,
    x: location.x,
    y: location.y,
    // Add personality data
    personality: {
      id: personality.id,
      name: personality.name,
      emoji: personality.emoji
    }
  };
  
  // Maybe add items to the monster group
  if (Math.random() < monsterData.itemChance) {
    monsterGroup.items = Units.generateItems(type, qty);
  }
  
  // Set the complete monster group at once
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  updates[groupPath] = monsterGroup;
  
  // Add a message about monster sighting
  const chatMessageKey = `chat_monster_spawn_${now}_${Math.floor(Math.random() * 1000)}`;
  updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
    text: createMonsterSpawnMessage(monsterData.name, qty, tileKey, personality),
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
 * Merge multiple monster groups into a single group
 * This is used by the tick system to consolidate monster groups
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {Array} groups - Array of monster groups to merge
 * @param {object} updates - Updates object to modify
 * @param {number} now - Current timestamp
 * @returns {object} Merged group or null if merge failed
 */
export async function mergeMonsterGroups(db, worldId, groups, updates, now) {
  if (!groups || groups.length <= 1) {
    return null;
  }
  
  // Find the largest group to be the base for merging
  const sortedGroups = [...groups].sort((a, b) => {
    const aCount = a.units ? Object.keys(a.units).length : 0;
    const bCount = b.units ? Object.keys(b.units).length : 0;
    return bCount - aCount; // Sort descending by unit count
  });
  
  const baseGroup = sortedGroups[0];
  const baseGroupPath = `worlds/${worldId}/chunks/${baseGroup.chunkKey}/${baseGroup.tileKey}/groups/${baseGroup.id}`;
  
  // Combined units collection
  let allUnits = {...(baseGroup.units || {})};
  let allItems = [...(baseGroup.items || [])];
  let unitTypeCounts = {};
  
  // Track monster types for naming
  baseGroup.units && Object.values(baseGroup.units).forEach(unit => {
    const type = unit.type || 'unknown';
    unitTypeCounts[type] = (unitTypeCounts[type] || 0) + 1;
  });
  
  // Merge in all other groups
  for (let i = 1; i < sortedGroups.length; i++) {
    const group = sortedGroups[i];
    const groupPath = `worlds/${worldId}/chunks/${group.chunkKey}/${group.tileKey}/groups/${group.id}`;
    
    // Merge units
    if (group.units) {
      allUnits = {...allUnits, ...group.units};
      
      // Track unit types for naming
      Object.values(group.units).forEach(unit => {
        const type = unit.type || 'unknown';
        unitTypeCounts[type] = (unitTypeCounts[type] || 0) + 1;
      });
    }
    
    // Merge items
    if (group.items && group.items.length > 0) {
      allItems = [...allItems, ...group.items];
    }
    
    // Delete the absorbed group
    updates[groupPath] = null;
  }
  
  // Generate a new name based on composition
  const totalUnits = Object.keys(allUnits).length;
  const newName = generateMergedGroupName(totalUnits, unitTypeCounts, baseGroup.name);
  
  // Update base group with all units and items
  updates[`${baseGroupPath}/units`] = allUnits;
  updates[`${baseGroupPath}/items`] = allItems;
  updates[`${baseGroupPath}/name`] = newName;
  
  // Add a message about the merge
  const chatMessageId = `monster_merge_${now}_${baseGroup.id}`;
  const location = {
    x: parseInt(baseGroup.tileKey.split(',')[0]),
    y: parseInt(baseGroup.tileKey.split(',')[1])
  };
  
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `Monster groups have merged into a larger ${newName} at (${location.x}, ${location.y})!`,
    type: 'event',
    timestamp: now,
    location
  };
  
  return {
    ...baseGroup,
    units: allUnits,
    items: allItems,
    name: newName
  };
}

/**
 * Standalone function to merge monster groups in the world
 * @param {string} worldId - World ID
 * @param {Object} chunks - Pre-loaded chunks data
 * @returns {Promise<number>} - Number of groups merged
 */
export async function mergeWorldMonsterGroups(worldId, chunks) {
  const db = getDatabase();
  let groupsMerged = 0;
  const now = Date.now();
  const updates = {};
  
  try {
    if (!chunks) {
      logger.info(`No chunks found in world ${worldId}`);
      return 0;
    }
    
    // Process logic to find and merge groups...
    // Use mergeMonsterGroups helper function with found groups
    
    // Apply updates
    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }
    
    return groupsMerged;
    
  } catch (error) {
    logger.error(`Error merging monster groups in world ${worldId}:`, error);
  }
}