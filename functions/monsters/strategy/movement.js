import {
  calculateSimplePath,
  calculateDistance,
  findAdjacentStructures,
  createMonsterMoveMessage,
  EXPLORATION_TICKS
} from '../_monsters.mjs';

// Re-export imported functions
export { calculateSimplePath, calculateDistance, findAdjacentStructures, createMonsterMoveMessage };

// Constants
const MAX_SCAN_DISTANCE = 20; // How far to scan for targets

/**
 * Move monster group towards a strategic target
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - The monster group data
 * @param {object} location - Current location coordinates
 * @param {object} worldScan - World scan data with strategic locations
 * @param {object} updates - Database updates object
 * @param {number} now - Current timestamp
 * @param {string} targetIntent - Optional intent of movement
 * @param {object} personality - Optional personality data
 * @returns {object} Action result
 */
export async function moveMonsterTowardsTarget(
  db, worldId, monsterGroup, location, worldScan, updates, now, targetIntent = null, personality = null
) {
  const totalUnits = monsterGroup.units ? Object.keys(monsterGroup.units).length : 1;
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  // Get personality weights or use defaults
  const weights = personality?.weights || { explore: 1.0, attack: 1.0 };
  
  let targetLocation;
  let targetType;
  let targetDistance = Infinity;

  // Check if monster is in exploration phase using tick counting
  const inExplorationPhase = monsterGroup.explorationPhase && 
                           (monsterGroup.explorationTicks && monsterGroup.explorationTicks > 0);
  
  // Decrement exploration ticks if in exploration phase
  if (inExplorationPhase) {
    updates[`${groupPath}/explorationTicks`] = (monsterGroup.explorationTicks || 1) - 1;
    
    // If this is the last exploration tick, clear the phase
    if (monsterGroup.explorationTicks <= 1) {
      updates[`${groupPath}/explorationPhase`] = false;
      updates[`${groupPath}/explorationTicks`] = null;
    }
  }
  
  // First priority: Check for targetStructure (for monsters specifically mobilized to attack)
  if (monsterGroup.targetStructure && !targetLocation) {
    targetLocation = monsterGroup.targetStructure;
    targetType = 'player_structure_attack';
    targetDistance = calculateDistance(location, targetLocation);
    console.log(`Monster group ${monsterGroup.id} targeting player structure at (${targetLocation.x}, ${targetLocation.y})`);
  }
  
  // Check if monster was recently mobilized and is in exploration phase
  if (inExplorationPhase && monsterGroup.mobilizedFromStructure) {
    const sourceStructure = worldScan.monsterStructures.find(s => 
      s.structure && s.structure.id === monsterGroup.mobilizedFromStructure);
      
    if (sourceStructure) {
      // Move away from source structure - prioritize player spawns
      if (worldScan.playerSpawns && worldScan.playerSpawns.length > 0) {
        // Sort player spawns by distance (closest first)
        const sortedSpawns = [...worldScan.playerSpawns].sort((a, b) => {
          const distA = calculateDistance(location, a);
          const distB = calculateDistance(location, b);
          return distA - distB;
        });
        
        // Pick one of the closest three, with preference to closer ones
        const targetIndex = Math.floor(Math.random() * Math.min(3, sortedSpawns.length));
        const targetSpawn = sortedSpawns[targetIndex];
        
        targetLocation = targetSpawn;
        targetType = 'player_spawn';
        targetDistance = calculateDistance(location, targetSpawn);
        
        // Log that we found a player spawn target during exploration phase
        console.log(`Monster in exploration phase targeting player spawn at (${targetSpawn.x}, ${targetSpawn.y})`);
      }
      // If no player spawns, fall through to other target options
    }
  }
  
  // First priority: Check if there are any structures on adjacent tiles to attack
  // Influenced by attack weight - but only if not in exploration phase
  const adjacentCheckChance = weights.attack || 1.0;
  if (!targetLocation && Math.random() < adjacentCheckChance) {
    const adjacentStructure = await findAdjacentStructures(db, worldId, location);
    if (adjacentStructure) {
      // Only target non-monster structures (target player structures more aggressively)
      if (adjacentStructure.structure && 
          (!adjacentStructure.structure.monster && 
           adjacentStructure.structure.owner !== 'monster')) {
        // If we found an adjacent structure, move to it for potential attack
        return moveToAdjacentTile(worldId, monsterGroup, location, adjacentStructure, updates, now, 'structure_attack');
      }
      // Also target player groups
      if (adjacentStructure.hasPlayerGroups) {
        return moveToAdjacentTile(worldId, monsterGroup, location, adjacentStructure, updates, now, 'structure_attack');
      }
    }
  }
  
  // If this monster group has a preferredStructureId (their "home"), prioritize it
  // But SKIP this if the monster is in exploration phase
  const homePreferenceWeight = personality?.id === 'TERRITORIAL' ? 2.0 : 1.0;
  if (!targetLocation && 
      !inExplorationPhase &&
      monsterGroup.preferredStructureId && 
      Math.random() < homePreferenceWeight) {
    // Try to find the preferred structure
    const preferredStructure = worldScan.monsterStructures.find(s => 
      s.structure && s.structure.id === monsterGroup.preferredStructureId);
      
    if (preferredStructure) {
      targetLocation = preferredStructure;
      targetType = 'monster_home';
      targetDistance = calculateDistance(location, preferredStructure);
    }
  }
  
  // Modified target selection based on personality and exploration phase
  if (!targetLocation || targetDistance > MAX_SCAN_DISTANCE) {
    // Calculate priorities based on personality
    const priorityMap = calculateMovementPriorities(weights, totalUnits, worldScan, inExplorationPhase);
    
    // Choose a target based on weighted priorities
    const targetChoice = chooseTargetLocation(location, priorityMap);
    if (targetChoice) {
      targetLocation = targetChoice.location;
      targetType = targetChoice.type;
      targetDistance = targetChoice.distance;
    }
  }

  // If no suitable target found or too far, move randomly with exploration weight
  if (!targetLocation || targetDistance > MAX_SCAN_DISTANCE) {
    // Boost exploration weight for exploration phase
    const exploreWeight = inExplorationPhase ? 2.0 : (weights.explore || 1.0);
    if (Math.random() < exploreWeight) {
      return moveRandomly(worldId, monsterGroup, location, updates, now);
    } else {
      // Some personalities might prefer to stay put rather than wander randomly
      return { action: 'idle', reason: 'no_suitable_target' };
    }
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
  
  // Movement speed can depend on personality
  let moveSpeed = personality?.id === 'NOMADIC' ? 1.3 : 
                 personality?.id === 'CAUTIOUS' ? 0.8 : 1;
                 
  // Boost speed in exploration phase
  if (inExplorationPhase) {
    moveSpeed *= 1.2;
  }
  
  // Instead of setting individual properties, create a movement update object
  // and set it all at once to avoid parent/child conflicts
  const movementUpdates = {
    status: 'moving',
    movementPath: path,
    pathIndex: 0,
    moveStarted: now,
    moveSpeed: moveSpeed,
    targetX: targetLocation.x,
    targetY: targetLocation.y,
    nextMoveTime: now + 60000 // One minute
  };
  
  // Set the entire movement data object at once
  updates[`${groupPath}`] = {
    ...monsterGroup,  // Keep existing group properties
    ...movementUpdates // Apply movement updates
  };
  
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
 * Calculate movement priorities based on personality and state
 * @param {object} weights - Personality weights
 * @param {number} totalUnits - Total unit count
 * @param {object} worldScan - World scan data
 * @param {boolean} inExplorationPhase - Whether the monster is in exploration phase
 * @returns {object} Priority map for different target types
 */
function calculateMovementPriorities(weights, totalUnits, worldScan, inExplorationPhase = false) {
  // Base priorities
  const priorities = {
    monster_structure: {
      weight: 0.5,
      locations: worldScan.monsterStructures || [],
      maxDistance: MAX_SCAN_DISTANCE
    },
    resource_hotspot: {
      weight: 0.5,
      locations: worldScan.resourceHotspots || [],
      maxDistance: MAX_SCAN_DISTANCE
    },
    player_spawn: {
      weight: 1.2,  // Increased base weight for player spawns (was 0.5)
      locations: worldScan.playerSpawns || [],
      maxDistance: MAX_SCAN_DISTANCE * 1.5  // Increased search range for spawns
    }
  };
  
  // Apply personality modifiers
  if (weights) {
    // Aggressive personality prioritizes player targets
    if (weights.attack > 1.0) {
      priorities.player_spawn.weight *= weights.attack * 2.0; // Increased multiplier (was 1.5)
      
      // ADDED: Extra weight for aggressive monsters with sufficient units
      if (weights.attack > 1.5 && totalUnits > 8) {
        priorities.player_spawn.weight *= 1.5; // Make spawns even more attractive targets
      }
    }
    
    // Resource-focused personalities prioritize resource hotspots
    if (weights.gather > 1.0) {
      priorities.resource_hotspot.weight *= weights.gather;
    }
    
    // Builder personalities prioritize monster structures
    if (weights.build > 1.0) {
      priorities.monster_structure.weight *= weights.build;
    }
  }
  
  // Unit count adjustments - large groups tend to be more aggressive
  if (totalUnits > 10) {
    priorities.player_spawn.weight *= 2.0; // Increased multiplier (was 1.5)
  } else if (totalUnits < 5) {
    priorities.resource_hotspot.weight *= 1.3;
  }
  
  // Exploration phase adjustments - prioritize player structures
  if (inExplorationPhase) {
    priorities.player_spawn.weight *= 4.0;  // Even stronger preference for finding players (was 3.0)
    priorities.resource_hotspot.weight *= 0.8;  // Reduced interest in resources during exploration
    priorities.monster_structure.weight *= 0.1;  // Actively avoid monster structures
  }
  
  return priorities;
}

/**
 * Choose a target location based on weighted priorities
 * @param {object} currentLocation - Current location
 * @param {object} priorityMap - Map of priorities for different target types
 * @returns {object|null} Chosen target or null if none found
 */
function chooseTargetLocation(currentLocation, priorityMap) {
  // Compile all possible targets with their weights
  const allTargets = [];
  
  // Process each priority category
  for (const [type, data] of Object.entries(priorityMap)) {
    for (const location of data.locations) {
      const distance = calculateDistance(currentLocation, location);
      if (distance < data.maxDistance) {
        // Closer locations get higher weight
        const distanceFactor = 1 - (distance / data.maxDistance);
        const weight = data.weight * distanceFactor;
        
        allTargets.push({
          type,
          location,
          distance,
          weight
        });
      }
    }
  }
  
  // If no targets, return null
  if (allTargets.length === 0) return null;
  
  // Select target using weighted random selection
  const totalWeight = allTargets.reduce((sum, target) => sum + target.weight, 0);
  let randomValue = Math.random() * totalWeight;
  
  for (const target of allTargets) {
    randomValue -= target.weight;
    if (randomValue <= 0) {
      return target;
    }
  }
  
  // Fallback to first target if something went wrong with the weighted selection
  return allTargets[0];
}

/**
 * Move a territorial monster back to its territory
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - Monster group data
 * @param {object} location - Current location
 * @param {object} territoryCenter - Center of territory
 * @param {object} updates - Database updates object
 * @param {number} now - Current timestamp
 * @returns {object} Action result
 */
function moveToTerritory(worldId, monsterGroup, location, territoryCenter, updates, now) {
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  // Create a path back to territory with slightly increased speed
  const path = calculateSimplePath(
    location.x, location.y,
    territoryCenter.x, territoryCenter.y,
    3 // Allow up to 3 steps to get back faster
  );
  
  // Set the movement data with faster speed to return to territory
  updates[`${groupPath}/status`] = 'moving';
  updates[`${groupPath}/movementPath`] = path;
  updates[`${groupPath}/pathIndex`] = 0;
  updates[`${groupPath}/moveStarted`] = now;
  updates[`${groupPath}/moveSpeed`] = 1.2; // Move faster to return to territory
  updates[`${groupPath}/targetX`] = territoryCenter.x;
  updates[`${groupPath}/targetY`] = territoryCenter.y;
  updates[`${groupPath}/nextMoveTime`] = now + 50000; // Slightly faster (50s)
  
  // Add chat message about returning to territory
  const chatMessageId = `monster_return_${now}_${monsterGroup.id}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `The territorial ${monsterGroup.name || 'monsters'} are returning to their domain at (${territoryCenter.x}, ${territoryCenter.y}).`,
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
      type: 'territory_return',
      x: territoryCenter.x,
      y: territoryCenter.y,
      distance: calculateDistance(location, territoryCenter)
    }
  };
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
  
  // Consolidate all updates into one object
  const movementUpdates = {
    status: 'moving',
    movementPath: path,
    pathIndex: 0,
    moveStarted: now,
    moveSpeed: 1,
    targetX: targetLocation.x,
    targetY: targetLocation.y,
    nextMoveTime: now + 60000 // One minute
  };
  
  // Set the entire updated group at once
  updates[`${groupPath}`] = {
    ...monsterGroup,  // Keep existing group properties
    ...movementUpdates // Apply movement updates
  };
  
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
  
  // Consolidate movement updates
  const movementUpdates = {
    status: 'moving',
    movementPath: path,
    pathIndex: 0,
    moveStarted: now,
    moveSpeed: 1,
    targetX: targetX,
    targetY: targetY,
    nextMoveTime: now + 60000
  };
  
  // Set the entire updated group at once
  updates[`${groupPath}`] = {
    ...monsterGroup, // Keep existing group properties
    ...movementUpdates // Apply movement updates
  };
  
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
  
  // Consolidate movement updates
  const movementUpdates = {
    status: 'moving',
    movementPath: path,
    pathIndex: 0,
    moveStarted: now,
    moveSpeed: 1.5, // Slightly faster for attack moves
    targetX: adjacentTile.x,
    targetY: adjacentTile.y,
    nextMoveTime: now + 45000, // 45 seconds - faster for adjacent moves
    moveReason: moveReason
  };
  
  // Set the entire updated group at once
  updates[`${groupPath}`] = {
    ...monsterGroup, // Keep existing group properties
    ...movementUpdates // Apply movement updates
  };
  
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
