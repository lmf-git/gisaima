import {
  calculateSimplePath,
  calculateDistance,
  findAdjacentStructures,
  createMonsterMoveMessage,
  isWaterTile,
  canTraverseWater,
  canTraverseLand // Import the new function
} from '../_monsters.mjs';

import { joinExistingBattle } from '../strategy/combat.mjs';

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
  // SAFETY CHECK: Only move monsters that are idle or can be moved
  if (monsterGroup.status !== 'idle') {
    console.log(`Cannot move monster group ${monsterGroup.id} with status: ${monsterGroup.status}. Movement requires idle status.`);
    return {
      action: 'none',
      reason: `monster_busy_${monsterGroup.status}`
    };
  }

  const totalUnits = monsterGroup.units ? Object.keys(monsterGroup.units).length : 1;
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  // NEW: Check if this monster is already set to another status in the updates object
  const statusPath = `${groupPath}/status`;
  if (updates[statusPath] && updates[statusPath] !== 'idle') {
    console.log(`Skipping movement for monster group ${monsterGroup.id} as it's already assigned status: ${updates[statusPath]}`);
    return { action: null, reason: 'already_committed' };
  }
  
  // NEW: Check for battles on the current tile - get from chunks to have latest data
  const tileKey = `${location.x},${location.y}`;
  const chunkKey = monsterGroup.chunkKey;
  
  // Check both chunks data and updates object for battles
  let hasBattles = false;
  
  // Check chunks data for existing battles
  if (chunks && chunks[chunkKey] && chunks[chunkKey][tileKey] && 
      chunks[chunkKey][tileKey].battles && 
      Object.keys(chunks[chunkKey][tileKey].battles).length > 0) {
    hasBattles = true;
  }
  
  // Check updates object for newly created battles on this tile
  for (const updatePath in updates) {
    if (updatePath.includes(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/`)) {
      hasBattles = true;
      break;
    }
  }
  
  // Check if monster is in exploration phase using tick counting
  const inExplorationPhase = monsterGroup.explorationPhase && 
                           (monsterGroup.explorationTicks && monsterGroup.explorationTicks > 0);
  
  // If there are battles, 75% chance to join instead of moving (unless we're in exploration phase)
  if (hasBattles && !inExplorationPhase && Math.random() < 0.75) {
    console.log(`Monster group ${monsterGroup.id} will try to join battle instead of moving.`);
    
    if (chunks && chunks[chunkKey] && chunks[chunkKey][tileKey]) {
      return await joinExistingBattle(db, worldId, monsterGroup, chunks[chunkKey][tileKey], updates, now);
    }
  }
  
  // Get personality weights or use defaults
  const weights = personality?.weights || { explore: 1.0, attack: 1.0 };
  
  let targetLocation;
  let targetType;
  let targetDistance = Infinity;

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

  // If no suitable target found or too far, choose a random direction with purpose
  if (!targetLocation || targetDistance > MAX_SCAN_DISTANCE) {
    // Choose a direction with some randomness but influenced by personality
    let dirX = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
    let dirY = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
    
    // Adjust by personality if available
    if (personality?.id) {
      // Nomadic monsters tend to move in straighter lines
      if (personality.id === 'NOMADIC') {
        if (Math.random() < 0.7) { // 70% chance for straight movement
          // Ensure we're moving in at least one direction
          if (dirX === 0 && dirY === 0) {
            dirX = Math.random() < 0.5 ? 1 : -1;
          }
          // Make movement more linear
          if (Math.random() < 0.6) {
            if (Math.abs(dirX) > Math.abs(dirY)) {
              dirY = 0;
            } else {
              dirX = 0;
            }
          }
        }
      }
      // Territorial monsters tend to move in small circles
      else if (personality.id === 'TERRITORIAL') {
        // Use a circular pattern
        const angle = Math.random() * 2 * Math.PI;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
      }
      // Aggressive monsters tend to move more toward center
      else if (personality.id === 'AGGRESSIVE') {
        if (Math.random() < 0.4) { // 40% bias toward center
          dirX = location.x > 0 ? -1 : 1;
          dirY = location.y > 0 ? -1 : 1;
        }
      }
    }
    
    // Scale movement distance by personality
    const explorationDistance = personality?.id === 'NOMADIC' ? 5 : 
                           personality?.id === 'CAUTIOUS' ? 2 : 3;
    
    targetLocation = {
      x: location.x + Math.round(dirX * explorationDistance),
      y: location.y + Math.round(dirY * explorationDistance)
    };
    targetType = 'exploration';
    targetDistance = calculateDistance(location, targetLocation);
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
  
  // Check if path was blocked by terrain
  if (wasPathBlockedByTerrain(path)) {
    const blockedAt = getPathBlockedCoordinates(path);
    console.log(`Monster path to ${targetType} was blocked by terrain at (${blockedAt.x}, ${blockedAt.y})`);
    
    // Consider finding an alternative target if this one is unreachable
    if (path.length <= 1) {
      console.log(`Cannot make progress to target, finding alternative...`);
      
      // Choose a different random direction
      const randomDirX = Math.floor(Math.random() * 3) - 1;
      const randomDirY = Math.floor(Math.random() * 3) - 1;
      const explorationDistance = personality?.id === 'NOMADIC' ? 4 : 2;
      
      // Create new target location
      targetLocation = {
        x: location.x + randomDirX * explorationDistance,
        y: location.y + randomDirY * explorationDistance
      };
      targetType = 'exploration';
      
      // Try again with new target
      return moveOneStepTowardsTarget(worldId, monsterGroup, location, targetLocation, targetType, updates, now, chunks, terrainGenerator);
    }
    
    // Otherwise continue with the partial path we have
  }
  
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
  
  // IMPROVED: Filter out structures that are too powerful if we have monster group data
  // Now excludes structures completely instead of just giving them lower weight
  if (monsterGroup) {
    const monsterPower = calculateGroupPower(monsterGroup);
    const personalityId = monsterGroup.personality?.id || 'BALANCED';
    
    // Filter player spawns and structures by power
    if (priorities.player_spawn.locations.length > 0) {
      priorities.player_spawn.locations = priorities.player_spawn.locations.filter(location => {
        // Check if structure exists and has type info
        if (location.structure && location.structure.type) {
          const structureType = location.structure.type;
          // Get structure power from STRUCTURES definition
          const structurePower = STRUCTURES[structureType]?.durability || 100;
          // Use personality to adjust power threshold
          const powerThreshold = personalityId === 'AGGRESSIVE' ? 0.4 : 
                               personalityId === 'FERAL' ? 0.05 : 0.6;
          
          // NEW: For aggressive/feral monsters with very low power,
          // let them head toward targets they'll merge near instead of attacking directly
          if (personalityId === 'AGGRESSIVE' || personalityId === 'FERAL') {
            // If very weak, allow targeting to find merge opportunities
            if (monsterPower < 20 && Math.random() < 0.5) {
              return true;
            }
          }
          
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
          const powerThreshold = personalityId === 'AGGRESSIVE' ? 0.4 : 
                               personalityId === 'FERAL' ? 0.05 : 0.6;
          
          // NEW: For aggressive monsters with very low power,
          // let them occasionally target structures for merging opportunities
          if (personalityId === 'AGGRESSIVE' || personalityId === 'FERAL') {
            if (monsterPower < 20 && Math.random() < 0.3) {
              return true;
            }
          }
          
          return monsterPower >= structurePower * powerThreshold;
        }
        return true;
      });
    }
    
    // NEW: If monster is too weak, look for other monster groups to merge with
    if ((personalityId === 'AGGRESSIVE' || personalityId === 'FERAL') && 
        monsterPower < 40) {
      // Add a special category for finding other monster groups to merge with
      priorities.monster_groups = {
        weight: 1.8, // High weight for finding merge opportunities
        locations: worldScan.monsterGroups || [],
        maxDistance: MAX_SCAN_DISTANCE * 1.5
      };
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
  
  // NEW: Check for same start and end position to prevent NaN values
  if (startX === endX && startY === endY) {
    return [{x: startX, y: startY}];
  }
  
  // Create path array with starting point
  const path = [{x: startX, y: startY}];
  
  // If start and end are the same, return just the start point
  if (startX === endX && startY === endY) {
    return path;
  }
  
  // Add definition for isWaterOnly - check if monster can only traverse water
  const isWaterOnly = monsterGroup.motion && 
                    monsterGroup.motion.includes('water') && 
                    !canTraverseLand(monsterGroup);
  
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
        // Instead of just breaking, log the reason and include a flag in the path
        console.log(`Path for monster group terminated at (${x},${y}) due to incompatible terrain (Water: ${isWater ? 'Yes' : 'No'})`);
        
        // Add a flag to indicate the path was blocked by terrain
        path.pathBlockedByTerrain = true;
        path.blockedAtCoordinates = {x, y};
        
        return path; // Return the path collected so far, ending at the edge of incompatible terrain
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
  // SAFETY CHECK: Only move monsters that are idle
  if (monsterGroup.status !== 'idle') {
    console.log(`Cannot move monster group ${monsterGroup.id} with status: ${monsterGroup.status}. Movement requires idle status.`);
    return {
      action: 'none',
      reason: `monster_busy_${monsterGroup.status}`
    };
  }

  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  const dx = targetLocation.x - location.x;
  const dy = targetLocation.y - location.y;
  
  // NEW: Check if monster is already at target location to prevent NaN values
  if (dx === 0 && dy === 0) {
    console.log(`Monster group ${monsterGroup.id} is already at target location (${location.x}, ${location.y})`);
    
    // Choose a random direction instead
    const randomDirX = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
    const randomDirY = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
    
    // Ensure we're moving somewhere (avoid 0,0)
    if (randomDirX === 0 && randomDirY === 0) {
      return {
        action: 'idle',
        reason: 'already_at_target'
      };
    }
    
    // Create a new target 1-2 tiles away in a random direction
    const newTargetX = location.x + randomDirX;
    const newTargetY = location.y + randomDirY;
    
    console.log(`Choosing random direction (${randomDirX},${randomDirY}) to avoid staying in place`);
    
    // Create a simple two-point path
    const path = [
      { x: location.x, y: location.y },
      { x: newTargetX, y: newTargetY }
    ];
    
    // Set movement data
    const movementUpdates = {
      status: 'moving',
      movementPath: path,
      pathIndex: 0,
      moveStarted: now,
      moveSpeed: 1,
      nextMoveTime: now + 60000 // One minute
    };
    
    // Set the entire updated group at once
    updates[`${groupPath}`] = {
      ...monsterGroup,  // Keep existing group properties
      ...movementUpdates // Apply movement updates
    };
    
    return {
      action: 'move',
      target: {
        type: 'random_exploration',
        x: newTargetX,
        y: newTargetY,
        distance: 1
      }
    };
  }
  
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
    
    // If no alternative found, try choosing a random direction instead of staying in place
    if (!foundAlternative) {
      // Choose a random valid direction based on monster's terrain capabilities
      const randomDirX = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
      const randomDirY = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
      
      // Ensure we're moving somewhere (avoid 0,0)
      if (randomDirX === 0 && randomDirY === 0) {
        randomDirX = Math.random() < 0.5 ? 1 : -1;
      }
      
      nextX = location.x + randomDirX;
      nextY = location.y + randomDirY;
      
      console.log(`Monster group ${monsterGroup.id} is trying random direction (${randomDirX},${randomDirY}) after terrain blockage.`);
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
 * Utility function to check if a path was terminated due to terrain incompatibility
 * @param {Array} path - Path array with possible metadata
 * @returns {boolean} True if path was terminated due to terrain
 */
function wasPathBlockedByTerrain(path) {
  return path && path.pathBlockedByTerrain === true;
}

/**
 * Get the coordinates where a path was blocked
 * @param {Array} path - Path array with possible metadata
 * @returns {object|null} Coordinates where path was blocked or null
 */
function getPathBlockedCoordinates(path) {
  return (path && path.pathBlockedByTerrain) ? path.blockedAtCoordinates : null;
}

// Helper function to get chunk key from coordinates
function getChunkKey(x, y) {
  const chunkX = Math.floor(x / 20);
  const chunkY = Math.floor(y / 20);
  return `${chunkX},${chunkY}`;
}

/**
 * Evaluate if a moving monster should interrupt its current path based on detected opportunities
 * @param {Object} monsterGroup - Monster group data
 * @param {Object} tileData - Current tile data
 * @param {Object} worldScan - World scan data
 * @param {Object} currentLocation - Current location coordinates
 * @returns {Object} Decision object with shouldInterrupt flag and reason
 */
export function shouldInterruptMovement(monsterGroup, tileData, worldScan, currentLocation) {
  // Don't interrupt if the monster just started moving (avoid oscillating behavior)
  if (monsterGroup.moveStarted && Date.now() - monsterGroup.moveStarted < 30000) { // 30 seconds grace period
    return { shouldInterrupt: false };
  }
  
  // Get personality and unit count for decision making
  const personalityId = monsterGroup.personality?.id || 'BALANCED';
  const unitCount = monsterGroup.units ? Object.keys(monsterGroup.units).length : 0;
  
  // Calculate base interruption thresholds based on personality
  let combatThreshold = 0.5;  // Default threshold
  let resourceThreshold = 0.4;
  let structureThreshold = 0.6;
  
  // Adjust thresholds by personality
  switch (personalityId) {
    case 'AGGRESSIVE':
      combatThreshold = 0.2;      // Much more likely to interrupt for combat
      resourceThreshold = 0.7;    // Less likely for resources
      structureThreshold = 0.5;
      break;
    case 'FERAL':
      combatThreshold = 0.1;      // Extremely likely to interrupt for combat
      resourceThreshold = 0.6;    // Less likely for resources  
      structureThreshold = 0.5;
      break;
    case 'TERRITORIAL':
      combatThreshold = 0.4;
      resourceThreshold = 0.5;
      structureThreshold = 0.3;   // More likely to interrupt for structures
      break;
    case 'CAUTIOUS':
      combatThreshold = 0.8;      // Less likely to interrupt for combat
      resourceThreshold = 0.3;    // More likely for resources
      structureThreshold = 0.7;
      break;
    case 'SNEAKY':
      combatThreshold = 0.7;      // Less likely to interrupt for combat
      resourceThreshold = 0.2;    // Very likely for resources
      structureThreshold = 0.6;
      break;
    case 'NOMADIC':
      combatThreshold = 0.6;
      resourceThreshold = 0.4;
      structureThreshold = 0.7;   // Less likely to interrupt for structures
      break;
  }
  
  // 1. Check for battles - highest priority for aggressive monsters
  if (tileData.battles && Object.keys(tileData.battles).length > 0) {
    if (Math.random() < (1 - combatThreshold)) { // Invert threshold so higher = more likely
      return { 
        shouldInterrupt: true, 
        reason: "join existing battle", 
        immediateAction: "join_battle" 
      };
    }
  }
  
  // 2. Check for player groups to attack
  const playerGroups = findPlayerGroupsOnTileForInterruption(tileData);
  if (playerGroups.length > 0) {
    // Compare powers if possible
    const monsterPower = calculateGroupPower(monsterGroup);
    let playerPower = 0;
    for (const group of playerGroups) {
      playerPower += calculateGroupPower(group);
    }
    
    // FERAL monsters might attack regardless of power
    const powerRatio = playerPower > 0 ? monsterPower / playerPower : 1;
    
    // Personality-specific attack decision
    let willAttack = false;
    
    if (personalityId === 'FERAL' && powerRatio > 0.2) {
      willAttack = Math.random() < 0.8; // 80% chance
    } else if (personalityId === 'AGGRESSIVE' && powerRatio > 0.5) {
      willAttack = Math.random() < 0.7; // 70% chance
    } else if (powerRatio > 0.7) { // All personalities might attack if they're stronger
      willAttack = Math.random() < (1 - combatThreshold);
    }
    
    if (willAttack) {
      return {
        shouldInterrupt: true,
        reason: "attack player groups",
        immediateAction: "attack_players",
        targets: playerGroups
      };
    }
  }
  
  // 3. Check for player structures to attack
  if (tileData.structure && !tileData.structure.monster) {
    // Calculate power comparison similar to above
    const structurePower = estimateStructurePower(tileData.structure);
    const monsterPower = calculateGroupPower(monsterGroup);
    const powerRatio = structurePower > 0 ? monsterPower / structurePower : 1;
    
    // Different personalities have different thresholds
    let willAttackStructure = false;
    
    if (personalityId === 'FERAL' && powerRatio > 0.3) {
      willAttackStructure = Math.random() < 0.7; // 70% chance
    } else if (personalityId === 'AGGRESSIVE' && powerRatio > 0.6) {
      willAttackStructure = Math.random() < 0.6; // 60% chance
    } else if (powerRatio > 0.8) { // All personalities might attack if they're much stronger
      willAttackStructure = Math.random() < (1 - structureThreshold);
    }
    
    if (willAttackStructure) {
      return {
        shouldInterrupt: true,
        reason: "attack player structure",
        immediateAction: "attack_structure",
        structure: tileData.structure
      };
    }
  }
  
  // 4. Check for monster groups to attack (only for specific personalities)
  if ((personalityId === 'FERAL' || personalityId === 'AGGRESSIVE') && 
      monsterGroup.personality?.canAttackMonsters) {
    const attackableMonsters = findAttackableMonsterGroups(tileData, monsterGroup.id);
    if (attackableMonsters.length > 0) {
      // FERAL monsters are more likely to attack other monsters
      const attackChance = personalityId === 'FERAL' ? 0.5 : 0.3;
      
      if (Math.random() < attackChance) {
        return {
          shouldInterrupt: true,
          reason: "attack other monsters",
          immediateAction: "attack_monsters",
          targets: attackableMonsters
        };
      }
    }
  }
  
  // 5. Check for resources on this tile
  if (tileData.resources && Object.keys(tileData.resources).length > 0) {
    // Check if monster needs resources (has few or none)
    const hasResources = monsterGroup.items && monsterGroup.items.length > 0;
    const resourceCount = hasResources ? countTotalResources(monsterGroup.items) : 0;
    
    if (!hasResources || resourceCount < 5) {
      if (Math.random() < (1 - resourceThreshold)) { // Invert threshold so higher = more likely
        return {
          shouldInterrupt: true,
          reason: "gather resources",
          immediateAction: "gather"
        };
      }
    }
  }
  
  // 6. Check for nearby valuable targets (within detection range)
  const detectionRange = personalityId === 'CAUTIOUS' ? 2 : 
                         personalityId === 'SNEAKY' ? 4 :
                         personalityId === 'AGGRESSIVE' ? 5 : 3;
  
  // Find nearby targets in worldScan
  const nearbyTargets = findNearbyTargets(currentLocation, worldScan, detectionRange);
  
  if (nearbyTargets.length > 0) {
    // Sort by priority and distance
    nearbyTargets.sort((a, b) => {
      // First sort by priority (higher first)
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // Then sort by distance (closer first)
      return a.distance - b.distance;
    });
    
    // Get highest priority target
    const topTarget = nearbyTargets[0];
    
    // Different personality types have different thresholds for changing course
    let interruptProbability = calculateInterruptProbability(topTarget, personalityId, topTarget.distance);
    
    if (Math.random() < interruptProbability) {
      return {
        shouldInterrupt: true,
        reason: `pursue nearby ${topTarget.type}`,
        immediateAction: "move_to_target",
        targetLocation: topTarget.location,
        targetType: topTarget.type
      };
    }
  }
  
  // No interruption needed
  return { shouldInterrupt: false };
}

/**
 * Find player groups on the current tile for potential interruption
 * Helper function for shouldInterruptMovement
 */
function findPlayerGroupsOnTileForInterruption(tileData) {
  const playerGroups = [];
  
  if (tileData.groups) {
    Object.entries(tileData.groups).forEach(([groupId, groupData]) => {
      // Check if it's a player group that could be attacked
      if (groupData.owner && 
          (groupData.status === 'idle' || groupData.status === 'gathering') && 
          groupData.type !== 'monster') {
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
 * Estimate the power of a structure for combat decisions
 */
function estimateStructurePower(structure) {
  if (!structure) return 0;
  
  // Use STRUCTURES definitions for power if available
  if (structure.type && STRUCTURES[structure.type]) {
    const basePower = STRUCTURES[structure.type].durability || 100;
    
    // Scale by health percentage if available
    if (structure.health && structure.maxHealth) {
      return basePower * (structure.health / structure.maxHealth);
    }
    
    return basePower;
  }
  
  // Fallback power estimation
  return structure.level ? structure.level * 50 : 100;
}

/**
 * Find nearby targets that might be worth interrupting movement for
 */
function findNearbyTargets(currentLocation, worldScan, detectionRange) {
  const targets = [];
  
  // Check player spawns
  if (worldScan.playerSpawns) {
    for (const spawn of worldScan.playerSpawns) {
      const distance = calculateDistance(currentLocation, spawn);
      if (distance <= detectionRange) {
        targets.push({
          type: 'player_spawn',
          location: spawn,
          distance,
          priority: 0.8
        });
      }
    }
  }
  
  // Check player structures
  if (worldScan.playerStructures) {
    for (const structure of worldScan.playerStructures) {
      const distance = calculateDistance(currentLocation, structure);
      if (distance <= detectionRange) {
        targets.push({
          type: 'player_structure',
          location: structure,
          distance,
          priority: 0.7
        });
      }
    }
  }
  
  // Check resource hotspots
  if (worldScan.resourceHotspots) {
    for (const resource of worldScan.resourceHotspots) {
      const distance = calculateDistance(currentLocation, resource);
      if (distance <= detectionRange) {
        targets.push({
          type: 'resource_hotspot',
          location: resource,
          distance,
          priority: 0.5
        });
      }
    }
  }
  
  // Check monster structures (for returning home)
  if (worldScan.monsterStructures) {
    for (const structure of worldScan.monsterStructures) {
      // Prioritize own structure
      const isOwn = monsterGroup?.preferredStructureId === structure.structure?.id;
      
      const distance = calculateDistance(currentLocation, structure);
      if (distance <= detectionRange) {
        targets.push({
          type: 'monster_structure',
          location: structure,
          distance,
          priority: isOwn ? 0.6 : 0.3
        });
      }
    }
  }
  
  return targets;
}

/**
 * Calculate probability of interrupting movement based on target and personality
 */
function calculateInterruptProbability(target, personalityId, distance) {
  // Base probability decreases with distance
  let probability = Math.max(0.1, 1 - (distance / 5));
  
  // Adjust based on personality and target type
  switch (personalityId) {
    case 'AGGRESSIVE':
      if (target.type === 'player_spawn' || target.type === 'player_structure') {
        probability *= 1.5;
      }
      break;
    case 'TERRITORIAL':
      if (target.type === 'monster_structure') {
        probability *= 1.7;
      }
      break;
    case 'NOMADIC':
      // More likely to change course in general
      probability *= 1.3;
      break;
    case 'CAUTIOUS':
      // Less likely to change course
      probability *= 0.6;
      break;
    case 'SNEAKY':
      if (target.type === 'resource_hotspot') {
        probability *= 1.5;
      }
      break;
    case 'FERAL':
      // Highly unpredictable, more likely to change course
      probability *= 1.8;
      break;
  }
  
  return Math.min(0.9, probability); // Cap at 90% to always have some randomness
}
