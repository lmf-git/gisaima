/**
 * Monster Strategy processing for Gisaima
 * Handles monster group AI behavior for movement, gathering, building, etc.
 */

import { logger } from "firebase-functions";
import { getDatabase } from 'firebase-admin/database';
import { calculateDistance, moveMonsterTowardsTarget } from '../monsters/strategy/movement.js';
import { findPlayerGroupsOnTile, initiateAttackOnPlayers, initiateAttackOnStructure, joinExistingBattle } from '../monsters/strategy/combat.mjs';
import { startMonsterGathering, countTotalResources, buildMonsterStructure, upgradeMonsterStructure, demobilizeAtMonsterStructure } from '../monsters/strategy/resources.mjs';

// Constants and configuration
const STRATEGY_CHANCE = 0.4; // Chance for a monster group to take strategic action
const MIN_UNITS_TO_BUILD = 5; // Minimum units needed to consider building
const MIN_RESOURCES_TO_BUILD = 15; // Minimum resources needed to build a structure

/**
 * Check if a group is a monster group
 */
export function isMonsterGroup(groupData) {
  return groupData.type === 'monster';
}

/**
 * Check if a group is available for action (idle and not in battle)
 */
export function isAvailableForAction(groupData) {
  return groupData.status === 'idle' && !groupData.inBattle;
}

/**
 * Scan the world map for important locations
 */
export async function scanWorldMap(db, worldId, chunks) {
  const playerSpawns = [];
  const monsterStructures = [];
  const resourceHotspots = [];
  
  // Scan through all chunks and tiles
  for (const [chunkKey, chunkData] of Object.entries(chunks)) {
    if (!chunkData) continue;
    
    // Process each tile in the chunk
    for (const [tileKey, tileData] of Object.entries(chunkData)) {
      if (!tileData) continue;
      
      const [x, y] = tileKey.split(',').map(Number);
      const location = { x, y, chunkKey, tileKey };
      
      // Check for player spawn structures
      if (tileData.structure && tileData.structure.type === 'spawn') {
        playerSpawns.push({
          ...location,
          structure: tileData.structure
        });
      }
      
      // Check for monster structures
      if (tileData.structure && 
         (tileData.structure.type.includes('monster') || 
          tileData.structure.owner === 'monster')) {
        monsterStructures.push({
          ...location,
          structure: tileData.structure
        });
      }
      
      // Identify resource hotspots (tiles with resources)
      if (tileData.resources && Object.keys(tileData.resources).length > 0) {
        resourceHotspots.push({
          ...location,
          resources: tileData.resources
        });
      }
    }
  }
  
  return {
    playerSpawns,
    monsterStructures,
    resourceHotspots
  };
}

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
  
  // Check if there's an battle on this tile
  if (tileData.battles) {
    return await joinExistingBattle(db, worldId, monsterGroup, tileData, updates, now);
  }
  
  // Check for player groups on this tile to attack
  const playerGroupsOnTile = findPlayerGroupsOnTile(tileData);
  if (playerGroupsOnTile.length > 0 && Math.random() < 0.8) { // 80% chance to attack player groups
    return await initiateAttackOnPlayers(db, worldId, monsterGroup, playerGroupsOnTile, location, updates, now);
  }
  
  // Check for attackable player structure on this tile
  const attackableStructure = tileData.structure && 
    tileData.structure.owner && 
    tileData.structure.owner !== 'monster';
    
  if (attackableStructure && Math.random() < 0.7) { // 70% chance to attack structure
    return await initiateAttackOnStructure(db, worldId, monsterGroup, tileData.structure, location, updates, now);
  }

  // Factors that influence decisions
  const totalUnits = monsterGroup.units?.length || 1;
  const hasResources = monsterGroup.items && monsterGroup.items.length > 0;
  const resourceCount = countTotalResources(monsterGroup.items);
  
  // If there's a monster structure on this tile, consider demobilizing or upgrading
  const structureOnTile = tileData.structure && 
    (tileData.structure.type.includes('monster') || tileData.structure.owner === 'monster');

  // Decision making based on group state and environment
  // Strategy 1: If on a monster structure tile with enough resources, consider upgrading
  if (structureOnTile && 
      hasResources && 
      resourceCount > 20 && 
      Math.random() < 0.3) {
    return await upgradeMonsterStructure(db, worldId, monsterGroup, tileData.structure, updates, now);
  }
  
  // Strategy 2: If on a monster structure tile with any resources, demobilize to deposit them
  if (structureOnTile && 
      hasResources && 
      Math.random() < 0.6) {
    return await demobilizeAtMonsterStructure(db, worldId, monsterGroup, tileData.structure, updates, now);
  }
  
  // Strategy 3: If large enough group with enough resources, build a new structure
  if (totalUnits >= MIN_UNITS_TO_BUILD && 
      hasResources && 
      resourceCount >= MIN_RESOURCES_TO_BUILD &&
      !structureOnTile &&
      Math.random() < 0.4) {
    return await buildMonsterStructure(db, worldId, monsterGroup, location, updates, now);
  }
  
  // Strategy 4: If carrying significant resources, prioritize moving to a monster structure
  if (hasResources && resourceCount > 10 && worldScan.monsterStructures.length > 0 && Math.random() < 0.8) {
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
  if ((!hasResources || resourceCount < 5) && Math.random() < 0.7) {
    return await startMonsterGathering(db, worldId, monsterGroup, updates, now);
  }
  
  // Strategy 6: Move towards a strategic target
  // This is the default action if others don't apply
  return await moveMonsterTowardsTarget(db, worldId, monsterGroup, location, worldScan, updates, now);
}

/**
 * Main function to process monster strategies across the world
 * @param {string} worldId World ID to process
 * @returns {Promise<Object>} Results summary
 */
export async function processMonsterStrategies(worldId) {
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
    totalProcessed: 0
  };
  
  try {
    logger.info(`Processing monster strategies for world ${worldId}`);
    
    // Get all chunks for this world
    const chunksRef = db.ref(`worlds/${worldId}/chunks`);
    const chunksSnapshot = await chunksRef.once('value');
    const chunks = chunksSnapshot.val();
    
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
              case 'join_battle': // New action type
                results.battlesJoined++;
                break;
              case 'attack': // New action type
                results.battlesJoined++;
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
