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
  findAttackableMonsterGroups, // Import the new function
  initiateAttackOnMonsters     // Import the new function
} from '../monsters/strategy/combat.mjs';
import { startMonsterGathering, countTotalResources } from '../monsters/strategy/resources.mjs';
import { MONSTER_PERSONALITIES, shouldChangePersonality, getRandomPersonality } from 'gisaima-shared/definitions/MONSTER_PERSONALITIES.js';
import { 
  isMonsterGroup, 
  isAvailableForAction,
  scanWorldMap
} from '../monsters/_monsters.mjs';
import { 
  buildMonsterStructure, 
  upgradeMonsterStructure, 
  demobilizeAtMonsterStructure,
  addOrUpgradeMonsterBuilding
} from '../monsters/strategy/building.js';

// Constants and configuration
const STRATEGY_CHANCE = 0.4; // Chance for a monster group to take strategic action
const MIN_UNITS_TO_BUILD = 5; // Minimum units needed to consider building
const MIN_RESOURCES_TO_BUILD = 15; // Minimum resources needed to build a structure
const MERGE_CHANCE = 0.7; // Chance to attempt merging when other monster groups are present
const MIN_DISTANCE_FROM_SPAWN = 10; // Minimum distance from player spawns to build a structure

// Re-export imported functions
export { isMonsterGroup, isAvailableForAction };

/**
 * Execute a strategic action for a monster group
 */
export async function executeMonsterStrategy(db, worldId, monsterGroup, location, tileData, worldScan, updates, now) {
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
    
    // If we're close enough to the target structure, initiate an attack
    const targetDistance = calculateDistance(location, monsterGroup.targetStructure);
    
    if (targetDistance <= 1.5) {
      // Get the target structure's actual data
      const targetChunkKey = getChunkKey(monsterGroup.targetStructure.x, monsterGroup.targetStructure.y);
      const targetTileKey = `${monsterGroup.targetStructure.x},${monsterGroup.targetStructure.y}`;
      
      try {
        const targetTileRef = db.ref(`worlds/${worldId}/chunks/${targetChunkKey}/${targetTileKey}`);
        const targetTileSnap = await targetTileRef.once('value');
        const targetTileData = targetTileSnap.val();
        
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
      } catch (error) {
        console.error(`Error checking target structure: ${error}`);
      }
    } else {
      // Still moving toward target - prioritize movement
      return await moveMonsterTowardsTarget(
        db, worldId, monsterGroup, location, worldScan, updates, now, 'structure_attack'
      );
    }
  }
  
  // Handle exploration phase differently
  if (inExplorationPhase) {
    // Skip demobilizing, merging, and other non-movement actions during exploration
    // Force movement action with higher probability (90%)
    if (Math.random() < 0.9) {
      return await moveMonsterTowardsTarget(
        db, worldId, monsterGroup, location, worldScan, updates, now, null, monsterGroup.personality
      );
    }
  }
  
  // Get personality and its influence weights, or use balanced defaults
  const personalityId = monsterGroup.personality?.id || 'BALANCED';
  const personality = MONSTER_PERSONALITIES[personalityId] || MONSTER_PERSONALITIES.BALANCED;
  const weights = personality.weights;
  
  // Check if monster should change personality
  if (shouldChangePersonality(monsterGroup, now)) {
    const newPersonality = getRandomPersonality(personalityId);
    updates[`${groupPath}/personality`] = {
      id: newPersonality.id,
      name: newPersonality.name,
      emoji: newPersonality.emoji
    };
    
    // Add message about personality change
    const chatMessageId = `monster_personality_change_${now}_${groupId}`;
    updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
      text: `The ${monsterGroup.name || 'monster group'} at (${location.x}, ${location.y}) has become ${newPersonality.emoji} ${newPersonality.name}!`,
      type: 'event',
      timestamp: now,
      location: {
        x: location.x,
        y: location.y
      }
    };
    
    // Update local reference for this decision cycle
    monsterGroup.personality = {
      id: newPersonality.id,
      name: newPersonality.name,
      emoji: newPersonality.emoji
    };
  }
  
  // If we're on our own structure and have just mobilized, prioritize moving away
  const structureOnTile = tileData.structure && 
    (tileData.structure.type && tileData.structure.owner === 'monster');
  
  const justMobilized = monsterGroup.mobilizedFromStructure && 
    monsterGroup.mobilizedFromStructure === (tileData.structure?.id || null);
  
  if (structureOnTile && justMobilized) {
    // Set exploration phase if not already set
    if (!monsterGroup.explorationPhase) {
      updates[`${groupPath}/explorationPhase`] = true;
      updates[`${groupPath}/exploreDuration`] = now + 300000; // 5 minutes
    }
    
    // Force movement away
    return await moveMonsterTowardsTarget(
      db, worldId, monsterGroup, location, worldScan, updates, now, null, personality
    );
  }
  
  // First priority: Check if there are other monster groups on this tile to merge with
  // Influenced by personality's merge weight
  if (!inExplorationPhase && Math.random() < MERGE_CHANCE * (weights?.merge || 1.0)) {
    const mergeableGroups = findMergeableMonsterGroups(tileData, groupId);
    if (mergeableGroups.length > 0) {
      return await mergeMonsterGroupsOnTile(db, worldId, monsterGroup, mergeableGroups, updates, now);
    }
  }
  
  // Check if there's a battle on this tile
  // Influenced by personality's attack/join battle weight
  if (!inExplorationPhase && tileData.battles) {
    const joinWeight = weights?.joinBattle || weights?.attack || 1.0;
    if (Math.random() < joinWeight) {
      return await joinExistingBattle(db, worldId, monsterGroup, tileData, updates, now);
    }
  }
  
  // NEW: Check for other monster groups to attack (for FERAL personality)
  if (!inExplorationPhase && personality?.canAttackMonsters && Math.random() < 0.85 * (weights?.attackMonsters || 0)) {
    const attackableMonsters = findAttackableMonsterGroups(tileData, groupId);
    if (attackableMonsters.length > 0) {
      return await initiateAttackOnMonsters(db, worldId, monsterGroup, attackableMonsters, location, updates, now);
    }
  }
  
  // Check for player groups on this tile to attack
  // Influenced by personality's attack weight
  const playerGroupsOnTile = findPlayerGroupsOnTile(tileData);
  if (playerGroupsOnTile.length > 0 && Math.random() < 0.8 * (weights?.attack || 1.0)) {
    return await initiateAttackOnPlayers(db, worldId, monsterGroup, playerGroupsOnTile, location, updates, now);
  }
  
  // Check for attackable player structure on this tile
  // Influenced by personality's attack weight
  const attackableStructure = tileData.structure && 
    tileData.structure.owner && 
    tileData.structure.owner !== 'monster';
    
  if (attackableStructure && Math.random() < 0.7 * (weights?.attack || 1.0)) {
    // Log that we found a structure to attack
    console.log(`Monster group ${groupId} considering attacking structure of type ${tileData.structure.type} at ${location.x},${location.y}`);
    return await initiateAttackOnStructure(db, worldId, monsterGroup, tileData.structure, location, updates, now);
  }

  // Factors that influence decisions
  const totalUnits = monsterGroup.units ? Object.keys(monsterGroup.units).length : 1;
  const hasResources = monsterGroup.items && monsterGroup.items.length > 0;
  const resourceCount = countTotalResources(monsterGroup.items);

  // Strategy 1: If on a monster structure tile with enough resources, consider upgrading
  // Influenced by personality's build weight
  if (structureOnTile && 
      hasResources && 
      resourceCount > 20 && 
      Math.random() < 0.3 * (weights?.build || 1.0)) {
    // Check if we should upgrade a building within the structure or the structure itself
    const structure = tileData.structure;
    
    // Check if the structure has buildings that can be upgraded
    if (structure.buildings && Object.keys(structure.buildings).length > 0 && Math.random() < 0.5) {
      // Select a building to upgrade
      const buildings = Object.entries(structure.buildings);
      const [buildingType, buildingData] = buildings[Math.floor(Math.random() * buildings.length)];
      
      // Try to upgrade the building
      return await addOrUpgradeMonsterBuilding(
        db, worldId, monsterGroup, structure, buildingType, updates, now
      );
    } else {
      // Upgrade the structure itself
      return await upgradeMonsterStructure(db, worldId, monsterGroup, tileData.structure, updates, now);
    }
  }
  
  // Strategy 2: If on a monster structure tile with any resources, demobilize to deposit them
  // Influenced by personality's build/gather weights
  const depositWeight = ((weights?.build || 1.0) + (weights?.gather || 1.0)) / 2;
  if (structureOnTile && 
      hasResources && 
      Math.random() < 0.6 * depositWeight) {
    return await demobilizeAtMonsterStructure(db, worldId, monsterGroup, tileData.structure, updates, now);
  }
  
  // Strategy 3: If large enough group with enough resources, build a new structure
  // Heavily influenced by personality's build weight
  if (totalUnits >= MIN_UNITS_TO_BUILD && 
      hasResources && 
      resourceCount >= MIN_RESOURCES_TO_BUILD &&
      !structureOnTile &&
      Math.random() < 0.4 * (weights?.build || 1.0)) {
    return await buildMonsterStructure(db, worldId, monsterGroup, location, updates, now);
  }
  
  // If the monster is on a structure tile that has no building yet, consider adding one
  if (structureOnTile && 
      structure.monster &&
      hasResources && 
      resourceCount > 15 &&
      (!structure.buildings || Object.keys(structure.buildings).length < 3) &&
      Math.random() < 0.3 * (weights?.build || 1.0)) {
      
    // Choose a building type to add
    const possibleBuildings = ['monster_nest', 'monster_forge', 'monster_totem'];
    const buildingType = possibleBuildings[Math.floor(Math.random() * possibleBuildings.length)];
      
    return await addOrUpgradeMonsterBuilding(
      db, worldId, monsterGroup, structure, buildingType, updates, now
    );
  }
  
  // Strategy 4: If carrying significant resources, prioritize moving to a monster structure
  // Influenced by personality's gather weight
  if (hasResources && resourceCount > 10 && worldScan.monsterStructures.length > 0 && 
      Math.random() < 0.8 * (weights?.gather || 1.0)) {
    // Find nearest monster structure
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
      return await moveMonsterTowardsTarget(
        db, worldId, monsterGroup, location, 
        { ...worldScan, targetStructure: nearestStructure }, 
        updates, now, 
        'resource_deposit'
      );
    }
  }
  
  // Strategy 5: If no resources, go gathering
  // Heavily influenced by personality's gather weight
  if ((!hasResources || resourceCount < 5) && Math.random() < 0.7 * (weights?.gather || 1.0)) {
    return await startMonsterGathering(db, worldId, monsterGroup, updates, now);
  }
  
  // Strategy 6: Move towards a strategic target
  // This is the default action if others don't apply
  // Influenced by personality's explore weight
  const exploreChance = inExplorationPhase ? 
    Math.min(0.9, (weights?.explore || 1.0) * 1.5) : // Higher chance during exploration phase
    Math.min(0.9, (weights?.explore || 1.0) * 0.5);   // Normal chance otherwise
    
  if (Math.random() < exploreChance) {
    return await moveMonsterTowardsTarget(db, worldId, monsterGroup, location, worldScan, updates, now, null, personality);
  }
  
  // BUILDING LOGIC - Check if monster group should build a structure
  // Only consider building if no structure exists on this tile
  if (!tileData.structure && personality?.weights?.build > 0.5) {
    const buildChance = personality.weights.build / 5; // Max 20% chance per tick for highest build weight

    // Use the comprehensive isSuitableForMonsterBuilding check
    if (Math.random() < buildChance && isSuitableForMonsterBuilding(tileData)) {
      // Check for minimum distance from player spawns
      let tooCloseToSpawn = false;
      for (const spawn of worldScan.playerSpawns) {
        const distance = calculateDistance(location, spawn);
        if (distance < MIN_DISTANCE_FROM_SPAWN) {
          tooCloseToSpawn = true;
          break;
        }
      }

      if (!tooCloseToSpawn) {
        // Attempt to build a monster structure
        // Implementation for building would go here
        console.log(`Monster group ${monsterGroup.id} is considering building at (${x}, ${y})`);
      }
    }
  }
  
  // If all strategies are rejected (based on personality weights), just stay idle
  return { action: 'idle', reason: 'personality' };
}

/**
 * Process demobilization of monster groups
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} updates - Updates object to modify
 * @param {object} monsterGroup - Monster group data
 * @param {string} chunkKey - Chunk key
 * @param {string} tileKey - Tile key 
 * @param {object} tileData - Tile data
 * @param {number} now - Current timestamp
 * @returns {boolean} True if demobilization was processed
 */
async function processMonsterDemobilization(db, worldId, updates, monsterGroup, chunkKey, tileKey, tileData, now) {
  // Skip if not in demobilising status
  if (monsterGroup.status !== 'demobilising') return false;
  
  // Full database path to this group
  const groupId = monsterGroup.id;
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  
  // Check if there's a structure to demobilize into
  if (!tileData.structure) {
    logger.warn(`No structure found for demobilizing monster group ${groupId}`);
    updates[`${groupPath}/status`] = 'idle'; // Reset to idle if no structure
    return false;
  }
  
  // Get the group name for chat messages
  const groupName = monsterGroup.name || "Monster group";
  const structureName = tileData.structure.name || "structure";
  
  // Add units from group to structure units (if structure supports this)
  if (monsterGroup.units && tileData.structure.monster) {
    // Get existing structure units
    const existingUnits = tileData.structure.units || {};
    
    // Combine with group units
    const updatedUnits = {
      ...existingUnits,
      ...monsterGroup.units
    };
    
    // Update structure units
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/units`] = updatedUnits;
  }
  
  // Create chat message for demobilization completion
  const chatMessageId = `monster_demob_complete_${now}_${groupId}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `${groupName} has been demobilized into ${structureName} at (${tileKey.replace(',', ', ')})`,
    type: 'event',
    timestamp: now,
    location: {
      x: parseInt(tileKey.split(',')[0]),
      y: parseInt(tileKey.split(',')[1])
    }
  };
  
  // Now that we've handled all the transfers, delete the group
  updates[groupPath] = null;
  
  return true;
}

/**
 * Main function to process monster strategies across the world
 * @param {string} worldId World ID to process
 * @param {Object} chunks Optional pre-loaded chunks data
 * @returns {Promise<Object>} Results summary
 */
export async function processMonsterStrategies(worldId, chunks = null) {
  const db = getDatabase();
  const now = Date.now();
  
  // Track results for reporting
  const results = {
    movesInitiated: 0,
    gatheringStarted: 0,
    structuresBuildStarted: 0,
    structuresUpgraded: 0,
    demobilizationsStarted: 0,
    battlesJoined: 0,
    groupsMerged: 0,
    personalitiesChanged: 0,
    idleDecisions: 0,
    totalProcessed: 0
  };
  
  try {
    logger.info(`Processing monster strategies for world ${worldId}`);
    
    // Use provided chunks or fetch them if not provided
    if (!chunks) {
      const chunksRef = db.ref(`worlds/${worldId}/chunks`);
      const chunksSnapshot = await chunksRef.once('value');
      chunks = chunksSnapshot.val();
    }
    
    if (!chunks) {
      logger.info(`No chunks found in world ${worldId}`);
      return results;
    }
    
    // Preparation: scan the world for key locations (player spawns, resources, etc)
    const worldScan = await scanWorldMap(db, worldId, chunks);
    
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
            db, worldId, monsterGroup, location, tileData, worldScan, updates, now
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
    
    // Apply all updates in a single batch
    if (Object.keys(updates).length > 0) {
      logger.info(`Applying ${Object.keys(updates).length} updates for monster strategies`);
      await db.ref().update(updates);
    }
    
    return results;
    
  } catch (error) {
    logger.error(`Error processing monster strategies for world ${worldId}:`, error);
    return { error: error.message };
  }
}
