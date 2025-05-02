/**
 * Monster Strategy processing for Gisaima
 * Handles monster group AI behavior for movement, gathering, building, etc.
 */

import { logger } from "firebase-functions";
import { getDatabase } from 'firebase-admin/database';
import { getChunkKey } from "gisaima-shared/map/cartography.js";

/**
 * Calculate a simple path between two points using a modified Bresenham's line algorithm
 * @param {number} startX - Starting X coordinate
 * @param {number} startY - Starting Y coordinate
 * @param {number} endX - Target X coordinate
 * @param {number} endY - Target Y coordinate
 * @param {number} maxSteps - Maximum number of steps to include in the path (default: 20)
 * @returns {Array<{x: number, y: number}>} Array of coordinates representing the path
 */
function calculateSimplePath(startX, startY, endX, endY, maxSteps = 20) {
  // Ensure inputs are integers
  startX = Math.round(startX);
  startY = Math.round(startY);
  endX = Math.round(endX);
  endY = Math.round(endY);
  
  // Create path array with starting point
  const path = [{x: startX, y: startY}];
  
  // If start and end are the same, return just the start point
  if (startX === endX && startY === endY) {
    return path;
  }
  
  // Calculate absolute differences and direction signs
  const dx = Math.abs(endX - startX);
  const dy = Math.abs(endY - startY);
  const sx = startX < endX ? 1 : -1;
  const sy = startY < endY ? 1 : -1;
  
  // Determine error for Bresenham's algorithm
  let err = dx - dy;
  let x = startX;
  let y = startY;
  
  // Limit path length to avoid excessive computation
  let stepsLeft = Math.min(maxSteps, dx + dy);
  
  while ((x !== endX || y !== endY) && stepsLeft > 0) {
    const e2 = 2 * err;
    
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    
    // Add current position to path
    path.push({x, y});
    stepsLeft--;
  }
  
  // If path is too short, ensure the end point is included
  if (path.length < maxSteps && (path[path.length-1].x !== endX || path[path.length-1].y !== endY)) {
    path.push({x: endX, y: endY});
  }
  
  return path;
}

// Constants and configuration
const STRATEGY_CHANCE = 0.4; // Chance for a monster group to take strategic action
const MAX_SCAN_DISTANCE = 20; // How far to scan for targets
const MIN_UNITS_TO_BUILD = 5; // Minimum units needed to consider building
const MIN_RESOURCES_TO_BUILD = 15; // Minimum resources needed to build a structure

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

/**
 * Check if a group is a monster group
 */
function isMonsterGroup(groupData) {
  return groupData.type === 'monster';
}

/**
 * Check if a group is available for action (idle and not in battle)
 */
function isAvailableForAction(groupData) {
  return groupData.status === 'idle' && !groupData.inBattle;
}

/**
 * Scan the world map for important locations
 */
async function scanWorldMap(db, worldId, chunks) {
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
async function executeMonsterStrategy(db, worldId, monsterGroup, location, tileData, worldScan, updates, now) {
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
  
  // NEW: Check for player groups on this tile to attack
  const playerGroupsOnTile = findPlayerGroupsOnTile(tileData);
  if (playerGroupsOnTile.length > 0 && Math.random() < 0.8) { // 80% chance to attack player groups
    return await initiateAttackOnPlayers(db, worldId, monsterGroup, playerGroupsOnTile, location, updates, now);
  }
  
  // NEW: Check for attackable player structure on this tile
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
  
  // NEW Strategy: If carrying significant resources (>10 items), prioritize moving to a monster structure
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
  
  // Strategy 4: If no resources, go gathering
  if ((!hasResources || resourceCount < 5) && Math.random() < 0.7) {
    return await startMonsterGathering(db, worldId, monsterGroup, updates, now);
  }
  
  // Strategy 5: Move towards a strategic target
  // This is the default action if others don't apply
  return await moveMonsterTowardsTarget(db, worldId, monsterGroup, location, worldScan, updates, now);
}

/**
 * Find player groups on the current tile
 * @param {object} tileData - Data for the current tile
 * @returns {Array} Array of player group objects
 */
function findPlayerGroupsOnTile(tileData) {
  const playerGroups = [];
  
  if (tileData.groups) {
    Object.entries(tileData.groups).forEach(([groupId, groupData]) => {
      // Check if it's a player group (has owner, not a monster, and is idle)
      if (groupData.owner && 
          groupData.status === 'idle' && 
          !groupData.inBattle &&
          !isMonsterGroup(groupData)) {
        playerGroups.push({
          id: groupId,
          ...groupData
        });
      }
    });
  }
  
  return playerGroups;
}

/**
 * Initiate an attack on player groups
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - The monster group initiating the attack
 * @param {Array} targetGroups - Array of target player groups
 * @param {object} location - The location coordinates
 * @param {object} updates - Updates object to modify
 * @param {number} now - Current timestamp
 * @returns {object} Action result
 */
async function initiateAttackOnPlayers(db, worldId, monsterGroup, targetGroups, location, updates, now) {
  const { x, y } = location;
  
  // Choose which player groups to attack (up to 3)
  const targetCount = Math.min(targetGroups.length, 3);

  // Sort by group size or randomly if sizes unknown
  targetGroups.sort((a, b) => (a.units?.length || 1) - (b.units?.length || 1));
  
  const selectedTargets = targetGroups.slice(0, targetCount);
  
  // Create battle ID and prepare battle data
  const battleId = `battle_${now}_${Math.floor(Math.random() * 1000)}`;
  
  // Create enhanced battle object with full units data for each side
  const battleData = {
    id: battleId,
    locationX: x,
    locationY: y,
    targetTypes: ['group'],
    side1: {
      groups: {
        [monsterGroup.id]: {
          type: 'monster',
          race: monsterGroup.race || 'monster',
          units: monsterGroup.units || {} // Include full units data
        }
      },
      name: monsterGroup.name || 'Monster Attack Force'
    },
    side2: {
      groups: selectedTargets.reduce((obj, group) => {
        obj[group.id] = {
          type: group.type || 'player',
          race: group.race || 'unknown',
          units: group.units || {} // Include full units data
        };
        return obj;
      }, {}),
      name: selectedTargets.length === 1 ? 
        (selectedTargets[0].name || 'Defenders') : 'Defending Forces'
    },
    tickCount: 0,
    createdAt: now
  };
  
  // Add battle to the tile
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = `${x},${y}`;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`] = battleData;
  
  // Update monster group to be in battle
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/inBattle`] = true;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleId`] = battleId;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleSide`] = 1;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleRole`] = 'attacker';
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/status`] = 'fighting';
  
  // Update each target group to be in battle
  for (const target of selectedTargets) {
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/inBattle`] = true;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleId`] = battleId;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleSide`] = 2;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleRole`] = 'defender';
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/status`] = 'fighting';
  }
  
  // Add battle start message to chat
  const targetName = selectedTargets.length > 0 ? 
    (selectedTargets[0].name || `Player group ${selectedTargets[0].id.slice(-4)}`) :
    'Player groups';
    
  const messageId = `monster_attack_${now}_${monsterGroup.id}`;
  updates[`worlds/${worldId}/chat/${messageId}`] = {
    text: `${monsterGroup.name || 'Monsters'} have attacked ${targetName} at (${x}, ${y})!`,
    type: 'event',
    timestamp: now,
    location: { x, y }
  };
  
  return {
    action: 'attack',
    targets: selectedTargets.map(t => t.id),
    battleId
  };
}

/**
 * Initiate an attack on a player structure
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - The monster group initiating the attack
 * @param {object} structure - Target structure
 * @param {object} location - The location coordinates
 * @param {object} updates - Updates object to modify
 * @param {number} now - Current timestamp
 * @returns {object} Action result
 */
async function initiateAttackOnStructure(db, worldId, monsterGroup, structure, location, updates, now) {
  const { x, y } = location;
  
  // Create battle ID and prepare battle data
  const battleId = `battle_${now}_${Math.floor(Math.random() * 1000)}`;
  
  // Create enhanced battle object with full units data
  const battleData = {
    id: battleId,
    locationX: x,
    locationY: y,
    targetTypes: ['structure'],
    structureId: structure.id,
    structurePower: structure.defensePower || 20, // Default structure defense power
    side1: {
      groups: {
        [monsterGroup.id]: {
          type: 'monster',
          race: monsterGroup.race || 'monster',
          units: monsterGroup.units || {} // Include full units data
        }
      },
      name: monsterGroup.name || 'Monster Attack Force'
    },
    side2: {
      groups: {},
      name: structure.name || 'Structure Defenses',
      structureInfo: {
        id: structure.id,
        name: structure.name || 'Structure',
        type: structure.type || 'unknown',
        owner: structure.owner || 'unknown',
        defensePower: structure.defensePower || 20
      }
    },
    tickCount: 0,
    createdAt: now
  };
  
  // Add battle to the tile
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = `${x},${y}`;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`] = battleData;
  
  // Update monster group to be in battle
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/inBattle`] = true;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleId`] = battleId;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleSide`] = 1;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleRole`] = 'attacker';
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/status`] = 'fighting';
  
  // Mark structure as in battle
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/inBattle`] = true;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/battleId`] = battleId;
  
  // Add battle start message to chat
  const structureName = structure.name || structure.type || "Settlement";
  const messageId = `monster_attack_structure_${now}_${monsterGroup.id}`;
  updates[`worlds/${worldId}/chat/${messageId}`] = {
    text: `${monsterGroup.name || 'Monsters'} are attacking ${structureName} at (${x}, ${y})!`,
    type: 'event',
    timestamp: now,
    location: { x, y }
  };
  
  return {
    action: 'attack',
    targetStructure: structure.id,
    battleId
  };
}

/**
 * Join an existing battle on this tile
 */
async function joinExistingBattle(db, worldId, monsterGroup, tileData, updates, now) {
  const groupId = monsterGroup.id;
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = monsterGroup.tileKey;
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  
  // Get battles on this tile
  const battles = Object.entries(tileData.battles || {})
    .map(([battleId, battle]) => ({ id: battleId, ...battle }));
  
  if (battles.length === 0) return { action: null };
  
  // Choose a random battle to join if multiple
  const battle = battles[Math.floor(Math.random() * battles.length)];
  
  // Decide which side to join
  // 30% chance to join attackers, 70% chance to join defenders
  // Monsters typically side with defenders, but sometimes they're opportunistic
  const joinAttackers = Math.random() < 0.3;
  const battleSide = joinAttackers ? 1 : 2;
  
  // Update monster group to join battle
  updates[`${groupPath}/inBattle`] = true;
  updates[`${groupPath}/battleId`] = battle.id;
  updates[`${groupPath}/battleSide`] = battleSide;
  updates[`${groupPath}/battleRole`] = 'reinforcement';
  
  // Add monster group to battle's side - simply add to the groups object
  const sideKey = battleSide === 1 ? 'side1' : 'side2';
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/${sideKey}/groups/${groupId}`] = true;
  
  // Add a chat message about monsters joining the fight
  const groupName = monsterGroup.name || "Monster group";
  const joiningSide = joinAttackers ? "attackers" : "defenders";
  
  const chatMessageId = `monster_join_battle_${now}_${groupId}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `${groupName} has joined the battle at (${tileKey.replace(',', ', ')}) on the side of the ${joiningSide}!`,
    type: 'event',
    timestamp: now,
    location: {
      x: parseInt(tileKey.split(',')[0]),
      y: parseInt(tileKey.split(',')[1])
    }
  };
  
  return {
    action: 'join_battle',
    battleId: battle.id,
    side: battleSide
  };
}

/**
 * Count total resources in a group's inventory
 */
function countTotalResources(items) {
  if (!items || !Array.isArray(items)) return 0;
  
  return items.reduce((total, item) => {
    return total + (item.quantity || 1);
  }, 0);
}

/**
 * Move monster group towards a strategic target
 */
async function moveMonsterTowardsTarget(db, worldId, monsterGroup, location, worldScan, updates, now) {
  const totalUnits = monsterGroup.units?.length || 1;
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  let targetLocation;
  let targetType;
  let targetDistance = Infinity;
  
  // First priority: Check if there are any structures on adjacent tiles to attack
  const adjacentStructure = await findAdjacentStructures(db, worldId, location);
  if (adjacentStructure) {
    // If we found an adjacent structure, move to it for potential attack
    return moveToAdjacentTile(worldId, monsterGroup, location, adjacentStructure, updates, now, 'structure_attack');
  }
  
  // If this monster group has a preferredStructureId (their "home"), prioritize it
  if (monsterGroup.preferredStructureId) {
    // Try to find the preferred structure
    const preferredStructure = worldScan.monsterStructures.find(s => 
      s.structure && s.structure.id === monsterGroup.preferredStructureId);
      
    if (preferredStructure) {
      targetLocation = preferredStructure;
      targetType = 'monster_home';
      targetDistance = calculateDistance(location, preferredStructure);
    }
  }
  
  // If no preferred structure or it's too far away, choose a different target
  if (!targetLocation || targetDistance > MAX_SCAN_DISTANCE) {
    // Prioritize monster structures if they exist
    if (worldScan.monsterStructures.length > 0 && Math.random() < 0.7) {
      // Find nearest monster structure
      for (const structure of worldScan.monsterStructures) {
        const distance = calculateDistance(location, structure);
        if (distance < targetDistance && distance < MAX_SCAN_DISTANCE) {
          targetLocation = structure;
          targetDistance = distance;
          targetType = 'monster_structure';
        }
      }
    }
    
    // If no monster structure found or didn't choose one, follow original targeting logic
    if (!targetLocation) {
      // Smaller groups tend to pursue resource hotspots
      if (totalUnits < 5 && worldScan.resourceHotspots.length > 0 && Math.random() < 0.7) {
        // Find nearest resource hotspot
        for (const hotspot of worldScan.resourceHotspots) {
          const distance = calculateDistance(location, hotspot);
          if (distance < targetDistance && distance < MAX_SCAN_DISTANCE) {
            targetLocation = hotspot;
            targetDistance = distance;
            targetType = 'resource';
          }
        }
      }
      
      // Medium groups target monster structures to deposit resources
      else if (totalUnits >= 5 && totalUnits < 10 && worldScan.monsterStructures.length > 0 && Math.random() < 0.6) {
        // Find nearest monster structure
        for (const structure of worldScan.monsterStructures) {
          const distance = calculateDistance(location, structure);
          if (distance < targetDistance && distance < MAX_SCAN_DISTANCE) {
            targetLocation = structure;
            targetDistance = distance;
            targetType = 'monster_structure';
          }
        }
      }
      
      // Stronger groups target player spawns
      else if (totalUnits >= 10 && worldScan.playerSpawns.length > 0) {
        // Find nearest player spawn
        for (const spawn of worldScan.playerSpawns) {
          const distance = calculateDistance(location, spawn);
          if (distance < targetDistance && distance < MAX_SCAN_DISTANCE) {
            targetLocation = spawn;
            targetDistance = distance;
            targetType = 'player_spawn';
          }
        }
      }
    }
  }

  // If no suitable target found or too far, move randomly
  if (!targetLocation || targetDistance > MAX_SCAN_DISTANCE) {
    return moveRandomly(worldId, monsterGroup, location, updates, now);
  }

  // If target is more than 1 tile away, move only 1 tile in that direction
  if (targetDistance > 1.5) {
    return moveOneStepTowardsTarget(worldId, monsterGroup, location, targetLocation, targetType, updates, now);
  }
  
  // Calculate a path to the target using a randomized step count for more varied monster movement
  const randomMaxSteps = 1 + Math.floor(Math.random() * 3);
  const path = calculateSimplePath(
    location.x, location.y,
    targetLocation.x, targetLocation.y, 
    randomMaxSteps
  );
  
  // Movement speed can depend on monster type
  let moveSpeed = 1;
  
  // Set the movement data
  updates[`${groupPath}/status`] = 'moving';
  updates[`${groupPath}/movementPath`] = path;
  updates[`${groupPath}/pathIndex`] = 0;
  updates[`${groupPath}/moveStarted`] = now;
  updates[`${groupPath}/moveSpeed`] = moveSpeed;
  updates[`${groupPath}/targetX`] = targetLocation.x;
  updates[`${groupPath}/targetY`] = targetLocation.y;
  updates[`${groupPath}/nextMoveTime`] = now + 60000; // One minute
  
  // Add chat message for significant monster movements
  const chatMessageId = `monster_move_${now}_${monsterGroup.id}`;
  const chatMessage = createMonsterMoveMessage(monsterGroup, targetType, targetLocation);
  
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: chatMessage,
    type: 'event',
    timestamp: now,
    location: {
      x: location.x,
      y: location.y
    }
  };
  
  return {
    action: 'move',
    target: {
      type: targetType,
      x: targetLocation.x,
      y: targetLocation.y,
      distance: targetDistance
    }
  };
}

/**
 * Find structures on adjacent tiles for potential attacking
 * @param {object} db Firebase database reference
 * @param {string} worldId The world ID
 * @param {object} location Current location {x, y}
 * @returns {Promise<object|null>} Adjacent tile with structure or null if none found
 */
async function findAdjacentStructures(db, worldId, location) {
  // Define adjacent directions (including diagonals)
  const directions = [
    {dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1},
    {dx: 1, dy: 1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}, {dx: -1, dy: -1}
  ];
  
  // Randomly shuffle directions for more unpredictable behavior
  directions.sort(() => Math.random() - 0.5);
  
  for (const dir of directions) {
    const adjX = location.x + dir.dx;
    const adjY = location.y + dir.dy;
    
    // Get chunk key for this tile
    const chunkKey = getChunkKey(adjX, adjY);
    const tileKey = `${adjX},${adjY}`;
    
    // Check if tile exists and has a structure
    try {
      const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
      const tileSnapshot = await tileRef.once('value');
      const tileData = tileSnapshot.val();
      
      if (tileData) {
        // If there's a player structure, this is a good target
        if (tileData.structure && tileData.structure.owner !== 'monster') {
          return {
            x: adjX,
            y: adjY,
            structure: tileData.structure
          };
        }
        
        // Also target tiles with player groups
        if (tileData.groups) {
          const hasPlayerGroups = Object.values(tileData.groups).some(
            group => group.owner && group.owner !== 'monster'
          );
          
          if (hasPlayerGroups) {
            return {
              x: adjX,
              y: adjY,
              hasPlayerGroups: true
            };
          }
        }
      }
    } catch (error) {
      // Silently continue to next direction on error
      continue;
    }
  }
  
  return null; // No adjacent structures or player groups found
}

/**
 * Move one step towards a target location
 */
function moveOneStepTowardsTarget(worldId, monsterGroup, location, targetLocation, targetType, updates, now) {
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  const dx = targetLocation.x - location.x;
  const dy = targetLocation.y - location.y;
  
  // Calculate the direction to move (normalize to get a unit vector)
  const length = Math.sqrt(dx * dx + dy * dy);
  const dirX = dx / length;
  const dirY = dy / length;
  
  // Calculate the next position (one tile in the target direction)
  const nextX = location.x + Math.round(dirX);
  const nextY = location.y + Math.round(dirY);
  
  // Create a simple two-point path
  const path = [
    { x: location.x, y: location.y },
    { x: nextX, y: nextY }
  ];
  
  // Set the movement data
  updates[`${groupPath}/status`] = 'moving';
  updates[`${groupPath}/movementPath`] = path;
  updates[`${groupPath}/pathIndex`] = 0;
  updates[`${groupPath}/moveStarted`] = now;
  updates[`${groupPath}/moveSpeed`] = 1;
  updates[`${groupPath}/targetX`] = targetLocation.x;
  updates[`${groupPath}/targetY`] = targetLocation.y;
  updates[`${groupPath}/nextMoveTime`] = now + 60000; // One minute
  
  // Add chat message for monster movement if it's a significant target
  if (['player_spawn', 'monster_structure', 'monster_home'].includes(targetType)) {
    const chatMessageId = `monster_move_${now}_${monsterGroup.id}`;
    const chatMessage = `${monsterGroup.name || "Monster group"} is moving towards ${targetType === 'player_spawn' ? 'a settlement' : 'their lair'}.`;
    
    updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
      text: chatMessage,
      type: 'event',
      timestamp: now,
      location: {
        x: location.x,
        y: location.y
      }
    };
  }
  
  return {
    action: 'move',
    target: {
      type: targetType,
      x: nextX,
      y: nextY,
      distance: 1
    }
  };
}

/**
 * Move the monster group in a random direction
 */
function moveRandomly(worldId, monsterGroup, location, updates, now) {
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  // Generate a random direction
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 }
  ];
  
  const direction = directions[Math.floor(Math.random() * directions.length)];
  // Randomize movement distance between 1-3 tiles
  const moveDistance = 1 + Math.floor(Math.random() * 3);
  const targetX = location.x + direction.x * moveDistance;
  const targetY = location.y + direction.y * moveDistance;
  
  // Calculate a path to the random target
  // Use a random number of steps between 1-3
  const randomMaxSteps = 1 + Math.floor(Math.random() * 3);
  const path = calculateSimplePath(
    location.x, location.y,
    targetX, targetY,
    randomMaxSteps
  );
  
  // Set the movement data
  updates[`${groupPath}/status`] = 'moving';
  updates[`${groupPath}/movementPath`] = path;
  updates[`${groupPath}/pathIndex`] = 0;
  updates[`${groupPath}/moveStarted`] = now;
  updates[`${groupPath}/moveSpeed`] = 1;
  updates[`${groupPath}/targetX`] = targetX;
  updates[`${groupPath}/targetY`] = targetY;
  updates[`${groupPath}/nextMoveTime`] = now + 60000; // One minute
  
  return {
    action: 'move',
    target: {
      type: 'random',
      x: targetX,
      y: targetY,
      distance: Math.sqrt(direction.x*direction.x + direction.y*direction.y) * moveDistance
    }
  };
}

/**
 * Move monster to an adjacent tile (typically for attacking)
 */
function moveToAdjacentTile(worldId, monsterGroup, location, adjacentTile, updates, now, moveReason) {
  const groupId = monsterGroup.id;
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = monsterGroup.tileKey;
  
  // Base path for this group
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  
  // Create a simple two-point path from current location to the adjacent tile
  const path = [
    { x: location.x, y: location.y },
    { x: adjacentTile.x, y: adjacentTile.y }
  ];
  
  // Set movement data
  updates[`${groupPath}/status`] = 'moving';
  updates[`${groupPath}/movementPath`] = path;
  updates[`${groupPath}/pathIndex`] = 0;
  updates[`${groupPath}/moveStarted`] = now;
  updates[`${groupPath}/moveSpeed`] = 1.5; // Slightly faster for attack moves
  updates[`${groupPath}/targetX`] = adjacentTile.x;
  updates[`${groupPath}/targetY`] = adjacentTile.y;
  updates[`${groupPath}/nextMoveTime`] = now + 45000; // 45 seconds - faster for adjacent moves
  updates[`${groupPath}/moveReason`] = moveReason;
  
  // Add a chat message if this is a structure attack
  if (moveReason === 'structure_attack' && adjacentTile.structure) {
    const chatMessageId = `monster_attack_move_${now}_${groupId}`;
    const structureType = adjacentTile.structure.type || 'settlement';
    const structureName = adjacentTile.structure.name || structureType;
    
    updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
      text: `${monsterGroup.name || "Monster group"} is moving to attack the ${structureName} at (${adjacentTile.x}, ${adjacentTile.y})!`,
      type: 'event',
      timestamp: now,
      location: {
        x: location.x,
        y: location.y
      }
    };
  } else if (moveReason === 'structure_attack' && adjacentTile.hasPlayerGroups) {
    const chatMessageId = `monster_attack_move_${now}_${groupId}`;
    
    updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
      text: `${monsterGroup.name || "Monster group"} is moving to attack players at (${adjacentTile.x}, ${adjacentTile.y})!`,
      type: 'event',
      timestamp: now,
      location: {
        x: location.x,
        y: location.y
      }
    };
  }
  
  return {
    action: 'move',
    target: {
      type: moveReason,
      x: adjacentTile.x,
      y: adjacentTile.y,
      distance: 1
    }
  };
}

/**
 * Calculate distance between two locations
 */
function calculateDistance(loc1, loc2) {
  const dx = loc1.x - loc2.x;
  const dy = loc1.y - loc2.y;
  return Math.sqrt(dx*dx + dy*dy);
}

/**
 * Create a descriptive message for monster movement
 */
function createMonsterMoveMessage(monsterGroup, targetType, targetLocation) {
  const groupName = monsterGroup.name || "Monster group";
  const size = monsterGroup.units?.length <= 3 ? "small" : 
              monsterGroup.units?.length <= 8 ? "medium-sized" : "large";
  
  switch (targetType) {
    case 'player_spawn':
      return `A ${size} ${groupName} is marching toward the settlement at (${targetLocation.x}, ${targetLocation.y})!`;
    case 'monster_structure':
      return `${groupName} is moving toward their lair at (${targetLocation.x}, ${targetLocation.y}).`;
    case 'resource':
      return `${groupName} is searching for resources near (${targetLocation.x}, ${targetLocation.y}).`;
    default:
      return `${groupName} is on the move.`;
  }
}

/**
 * Start the monster group gathering resources
 * @param {object} db - Firebase database reference
 * @param {string} worldId - The world ID
 * @param {object} monsterGroup - The monster group data
 * @param {object} updates - Updates object to modify
 * @param {number} now - Current timestamp
 * @returns {object} Action result
 */
async function startMonsterGathering(db, worldId, monsterGroup, updates, now) {
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  // Get tile data to determine biome
  const tileRef = db.ref(`worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}`);
  const tileSnapshot = await tileRef.once('value');
  const tileData = tileSnapshot.val() || {};
  
  // Get the biome or default to plains
  const biome = tileData.biome?.name || 'plains';
  
  // Set gathering status with tick counting
  updates[`${groupPath}/status`] = 'gathering';
  updates[`${groupPath}/gatheringStarted`] = now;
  updates[`${groupPath}/gatheringBiome`] = biome;
  updates[`${groupPath}/gatheringTicksRemaining`] = 2; // Set to wait for 2 ticks
  
  // Add a chat message
  const chatMessageId = `monster_gather_${now}_${monsterGroup.id}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `${monsterGroup.name || "Monster group"} is gathering resources in the ${biome}.`,
    type: 'event',
    timestamp: now,
    location: {
      x: parseInt(monsterGroup.tileKey.split(',')[0]),
      y: parseInt(monsterGroup.tileKey.split(',')[1])
    }
  };
  
  return {
    action: 'gather',
    biome
  };
}
