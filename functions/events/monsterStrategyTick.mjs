/**
 * Monster Strategy processing for Gisaima
 * Handles monster group AI behavior for movement, gathering, building, etc.
 */

import { logger } from "firebase-functions";
import { getDatabase } from 'firebase-admin/database';
import { calculateDistance, moveMonsterTowardsTarget } from '../monsters/strategy/movement.js';
import { 
  findPlayerGroupsOnTile, 
  initiateAttackOnPlayers, 
  initiateAttackOnStructure, 
  joinExistingBattle,
  findMergeableMonsterGroups,
  mergeMonsterGroupsOnTile,
  findAttackableMonsterGroups,
  initiateAttackOnMonsters
} from '../monsters/strategy/combat.mjs';
import { startMonsterGathering, countTotalResources } from '../monsters/strategy/resources.mjs';
import { MONSTER_PERSONALITIES, shouldChangePersonality, getRandomPersonality } from 'gisaima-shared/definitions/MONSTER_PERSONALITIES.js';
import { 
  isMonsterGroup, 
  isAvailableForAction,
  scanWorldMap,
  isSuitableForMonsterBuilding,
  canTraverseWater,
  isWaterTile
} from '../monsters/_monsters.mjs';

import { 
  buildMonsterStructure, 
  upgradeMonsterStructure, 
  demobilizeAtMonsterStructure,
  addOrUpgradeMonsterBuilding
} from '../monsters/strategy/building.js';
import { calculateGroupPower } from "gisaima-shared/war/battles.js";
import { STRUCTURES } from "gisaima-shared/definitions/STRUCTURES.js";

// Constants and configuration
const STRATEGY_CHANCE = 0.4; // Chance for a monster group to take strategic action
const MIN_UNITS_TO_BUILD = 5; // Minimum units needed to consider building
const MIN_RESOURCES_TO_BUILD = 15; // Minimum resources needed to build a structure
const MERGE_CHANCE = 0.7; // Chance to attempt merging when other monster groups are present
const MIN_DISTANCE_FROM_SPAWN = 10; // Minimum distance from player spawns to build a structure
const NEAR_MONSTER_STRUCTURE_DISTANCE = 15; // Distance considered "near" a monster structure (added)

// Re-export imported functions
export { isMonsterGroup, isAvailableForAction };

/**
 * Execute a strategic action for a monster group
 */
export async function executeMonsterStrategy(db, worldId, monsterGroup, location, tileData, worldScan, updates, now, chunks, terrainGenerator = null) {
  // Get current data needed to make decisions
  const groupId = monsterGroup.id;
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = monsterGroup.tileKey;
  
  // Base path for this group
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  
  // Check if monster is in exploration phase using tick counting
  const inExplorationPhase = monsterGroup.explorationPhase && 
                           (monsterGroup.explorationTicks && monsterGroup.explorationTicks > 0);
  
  // Check for targeted player structure (from structured mobilization)
  if (monsterGroup.targetStructure) {
    console.log(`Monster group ${groupId} has target structure at (${monsterGroup.targetStructure.x}, ${monsterGroup.targetStructure.y})`);
    
    // Check if target structure is on a water tile and monster can't traverse water
    let isTargetWater = false;
    
    // Use TerrainGenerator if available
    if (terrainGenerator && !canTraverseWater(monsterGroup)) {
      // Use coordinates instead of tile data
      isTargetWater = isWaterTile(
        monsterGroup.targetStructure.x, 
        monsterGroup.targetStructure.y,
        terrainGenerator
      );
    }
    // Fallback to chunk data if no terrain generator
    else if (chunks && !canTraverseWater(monsterGroup)) {
      const targetChunkKey = getChunkKey(monsterGroup.targetStructure.x, monsterGroup.targetStructure.y);
      const targetTileKey = `${monsterGroup.targetStructure.x},${monsterGroup.targetStructure.y}`;
      
      if (chunks[targetChunkKey] && chunks[targetChunkKey][targetTileKey]) {
        const targetTileData = chunks[targetChunkKey][targetTileKey];
        // Direct check for water property
        isTargetWater = targetTileData.biome?.water === true;
      }
    }
    
    if (isTargetWater) {
      // Reset target structure if it's on water and we can't reach it
      console.log(`Monster group ${groupId} cannot reach target structure - it's on a water tile`);
      updates[`${groupPath}/targetStructure`] = null;
      
      // Move to a different target instead
      return await moveMonsterTowardsTarget(
        db, worldId, monsterGroup, location, worldScan, updates, now, null, monsterGroup.personality, chunks, terrainGenerator
      );
    }
    
    // If we're close enough to the target structure, initiate an attack
    const targetDistance = calculateDistance(location, monsterGroup.targetStructure);
    
    if (targetDistance <= 1.5) {
      // Get the target structure's data from chunks instead of database
      const targetChunkKey = getChunkKey(monsterGroup.targetStructure.x, monsterGroup.targetStructure.y);
      const targetTileKey = `${monsterGroup.targetStructure.x},${monsterGroup.targetStructure.y}`;
      
      // Use chunks data instead of making a database call
      if (chunks && chunks[targetChunkKey] && chunks[targetChunkKey][targetTileKey]) {
        const targetTileData = chunks[targetChunkKey][targetTileKey];
        
        if (targetTileData && targetTileData.structure) {
          // We've reached the target - attack it!
          return await initiateAttackOnStructure(
            db, 
            worldId, 
            monsterGroup, 
            targetTileData.structure, 
            monsterGroup.targetStructure, 
            updates, 
            now
          );
        }
      } else {
        console.log(`Target tile ${targetTileKey} in chunk ${targetChunkKey} not found in chunks data`);
      }
    } else {
      // Still moving toward target - prioritize movement
      return await moveMonsterTowardsTarget(
        db, worldId, monsterGroup, location, worldScan, updates, now, 'structure_attack', null, chunks
      );
    }
  }
  
  // Handle exploration phase differently
  if (inExplorationPhase) {
    // Skip demobilizing, merging, and other non-movement actions during exploration
    // Force movement action with higher probability (90%)
    if (Math.random() < 0.9) {
      return await moveMonsterTowardsTarget(
        db, worldId, monsterGroup, location, worldScan, updates, now, null, monsterGroup.personality, chunks, terrainGenerator
      );
    }
  }
  
  // Get personality and its influence weights, or use balanced defaults
  const personalityId = monsterGroup.personality?.id || 'BALANCED';
  const personality = MONSTER_PERSONALITIES[personalityId] || MONSTER_PERSONALITIES.BALANCED;
  const weights = personality.weights;
  
  // NEW: Action pool approach - define possible actions with weights
  const actionPool = [];
  
  // Factors that influence decisions
  const totalUnits = monsterGroup.units ? Object.keys(monsterGroup.units).length : 1;
  const hasResources = monsterGroup.items && monsterGroup.items.length > 0;
  const resourceCount = countTotalResources(monsterGroup.items);
  
  // Structure under construction that could be adopted
  const structureUnderConstruction = tileData.structure && 
                                   tileData.structure.status === 'building' && 
                                   (!tileData.structure.builder || 
                                    !tileData.groups || 
                                    !Object.values(tileData.groups).some(g => g.status === 'building'));
  
  // Structure on current tile
  const structureOnTile = tileData.structure && tileData.structure?.monster;
  
  // Just mobilized from structure on current tile?
  const justMobilized = monsterGroup.mobilizedFromStructure && 
    monsterGroup.mobilizedFromStructure === (tileData.structure?.id || null);
  
  if (justMobilized && structureOnTile) {
    // If we're on our own structure and have just mobilized, prioritize moving away
    return await moveMonsterTowardsTarget(
      db, worldId, monsterGroup, location, worldScan, updates, now, null, personality, chunks, terrainGenerator
    );
  }
  
  // Check for other monster groups to merge with
  const mergeableGroups = !inExplorationPhase ? findMergeableMonsterGroups(tileData, groupId) : [];
  if (mergeableGroups.length > 0) {
    actionPool.push({
      name: 'merge',
      weight: 0.7 * (weights?.merge || 1.0),
      execute: async () => await mergeMonsterGroupsOnTile(db, worldId, monsterGroup, mergeableGroups, updates, now)
    });
  }
  
  // Check for battles on this tile to join
  if (!inExplorationPhase && tileData.battles) {
    const joinWeight = weights?.joinBattle || weights?.attack || 1.0;
    actionPool.push({
      name: 'join_battle',
      weight: joinWeight * 0.6,
      execute: async () => await joinExistingBattle(db, worldId, monsterGroup, tileData, updates, now)
    });
  }
  
  // Check for other monster groups to attack
  if (!inExplorationPhase && personality?.canAttackMonsters) {
    const attackableMonsters = findAttackableMonsterGroups(tileData, groupId);
    if (attackableMonsters.length > 0) {
      actionPool.push({
        name: 'attack_monsters',
        weight: 0.7 * (weights?.attackMonsters || 0),
        execute: async () => await initiateAttackOnMonsters(db, worldId, monsterGroup, attackableMonsters, location, updates, now)
      });
    }
  }
  
  // Check for player groups to attack
  const playerGroupsOnTile = findPlayerGroupsOnTile(tileData);
  if (playerGroupsOnTile.length > 0) {
    // Calculate powers for comparison
    const monsterPower = calculateGroupPower(monsterGroup);
    let playerPower = 0;
    for (const playerGroup of playerGroupsOnTile) {
      playerPower += calculateGroupPower(playerGroup);
    }
    
    // Only add attack option if monster is strong enough
    const powerThreshold = personality?.id === 'AGGRESSIVE' ? 0.5 : 0.7;
    if (monsterPower >= playerPower * powerThreshold) {
      actionPool.push({
        name: 'attack_players',
        weight: 0.8 * (weights?.attack || 1.0),
        execute: async () => await initiateAttackOnPlayers(db, worldId, monsterGroup, playerGroupsOnTile, location, updates, now)
      });
    }
  }
  
  // Check for structure to attack
  const attackableStructure = tileData.structure && !tileData.structure?.monster;
  if (attackableStructure) {
    // Calculate powers
    const monsterPower = calculateGroupPower(monsterGroup);
    
    // Calculate structure power
    const structureType = tileData.structure.type;
    let structurePower = 0;
    
    if (STRUCTURES[structureType]) {
      structurePower = STRUCTURES[structureType].durability || 0;
      
      // Add power from defending groups
      const defendingGroups = Object.values(tileData.groups || {}).filter(
        group => group.type !== 'monster' && group.id !== monsterGroup.id
      );
      
      for (const defenderGroup of defendingGroups) {
        structurePower += calculateGroupPower(defenderGroup);
      }
    }
    
    // Only add attack option if monster is strong enough
    const powerThreshold = personality?.id === 'AGGRESSIVE' ? 0.4 : 0.6;
    if (monsterPower >= structurePower * powerThreshold) {
      actionPool.push({
        name: 'attack_structure',
        weight: 0.7 * (weights?.attack || 1.0),
        execute: async () => await initiateAttackOnStructure(db, worldId, monsterGroup, tileData.structure, location, updates, now)
      });
    }
  }
  
  // Check if we can adopt an abandoned structure
  if (structureUnderConstruction) {
    actionPool.push({
      name: 'adopt_structure',
      weight: 0.7 * (weights?.build || 1.0),
      execute: async () => await adoptAbandonedStructure(db, worldId, monsterGroup, tileData.structure, updates, now, chunks)
    });
  }
  
  // Check if we can upgrade structure or building
  if (structureOnTile && hasResources && resourceCount > 20) {
    const structure = tileData.structure;
    
    // Check if the structure has buildings that can be upgraded
    if (structure.buildings && Object.keys(structure.buildings).length > 0) {
      actionPool.push({
        name: 'upgrade_building',
        weight: 0.3 * (weights?.build || 1.0),
        execute: async () => {
          const buildings = Object.entries(structure.buildings);
          const [buildingType, buildingData] = buildings[Math.floor(Math.random() * buildings.length)];
          return await addOrUpgradeMonsterBuilding(db, worldId, monsterGroup, structure, buildingType, updates, now);
        }
      });
    }
    
    // Add option to upgrade the structure itself
    actionPool.push({
      name: 'upgrade_structure',
      weight: 0.3 * (weights?.build || 1.0),
      execute: async () => await upgradeMonsterStructure(db, worldId, monsterGroup, tileData.structure, updates, now)
    });
  }
  
  // Check if we can deposit resources
  const depositWeight = ((weights?.build || 1.0) + (weights?.gather || 1.0)) / 2;
  if (structureOnTile && hasResources) {
    actionPool.push({
      name: 'deposit_resources',
      weight: 0.6 * depositWeight,
      execute: async () => await demobilizeAtMonsterStructure(db, worldId, monsterGroup, tileData.structure, updates, now)
    });
  }
  
  // Check if we can build a new structure
  if (totalUnits >= MIN_UNITS_TO_BUILD && 
      hasResources && 
      resourceCount >= MIN_RESOURCES_TO_BUILD &&
      !structureOnTile &&
      !tileData.structure) {
    actionPool.push({
      name: 'build_structure',
      weight: 0.4 * (weights?.build || 1.0),
      execute: async () => await buildMonsterStructure(db, worldId, monsterGroup, location, updates, now, worldScan, chunks)
    });
  }
  
  // Check if we can add a building to an existing structure
  if (structureOnTile && 
      tileData.structure.monster &&
      hasResources && 
      resourceCount > 15 &&
      (!tileData.structure.buildings || Object.keys(tileData.structure.buildings).length < 3)) {
    
    actionPool.push({
      name: 'add_building',
      weight: 0.3 * (weights?.build || 1.0),
      execute: async () => {
        const possibleBuildings = ['monster_nest', 'monster_forge', 'monster_totem'];
        const buildingType = possibleBuildings[Math.floor(Math.random() * possibleBuildings.length)];
        return await addOrUpgradeMonsterBuilding(db, worldId, monsterGroup, tileData.structure, buildingType, updates, now);
      }
    });
  }
  
  // Check if we should return resources to a structure
  if (hasResources && resourceCount > 10 && worldScan.monsterStructures.length > 0) {
    let nearestStructure = null;
    let minDistance = Infinity;
    
    for (const structure of worldScan.monsterStructures) {
      const distance = calculateDistance(location, structure);
      if (distance < minDistance) {
        minDistance = distance;
        nearestStructure = structure;
      }
    }
    
    if (nearestStructure) {
      actionPool.push({
        name: 'return_resources',
        weight: 0.8 * (weights?.gather || 1.0),
        execute: async () => await moveMonsterTowardsTarget(
          db, worldId, monsterGroup, location, 
          { ...worldScan, targetStructure: nearestStructure }, 
          updates, now, 
          'resource_deposit',
          personality,
          chunks,
          terrainGenerator
        )
      });
    }
  }
  
  // Check if we should gather resources
  if ((!hasResources || resourceCount < 5)) {
    actionPool.push({
      name: 'gather',
      weight: 0.7 * (weights?.gather || 1.0),
      execute: async () => await startMonsterGathering(db, worldId, monsterGroup, updates, now, chunks)
    });
  }
  
  // Always add exploration/movement as an option with higher weight for nomadic
  const exploreWeight = inExplorationPhase ? 
    1.5 * (weights?.explore || 1.0) : // Higher for exploration phase
    (personality?.id === 'NOMADIC' ? 
      1.2 * (weights?.explore || 1.0) : // Higher for nomadic
      0.8 * (weights?.explore || 1.0)); // Normal for others
      
  actionPool.push({
    name: 'explore',
    weight: exploreWeight,
    execute: async () => await moveMonsterTowardsTarget(
      db, worldId, monsterGroup, location, worldScan, updates, now, null, personality, chunks, terrainGenerator
    )
  });
  
  // Add idle as the lowest-probability option (reduced by 70%)
  actionPool.push({
    name: 'idle',
    weight: 0.3, // Fixed lower weight to reduce idle time
    execute: async () => ({ action: 'idle', reason: 'personality' })
  });
  
  // Calculate total weight for normalization
  const totalWeight = actionPool.reduce((sum, action) => sum + action.weight, 0);
  
  // Choose an action using weighted random selection
  let targetWeight = Math.random() * totalWeight;
  let selectedAction = null;
  
  for (const action of actionPool) {
    targetWeight -= action.weight;
    if (targetWeight <= 0) {
      selectedAction = action;
      break;
    }
  }
  
  // If something went wrong with selection, default to explore
  if (!selectedAction) {
    selectedAction = actionPool.find(a => a.name === 'explore') || actionPool[0];
  }
  
  // Log the action chosen
  console.log(`Monster group ${monsterGroup.id} with ${personalityId} personality chose action: ${selectedAction.name}`);
  
  // Execute the selected action
  return await selectedAction.execute();
}

// Helper function to get chunk key
function getChunkKey(x, y) {
  const chunkX = Math.floor(x / 20);
  const chunkY = Math.floor(y / 20);
  return `${chunkX},${chunkY}`;
}

/**
 * Main function to process monster strategies across the world
 * @param {string} worldId World ID to process
 * @param {Object} chunks Pre-loaded chunks data
 * @param {Object} terrainGenerator TerrainGenerator instance
 * @returns {Promise<Object>} Results summary
 */
export async function processMonsterStrategies(worldId, chunks, terrainGenerator) {
  const db = getDatabase();
  const now = Date.now();
  
  // Track results for reporting
  const results = {
    movesInitiated: 0,
    gatheringStarted: 0,
    structuresBuildStarted: 0,
    structuresUpgraded: 0,
    structuresAdopted: 0,
    demobilizationsStarted: 0,
    battlesJoined: 0,
    groupsMerged: 0,
    personalitiesChanged: 0,
    idleDecisions: 0,
    totalProcessed: 0
  };
  
  try {
    logger.info(`Processing monster strategies for world ${worldId}`);
    
    // Ensure chunks exists before scanning but don't try to fetch it
    if (!chunks) {
      logger.error(`No chunks data provided for world ${worldId} in processMonsterStrategies`);
      return results;
    }
    
    // Preparation: scan the world for key locations (player spawns, resources, etc)
    const worldScan = scanWorldMap(chunks);
    
    logger.info(`World scan complete. Found: ${worldScan.playerSpawns.length} player spawns, ` +
                `${worldScan.monsterStructures.length} monster structures, ` + 
                `${worldScan.resourceHotspots.length} resource hotspots`);
    
    // Process all chunks - we'll use a batched update approach for efficiency
    const updates = {};
    
    // Second pass: Process individual monster strategies
    // Scan each chunk for monster groups
    for (const [chunkKey, chunkData] of Object.entries(chunks)) {
      if (!chunkData) continue;
      
      // Process each tile in the chunk
      for (const [tileKey, tileData] of Object.entries(chunkData)) {
        if (!tileData) continue;
        
        // Skip tiles with no groups
        if (!tileData.groups) continue;
        
        // Find monster groups on this tile
        const monsterGroups = [];
        for (const [groupId, groupData] of Object.entries(tileData.groups)) {
          if (isMonsterGroup(groupData) && isAvailableForAction(groupData)) {
            monsterGroups.push({
              id: groupId,
              ...groupData,
              tileKey,
              chunkKey
            });
          }
        }
        
        // Skip if no monster groups found
        if (monsterGroups.length === 0) continue;
        
        // Process each monster group
        for (const monsterGroup of monsterGroups) {
          // Only process a percentage of monster groups each tick to avoid too much activity
          if (Math.random() > STRATEGY_CHANCE) continue;
          
          // Skip groups that have been processed already (might have been merged)
          if (updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}`] === null) {
            continue;
          }
          
          // Decide and execute a strategy for this monster group
          const location = {
            x: parseInt(tileKey.split(',')[0]),
            y: parseInt(tileKey.split(',')[1])
          };
          
          const result = await executeMonsterStrategy(
            db, worldId, monsterGroup, location, tileData, worldScan, updates, now, chunks, terrainGenerator
          );
          
          // Track results
          if (result.action) {
            results.totalProcessed++;
            
            switch (result.action) {
              case 'move':
                results.movesInitiated++;
                break;
              case 'gather':
                results.gatheringStarted++;
                break;
              case 'build':
                results.structuresBuildStarted++;
                break;
              case 'upgrade':
                results.structuresUpgraded++;
                break;
              case 'adopt':
                results.structuresAdopted++;
                break;
              case 'demobilize':
                results.demobilizationsStarted++;
                break;
              case 'join_battle':
                results.battlesJoined++;
                break;
              case 'attack':
                results.battlesJoined++;
                break;
              case 'merge':
                results.groupsMerged++;
                break;
              case 'personality_change':
                results.personalitiesChanged++;
                break;
              case 'idle':
                results.idleDecisions++;
                break;
            }
          }
        }
      }
    }
    
    // Apply all updates in a single batch, but first sanitize them to prevent conflicts
    if (Object.keys(updates).length > 0) {
      logger.info(`Sanitizing and applying ${Object.keys(updates).length} updates for monster strategies`);
      const sanitizedUpdates = sanitizeUpdates(updates);
      await db.ref().update(sanitizedUpdates);
    }
    
    return results;
    
  } catch (error) {
    logger.error(`Error processing monster strategies for world ${worldId}:`, error);
    return { error: error.message };
  }
}

/**
 * Sanitize updates to prevent Firebase update conflicts
 * @param {Object} updates Original updates object
 * @returns {Object} Sanitized updates object
 */
function sanitizeUpdates(updates) {
  const sanitizedUpdates = {};
  const pathsToSkip = new Set();
  
  // First pass: Identify all paths that might conflict
  for (const path in updates) {
    if (pathsToSkip.has(path)) continue;
    
    // Check for potential conflicts in other paths
    for (const otherPath in updates) {
      if (path === otherPath || pathsToSkip.has(otherPath)) continue;
      
      // If otherPath is an ancestor path of path, we need to handle this conflict
      if (path.startsWith(otherPath + '/')) {
        // If we're setting the entire object, no need to set its individual properties
        pathsToSkip.add(path);
        break;
      }
      
      // If path is an ancestor of otherPath, skip the other path
      if (otherPath.startsWith(path + '/')) {
        pathsToSkip.add(otherPath);
      }
    }
  }
  
  // Second pass: Add only non-skipped paths
  for (const path in updates) {
    if (!pathsToSkip.has(path)) {
      sanitizedUpdates[path] = updates[path];
    }
  }
  
  return sanitizedUpdates;
}
