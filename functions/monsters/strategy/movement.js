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
export function calculateSimplePath(startX, startY, endX, endY, maxSteps = 20) {
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

/**
 * Calculate distance between two locations
 */
export function calculateDistance(loc1, loc2) {
  const dx = loc1.x - loc2.x;
  const dy = loc1.y - loc2.y;
  return Math.sqrt(dx*dx + dy*dy);
}

// Constants
const MAX_SCAN_DISTANCE = 20; // How far to scan for targets

/**
 * Move monster group towards a strategic target
 */
export async function moveMonsterTowardsTarget(db, worldId, monsterGroup, location, worldScan, updates, now, targetIntent = null) {
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
export async function findAdjacentStructures(db, worldId, location) {
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
export function moveOneStepTowardsTarget(worldId, monsterGroup, location, targetLocation, targetType, updates, now) {
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
export function moveRandomly(worldId, monsterGroup, location, updates, now) {
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
export function moveToAdjacentTile(worldId, monsterGroup, location, adjacentTile, updates, now, moveReason) {
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
 * Create a descriptive message for monster movement
 */
export function createMonsterMoveMessage(monsterGroup, targetType, targetLocation) {
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
