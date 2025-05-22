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
  isWaterTile,
  isBiomeCompatible 
} from "../monsters/_monsters.mjs";

import { getRandomPersonality } from "../monsters/_monsters.mjs";
import { Units } from 'gisaima-shared/units/units.js';
import { getChunkKey } from 'gisaima-shared/map/cartography.js';

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
 * @param {Object} terrainGenerator - TerrainGenerator instance
 * @returns {Promise<number>} - Number of monster groups spawned
 */
export async function spawnMonsters(worldId, chunks, terrainGenerator) {
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
    const structureSpawns = await spawnMonstersAtStructures(worldId, monsterStructures, existingMonsterLocations, chunks, terrainGenerator);
    monstersSpawned += structureSpawns;
    
    // Process structure mobilizations
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
      
      // Either create a new monster group or merge with an existing one
      const updates = {};
      
      // Use terrainGenerator instead of relying on tile data for biome
      await createNewMonsterGroup(
        worldId, 
        spawnChunkKey, 
        spawnTileKey, 
        spawnLocation, 
        updates, 
        terrainGenerator, // Pass terrainGenerator instead of tileBiome
        chunks
      );
      
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
 * @param {Object} chunks - All world chunks data
 * @param {Object} terrainGenerator - TerrainGenerator instance
 * @returns {Promise<number>} - Number of monster groups spawned
 */
async function spawnMonstersAtStructures(worldId, monsterStructures, existingMonsterLocations, chunks, terrainGenerator) {
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
    
    // Get tile data from chunks instead of making a database call
    const tileData = chunks[structureData.chunkKey]?.[structureData.tileKey];
    if (!tileData) {
      continue;
    }
    
    // Skip if tile has groups already to prevent overcrowding
    if (tileData.groups && Object.keys(tileData.groups).length > 0) {
      continue;
    }
    
    // Check if tile is water - use x, y coordinates instead of tileData object
    const isWater = isWaterTile(structureData.x, structureData.y, terrainGenerator);
    
    // Determine monster type based on structure and terrain
    let monsterType = 'ork'; // Default
    
    // Use structure type to influence monster type
    if (structureData.structure.type) {
      if (isWater) {
        // Select an appropriate water monster
        const waterMonsterTypes = ['merfolk', 'sea_serpent', 'shark', 'drowned'];
        monsterType = waterMonsterTypes[Math.floor(Math.random() * waterMonsterTypes.length)];
      } else if (structureData.structure.type === 'monster_hive') {
        monsterType = Math.random() > 0.5 ? 'spider' : 'ork';
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
    
    // Assign a personality to the monster group - get biome from TerrainGenerator
    const terrainData = terrainGenerator.getTerrainData(structureData.x, structureData.y);
    const biome = terrainData.biome.name;
    
    const personality = getRandomPersonality(monsterType, biome);
    
    // Create the monster group object
    const monsterGroup = {
      id: groupId,
      name: monsterData.name,
      type: 'monster',
      status: 'idle',
      units: units,
      x: structureData.x,
      y: structureData.y,
      // Add motion capabilities based on environment and monster type
      motion: monsterData.motion || (isWater ? ['water'] : ['ground']),
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
      // Generate items in the new format
      monsterGroup.items = Units.generateItems(monsterType, qty, true); // Pass true to get object format
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
 * @param {Object} terrainGenerator - TerrainGenerator instance (optional)
 * @returns {Promise<number>} - Number of groups mobilized
 */
async function mobilizeFromMonsterStructures(worldId, monsterStructures, chunks, terrainGenerator = null) {
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
    
    // Get structure data from chunks instead of making a database call
    const tileData = chunks[structureData.chunkKey]?.[structureData.tileKey];
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
    let monsterType = 'ork'; // Default
    
    // Use structure type to determine monster type
    if (structure.type) {
      if (structure.type === 'monster_hive') {
        monsterType = Math.random() > 0.5 ? 'spider' : 'ork';
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
async function createNewMonsterGroup(
  worldId, 
  chunkKey, 
  tileKey, 
  location, 
  updates, 
  terrainGenerator, 
  chunks
) {
  const now = Date.now();
  
  // Check if the spawn location is a water tile - USE TERRAINGENERATOR DIRECTLY
  const isWaterLocation = isWaterTile(location.x, location.y, terrainGenerator);
  
  // Get biome info from TerrainGenerator
  const terrainData = terrainGenerator.getTerrainData(location.x, location.y);
  const biome = terrainData.biome.name;
  
  // DEBUG: Log biome information for spawn location
  logger.info(`[BIOME_DEBUG] Spawn location: (${location.x}, ${location.y}) | Biome: ${biome} | Water: ${isWaterLocation ? 'Yes' : 'No'}`);
  logger.info(`[BIOME_DEBUG] Terrain details: ${JSON.stringify({
    elevation: terrainData.elevation || 'unknown',
    moisture: terrainData.moisture || 'unknown',
    biomeId: terrainData.biome.id || 'unknown',
    riverValue: terrainData.riverValue || 0,
    lakeValue: terrainData.lakeValue || 0,
  })}`);
  
  // Select monster type based on terrain: water or land
  let type;
  
  // If this is a water tile, select a water monster
  if (isWaterLocation) {
    // List of water monster types
    const waterMonsterTypes = ['merfolk', 'sea_serpent', 'shark', 'kraken', 'drowned'];
    
    // Choose a water monster type based on biome/water depth
    if (biome === 'deep_ocean') {
      // Favor deep water monsters
      type = Math.random() < 0.6 ? 
        ['kraken', 'sea_serpent'][Math.floor(Math.random() * 2)] : 
        waterMonsterTypes[Math.floor(Math.random() * waterMonsterTypes.length)];
    } else if (biome === 'ocean' || biome === 'sea') {
      // Favor ocean monsters
      type = Math.random() < 0.7 ? 
        ['merfolk', 'shark', 'sea_serpent'][Math.floor(Math.random() * 3)] : 
        waterMonsterTypes[Math.floor(Math.random() * waterMonsterTypes.length)];
    } else {
      // Shallower water (rivers, lakes)
      type = Math.random() < 0.8 ? 
        ['merfolk', 'drowned'][Math.floor(Math.random() * 2)] : 
        waterMonsterTypes[Math.floor(Math.random() * waterMonsterTypes.length)];
    }
  } else {
    // Choose a land monster type using existing function
    type = Units.chooseMonsterTypeForBiome(biome);
    logger.info(`[BIOME_DEBUG] Selected land monster type '${type}' for biome '${biome}'`);
  }
  
  const monsterData = Units.getUnit(type, 'monster');
  
  if (!monsterData) {
    logger.error(`Invalid monster type: ${type}`);
    return null;
  }
  
  // IMPORTANT: Validate that the monster's motion capabilities are compatible with the terrain
  if (isWaterLocation && monsterData.motion) {
    // If this is a water tile, ensure the monster can traverse water
    if (!monsterData.motion.includes('water') && 
        !monsterData.motion.includes('aquatic') && 
        !monsterData.motion.includes('flying')) {
      // This monster can't traverse water, so find a different monster type
      logger.info(`[BIOME_DEBUG] Monster type ${type} cannot traverse water - selecting a water-capable monster instead`);
      
      // Use a water monster instead
      const waterMonsterTypes = ['merfolk', 'sea_serpent', 'shark', 'drowned'];
      type = waterMonsterTypes[Math.floor(Math.random() * waterMonsterTypes.length)];
      monsterData = Units.getUnit(type, 'monster');
      
      if (!monsterData) {
        logger.error(`Failed to find valid water monster type`);
        return null;
      }
    }
  } else if (!isWaterLocation && monsterData.motion) {
    // If this is a land tile, ensure the monster can traverse land
    if (monsterData.motion.length === 1 && 
       (monsterData.motion.includes('water') || monsterData.motion.includes('aquatic'))) {
      // This monster can only traverse water, so find a land monster instead
      logger.info(`[BIOME_DEBUG] Monster type ${type} can only traverse water - selecting a land-capable monster instead`);
      
      // Try a few common land monsters
      const landMonsterTypes = ['ork', 'bandit', 'wolf', 'skeleton'];
      type = landMonsterTypes[Math.floor(Math.random() * landMonsterTypes.length)];
      monsterData = Units.getUnit(type, 'monster');
      
      if (!monsterData) {
        logger.error(`Failed to find valid land monster type`);
        return null;
      }
    }
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
    // Add motion capabilities from monster definition
    motion: monsterData.motion || ['ground'], // Default to ground if not specified
    // Add personality data
    personality: {
      id: personality.id,
      name: personality.name,
      emoji: personality.emoji
    }
  };
  
  // Maybe add items to the monster group using the updated format
  if (Math.random() < monsterData.itemChance) {
    // Generate items using the new format directly
    monsterGroup.items = Units.generateItems(type, qty, true); // Pass true to get object format
  }
  
  // Set the complete monster group at once
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  updates[groupPath] = monsterGroup;
  
  // Debug log for successful spawn
  logger.info(`[BIOME_DEBUG] Successfully spawned ${type} at (${location.x}, ${location.y}) in biome ${biome}`);
  
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
  let unitTypeCounts = {};
  
  // Initialize merged items according to the base group's format
  let mergedItems;
  
  // Check if base group uses the new format
  const baseGroupUsesNewFormat = baseGroup.items && 
                              !Array.isArray(baseGroup.items) && 
                              typeof baseGroup.items === 'object';
  
  if (baseGroupUsesNewFormat) {
    // Use object format if base group does
    mergedItems = {...baseGroup.items};
  } else {
    // Use array format if base group does (legacy)
    mergedItems = [...(baseGroup.items || [])];
  }
  
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
    
    // Merge items based on format
    if (group.items) {
      if (baseGroupUsesNewFormat) {
        // Base group uses new format, merge accordingly
        if (!Array.isArray(group.items) && typeof group.items === 'object') {
          // Both use object format, merge directly
          Object.entries(group.items).forEach(([itemCode, quantity]) => {
            mergedItems[itemCode] = (mergedItems[itemCode] || 0) + quantity;
          });
        } else if (Array.isArray(group.items)) {
          // Convert array items to object format and merge
          group.items.forEach(item => {
            if (item && item.id) {
              const itemCode = item.id.toUpperCase();
              mergedItems[itemCode] = (mergedItems[itemCode] || 0) + (item.quantity || 1);
            }
          });
        }
      } else {
        // Base group uses legacy format, maintain array
        if (Array.isArray(group.items)) {
          // Both use array format, concatenate
          mergedItems = [...mergedItems, ...group.items];
        } else if (!Array.isArray(group.items) && typeof group.items === 'object') {
          // Convert object items to array format and merge
          Object.entries(group.items).forEach(([itemCode, quantity]) => {
            mergedItems.push({
              id: itemCode,
              name: ITEMS[itemCode]?.name || itemCode,
              type: 'resource',
              quantity: quantity
            });
          });
        }
      }
    }
    
    // Delete the absorbed group
    updates[groupPath] = null;
  }
  
  // Generate a new name based on composition
  const totalUnits = Object.keys(allUnits).length;
  const newName = generateMergedGroupName(totalUnits, unitTypeCounts, baseGroup.name);
  
  // Update base group with all units and items
  updates[`${baseGroupPath}/units`] = allUnits;
  updates[`${baseGroupPath}/items`] = mergedItems;
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
 * @param {Object} terrainGenerator - TerrainGenerator instance (optional)
 * @returns {Promise<number>} - Number of groups merged
 */
export async function mergeWorldMonsterGroups(worldId, chunks, terrainGenerator = null) {
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

/**
 * Process monster spawning for the current tick
 * @param {Object} data - Current game state
 * @param {Object} db - Database reference
 * @param {Object} updates - Updates to apply
 * @param {Object} terrainGenerator - Instance of TerrainGenerator
 * @param {number} now - Current timestamp
 */
export async function monsterSpawnTick(data, db, updates, terrainGenerator, now) {
  const { world, chunks, gameTime } = data;
  const worldId = world.id;
  
  // Configure spawn parameters
  const spawnChance = 0.05; // 5% chance per suitable tile
  const minDistanceFromSpawn = 15;
  
  // Get all monster types for spawning
  const monsterTypes = Object.entries(UNITS)
    .filter(([_, unit]) => unit.category === 'monster')
    .map(([id, unit]) => ({ id, ...unit }));
  
  // Process each chunk in the world
  for (const [chunkKey, chunkData] of Object.entries(chunks || {})) {
    if (!chunkData) continue;
    
    // Process each tile in the chunk
    for (const [tileKey, tileData] of Object.entries(chunkData)) {
      if (!tileData) continue;
      
      // Skip if tile already has monsters, structures, or is in battle
      if (tileData.groups && Object.values(tileData.groups).some(g => g.type === 'monster')) continue;
      if (tileData.structure) continue;
      if (tileData.battles && Object.keys(tileData.battles).length > 0) continue;
      
      // Extract tile coordinates and check if it's too close to spawn
      const [x, y] = tileKey.split(',').map(Number);
      
      // Skip if too close to spawn
      if (world.spawn) {
        const dx = x - world.spawn.x;
        const dy = y - world.spawn.y;
        if (Math.sqrt(dx*dx + dy*dy) < minDistanceFromSpawn) continue;
      }
      
      // IMPORTANT: Use TerrainGenerator to get biome data for this tile
      const terrainData = terrainGenerator.getTerrainData(x, y);
      if (!terrainData || !terrainData.biome || !terrainData.biome.name) continue;
      
      // Extract biome name from terrain data
      const biomeName = terrainData.biome.name;
      
      // Check if this is a water tile using coordinates and terrainGenerator
      const isWaterBiome = isWaterTile(x, y, terrainGenerator);
      
      // Debug log for tile being considered for spawning
      logger.debug(`[BIOME_DEBUG] Considering tile (${x}, ${y}) | Biome: ${biomeName} | Water: ${isWaterBiome ? 'Yes' : 'No'}`);
      
      // Roll for monster spawn
      if (Math.random() < spawnChance) {
        // Filter monsters suitable for this biome and environment
        const suitableMonsters = monsterTypes.filter(monster => 
          isBiomeCompatible(monster, biomeName, isWaterBiome)
        );
        
        // Debug log for suitable monsters
        logger.info(`[BIOME_DEBUG] Tile (${x}, ${y}) | Biome: ${biomeName} | Found ${suitableMonsters.length} suitable monsters: ${suitableMonsters.map(m => m.id).join(', ')}`);
        
        // If no suitable monsters for this biome, skip
        if (suitableMonsters.length === 0) {
          logger.info(`[BIOME_DEBUG] No suitable monsters found for biome ${biomeName} at (${x}, ${y})`);
          continue;
        }
        
        // Select random monster from suitable ones, weighted by probability
        const selectedMonster = selectRandomMonster(suitableMonsters);
        if (!selectedMonster) continue;
        
        logger.info(`[BIOME_DEBUG] Selected monster type '${selectedMonster.id}' for biome '${biomeName}' at (${x}, ${y})`);
        
        // Generate monster group
        await spawnMonsterGroup(
          selectedMonster,
          worldId,
          x,
          y,
          chunkKey,
          tileKey,
          updates,
          now
        );
      }
    }
  }
}

/**
 * Select a random monster weighted by probability
 * @param {Array} monsters List of suitable monsters
 * @returns {Object} Selected monster
 */
function selectRandomMonster(monsters) {
  // Calculate total probability
  const totalProb = monsters.reduce((sum, m) => sum + (m.probability || 0.1), 0);
  
  // Roll a random value
  const roll = Math.random() * totalProb;
  
  // Select monster based on roll
  let cumulativeProb = 0;
  for (const monster of monsters) {
    cumulativeProb += (monster.probability || 0.1);
    if (roll <= cumulativeProb) {
      return monster;
    }
  }
  
  // Fallback to first monster if something went wrong
  return monsters[0];
}

/**
 * Spawn a monster group at the given location
 * @param {Object} monster Monster type data
 * @param {string} worldId World ID
 * @param {number} x X coordinate
 * @param {number} y Y coordinate
 * @param {string} chunkKey Chunk key
 * @param {string} tileKey Tile key
 * @param {Object} updates Updates object
 * @param {number} now Current timestamp
 * @returns {string} Generated group ID
 */
async function spawnMonsterGroup(monster, worldId, x, y, chunkKey, tileKey, updates, now) {
  // Generate a unique ID for this monster group
  const groupId = `monster_${now}_${Math.floor(Math.random() * 10000)}`;
  
  // Calculate random number of units within monster's range
  const minUnits = monster.unitCountRange?.[0] || 1;
  const maxUnits = monster.unitCountRange?.[1] || 4;
  const unitCount = Math.floor(Math.random() * (maxUnits - minUnits + 1)) + minUnits;
  
  // Generate individual monster units
  const units = generateMonsterUnits(monster.id, unitCount);
  
  // Assign a random personality
  const personality = getRandomPersonality(monster.id);
  
  // Create the monster group
  const monsterGroup = {
    id: groupId,
    name: monster.name,
    type: 'monster',
    status: 'idle',
    units: units,
    x: x,
    y: y,
    // Add motion capabilities from monster type
    motion: monster.motion || ['ground'],
    // Add personality
    personality: {
      id: personality.id,
      name: personality.name,
      emoji: personality.emoji
    }
  };
  
  // Debug log for new monster group
  logger.info(`[BIOME_DEBUG] Creating new monster group: ${monster.id} (${unitCount} units) at (${x}, ${y})`);
  
  // Add to updates
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  updates[groupPath] = monsterGroup;
  
  // Add a message about monster sighting
  const chatMessageId = `chat_monster_spawn_${now}_${Math.floor(Math.random() * 1000)}`;
  const chatPath = `worlds/${worldId}/chat/${chatMessageId}`;
  updates[chatPath] = {
    text: createMonsterSpawnMessage(monster.name, unitCount, `${x},${y}`, personality),
    type: 'event',
    timestamp: now,
    location: { x, y }
  };
  
  return groupId;
}