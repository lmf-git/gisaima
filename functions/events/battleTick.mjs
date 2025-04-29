/**
 * Battle Tick function for Gisaima
 * Processes ongoing battles and determines outcomes for groups and structures
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";

// Run battle tick every minute
export const processBattles = onSchedule({
  schedule: "every 1 minutes",
  maxInstances: 1,
  memory: "256MiB"
}, async (event) => {
  const db = getDatabase();
  const worldsRef = db.ref("worlds");

  try {
    // Get all worlds
    const worldsSnapshot = await worldsRef.once("value");
    const worlds = worldsSnapshot.val();
    
    if (!worlds) {
      logger.info("No worlds found");
      return;
    }
    
    // Process each world
    for (const [worldId, worldData] of Object.entries(worlds)) {
      if (!worldData.chunks) continue;
      
      // Track all active battles
      const battles = [];

      // Scan through chunks for battles
      for (const [chunkKey, chunkData] of Object.entries(worldData.chunks)) {
        if (!chunkData) continue;
        
        for (const [locationKey, tileData] of Object.entries(chunkData)) {
          if (locationKey === "lastUpdated" || !tileData) continue;

          const [x, y] = locationKey.split(",").map(Number);
          
          if (tileData.battles) {
            for (const [battleId, battleData] of Object.entries(tileData.battles)) {
              // Only process active battles
              if (battleData.status === "active") {
                battles.push({
                  worldId,
                  chunkKey,
                  locationKey,
                  x,
                  y,
                  battleId,
                  battleData
                });
              }
            }
          }
        }
      }
      
      logger.info(`Found ${battles.length} active battles in world ${worldId}`);
      
      // Process each battle
      for (const battle of battles) {
        try {
          await processBattle(battle);
        } catch (error) {
          logger.error(`Error processing battle ${battle.battleId}:`, error);
        }
      }
    }
    
    logger.info("Battle tick processing complete");
    
  } catch (error) {
    logger.error("Error processing battle tick:", error);
  }
});

async function processBattle(battle) {
  const { worldId, chunkKey, locationKey, x, y, battleId, battleData } = battle;
  const db = getDatabase();
  
  // Get current battle state
  const battleRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}`);
  const battleSnapshot = await battleRef.once("value");
  
  if (!battleSnapshot.exists()) {
    logger.warn(`Battle ${battleId} no longer exists`);
    return;
  }
  
  const currentBattleData = battleSnapshot.val();
  
  // Skip if battle is not active
  if (currentBattleData.status !== "active") {
    return;
  }
  
  // Get tile data to access groups and structures
  const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}`);
  const tileSnapshot = await tileRef.once("value");
  const tileData = tileSnapshot.val();
  
  if (!tileData) {
    logger.error(`Tile data not found for battle ${battleId}`);
    return;
  }
  
  // Determine what types of targets are in this battle
  const targetTypes = currentBattleData.targetTypes || [];
  const includesGroups = targetTypes.includes("group");
  const includesStructure = targetTypes.includes("structure");
  
  // If no targetTypes field exists (for backward compatibility), check the old targetType field
  if (targetTypes.length === 0 && currentBattleData.targetType) {
    if (currentBattleData.targetType === "group") targetTypes.push("group");
    if (currentBattleData.targetType === "structure") targetTypes.push("structure");
  }
  
  // Get groups involved in the battle
  const groups = tileData.groups || {};
  const attackers = [];
  const defenders = [];
  
  // Find all groups involved in this battle
  for (const [groupId, groupData] of Object.entries(groups)) {
    if (groupData.battleId === battleId) {
      if (groupData.battleSide === 1) {
        attackers.push({ ...groupData, id: groupId });
      } else if (groupData.battleSide === 2) {
        defenders.push({ ...groupData, id: groupId });
      }
    }
  }
  
  // Process structure if included in this battle
  let structure = null;
  if (tileData.structure && tileData.structure.battleId === battleId) {
    structure = { ...tileData.structure };
  }
  
  // Validate battle participants
  if (attackers.length === 0) {
    logger.warn(`Battle ${battleId} has no attackers, ending battle`);
    await endBattle(worldId, chunkKey, locationKey, battleId, 2, defenders, structure);
    return;
  }
  
  if (includesGroups && defenders.length === 0 && includesStructure && !structure) {
    logger.warn(`Battle ${battleId} has no valid defenders, ending battle`);
    await endBattle(worldId, chunkKey, locationKey, battleId, 1, attackers, null);
    return;
  }
  
  // Calculate total power for each side
  const attackerPower = calculateTotalPower(attackers);
  
  // Defender power combines group power and structure power
  let defenderGroupPower = calculateTotalPower(defenders);
  let structurePower = structure ? calculateStructurePower(structure) : 0;
  let defenderTotalPower = defenderGroupPower + structurePower;
  
  // Increment battle tick
  const tickCount = (currentBattleData.tickCount || 0) + 1;
  
  // Determine if battle should end on this tick
  const shouldEndBattle = tickCount >= 3; // End after 3 ticks
  let winner = null;
  
  if (shouldEndBattle || attackerPower === 0 || defenderTotalPower === 0) {
    // Determine winner
    if (attackerPower > defenderTotalPower) {
      winner = 1; // Attackers win
    } else if (defenderTotalPower > attackerPower) {
      winner = 2; // Defenders win
    } else {
      // In case of tie, defenders have advantage
      winner = 2;
    }
    
    // End the battle with the determined winner
    await endBattle(
      worldId, 
      chunkKey, 
      locationKey, 
      battleId, 
      winner, 
      winner === 1 ? attackers : defenders,
      winner === 2 ? structure : null
    );
    
    return;
  }
  
  // Update battle data for next tick
  await battleRef.update({
    tickCount,
    side1Power: attackerPower,
    side2Power: defenderTotalPower,
    defenderGroupPower,
    structurePower
  });
  
  logger.info(`Battle ${battleId} tick ${tickCount} processed. Attackers: ${attackerPower}, Defenders: ${defenderTotalPower} (Groups: ${defenderGroupPower}, Structure: ${structurePower})`);
}

async function endBattle(worldId, chunkKey, locationKey, battleId, winningSide, winningGroups, winningStructure) {
  const db = getDatabase();
  const now = Date.now();
  
  try {
    // Get current battle and tile data
    const battleRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}`);
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}`);
    
    const [battleSnapshot, tileSnapshot] = await Promise.all([
      battleRef.once("value"),
      tileRef.once("value")
    ]);
    
    if (!battleSnapshot.exists() || !tileSnapshot.exists()) {
      logger.error(`Battle ${battleId} or tile data not found`);
      return;
    }
    
    const battleData = battleSnapshot.val();
    const tileData = tileSnapshot.val();
    
    // Determine target types
    const targetTypes = battleData.targetTypes || [];
    const includesGroups = targetTypes.includes("group");
    const includesStructure = targetTypes.includes("structure");
    
    // For backward compatibility
    if (targetTypes.length === 0 && battleData.targetType) {
      if (battleData.targetType === "group") targetTypes.push("group");
      if (battleData.targetType === "structure") targetTypes.push("structure");
    }
    
    // Get groups involved in the battle
    const groups = tileData.groups || {};
    const attackers = [];
    const defenders = [];
    let casualties = 0;
    
    // Find all groups involved in this battle
    for (const [groupId, groupData] of Object.entries(groups)) {
      if (groupData.battleId === battleId) {
        if (groupData.battleSide === 1) {
          attackers.push({ ...groupData, id: groupId });
        } else if (groupData.battleSide === 2) {
          defenders.push({ ...groupData, id: groupId });
        }
      }
    }
    
    // Structure data if applicable
    const structure = tileData.structure?.battleId === battleId ? tileData.structure : null;
    
    // Prepare updates object
    const updates = {};
    
    // Update battle status
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/status`] = "completed";
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/winner`] = winningSide;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/endedAt`] = now;
    
    // Process groups based on battle outcome
    const losingGroups = winningSide === 1 ? defenders : attackers;
    
    // Update winning groups
    if (winningGroups) {
      for (const group of winningGroups) {
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/inBattle`] = false;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleId`] = null;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleSide`] = null;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleRole`] = null;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/status`] = "idle";
        
        // Add victory message
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/lastMessage`] = {
          text: "Victory in battle! All units survived the battle.",
          timestamp: now
        };
      }
    }
    
    // Handle losing groups - remove them
    for (const group of losingGroups) {
      // Remove the group
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] = null;
      casualties++;
      
      // Update player state if this was a player's group
      if (group.owner) {
        updates[`worlds/${worldId}/chat/death_${now}_${group.owner}`] = {
          text: `${group.name || "Unknown player"} was defeated in battle at (${locationKey})`,
          type: "event",
          location: { x: parseInt(locationKey.split(',')[0]), y: parseInt(locationKey.split(',')[1]) },
          timestamp: now
        };
        
        // Add defeat message to player
        updates[`players/${group.owner}/worlds/${worldId}/lastMessage`] = {
          text: "You were defeated in battle.",
          timestamp: now
        };
      }
    }
    
    // Variables to track structure outcomes
    let structureDestroyed = false;
    let structureCaptured = false;
    let newOwner = null;
    let previousOwner = null;
    
    // Handle structure if it was in the battle
    if (includesStructure && structure) {
      if (winningSide === 1) {
        // Attackers won - structure could be destroyed or claimed
        if (structure.type === "spawn") {
          // Spawn points can't be destroyed, just reset battle status
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/inBattle`] = false;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/battleId`] = null;
        } else {
          // Calculate destruction chance based on structure type and battle damage
          const destructionChance = calculateDestructionChance(structure, battleData);
          const isDestroyed = Math.random() < destructionChance;
          
          if (isDestroyed) {
            // Structure is destroyed - remove it entirely
            updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure`] = null;
            structureDestroyed = true;
            previousOwner = structure.owner;
            
            logger.info(`Structure ${structure.name || structure.id} destroyed at (${locationKey})`);
          } else {
            // Structure survives but is captured - find strongest attacker to be new owner
            previousOwner = structure.owner;
            
            // Find strongest attacker group
            if (attackers.length > 0) {
              // Sort attackers by power (descending)
              const sortedAttackers = [...attackers].sort((a, b) => {
                const powerA = calculateGroupPower(a);
                const powerB = calculateGroupPower(b);
                return powerB - powerA;
              });
              
              // The strongest group's owner becomes the new structure owner
              const strongestGroup = sortedAttackers[0];
              if (strongestGroup && strongestGroup.owner) {
                newOwner = strongestGroup.owner;
                const newOwnerName = strongestGroup.name?.replace("'s Force", "") || "Unknown Conqueror";
                
                updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/owner`] = newOwner;
                updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/ownerName`] = newOwnerName;
                structureCaptured = true;
                
                logger.info(`Structure ${structure.name || structure.id} captured by ${newOwnerName} at (${locationKey})`);
              }
            }
            
            // Reset battle status
            updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/inBattle`] = false;
            updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/battleId`] = null;
          }
        }
      } else {
        // Defenders won - structure stays intact
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/inBattle`] = false;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/battleId`] = null;
      }
    }
    
    // Add battle outcome to chat
    const attackerName = attackers.length > 0 ? attackers[0].name || "Unknown Force" : "Unknown Force";
    
    // Build a result message based on what was being attacked
    let resultMessage = `Battle at (${locationKey}) has ended after ${battleData.tickCount || 1} ticks! `;
    
    // Different messages based on what was involved in the battle
    if (includesGroups && includesStructure) {
      const defenderName = defenders.length > 0 ? defenders[0].name || "Unknown Force" : "Unknown Force";
      const structureName = structure ? structure.name || "Structure" : "Structure";
      
      if (winningSide === 1) {
        if (structureDestroyed) {
          resultMessage += `Victorious: ${attackerName} defeated ${defenderName} and destroyed ${structureName}`;
        } else if (structureCaptured) {
          resultMessage += `Victorious: ${attackerName} defeated ${defenderName} and captured ${structureName}`;
        } else {
          resultMessage += `Victorious: ${attackerName} defeated ${defenderName} and captured ${structureName}`;
        }
      } else {
        resultMessage += `${defenderName} and ${structureName} successfully defended against ${attackerName}`;
      }
    } 
    else if (includesGroups) {
      const defenderName = defenders.length > 0 ? defenders[0].name || "Unknown Force" : "Unknown Force";
      
      if (winningSide === 1) {
        resultMessage += `Victorious: ${attackerName} Defeated: ${defenderName}`;
      } else {
        resultMessage += `Victorious: ${defenderName} Defeated: ${attackerName}`;
      }
    }
    else if (includesStructure) {
      const structureName = structure ? structure.name || "Structure" : "Structure";
      
      if (winningSide === 1) {
        if (structureDestroyed) {
          resultMessage += `${attackerName} successfully destroyed ${structureName}`;
        } else if (structureCaptured) {
          resultMessage += `${attackerName} successfully captured ${structureName}`;
        } else {
          resultMessage += `${attackerName} successfully captured ${structureName}`;
        }
      } else {
        resultMessage += `${attackerName} failed to capture ${structureName}`;
      }
    }
    
    // Add casualties count
    if (casualties > 0) {
      resultMessage += ` (${casualties} casualties)`;
    }
    
    // Add battle outcome to chat
    updates[`worlds/${worldId}/chat/battle_${now}_${battleId}_${Math.floor(Math.random() * 1000)}`] = {
      text: resultMessage,
      type: "event",
      location: { x: parseInt(locationKey.split(',')[0]), y: parseInt(locationKey.split(',')[1]) },
      timestamp: now
    };
    
    // If structure was destroyed or captured, add a specific message
    if (structureDestroyed) {
      updates[`worlds/${worldId}/chat/structure_destroyed_${now}_${Math.floor(Math.random() * 1000)}`] = {
        text: `A ${structure.type || ''} structure was destroyed at (${locationKey})`,
        type: "event",
        location: { x: parseInt(locationKey.split(',')[0]), y: parseInt(locationKey.split(',')[1]) },
        timestamp: now
      };
    } else if (structureCaptured && previousOwner !== newOwner) {
      updates[`worlds/${worldId}/chat/structure_captured_${now}_${Math.floor(Math.random() * 1000)}`] = {
        text: `${structure.name || 'A structure'} at (${locationKey}) was captured by ${attackers[0]?.name?.replace("'s Force", "") || "Unknown Conqueror"}`,
        type: "event",
        location: { x: parseInt(locationKey.split(',')[0]), y: parseInt(locationKey.split(',')[1]) },
        timestamp: now
      };
    }
    
    // Execute all updates atomically
    await db.ref().update(updates);
    logger.info(`Battle ${battleId} ended. Winner: side ${winningSide}`);
    
  } catch (error) {
    logger.error(`Error ending battle ${battleId}:`, error);
  }
}

// Calculate chance for structure to be destroyed based on structure type and battle damage
function calculateDestructionChance(structure, battleData) {
  // Base destruction chance by structure type (lower for more important structures)
  let baseChance = 0.2; // Default 20% chance
  
  switch (structure.type) {
    case 'fortress':
      baseChance = 0.05; // 5% base chance - very sturdy
      break;
    case 'watchtower':
      baseChance = 0.25; // 25% base chance - relatively fragile
      break;
    case 'stronghold':
      baseChance = 0.1; // 10% base chance - quite sturdy
      break;
    case 'camp':
      baseChance = 0.4; // 40% base chance - very fragile
      break;
    case 'outpost':
      baseChance = 0.3; // 30% base chance - somewhat fragile
      break;
    case 'village':
      baseChance = 0.15; // 15% base chance - moderately sturdy
      break;
    default:
      baseChance = 0.2; // 20% base chance for unknown types
  }
  
  // Consider battle damage - the longer the battle, the higher the chance of destruction
  const battleTicksFactor = Math.min(1, (battleData.tickCount || 0) / 5); // Max factor of 1 after 5 ticks
  
  // Consider power ratio - if attackers were much stronger than the structure,
  // increase destruction chance
  const attackerPower = battleData.side1Power || 0;
  const structurePower = battleData.structurePower || 0;
  
  // Calculate power ratio factor, capped at 2 (doubling the destruction chance)
  const powerRatioFactor = Math.min(2, attackerPower / Math.max(1, structurePower));
  
  // Calculate final destruction chance
  const finalChance = baseChance * (1 + battleTicksFactor * 0.5) * powerRatioFactor;
  
  // Cap the chance at 75% - even the most overwhelming attack has some chance to leave structure standing
  return Math.min(0.75, finalChance);
}

function calculateTotalPower(groups) {
  if (!groups || groups.length === 0) return 0;
  
  return groups.reduce((total, group) => {
    let groupPower = group.unitCount || 1;
    
    // If we have unit details, use those
    if (group.units) {
      if (Array.isArray(group.units)) {
        groupPower = group.units.length;
      } else if (typeof group.units === 'object') {
        groupPower = Object.keys(group.units).length;
      }
    }
    
    return total + groupPower;
  }, 0);
}

function calculateStructurePower(structure) {
  if (!structure) return 0;
  
  // Base power by structure type
  let basePower = 5;
  
  switch (structure.type) {
    case 'spawn':
      basePower = 15;
      break;
    case 'fortress':
      basePower = 30;
      break;
    case 'watchtower':
      basePower = 10;
      break;
    case 'stronghold':
      basePower = 25;
      break;
    default:
      basePower = 5;
  }
  
  return basePower;
}

// Helper function to calculate group power (for sorting attackers by strength)
function calculateGroupPower(group) {
  // Base calculation using unit count
  let power = group.unitCount || 1;
  
  // If we have detailed units data, use it for better calculations
  if (group.units && typeof group.units === 'object') {
    // Check if it's an array or object
    if (Array.isArray(group.units)) {
      power = group.units.reduce((total, unit) => {
        // Calculate unit strength (default to 1 if not specified)
        const unitStrength = unit.strength || 1;
        return total + unitStrength;
      }, 0);
    } else {
      // Handle object format (keys are unit IDs)
      power = Object.values(group.units).reduce((total, unit) => {
        const unitStrength = unit.strength || 1;
        return total + unitStrength;
      }, 0);
    }
    
    // Ensure minimum power of 1
    power = Math.max(1, power);
  }
  
  return power;
}
