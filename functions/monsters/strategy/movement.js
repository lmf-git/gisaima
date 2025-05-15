import {
  calculateSimplePath,
  calculateDistance,
  findAdjacentStructures,
  createMonsterMoveMessage,
  isWaterTile,
  canTraverseWater,
  canTraverseLand // Import the new function
} from '../_monsters.mjs';

import { STRUCTURES } from 'gisaima-shared/definitions/STRUCTURES.js';
import { calculateGroupPower } from "gisaima-shared/war/battles.js";

// Re-export imported functions
export { calculateSimplePath, calculateDistance, findAdjacentStructures, createMonsterMoveMessage };

// Constants
const MAX_SCAN_DISTANCE = 35; // How far to scan for targets (increased from 20)

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
 * @param {object} chunks - Optional pre-loaded chunks data
 * @param {object} terrainGenerator - TerrainGenerator instance
 * @returns {object} Action result
 */
export async function moveMonsterTowardsTarget(
  db, worldId, monsterGroup, location, worldScan, updates, now, targetIntent = null, personality = null, chunks = null, terrainGenerator = null
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
    // Pass chunks data to findAdjacentStructures
    const adjacentStructure = await findAdjacentStructures(db, worldId, location, chunks);
    if (adjacentStructure) {
      // Only target non-monster structures (target player structures more aggressively)
      if (adjacentStructure.structure && 
          !adjacentStructure.structure.monster) {
        // If we found an adjacent structure, move to it for potential attack
        return moveOneStepTowardsTarget(worldId, monsterGroup, location, adjacentStructure, 'structure_attack', updates, now, chunks, terrainGenerator);
      }
      // Also target player groups
      if (adjacentStructure.hasPlayerGroups) {
        return moveOneStepTowardsTarget(worldId, monsterGroup, location, adjacentStructure, 'player_group_attack', updates, now, chunks, terrainGenerator);
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
    // Calculate priorities based on personality - pass the monster group for power comparison
    const priorityMap = calculateMovementPriorities(weights, totalUnits, worldScan, inExplorationPhase, monsterGroup);
    
    // Choose a target based on weighted priorities
    const targetChoice = chooseTargetLocation(location, priorityMap);
    if (targetChoice) {
      targetLocation = targetChoice.location;
      targetType = targetChoice.type;
      targetDistance = targetChoice.distance;
    }
  }

  // If no suitable target found or too far, move with purpose instead of randomly
  if (!targetLocation || targetDistance > MAX_SCAN_DISTANCE) {
    // Boost exploration weight for exploration phase
    const exploreWeight = inExplorationPhase ? 2.0 : (weights?.explore || 1.0);
    
    // Always explore with purpose, never truly random
    return moveWithPurpose(worldId, monsterGroup, location, updates, now, chunks, terrainGenerator, personality);
  }

  // Check if target is reachable (not water, or monster can traverse water)
  if (targetLocation && terrainGenerator) {
    // Check if target tile is water and if monster can cross water
    const targetTerrainData = terrainGenerator.getTerrainData(targetLocation.x, targetLocation.y);
    
    // Check if this is a water biome or has high river/lake value
    const isWater = (targetTerrainData.biome && targetTerrainData.biome.water) || 
                   targetTerrainData.riverValue > 0.2 || 
                   targetTerrainData.lakeValue > 0.2;
    
    if (isWater && !canTraverseWater(monsterGroup)) {
      console.log(`Target at (${targetLocation.x},${targetLocation.y}) is water and monster can't traverse it. Finding new target.`);
      
      // Try to find nearby land - search in expanding radius
      const maxSearchRadius = 5;
      let foundLand = false;
      
      // Search in an expanding spiral pattern
      for (let radius = 1; radius <= maxSearchRadius && !foundLand; radius++) {
        for (let dx = -radius; dx <= radius && !foundLand; dx++) {
          for (let dy = -radius; dy <= radius && !foundLand; dy++) {
            // Only check points on the perimeter of the current radius
            if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
              const checkX = targetLocation.x + dx;
              const checkY = targetLocation.y + dy;
              
              // Check terrain at this location
              const checkTerrain = terrainGenerator.getTerrainData(checkX, checkY);
              
              // If this isn't water, use it as the new target
              if ((!checkTerrain.biome || !checkTerrain.biome.water) && 
                  checkTerrain.riverValue <= 0.2 && 
                  checkTerrain.lakeValue <= 0.2) {
                targetLocation = { x: checkX, y: checkY };
                foundLand = true;
                console.log(`Found nearby land at (${checkX}, ${checkY})`);
                break;
              }
            }
          }
        }
      }
      
      // Reset target if no nearby land found
      if (!foundLand) {
        targetLocation = null;
        targetType = null;
        targetDistance = Infinity;
      }
    }
  }
  
  // If target is more than 1 tile away, move only 1 tile in that direction
  if (targetDistance > 1.5) {
    return moveOneStepTowardsTarget(worldId, monsterGroup, location, targetLocation, targetType, updates, now, chunks, terrainGenerator);
  }
  
  // Calculate a path to the target using a randomized step count for more varied monster movement
  const randomMaxSteps = 1 + Math.floor(Math.random() * 3);
  const path = calculateWaterAwarePath(
    location.x, location.y,
    targetLocation.x, targetLocation.y, 
    randomMaxSteps,
    monsterGroup,
    terrainGenerator
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
 * @param {object} monsterGroup - The monster group data for power calculation
 * @returns {object} Priority map for different target types
 */
function calculateMovementPriorities(weights, totalUnits, worldScan, inExplorationPhase = false, monsterGroup = null) {
  // Base priorities
  const priorities = {
    monster_structure: {
      weight: 0.5,
      locations: worldScan.monsterStructures || [],
      maxDistance: MAX_SCAN_DISTANCE * 1.2 // Increased from base distance
    },
    resource_hotspot: {
      weight: 0.5,
      locations: worldScan.resourceHotspots || [],
      maxDistance: MAX_SCAN_DISTANCE
    },
    player_spawn: {
      weight: 1.2,  // Increased base weight for player spawns (was 0.5)
      locations: worldScan.playerSpawns || [],
      maxDistance: MAX_SCAN_DISTANCE * 2.0  // Increased search range for spawns (was 1.5)
    },
    // Add player structures as a specific target category
    player_structure: {
      weight: 1.0,  // Base weight for player structures
      locations: worldScan.playerStructures || [],
      maxDistance: MAX_SCAN_DISTANCE * 1.5  // Increased search range (was 1.2)
    }
  };
  
  // Filter out structures that are too powerful if we have monster group data
  if (monsterGroup) {
    const monsterPower = calculateGroupPower(monsterGroup);
    
    // Filter player spawns and structures by power
    if (priorities.player_spawn.locations.length > 0) {
      priorities.player_spawn.locations = priorities.player_spawn.locations.filter(location => {
        // Check if structure exists and has type info
        if (location.structure && location.structure.type) {
          const structureType = location.structure.type;
          // Get structure power from STRUCTURES definition
          const structurePower = STRUCTURES[structureType]?.durability || 100;
          // Use personality to adjust power threshold
          const powerThreshold = monsterGroup.personality?.id === 'AGGRESSIVE' ? 0.4 : 0.6;
          // Only keep locations where monster power is sufficient
          return monsterPower >= structurePower * powerThreshold;
        }
        return true; // Keep if no structure info available
      });
    }
    
    if (priorities.player_structure.locations.length > 0) {
      priorities.player_structure.locations = priorities.player_structure.locations.filter(location => {
        if (location.structure && location.structure.type) {
          const structureType = location.structure.type;
          const structurePower = STRUCTURES[structureType]?.durability || 100;
          const powerThreshold = monsterGroup.personality?.id === 'AGGRESSIVE' ? 0.4 : 0.6;
          return monsterPower >= structurePower * powerThreshold;
        }
        return true;
      });
    }
  }
  
  // Apply personality modifiers
  if (weights) {
    // Aggressive personality prioritizes player targets including structures
    if (weights.attack > 1.0) {
      priorities.player_spawn.weight *= weights.attack * 2.0;
      priorities.player_structure.weight *= weights.attack * 1.8; // Strong weight for attacking structures
      
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
 * Calculate a path that respects the monster's terrain traversal capabilities
 * @param {number} startX - Starting X coordinate
 * @param {number} startY - Starting Y coordinate
 * @param {number} endX - Target X coordinate
 * @param {number} endY - Target Y coordinate
 * @param {number} maxSteps - Maximum steps
 * @param {object} monsterGroup - Monster group data to check traversal abilities
 * @param {object} terrainGenerator - TerrainGenerator instance
 * @returns {Array} Array of path points
 */
function calculateWaterAwarePath(startX, startY, endX, endY, maxSteps, monsterGroup, terrainGenerator) {
  // If we don't have a terrain generator, use regular path calculation
  if (!terrainGenerator) {
    return calculateSimplePath(startX, startY, endX, endY, maxSteps);
  }
  
  // Determine if this is a water-only monster
  const isWaterOnly = monsterGroup.motion && 
                    monsterGroup.motion.includes('water') && 
                    !canTraverseLand(monsterGroup);
  
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
  
  // Limit path to avoid excessive computation
  let stepsLeft = Math.min(maxSteps, dx + dy);
  
  while ((x !== endX || y !== endY) && stepsLeft > 0) {
    const e2 = 2 * err;
    
    // Calculate potential next X position
    let nextX = x;
    if (e2 > -dy) {
      nextX = x + sx;
    }
    
    // Calculate potential next Y position
    let nextY = y;
    if (e2 < dx) {
      nextY = y + sy;
    }
    
    // Check if next position terrain is compatible with monster's abilities
    if (terrainGenerator) {
      const isWater = isWaterTile(nextX, nextY, terrainGenerator);
      
      // Skip this tile if:
      // 1. It's water and the monster can't traverse water, OR
      // 2. It's land and the monster is water-only
      if ((isWater && !canTraverseWater(monsterGroup)) || 
          (!isWater && isWaterOnly)) {
        break;
      }
    }
    
    // Update position
    if (e2 > -dy) {
      err -= dy;
      x = nextX;
    }
    
    if (e2 < dx) {
      err += dx;
      y = nextY;
    }
    
    // Add current position to path
    path.push({x, y});
    stepsLeft--;
  }
  
  return path;
}

/**
 * Move one step towards a target location
 */
export function moveOneStepTowardsTarget(worldId, monsterGroup, location, targetLocation, targetType, updates, now, chunks, terrainGenerator = null) {
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  const dx = targetLocation.x - location.x;
  const dy = targetLocation.y - location.y;
  
  // Calculate the direction to move (normalize to get a unit vector)
  const length = Math.sqrt(dx * dx + dy * dy);
  const dirX = dx / length;
  const dirY = dy / length;
  
  // Calculate the next position (one tile in the target direction)
  let nextX = location.x + Math.round(dirX);
  let nextY = location.y + Math.round(dirY);
  
  // Check if this is a water-only monster
  const isWaterOnly = monsterGroup.motion && 
                    monsterGroup.motion.includes('water') && 
                    !canTraverseLand(monsterGroup);
  
  // Check if next position's terrain is compatible with monster's abilities
  let isNextPositionWater = false;
  let isValidTerrain = true;
  
  if (terrainGenerator) {
    // Use coordinates instead of tile data
    isNextPositionWater = isWaterTile(nextX, nextY, terrainGenerator);
    
    // Check if the terrain is valid for this monster's motion capabilities
    if ((isNextPositionWater && !canTraverseWater(monsterGroup)) ||
        (!isNextPositionWater && isWaterOnly)) {
      isValidTerrain = false;
    }
  }
  // Fallback to chunk data if no terrain generator
  else if (chunks) {
    const chunkKey = getChunkKey(nextX, nextY);
    const tileKey = `${nextX},${nextY}`;
    
    if (chunks[chunkKey] && chunks[chunkKey][tileKey]) {
      const tileData = chunks[chunkKey][tileKey];
      // Direct check for water property
      isNextPositionWater = tileData.biome?.water === true;
      
      // Check if the terrain is valid for this monster's motion capabilities
      if ((isNextPositionWater && !canTraverseWater(monsterGroup)) ||
          (!isNextPositionWater && isWaterOnly)) {
        isValidTerrain = false;
      }
    }
  }
  
  if (!isValidTerrain) {
    // Try alternative directions based on monster type
    const alternatives = [
      { x: location.x + 1, y: location.y }, // Right
      { x: location.x - 1, y: location.y }, // Left
      { x: location.x, y: location.y + 1 }, // Down
      { x: location.x, y: location.y - 1 }, // Up
      { x: location.x + 1, y: location.y + 1 }, // Diagonal down-right
      { x: location.x + 1, y: location.y - 1 }, // Diagonal up-right
      { x: location.x - 1, y: location.y + 1 }, // Diagonal down-left
      { x: location.x - 1, y: location.y - 1 }  // Diagonal up-left
    ];
    
    // Shuffle alternatives for more natural movement
    alternatives.sort(() => Math.random() - 0.5);
    
    // Find first valid terrain alternative
    let foundAlternative = false;
    for (const alt of alternatives) {
      let isAltWater = false;
      
      // Check using terrain generator if available
      if (terrainGenerator) {
        isAltWater = isWaterTile(alt.x, alt.y, terrainGenerator);
                    
        // For water-only monsters, we WANT water tiles
        // For land-only monsters, we WANT non-water tiles
        if ((isWaterOnly && isAltWater) || (!isWaterOnly && !isAltWater)) {
          nextX = alt.x;
          nextY = alt.y;
          foundAlternative = true;
          break;
        }
      } 
      // Otherwise use chunks data
      else if (chunks) {
        const altChunkKey = getChunkKey(alt.x, alt.y);
        const altTileKey = `${alt.x},${alt.y}`;
        
        if (chunks[altChunkKey] && chunks[altChunkKey][altTileKey]) {
          const altTileData = chunks[altChunkKey][altTileKey];
          // Direct check for water property instead of using isWaterTile function
          isAltWater = altTileData.biome?.water === true;
          
          // For water-only monsters, we WANT water tiles
          // For land-only monsters, we WANT non-water tiles
          if ((isWaterOnly && isAltWater) || (!isWaterOnly && !isAltWater)) {
            nextX = alt.x;
            nextY = alt.y;
            foundAlternative = true;
            break;
          }
        }
      }
    }
    
    // If no alternative found, stay in place
    if (!foundAlternative) {
      console.log(`Monster group ${monsterGroup.id} is blocked by incompatible terrain and can't find an alternative path.`);
      return {
        action: 'idle',
        reason: 'blocked_by_terrain'
      };
    }
  }
  
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
 * Move the monster group with purpose rather than randomly
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - Monster group data
 * @param {object} location - Current location
 * @param {object} updates - Database updates object
 * @param {number} now - Current timestamp
 * @param {object} chunks - Pre-loaded chunks data
 * @param {object} terrainGenerator - TerrainGenerator instance
 * @param {object} personality - Monster personality
 * @returns {object} Action result
 */
export function moveWithPurpose(worldId, monsterGroup, location, updates, now, chunks, terrainGenerator = null, personality = null) {
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  // Check if this is a water-only monster
  const isWaterOnly = monsterGroup.motion && 
                    monsterGroup.motion.includes('water') && 
                    !canTraverseLand(monsterGroup);
  
  // Get personality traits if available
  const personalityId = personality?.id || 'BALANCED';
  
  // Choose a purposeful direction based on personality and context
  let targetX, targetY;
  let purposeType = 'exploration'; // Default purpose
  
  // Define exploration distance based on personality
  const exploreDistance = personality?.id === 'NOMADIC' ? 5 : 
                         personality?.id === 'CAUTIOUS' ? 2 : 3;
  
  // Check for terrain features in chunks first to find interesting landmarks
  const landmarkTarget = findInterestingLandmark(location, chunks, terrainGenerator, exploreDistance, monsterGroup);
  
  if (landmarkTarget) {
    // Found a landmark to explore
    targetX = landmarkTarget.x;
    targetY = landmarkTarget.y;
    purposeType = landmarkTarget.type;
  }
  // If no landmark, choose directional exploration
  else {
    // Choose directional preference based on personality
    const direction = chooseDirectionalPreference(personalityId, monsterGroup);
    
    // Apply direction with some randomness
    targetX = location.x + (direction.x * exploreDistance) + (Math.floor(Math.random() * 3) - 1);
    targetY = location.y + (direction.y * exploreDistance) + (Math.floor(Math.random() * 3) - 1);
    
    // Make sure we're not moving to our current location
    if (targetX === location.x && targetY === location.y) {
      targetX += (Math.random() > 0.5) ? 1 : -1;
    }
  }
  
  // Ensure target location is compatible with monster's movement capabilities
  const targetLocation = ensureCompatibleTerrain({x: targetX, y: targetY}, monsterGroup, chunks, terrainGenerator);
  targetX = targetLocation.x;
  targetY = targetLocation.y;
  
  // Calculate a water-aware path to the target
  const randomMaxSteps = 1 + Math.floor(Math.random() * 3);
  const path = calculateWaterAwarePath(
    location.x, location.y,
    targetX, targetY,
    randomMaxSteps,
    monsterGroup,
    terrainGenerator
  );
  
  // Adjust movement speed based on purpose and personality
  let moveSpeed = 1.0; // Default speed
  
  if (personality?.id === 'NOMADIC') moveSpeed = 1.2; // Nomadic monsters move faster
  else if (personality?.id === 'CAUTIOUS') moveSpeed = 0.8; // Cautious monsters move slower
  
  // Consolidate movement updates
  const movementUpdates = {
    status: 'moving',
    movementPath: path,
    pathIndex: 0,
    moveStarted: now,
    moveSpeed: moveSpeed,
    targetX: targetX,
    targetY: targetY,
    nextMoveTime: now + 60000
  };
  
  // Set the entire updated group at once
  updates[`${groupPath}`] = {
    ...monsterGroup, // Keep existing group properties
    ...movementUpdates // Apply movement updates
  };
  
  // Only add chat messages for significant movements
  if (purposeType !== 'exploration' || Math.random() < 0.3) {
    const chatMessageId = `monster_move_${now}_${monsterGroup.id}`;
    const chatMessage = createPurposefulMoveMessage(monsterGroup, purposeType, {x: targetX, y: targetY});
    
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
      type: purposeType,
      x: targetX,
      y: targetY,
      distance: Math.sqrt(Math.pow(targetX - location.x, 2) + Math.pow(targetY - location.y, 2))
    }
  };
}

/**
 * Choose a directional preference based on personality
 * @param {string} personalityId - Monster personality ID
 * @param {object} monsterGroup - Monster group data
 * @returns {object} Direction vector {x, y}
 */
function chooseDirectionalPreference(personalityId, monsterGroup) {
  // Base directions
  const directions = [
    {x: 1, y: 0},  // East
    {x: -1, y: 0}, // West
    {x: 0, y: 1},  // South
    {x: 0, y: -1}, // North
    {x: 1, y: 1},  // Southeast
    {x: 1, y: -1}, // Northeast
    {x: -1, y: 1}, // Southwest
    {x: -1, y: -1} // Northwest
  ];
  
  // Use consistent preferred direction if monster has one
  if (!monsterGroup.preferredDirection) {
    // First time choosing direction - set persistent preferred direction
    const dirIndex = Math.floor(Math.random() * directions.length);
    monsterGroup.preferredDirection = directions[dirIndex];
  }
  
  // For nomadic monsters, they tend to follow their preferred direction more consistently
  if (personalityId === 'NOMADIC') {
    if (Math.random() < 0.7) {
      return monsterGroup.preferredDirection;
    }
  }
  
  // Territorial monsters tend to circle around their spawn location
  if (personalityId === 'TERRITORIAL') {
    // Rotate around origin point if they're exploring
    if (monsterGroup.mobilizedFromStructure) {
      // Pseudo-random but consistent circular movement
      const angle = (Date.now() % 1000) / 1000 * 2 * Math.PI;
      return {
        x: Math.cos(angle),
        y: Math.sin(angle)
      };
    }
  }
  
  // For aggressive monsters, bias toward world center if they exist
  if (personalityId === 'AGGRESSIVE') {
    if (Math.random() < 0.4) {
      const worldCenter = {x: 0, y: 0}; // Assume 0,0 is center
      return {
        x: worldCenter.x > monsterGroup.x ? 1 : -1,
        y: worldCenter.y > monsterGroup.y ? 1 : -1
      };
    }
  }
  
  // FERAL monsters make sudden direction changes
  if (personalityId === 'FERAL') {
    if (Math.random() < 0.6) {
      const dirIndex = Math.floor(Math.random() * directions.length);
      return directions[dirIndex];
    }
  }
  
  // For other personalities or fallback, use a similar direction
  // to their preferred with some small variation
  const variation = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
  let dirIndex = directions.findIndex(d => 
    d.x === monsterGroup.preferredDirection.x && 
    d.y === monsterGroup.preferredDirection.y
  );
  
  // Shift index with wrap-around
  dirIndex = (dirIndex + variation) % directions.length;
  if (dirIndex < 0) dirIndex += directions.length;
  
  return directions[dirIndex];
}

/**
 * Find interesting landmarks or features in the area for purposeful exploration
 * @param {object} location - Current location
 * @param {object} chunks - Pre-loaded chunks data
 * @param {object} terrainGenerator - TerrainGenerator instance
 * @param {number} searchRadius - Radius to search
 * @param {object} monsterGroup - Monster group data
 * @returns {object|null} Location of interest or null if none found
 */
function findInterestingLandmark(location, chunks, terrainGenerator, searchRadius, monsterGroup) {
  if (!chunks) return null;
  
  // Increase the exploration landmark search radius by 50%
  const enhancedSearchRadius = Math.floor(searchRadius * 1.5);
  
  const interestingFeatures = [];
  
  // Search nearby chunks for interesting features - using enhanced radius
  for (let dx = -enhancedSearchRadius; dx <= enhancedSearchRadius; dx++) {
    for (let dy = -enhancedSearchRadius; dy <= enhancedSearchRadius; dy++) {
      const checkX = location.x + dx;
      const checkY = location.y + dy;
      
      // Skip checking current location
      if (dx === 0 && dy === 0) continue;
      
      const chunkKey = getChunkKey(checkX, checkY);
      const tileKey = `${checkX},${checkY}`;
      
      if (chunks[chunkKey] && chunks[chunkKey][tileKey]) {
        const tileData = chunks[chunkKey][tileKey];
        
        // Calculate interest score for this tile
        let interestScore = 0;
        let featureType = 'exploration';
        
        // Resources are very interesting
        if (tileData.resources && Object.keys(tileData.resources).length > 0) {
          interestScore += 5;
          featureType = 'resources';
        }
        
        // Biome transitions are interesting
        if (tileData.biome && tileData.biome.name && 
            location.x && location.y &&
            chunks[getChunkKey(location.x, location.y)] && 
            chunks[getChunkKey(location.x, location.y)][`${location.x},${location.y}`] &&
            chunks[getChunkKey(location.x, location.y)][`${location.x},${location.y}`].biome &&
            tileData.biome.name !== chunks[getChunkKey(location.x, location.y)][`${location.x},${location.y}`].biome.name) {
          interestScore += 3;
          featureType = 'biome_transition';
        }
        
        // Water features are interesting for water monsters, less so for land-only
        const isWater = isWaterTile(checkX, checkY, terrainGenerator);
        
        if (isWater) {
          if (canTraverseWater(monsterGroup)) {
            interestScore += 4;
            featureType = 'water_feature';
          } else {
            // Land-only monsters will avoid water, but might be curious from a distance
            interestScore += 1;
            featureType = 'water_edge';
          }
        }
        
        // Distance penalty - closer landmarks are more interesting
        const distance = Math.sqrt(dx*dx + dy*dy);
        interestScore -= distance * 0.5;
        
        // Add if sufficiently interesting
        if (interestScore > 0) {
          interestingFeatures.push({
            x: checkX,
            y: checkY,
            score: interestScore,
            type: featureType,
            distance: distance
          });
        }
      }
    }
  }
  
  // Sort by interest score and pick the most interesting
  if (interestingFeatures.length > 0) {
    interestingFeatures.sort((a, b) => b.score - a.score);
    return interestingFeatures[0];
  }
  
  return null;
}

/**
 * Check if a location is water using terrain generator
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {object} terrainGenerator - TerrainGenerator instance
 * @returns {boolean} True if the location is water
 */
function isWaterFromTerrainGenerator(x, y, terrainGenerator) {
  if (!terrainGenerator) return false;
  return isWaterTile(x, y, terrainGenerator);
}

/**
 * Ensure target location is compatible with monster's movement capabilities
 */
function ensureCompatibleTerrain(targetLocation, monsterGroup, chunks, terrainGenerator) {
  const isWaterOnly = monsterGroup.motion && 
                    monsterGroup.motion.includes('water') && 
                    !canTraverseLand(monsterGroup);
  
  // Check if target location is water
  let isTargetWater = false;
  
  if (terrainGenerator) {
    // Use the updated isWaterTile function
    isTargetWater = isWaterTile(targetLocation.x, targetLocation.y, terrainGenerator);
  } else if (chunks) {
    // Fallback for when terrainGenerator isn't available
    const chunkKey = getChunkKey(targetLocation.x, targetLocation.y);
    const tileKey = `${targetLocation.x},${targetLocation.y}`;
    
    if (chunks[chunkKey] && chunks[chunkKey][tileKey]) {
      const tileData = chunks[chunkKey][tileKey];
      // Direct check for water property on biome
      isTargetWater = tileData.biome?.water === true;
    }
  }
  
  // If terrain is incompatible, find a suitable nearby location
  if ((isWaterOnly && !isTargetWater) || (!canTraverseWater(monsterGroup) && isTargetWater)) {
    // Search in a spiral pattern for compatible terrain
    const searchRadius = 5;
    
    for (let radius = 1; radius <= searchRadius; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          // Only check points on the perimeter of current radius
          if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
            const checkX = targetLocation.x + dx;
            const checkY = targetLocation.y + dy;
            let isWater = false;
            
            // Check terrain at this location
            if (terrainGenerator) {
              isWater = isWaterTile(checkX, checkY, terrainGenerator);
            } else if (chunks) {
              const checkChunkKey = getChunkKey(checkX, checkY);
              const checkTileKey = `${checkX},${checkY}`;
              
              if (chunks[checkChunkKey] && chunks[checkChunkKey][checkTileKey]) {
                const checkTileData = chunks[checkChunkKey][checkTileKey];
                // Direct check for water property
                isWater = checkTileData.biome?.water === true;
              }
            }
            
            // Return this location if terrain is compatible
            if ((isWaterOnly && isWater) || (!isWaterOnly && (!isWater || canTraverseWater(monsterGroup)))) {
              return { x: checkX, y: checkY };
            }
          }
        }
      }
    }
  }
  
  // If no compatible terrain found, return original target
  return targetLocation;
}

/**
 * Create a message about purposeful monster movement
 * @param {object} monsterGroup - Monster group data
 * @param {string} purposeType - Type of movement purpose
 * @param {object} targetLocation - Target location
 * @returns {string} Formatted message
 */
function createPurposefulMoveMessage(monsterGroup, purposeType, targetLocation) {
  const groupName = monsterGroup.name || "Monster group";
  const personalityEmoji = monsterGroup.personality?.emoji ? `${monsterGroup.personality.emoji} ` : '';
  
  switch (purposeType) {
    case 'resources':
      return `${personalityEmoji}${groupName} is investigating resources at (${targetLocation.x}, ${targetLocation.y}).`;
    case 'water_feature':
      return `${personalityEmoji}${groupName} is heading toward water at (${targetLocation.x}, ${targetLocation.y}).`;
    case 'biome_transition':
      return `${personalityEmoji}${groupName} is exploring new terrain at (${targetLocation.x}, ${targetLocation.y}).`;
    case 'water_edge':
      return `${personalityEmoji}${groupName} is scouting near the water's edge at (${targetLocation.x}, ${targetLocation.y}).`;
    default:
      return `${personalityEmoji}${groupName} is exploring the area around (${targetLocation.x}, ${targetLocation.y}).`;
  }
}

// Helper function to get chunk key from coordinates
function getChunkKey(x, y) {
  const chunkX = Math.floor(x / 20);
  const chunkY = Math.floor(y / 20);
  return `${chunkX},${chunkY}`;
}
