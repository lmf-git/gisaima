/**
 * Monster Strategy processing for Gisaima
 * Handles monster group AI behavior for movement, gathering, building, etc.
 */

import { logger } from "firebase-functions";
import { getDatabase } from 'firebase-admin/database';
import { calculateDistance, moveMonsterTowardsTarget, shouldInterruptMovement } from '../monsters/strategy/movement.js';
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
    totalProcessed: 0,
    errors: 0 // Add an error counter
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
    
    // NEW: Add tracking for monsters already processed in this tick
    // This prevents race conditions where multiple monsters take conflicting actions
    const processedMonsters = new Set();
    const reservedForCombat = new Set(); // Track monsters that will be in combat
    const pendingBattles = {}; // Track battles being created in this tick
    
    // NEW: First process aggressive monsters, then others - prioritizes combat
    const allMonsterGroups = [];
    
    // Scan each chunk for monster groups and collect them
    for (const [chunkKey, chunkData] of Object.entries(chunks)) {
      if (!chunkData) continue;
      
      // Process each tile in the chunk
      for (const [tileKey, tileData] of Object.entries(chunkData)) {
        if (!tileData || !tileData.groups) continue;
        
        // Find monster groups on this tile
        for (const [groupId, groupData] of Object.entries(tileData.groups)) {
          if (isMonsterGroup(groupData) && isAvailableForAction(groupData)) {
            allMonsterGroups.push({
              id: groupId,
              ...groupData,
              tileKey,
              chunkKey,
              location: {
                x: parseInt(tileKey.split(',')[0]),
                y: parseInt(tileKey.split(',')[1])
              },
              // Determine if this is an aggressive monster
              isAggressive: groupData.personality?.id === 'AGGRESSIVE' || 
                          groupData.personality?.id === 'FERAL'
            });
          }
        }
      }
    }
    
    // Sort monster groups to process aggressive ones first
    allMonsterGroups.sort((a, b) => {
      // Sort by aggression (aggressive first)
      if (a.isAggressive !== b.isAggressive) {
        return a.isAggressive ? -1 : 1;
      }
      
      // Then by unit count (stronger first)
      const aUnits = a.units ? Object.keys(a.units).length : 0;
      const bUnits = b.units ? Object.keys(b.units).length : 0;
      return bUnits - aUnits;
    });
    
    // Process each monster group in prioritized order
    for (const monsterGroup of allMonsterGroups) {
      // Only process a percentage of monster groups each tick to avoid too much activity
      if (Math.random() > STRATEGY_CHANCE) continue;
      
      const groupId = monsterGroup.id;
      const chunkKey = monsterGroup.chunkKey;
      const tileKey = monsterGroup.tileKey;
      const location = monsterGroup.location;
      
      // Skip if this monster has already been processed
      if (processedMonsters.has(`${chunkKey}_${tileKey}_${groupId}`)) {
        continue;
      }
      
      // Skip groups that have been reserved for combat
      if (reservedForCombat.has(`${chunkKey}_${tileKey}_${groupId}`)) {
        continue;
      }
      
      // Get the current tile data
      const tileData = chunks[chunkKey]?.[tileKey];
      if (!tileData) continue;
      
      // NEW: Add metadata to monsterGroup object to track action conflicts
      monsterGroup.combatReserved = false;
      
      try {
        // Execute strategy and get result
        const result = await executeMonsterStrategy(
          db, worldId, monsterGroup, location, tileData, worldScan, 
          updates, now, chunks, terrainGenerator,
          { 
            processedMonsters, 
            reservedForCombat, 
            pendingBattles 
          }
        );
        
        // Mark this monster as processed
        processedMonsters.add(`${chunkKey}_${tileKey}_${groupId}`);
        
        // Safely check result - add defensive check for undefined result
        if (!result) {
          logger.warn(`Strategy execution returned undefined for monster group ${groupId}`);
          results.errors++;
          continue; // Skip to next monster group
        }
        
        // If this was a combat action, mark all involved monsters as reserved
        if (result.action === 'attack' && result.targets) {
          // Mark all targets as reserved for combat
          for (const targetId of result.targets) {
            reservedForCombat.add(`${chunkKey}_${tileKey}_${targetId}`);
          }
          
          // Store battle info for possible joining by other monsters
          if (result.battleId) {
            pendingBattles[`${chunkKey}_${tileKey}`] = pendingBattles[`${chunkKey}_${tileKey}`] || [];
            pendingBattles[`${chunkKey}_${tileKey}`].push({
              battleId: result.battleId,
              initiator: groupId
            });
          }
        }
        
        // Track results - add defensive check for action property
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
            case 'error': // New case for error actions
              results.errors++;
              break;
            default:
              logger.warn(`Unknown action type: ${result.action} for monster group ${groupId}`);
          }
        } else {
          // If result exists but has no action property
          logger.warn(`Missing action property in result for monster group ${groupId}`);
          results.errors++;
        }
      } catch (strategyError) {
        // Catch errors in strategy execution to prevent crashing the entire loop
        logger.error(`Error executing strategy for monster group ${groupId}: ${strategyError.message}`);
        results.errors++;
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
    return { ...results, error: error.message };
  }
}

/**
 * Execute a strategic action for a monster group
 * @param {Object} db - Database reference
 * @param {string} worldId - World ID
 * @param {Object} monsterGroup - Monster group data
 * @param {Object} location - Location coordinates
 * @param {Object} tileData - Current tile data
 * @param {Object} worldScan - Scanned world data
 * @param {Object} updates - Updates object
 * @param {number} now - Current timestamp
 * @param {Object} chunks - Loaded chunks data
 * @param {Object} terrainGenerator - Terrain generator instance
 * @param {Object} conflictTracking - Object to track conflicts
 * @returns {Object} Action result
 */
export async function executeMonsterStrategy(
  db, worldId, monsterGroup, location, tileData, worldScan, updates, now, chunks, terrainGenerator = null,
  conflictTracking = null // Added conflict tracking parameter
) {
  try {
    // Get current data needed to make decisions
    const groupId = monsterGroup.id;
    const chunkKey = monsterGroup.chunkKey;
    const tileKey = monsterGroup.tileKey;
    
    // Base path for this group
    const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
    
    // Check if this monster was already processed or reserved
    if (conflictTracking) {
      const monsterKey = `${chunkKey}_${tileKey}_${groupId}`;
      if (conflictTracking.processedMonsters.has(monsterKey)) {
        return { action: 'error', reason: 'already_processed' };
      }
      if (conflictTracking.reservedForCombat.has(monsterKey)) {
        return { action: 'error', reason: 'reserved_for_combat' };
      }
    }
    
    // NEW: Check if monster is currently moving and evaluate potential interruptions
    if (monsterGroup.status === 'moving' && monsterGroup.movementPath) {
      // Check if we should interrupt the current movement based on detected opportunities
      const interruptionCheck = shouldInterruptMovement(monsterGroup, tileData, worldScan, location);
      
      if (interruptionCheck.shouldInterrupt) {
        console.log(`Monster group ${groupId} interrupting movement to ${interruptionCheck.reason} at (${location.x}, ${location.y})`);
        
        // Clear movement data to allow new action
        updates[`${groupPath}/status`] = 'idle';
        updates[`${groupPath}/movementPath`] = null;
        updates[`${groupPath}/pathIndex`] = null;
        updates[`${groupPath}/moveStarted`] = null;
        updates[`${groupPath}/moveSpeed`] = null;
        
        // Update monsterGroup object for the rest of the function to use
        monsterGroup = {
          ...monsterGroup,
          status: 'idle',
          movementPath: null,
          pathIndex: null
        };
        
        // If there's a specific action to take immediately, handle it
        if (interruptionCheck.immediateAction) {
          if (interruptionCheck.immediateAction === 'attack_players' && interruptionCheck.targets) {
            return await initiateAttackOnPlayers(
              db, worldId, monsterGroup, interruptionCheck.targets, location, updates, now
            );
          } else if (interruptionCheck.immediateAction === 'attack_structure' && interruptionCheck.structure) {
            return await initiateAttackOnStructure(
              db, worldId, monsterGroup, interruptionCheck.structure, location, updates, now
            );
          } else if (interruptionCheck.immediateAction === 'attack_monsters' && interruptionCheck.targets) {
            return await initiateAttackOnMonsters(
              db, worldId, monsterGroup, interruptionCheck.targets, location, updates, now
            );
          } else if (interruptionCheck.immediateAction === 'join_battle') {
            return await joinExistingBattle(db, worldId, monsterGroup, tileData, updates, now);
          } else if (interruptionCheck.immediateAction === 'move_to_target' && interruptionCheck.targetLocation) {
            return await moveMonsterTowardsTarget(
              db, worldId, monsterGroup, location, 
              { ...worldScan, targetLocation: interruptionCheck.targetLocation },
              updates, now, interruptionCheck.targetType || null, monsterGroup.personality, chunks, terrainGenerator
            );
          }
        }
      }
    }
    
    // Check if monster is in exploration phase using tick counting
    const inExplorationPhase = monsterGroup.explorationPhase && 
                           (monsterGroup.explorationTicks && monsterGroup.explorationTicks > 0);
    
    // If this monster group has a targetStructure (from structured mobilization)
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
    
    // Check for resources using countTotalResources that already supports both formats
    // Track both whether we have any resources and the resource count
    let hasResources = false;
    let resourceCount = 0;
    
    if (monsterGroup.items) {
      // Handle items as object (new format)
      if (!Array.isArray(monsterGroup.items) && typeof monsterGroup.items === 'object') {
        hasResources = Object.keys(monsterGroup.items).length > 0;
        resourceCount = countTotalResources(monsterGroup.items);
      } 
      // Handle items as array (legacy format)
      else if (Array.isArray(monsterGroup.items)) {
        hasResources = monsterGroup.items.length > 0;
        resourceCount = countTotalResources(monsterGroup.items);
      }
    }
    
    // NEW: Check if the monster is on the same tile as a player structure it could attack
    const onSameTileAsPlayerStructure = 
      tileData.structure && 
      !tileData.structure.monster && 
      tileData.structure.type !== 'spawn';
    
    // If aggressive/feral monster is on same tile as a player structure, always attack it
    if (onSameTileAsPlayerStructure && 
        (personalityId === 'AGGRESSIVE' || personalityId === 'FERAL')) {
      console.log(`${personalityId} monster group ${monsterGroup.id} on same tile as player structure - attacking!`);
      
      return await initiateAttackOnStructure(
        db, worldId, monsterGroup, tileData.structure, location, updates, now
      );
    }
    
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
      // NEW: Calculate monster power
      const monsterPower = calculateGroupPower(monsterGroup);
      
      // NEW: If this is an aggressive monster that's too weak to attack anything, prioritize merging
      let mergeWeight = 0.7 * (weights?.merge || 1.0);
      
      // If aggressive/feral and too weak, greatly increase merging priority
      if ((personalityId === 'AGGRESSIVE' || personalityId === 'FERAL')) {
        // Check power against potential targets (simplified version)
        let canAttackAnyTarget = false;
        
        // Check for attackable structures
        if (tileData.structure && !tileData.structure.monster) {
          const structureType = tileData.structure.type;
          let structurePower = 0;
          if (STRUCTURES[structureType]) {
            structurePower = STRUCTURES[structureType].durability || 0;
          }
          const powerThreshold = personalityId === 'AGGRESSIVE' ? 0.4 : 0.6;
          canAttackAnyTarget = monsterPower >= structurePower * powerThreshold;
        }
        
        // If too weak to attack, prioritize merging
        if (!canAttackAnyTarget) {
          console.log(`${personalityId} monster group ${monsterGroup.id} is too weak to attack - prioritizing merging!`);
          mergeWeight = 2.0; // Very high priority to merge when too weak
        }
      }
      
      actionPool.push({
        name: 'merge',
        weight: mergeWeight,
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
      
      // MODIFIED: Always add attack option if monster is on same tile as structure
      // Otherwise, check power threshold
      const onSameTile = true; // We know we're on the same tile in this context
      const powerThreshold = personality?.id === 'AGGRESSIVE' ? 0.4 : 0.6;
      
      if (onSameTile || monsterPower >= structurePower * powerThreshold) {
        // If on same tile, give very high priority to attacking
        const attackWeight = onSameTile ? 
          2.0 : // Very high weight when on same tile
          0.7 * (weights?.attack || 1.0); // Normal weight otherwise
        
        actionPool.push({
          name: 'attack_structure',
          weight: attackWeight,
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
    
    // Select an action using weighted random selection
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
      
      // If still no action is available, return a safe default
      if (!selectedAction) {
        console.log(`No action available for monster group ${monsterGroup.id}. Using idle default.`);
        return { action: 'idle', reason: 'fallback_no_actions' };
      }
    }
    
    // Log the action chosen
    console.log(`Monster group ${monsterGroup.id} with ${personalityId} personality chose action: ${selectedAction.name}`);
    
    // Execute the selected action with try-catch to handle errors
    try {
      const actionResult = await selectedAction.execute();
      // Ensure the result has at least an action property
      if (!actionResult) {
        return { action: 'error', reason: 'action_execution_returned_undefined' };
      }
      if (!actionResult.action) {
        return { ...actionResult, action: 'idle', reason: 'missing_action_property' };
      }
      return actionResult;
    } catch (actionError) {
      console.error(`Error executing ${selectedAction.name} for monster group ${monsterGroup.id}:`, actionError);
      return { 
        action: 'error', 
        reason: `action_execution_error: ${actionError.message}`,
        originalAction: selectedAction.name
      };
    }
  } catch (error) {
    console.error(`Error in executeMonsterStrategy for group ${monsterGroup?.id || 'unknown'}:`, error);
    // Return a safe fallback that won't cause errors
    return { action: 'error', reason: `strategy_error: ${error.message}` };
  }
}

// Helper function to get chunk key
function getChunkKey(x, y) {
  const chunkX = Math.floor(x / 20);
  const chunkY = Math.floor(y / 20);
  return `${chunkX},${chunkY}`;
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
  
  // Second pass: Identify and resolve status conflicts (fighting vs moving)
  const statusConflicts = new Map();
  
  // Look for status setting paths that might conflict
  const statusRegex = /\/groups\/([^\/]+)\/status$/;
  
  for (const path in updates) {
    if (pathsToSkip.has(path)) continue;
    
    const statusMatch = path.match(statusRegex);
    if (statusMatch) {
      const groupBasePath = path.substring(0, path.lastIndexOf('/status'));
      const groupId = statusMatch[1];
      
      // If we've seen this group before, we have a conflict
      if (statusConflicts.has(groupBasePath)) {
        const currentStatus = updates[path];
        const previousStatus = updates[statusConflicts.get(groupBasePath)];
        
        // Prioritize combat over movement
        if (currentStatus === 'fighting' && previousStatus === 'moving') {
          // Keep fighting, remove moving
          pathsToSkip.add(statusConflicts.get(groupBasePath));
          
          // Also skip any movement-related paths for this group
          for (const otherPath in updates) {
            if (otherPath.startsWith(groupBasePath) && 
                (otherPath.includes('/move') || otherPath.includes('/path'))) {
              pathsToSkip.add(otherPath);
            }
          }
        } else if (currentStatus === 'moving' && previousStatus === 'fighting') {
          // Keep fighting, skip moving
          pathsToSkip.add(path);
          
          // Also skip any movement-related paths for this group
          for (const otherPath in updates) {
            if (otherPath.startsWith(groupBasePath) && 
                (otherPath.includes('/move') || otherPath.includes('/path'))) {
              pathsToSkip.add(otherPath);
            }
          }
        }
      } else {
        statusConflicts.set(groupBasePath, path);
      }
    }
  }
  
  // Third pass: Add only non-skipped paths
  for (const path in updates) {
    if (!pathsToSkip.has(path)) {
      sanitizedUpdates[path] = updates[path];
    }
  }
  
  return sanitizedUpdates;
}
