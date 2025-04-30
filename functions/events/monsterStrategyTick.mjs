/**
 * Monster Strategy processing for Gisaima
 * Handles monster group AI behavior for movement, gathering, building, etc.
 */

import { logger } from "firebase-functions";
import { getDatabase } from 'firebase-admin/database';
import { getChunkKey } from "./utils.mjs";
import { mergeItems } from "./utils.mjs";

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

// Monster structure types and their properties
const MONSTER_STRUCTURES = {
  'monster_lair': {
    name: "Monster Lair",
    buildCost: {
      'Wooden Sticks': 8,
      'Stone Pieces': 6
    },
    buildTime: 1,
    capacity: 10,
    features: ['basic_storage', 'monster_spawning']
  },
  'monster_fortress': {
    name: "Monster Fortress",
    buildCost: {
      'Wooden Sticks': 15,
      'Stone Pieces': 12,
      'Monster Hide': 5
    },
    buildTime: 2,
    capacity: 25,
    features: ['advanced_storage', 'monster_defense', 'monster_spawning']
  },
  'monster_hive': {
    name: "Monster Hive",
    buildCost: {
      'Wooden Sticks': 10,
      'Stone Pieces': 8,
      'Monster Blood': 3
    },
    buildTime: 1,
    capacity: 15,
    features: ['monster_spawning', 'rapid_growth']
  }
};

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
    
    // Scan each chunk for monster groups
    for (const [chunkKey, chunkData] of Object.entries(chunks)) {
      if (!chunkData || chunkKey === 'lastUpdated') continue;
      
      // Process each tile in the chunk
      for (const [tileKey, tileData] of Object.entries(chunkData)) {
        if (!tileData || tileKey === 'lastUpdated') continue;
        
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
  return groupData.type === 'monster' || groupData.monsterType;
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
    if (!chunkData || chunkKey === 'lastUpdated') continue;
    
    // Process each tile in the chunk
    for (const [tileKey, tileData] of Object.entries(chunkData)) {
      if (!tileData || tileKey === 'lastUpdated') continue;
      
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
  
  // Check if there's an active battle on this tile
  if (tileData.battles && Object.values(tileData.battles).some(battle => battle.status === 'active')) {
    return await joinExistingBattle(db, worldId, monsterGroup, tileData, updates, now);
  }
  
  // Factors that influence decisions
  const unitCount = monsterGroup.unitCount || 1;
  const mergeCount = monsterGroup.mergeCount || 0;
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
  if (unitCount >= MIN_UNITS_TO_BUILD && 
      hasResources && 
      resourceCount >= MIN_RESOURCES_TO_BUILD &&
      !structureOnTile &&
      Math.random() < 0.4) {
    return await buildMonsterStructure(db, worldId, monsterGroup, location, updates, now);
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
 * Join an existing battle on this tile
 */
async function joinExistingBattle(db, worldId, monsterGroup, tileData, updates, now) {
  const groupId = monsterGroup.id;
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = monsterGroup.tileKey;
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  
  // Get active battles on this tile
  const battles = Object.entries(tileData.battles || {})
    .filter(([_, battle]) => battle.status === 'active')
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
  updates[`${groupPath}/lastUpdated`] = now;
  
  // Add monster group to battle's side
  const sideKey = battleSide === 1 ? 'side1' : 'side2';
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/${sideKey}/groups/${groupId}`] = {
    id: groupId,
    joined: now
  };
  
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
  const unitCount = monsterGroup.unitCount || 1;
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  const groupStrength = calculateGroupStrength(monsterGroup);
  
  let targetLocation;
  let targetType;
  let targetDistance = Infinity;
  
  // First priority: Check if there are any structures on adjacent tiles to attack
  const adjacentStructure = await findAdjacentStructures(db, worldId, location);
  if (adjacentStructure) {
    // If we found an adjacent structure, move to it for potential attack
    return moveToAdjacentTile(monsterGroup, location, adjacentStructure, updates, now, 'structure_attack');
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
      if (unitCount < 5 && worldScan.resourceHotspots.length > 0 && Math.random() < 0.7) {
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
      else if (unitCount >= 5 && unitCount < 10 && worldScan.monsterStructures.length > 0 && Math.random() < 0.6) {
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
      else if ((unitCount >= 10 || groupStrength > 15) && worldScan.playerSpawns.length > 0) {
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
  
  // Calculate a path to the target (using a simple approach for now)
  const path = calculateSimplePath(
    location.x, location.y,
    targetLocation.x, targetLocation.y
  );
  
  // Movement speed can depend on monster type
  let moveSpeed = 1;
  if (monsterGroup.monsterType === 'wolf') moveSpeed = 1.5;
  if (monsterGroup.monsterType === 'spider') moveSpeed = 1.2;
  
  // Set the movement data
  updates[`${groupPath}/status`] = 'moving';
  updates[`${groupPath}/movementPath`] = path;
  updates[`${groupPath}/pathIndex`] = 0;
  updates[`${groupPath}/moveStarted`] = now;
  updates[`${groupPath}/moveSpeed`] = moveSpeed;
  updates[`${groupPath}/targetX`] = targetLocation.x;
  updates[`${groupPath}/targetY`] = targetLocation.y;
  updates[`${groupPath}/nextMoveTime`] = now + 60000; // One minute
  updates[`${groupPath}/lastUpdated`] = now;
  
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
 * Move one step towards a target location
 */
function moveOneStepTowardsTarget(worldId, monsterGroup, location, targetLocation, targetType, updates, now) {
  const groupId = monsterGroup.id;
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = monsterGroup.tileKey;
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  
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
  updates[`${groupPath}/lastUpdated`] = now;
  
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
 * Find structures on adjacent tiles
 */
async function findAdjacentStructures(db, worldId, location) {
  // Define adjacent tiles (including diagonals)
  const adjacentOffsets = [
    {x: 0, y: 1}, {x: 1, y: 0}, {x: 0, y: -1}, {x: -1, y: 0},
    {x: 1, y: 1}, {x: 1, y: -1}, {x: -1, y: 1}, {x: -1, y: -1}
  ];
  
  for (const offset of adjacentOffsets) {
    const adjX = location.x + offset.x;
    const adjY = location.y + offset.y;
    
    // Calculate chunk for this adjacent tile
    const adjChunkX = Math.floor(adjX / 20);
    const adjChunkY = Math.floor(adjY / 20);
    const adjChunkKey = `${adjChunkX},${adjChunkY}`;
    const adjTileKey = `${adjX},${adjY}`;
    
    // Check if there's a structure on this tile
    const tileRef = db.ref(`worlds/${worldId}/chunks/${adjChunkKey}/${adjTileKey}`);
    const tileSnapshot = await tileRef.once('value');
    const tileData = tileSnapshot.val();
    
    if (tileData && tileData.structure) {
      // Found structure on an adjacent tile
      // Don't attack monster structures
      if (tileData.structure.owner === 'monster') {
        continue;
      }
      
      return {
        x: adjX,
        y: adjY,
        chunkKey: adjChunkKey,
        tileKey: adjTileKey,
        structure: tileData.structure
      };
    }
    
    // Also check for player groups to attack
    if (tileData && tileData.groups) {
      let hasPlayerGroups = false;
      
      for (const [groupId, group] of Object.entries(tileData.groups)) {
        if (group.owner && group.owner !== 'monster' && group.type !== 'monster') {
          hasPlayerGroups = true;
          break;
        }
      }
      
      if (hasPlayerGroups) {
        return {
          x: adjX,
          y: adjY,
          chunkKey: adjChunkKey,
          tileKey: adjTileKey,
          hasPlayerGroups: true
        };
      }
    }
  }
  
  return null;
}

/**
 * Create a descriptive message for monster movement
 */
function createMonsterMoveMessage(monsterGroup, targetType, targetLocation) {
  const groupName = monsterGroup.name || "Monster group";
  const size = monsterGroup.unitCount <= 3 ? "small" : 
              monsterGroup.unitCount <= 8 ? "medium-sized" : "large";
  
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
 * Move monster to an adjacent tile (typically for attacking)
 */
function moveToAdjacentTile(monsterGroup, location, adjacentTile, updates, now, moveReason) {
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
  updates[`${groupPath}/lastUpdated`] = now;
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
  const targetX = location.x + direction.x * (1 + Math.floor(Math.random() * 3));
  const targetY = location.y + direction.y * (1 + Math.floor(Math.random() * 3));
  
  // Calculate a path to the random target
  const path = calculateSimplePath(
    location.x, location.y,
    targetX, targetY
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
  updates[`${groupPath}/lastUpdated`] = now;
  
  return {
    action: 'move',
    target: {
      type: 'random',
      x: targetX,
      y: targetY,
      distance: Math.sqrt(direction.x*direction.x + direction.y*direction.y)
    }
  };
}

/**
 * Start the monster group gathering resources
 */
async function startMonsterGathering(db, worldId, monsterGroup, updates, now) {
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  // Get tile data to determine biome
  const tileRef = db.ref(`worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}`);
  const tileSnapshot = await tileRef.once('value');
  const tileData = tileSnapshot.val() || {};
  
  // Get the biome or default to plains
  const biome = tileData.biome?.name || 'plains';
  
  // Set gathering status and duration
  const gatheringDuration = 60000; // 1 minute
  updates[`${groupPath}/status`] = 'gathering';
  updates[`${groupPath}/gatheringStarted`] = now;
  updates[`${groupPath}/gatheringUntil`] = now + gatheringDuration;
  updates[`${groupPath}/gatheringBiome`] = biome;
  updates[`${groupPath}/lastUpdated`] = now;
  
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

/**
 * Build a monster structure at the current location
 */
async function buildMonsterStructure(db, worldId, monsterGroup, location, updates, now) {
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  // Choose which structure to build based on group size and resources
  const structureChoice = chooseMonsterStructureType(monsterGroup);
  const structureTemplate = MONSTER_STRUCTURES[structureChoice];
  
  if (!structureTemplate) {
    return { action: null }; // Failed to find a suitable structure
  }
  
  // Check if we have enough resources
  if (!hasEnoughResources(monsterGroup.items, structureTemplate.buildCost)) {
    return { action: null }; // Not enough resources
  }
  
  // Calculate build time
  const buildTime = structureTemplate.buildTime;
  const buildCompletionTime = now + (buildTime * 60000); // Convert to milliseconds
  
  // Generate a unique ID for the structure
  const structureId = `monster_structure_${now}_${Math.floor(Math.random() * 10000)}`;
  
  // Create the structure in building state
  updates[`worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/structure`] = {
    id: structureId,
    name: structureTemplate.name,
    type: structureChoice,
    status: 'building',
    buildProgress: 0,
    buildTotalTime: buildTime,
    buildStartTime: now,
    buildCompletionTime: buildCompletionTime,
    owner: 'monster',
    ownerType: monsterGroup.monsterType || 'generic_monster',
    builder: monsterGroup.id
  };
  
  // Update group status to building
  updates[`${groupPath}/status`] = 'building';
  updates[`${groupPath}/buildingUntil`] = buildCompletionTime;
  updates[`${groupPath}/lastUpdated`] = now;
  
  // Consume resources from the group
  const remainingItems = consumeResources(monsterGroup.items, structureTemplate.buildCost);
  updates[`${groupPath}/items`] = remainingItems;
  
  // Add a chat message
  const chatMessageId = `monster_build_${now}_${monsterGroup.id}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `${monsterGroup.name || "Monster group"} has begun constructing a ${structureTemplate.name} at (${location.x}, ${location.y})!`,
    type: 'event',
    timestamp: now,
    location: {
      x: location.x,
      y: location.y
    }
  };
  
  return {
    action: 'build',
    structureType: structureChoice,
    completesAt: buildCompletionTime
  };
}

/**
 * Choose which monster structure type to build
 */
function chooseMonsterStructureType(monsterGroup) {
  const unitCount = monsterGroup.unitCount || 1;
  const resourceCount = countTotalResources(monsterGroup.items);
  
  // More powerful groups can build better structures
  if (unitCount >= 12 && resourceCount >= 30) {
    return 'monster_fortress';
  } else if (unitCount >= 8 && resourceCount >= 20 && monsterGroup.monsterType === 'spider') {
    return 'monster_hive';
  } else {
    return 'monster_lair'; // Default structure
  }
}

/**
 * Check if group has enough resources for a structure
 */
function hasEnoughResources(items, requiredResources) {
  if (!items || !Array.isArray(items)) return false;
  
  const availableResources = {};
  
  // Count available resources
  for (const item of items) {
    if (!availableResources[item.name]) {
      availableResources[item.name] = 0;
    }
    availableResources[item.name] += item.quantity || 1;
  }
  
  // Check against requirements
  for (const [resource, amount] of Object.entries(requiredResources)) {
    const available = availableResources[resource] || 0;
    if (available < amount) {
      return false;
    }
  }
  
  return true;
}

/**
 * Consume resources for building/upgrading
 */
function consumeResources(items, requiredResources) {
  if (!items || !Array.isArray(items)) return [];
  
  // Clone the items array to avoid modifying the original
  const remainingItems = [...items];
  
  // Track how much of each resource we still need to consume
  const resourcesNeeded = { ...requiredResources };
  
  // Process each item
  for (let i = remainingItems.length - 1; i >= 0; i--) {
    const item = remainingItems[i];
    
    // If this resource is needed
    if (resourcesNeeded[item.name]) {
      const toConsume = Math.min(item.quantity || 1, resourcesNeeded[item.name]);
      resourcesNeeded[item.name] -= toConsume;
      
      // Update the item quantity or remove if fully consumed
      if (toConsume < item.quantity) {
        remainingItems[i] = { ...item, quantity: item.quantity - toConsume };
      } else {
        remainingItems.splice(i, 1); // Remove the item
      }
      
      // If we've consumed all needed resources, we can stop
      if (Object.values(resourcesNeeded).every(amount => amount <= 0)) break;
    }
  }
  
  return remainingItems;
}

/**
 * Demobilize a monster group at a monster structure
 */
async function demobilizeAtMonsterStructure(db, worldId, monsterGroup, structure, updates, now) {
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  // Set demobilizing status
  updates[`${groupPath}/status`] = 'demobilising';
  updates[`${groupPath}/lastUpdated`] = now;
  updates[`${groupPath}/targetStructureId`] = structure.id;
  updates[`${groupPath}/storageDestination`] = 'shared'; // Monsters always use shared storage
  
  // Add more precise location data for accurate demobilization
  updates[`${groupPath}/demobilizationData`] = {
    exactLocation: {
      x: parseInt(monsterGroup.tileKey.split(',')[0]),
      y: parseInt(monsterGroup.tileKey.split(',')[1]),
      chunkKey: monsterGroup.chunkKey,
      tileKey: monsterGroup.tileKey
    }
  };
  
  // Add a chat message
  const chatMessageId = `monster_demob_${now}_${monsterGroup.id}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `${monsterGroup.name || "Monster group"} is being absorbed into the ${structure.name || "monster structure"}.`,
    type: 'event',
    timestamp: now,
    location: {
      x: parseInt(monsterGroup.tileKey.split(',')[0]),
      y: parseInt(monsterGroup.tileKey.split(',')[1])
    }
  };
  
  return {
    action: 'demobilize',
    structureId: structure.id
  };
}

/**
 * Upgrade a monster structure
 */
async function upgradeMonsterStructure(db, worldId, monsterGroup, structure, updates, now) {
  // Only upgrade if structure is complete and not already upgrading
  if (structure.status !== 'complete' || structure.upgradeInProgress) {
    return { action: null };
  }
  
  // Get the current structure level
  const currentLevel = structure.level || 1;
  
  // Don't upgrade beyond level 3
  if (currentLevel >= 3) {
    return { action: null };
  }
  
  // Calculate upgrade costs based on current level
  const upgradeResourceCosts = {
    'Wooden Sticks': 5 * currentLevel,
    'Stone Pieces': 4 * currentLevel
  };
  
  // Add special resources for higher levels
  if (currentLevel >= 2) {
    upgradeResourceCosts['Monster Hide'] = 3;
    upgradeResourceCosts['Monster Blood'] =
    upgradeResourceCosts['Monster Blood'] = 2;
  }
  
  // Check if structure has enough resources in shared storage
  const structureItems = structure.items || [];
  if (!hasEnoughResources(structureItems, upgradeResourceCosts)) {
    return { action: null };
  }
  
  // Set up upgrade timing
  const upgradeTime = currentLevel * 60000; // Level 1->2: 1 minute, 2->3: 2 minutes
  const completionTime = now + upgradeTime;
  
  // Generate unique upgrade ID
  const upgradeId = `monster_upgrade_${now}_${Math.floor(Math.random() * 10000)}`;
  
  // Create upgrade entry
  updates[`worlds/${worldId}/upgrades/${upgradeId}`] = {
    id: upgradeId,
    type: 'structure',
    worldId,
    structureId: structure.id,
    chunkKey: monsterGroup.chunkKey,
    tileKey: monsterGroup.tileKey,
    fromLevel: currentLevel,
    toLevel: currentLevel + 1,
    startedAt: now,
    completesAt: completionTime,
    startedBy: 'monster',
    status: 'pending',
    processed: false
  };
  
  // Update structure to indicate upgrading
  const structurePath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/structure`;
  updates[`${structurePath}/upgradeInProgress`] = true;
  updates[`${structurePath}/upgradeId`] = upgradeId;
  updates[`${structurePath}/upgradeStartedAt`] = now;
  updates[`${structurePath}/upgradeCompletesAt`] = completionTime;
  
  // Consume resources from the structure
  const remainingItems = consumeResources(structureItems, upgradeResourceCosts);
  updates[`${structurePath}/items`] = remainingItems;
  
  // Create a chat message
  const chatMessageId = `monster_upgrade_${now}_${structure.id}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `The ${structure.name || "monster structure"} at (${monsterGroup.tileKey.replace(',', ', ')}) is being upgraded by monsters.`,
    type: 'event',
    timestamp: now,
    location: {
      x: parseInt(monsterGroup.tileKey.split(',')[0]),
      y: parseInt(monsterGroup.tileKey.split(',')[1])
    }
  };
  
  return {
    action: 'upgrade',
    fromLevel: currentLevel,
    toLevel: currentLevel + 1,
    completesAt: completionTime
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
 * Calculate the combat strength of a monster group
 */
function calculateGroupStrength(group) {
  const unitCount = group.unitCount || 1;
  let baseStrength = unitCount;
  
  // Adjust based on monster type
  switch (group.monsterType) {
    case 'troll':
      baseStrength *= 2.5;
      break;
    case 'skeleton':
      baseStrength *= 1.2;
      break;
    case 'elemental':
      baseStrength *= 2.0;
      break;
    case 'wolf':
      baseStrength *= 1.5;
      break;
    case 'goblin':
      baseStrength *= 0.8;
      break;
    default:
      // Keep base strength
      break;
  }
  
  // Adjust for merge count (groups that have merged are stronger)
  const mergeBonus = group.mergeCount ? (group.mergeCount * 0.2) : 0;
  baseStrength *= (1 + mergeBonus);
  
  return baseStrength;
}

/**
 * Monster Group Merging and Enhancement
 * New function to check and merge monster groups
 */
export async function mergeMonsterGroups(worldId) {
  const db = getDatabase();
  const now = Date.now();
  let mergesPerformed = 0;
  const updates = {};
  
  // Get all chunks for this world
  const chunksRef = db.ref(`worlds/${worldId}/chunks`);
  const chunksSnapshot = await chunksRef.once('value');
  const chunks = chunksSnapshot.val();
  
  // Process each chunk
  for (const [chunkKey, chunkData] of Object.entries(chunks)) {
    if (!chunkData || chunkKey === 'lastUpdated') continue;
    
    // Process each tile in the chunk
    for (const [tileKey, tileData] of Object.entries(chunkData)) {
      if (!tileData || tileKey === 'lastUpdated') continue;
      
      // Skip if no groups on this tile
      if (!tileData.groups) continue;
      
      // Find monster groups on this tile
      const monsterGroups = [];
      for (const [groupId, groupData] of Object.entries(tileData.groups)) {
        if ((groupData.type === 'monster' || groupData.monsterType) && 
            groupData.status === 'idle' && !groupData.inBattle) {
          monsterGroups.push({ id: groupId, ...groupData });
        }
      }
      
      // Need at least 2 monster groups to merge
      if (monsterGroups.length < 2) continue;
      
      // Sort monster groups by their type
      const groupsByType = {};
      for (const group of monsterGroups) {
        const type = group.monsterType || 'unknown';
        if (!groupsByType[type]) {
          groupsByType[type] = [];
        }
        groupsByType[type].push(group);
      }
      
      // Process each type
      for (const [monsterType, typeGroups] of Object.entries(groupsByType)) {
        if (typeGroups.length < 2) continue;
        
        // Only merge with 70% chance to avoid always merging
        if (Math.random() > 0.7) continue;
        
        // Sort by unit count (descending)
        typeGroups.sort((a, b) => (b.unitCount || 1) - (a.unitCount || 1));
        
        // Largest group becomes the base
        const baseGroup = typeGroups[0];
        const mergeTargets = typeGroups.slice(1);
        
        // Calculate total unit count
        let totalUnits = baseGroup.unitCount || 1;
        for (const group of mergeTargets) {
          totalUnits += group.unitCount || 1;
        }
        
        // Add bonus units (10-30% bonus)
        const bonusUnits = Math.floor(totalUnits * (0.1 + Math.random() * 0.2));
        totalUnits += bonusUnits;
        
        // Cap at a reasonable size (e.g., 20)
        totalUnits = Math.min(totalUnits, 20);
        
        // Combine items from all groups
        const allItems = [];
        
        // Add items from base group
        if (baseGroup.items) {
          if (Array.isArray(baseGroup.items)) {
            allItems.push(...baseGroup.items);
          } else {
            allItems.push(...Object.values(baseGroup.items));
          }
        }
        
        // Add items from merge targets
        for (const group of mergeTargets) {
          if (group.items) {
            if (Array.isArray(group.items)) {
              allItems.push(...group.items);
            } else {
              allItems.push(...Object.values(group.items));
            }
          }
        }
        
        // Add bonus items
        const bonusItemCount = Math.min(2, Math.ceil(bonusUnits / 3));
        for (let i = 0; i < bonusItemCount; i++) {
          if (Math.random() < 0.8) {
            allItems.push(generateBonusItem(monsterType));
          }
        }
        
        // Update the base group
        const basePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${baseGroup.id}`;
        
        // Determine new name based on size
        let newName;
        if (totalUnits <= 3) {
          newName = `Small ${baseGroup.name}`;
        } else if (totalUnits <= 7) {
          newName = `${baseGroup.name} Pack`;
        } else if (totalUnits <= 12) {
          newName = `${baseGroup.name} Horde`;
        } else {
          newName = `Massive ${baseGroup.name} Legion`;
        }
        
        updates[`${basePath}/unitCount`] = totalUnits;
        updates[`${basePath}/name`] = newName;
        updates[`${basePath}/items`] = allItems;
        updates[`${basePath}/lastUpdated`] = now;
        updates[`${basePath}/mergeCount`] = (baseGroup.mergeCount || 0) + mergeTargets.length;
        updates[`${basePath}/merged`] = true;
        
        // Remove the merged groups
        for (const group of mergeTargets) {
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${group.id}`] = null;
        }
        
        // Add chat message about the merge
        const chatMessageId = `monster_merge_${now}_${baseGroup.id}`;
        const [x, y] = tileKey.split(',').map(Number);
        
        updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
          text: `Monster groups have merged at (${x}, ${y}) forming a ${newName}!`,
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
  }
  
  return { mergesPerformed };
}

/**
 * Generate a bonus item for merged monster groups
 */
function generateBonusItem(monsterType) {
  // Choose rarity with weighted probabilities
  const rarityRoll = Math.random();
  let rarity;
  
  if (rarityRoll > 0.98) {
    rarity = 'epic';
  } else if (rarityRoll > 0.90) {
    rarity = 'rare';
  } else if (rarityRoll > 0.70) {
    rarity = 'uncommon';
  } else {
    rarity = 'common';
  }
  
  // Define possible item types
  const itemTypes = ['resource', 'weapon', 'material', 'gem'];
  const itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
  
  // Define monster type specific items
  const monsterItems = {
    goblin: {
      resource: 'Stolen Goods',
      weapon: 'Crude Weapon',
      material: 'Goblin Hide',
      gem: 'Shiny Rock'
    },
    wolf: {
      resource: 'Wolf Meat',
      weapon: 'Wolf Fang',
      material: 'Wolf Pelt',
      gem: 'Wolf Eye'
    },
    spider: {
      resource: 'Spider Silk',
      weapon: 'Venom Sac',
      material: 'Spider Leg',
      gem: 'Spider Eye'
    },
    skeleton: {
      resource: 'Bone Dust',
      weapon: 'Ancient Blade',
      material: 'Skull Fragment',
      gem: 'Soul Essence'
    },
    troll: {
      resource: 'Troll Meat',
      weapon: 'Troll Club',
      material: 'Troll Hide',
      gem: 'Troll Tooth'
    },
    // Default for unknown types
    default: {
      resource: 'Monster Parts',
      weapon: 'Monster Weapon',
      material: 'Monster Hide',
      gem: 'Unusual Stone'
    }
  };
  
  // Get item based on monster type and item type
  const itemName = monsterItems[monsterType]?.[itemType] || 
                  monsterItems.default[itemType];
  
  // Quantity depends on rarity
  const quantity = rarity === 'common' ? Math.floor(Math.random() * 3) + 1 : 
                  rarity === 'uncommon' ? Math.floor(Math.random() * 2) + 1 : 1;
  
  return {
    id: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: itemName,
    type: itemType,
    rarity,
    quantity
  };
}
