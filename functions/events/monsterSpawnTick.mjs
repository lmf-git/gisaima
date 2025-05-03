/**
 * Monster Spawn processing for Gisaima
 * Handles spawning monster groups near player activity
 */

import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";
import { Units } from 'gisaima-shared/units/units.js';
import { 
  generateMonsterUnits,
  createMonsterSpawnMessage,
  createMonsterGrowthMessage,
  countUnits,
  canStructureMobilize,
  MIN_UNITS_TO_MOBILIZE,
  MOBILIZATION_CHANCE,
  createMonsterGroupFromStructure,
  isMonsterStructure
} from '../monsters/_monsters.mjs';

// Constants for monster spawning
const SPAWN_CHANCE = .1; // 10% chance to spawn monsters in an active area
const MAX_SPAWN_DISTANCE = 9; // Maximum distance from player activity to spawn
const MIN_SPAWN_DISTANCE = 4; // Minimum distance from player activity to spawn
const MAX_MONSTERS_PER_CHUNK = 10; // Maximum monster groups per chunk
const STRUCTURE_SPAWN_CHANCE = 0.03; // 3% chance for a monster structure to spawn a monster group per tick

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
    const monsterStructures = [];
    
    // Scan chunks for player activity and monster structures
    for (const [chunkKey, chunkData] of Object.entries(chunks)) {
      if (!chunkData) continue;
      
      let monsterCount = 0;
      
      // Look through tiles in this chunk
      for (const [tileKey, tileData] of Object.entries(chunkData)) {
        if (!tileData) continue;
        
        const [x, y] = tileKey.split(',').map(Number);
        
        // Track monster structures - Updated to also check owner field
        if (tileData.structure && 
            (tileData.structure.monster === true || 
             tileData.structure.owner === 'monster' ||
             (tileData.structure.type && tileData.structure.type.includes('monster')))) {
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
      now
    );
    
    if (newGroupId) {
      groupsMobilized++;
      logger.info(`Monster structure at (${structureData.x}, ${structureData.y}) mobilized a new group`);
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
          .filter(([_, g]) => g.type === 'monster')
          .filter(([_, g]) => g.status === 'idle' && !g.inBattle)
          .map(([id, data]) => ({id, ...data}));
        
        // Need at least 2 monster groups to merge
        if (monsterGroups.length < 2) continue;
        
        const allowMixing = Math.random() < 0.2; // 20% chance to mix different types
        
        if (allowMixing) {
          // Create a mixed group from different monster types
          if (mergeGroups(worldId, chunkKey, tileKey, monsterGroups, updates, now, true)) {
            mergesPerformed++;
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
  
  // Determine group info
  let groupPath, groupName;
  const [x, y] = tileKey.split(',').map(Number);
  
  // Regular merge to base group
  groupName = baseGroup.name || "Monster Group";
  
  groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}`;
  
  // Retain personality from the base group (largest)
  // This encourages more powerful groups to maintain their behaviors
  
  // Update the base group
  updates[`${groupPath}/name`] = groupName;
  updates[`${groupPath}/items`] = allItems;
  updates[`${groupPath}/units`] = mergedUnits;
  updates[`${groupPath}/x`] = x;
  updates[`${groupPath}/y`] = y;
  updates[`${groupPath}/status`] = 'idle';
  updates[`${groupPath}/type`] = 'monster'; // Ensure type is set
  
  // Delete other groups
  for (const group of mergedGroups) {
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${group.id}`] = null;
  }
  
  // Add chat message about the merger
  const personality = baseGroup.personality || { name: '', emoji: '' };
  const personalityText = personality.name ? ` ${personality.emoji} ${personality.name}` : '';
  
  const chatMessageKey = `chat_monster_merge_${now}_${Math.floor(Math.random() * 1000)}`;
  updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
    text: `Monster groups have merged at (${x}, ${y}) forming a${personalityText} ${groupName}!`,
    type: 'event',
    timestamp: now,
    location: { x, y }
  };
  
  return true;
}
