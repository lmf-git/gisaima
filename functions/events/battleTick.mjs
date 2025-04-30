/**
 * Battle Tick function for Gisaima
 * Processes ongoing battles and determines outcomes for groups and structures
 */

import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";

/**
 * Process battles for a given world
 * 
 * @param {string} worldId The ID of the world to process
 * @returns {Promise<number>} Number of battles processed
 */
export async function processBattles(worldId) {
  const db = getDatabase();
  let battlesProcessed = 0;

  try {
    // Get world data
    const worldRef = db.ref(`worlds/${worldId}`);
    const worldSnapshot = await worldRef.once("value");
    const worldData = worldSnapshot.val();
    
    if (!worldData || !worldData.chunks) {
      logger.info(`No chunks found in world ${worldId}`);
      return battlesProcessed;
    }
    
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
        battlesProcessed++;
      } catch (error) {
        logger.error(`Error processing battle ${battle.battleId}:`, error);
      }
    }
    
    logger.info(`Processed ${battlesProcessed} battles in world ${worldId}`);
    return battlesProcessed;
    
  } catch (error) {
    logger.error(`Error processing battles for world ${worldId}:`, error);
    return battlesProcessed;
  }
}

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

/**
 * Process a battle tick, handling unit attrition
 */
async function processBattleTick(worldId, chunkKey, locationKey, battleId, battleData) {
  const db = getDatabase();
  const updates = {};
  const now = Date.now();
  
  try {
    // Get the full data for both sides of the battle
    const side1Groups = await fetchBattleGroups(worldId, chunkKey, locationKey, battleData.side1.groups || {});
    const side2Groups = await fetchBattleGroups(worldId, chunkKey, locationKey, battleData.side2.groups || {});
    
    // Also get structure if it's involved in the battle
    let structure = null;
    if (battleData.targetTypes?.includes("structure")) {
      const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure`);
      const structureSnapshot = await tileRef.once("value");
      structure = structureSnapshot.val();
    }
    
    // Calculate current power for each side - this will include newly joined groups
    let side1Power = calculateSidePower(side1Groups);
    let side2Power = calculateSidePower(side2Groups) + (structure ? calculateStructurePower(structure) : 0);
    
    // Calculate attrition for both sides
    // Simple approach: Power ratio determines casualty rate with some randomization
    const totalPower = side1Power + side2Power;
    
    if (totalPower > 0) {
      // Calculate base casualty rates based on power differential
      const side1Ratio = side2Power / totalPower;
      const side2Ratio = side1Power / totalPower;
      
      // Apply attrition to side 1 groups
      const side1Casualties = applyAttrition(side1Groups, side1Ratio, worldId, chunkKey, locationKey, updates, now);
      
      // Apply attrition to side 2 groups
      const side2Casualties = applyAttrition(side2Groups, side2Ratio, worldId, chunkKey, locationKey, updates, now);
      
      // Apply damage to structure if involved
      let structureDamage = 0;
      if (structure && side1Power > 0) {
        // Structure takes damage proportional to side1's power
        const baseStructureDamage = side1Power / (side1Power + side2Power - calculateStructurePower(structure)) * 0.3;
        structureDamage = Math.max(1, Math.floor(baseStructureDamage * 10));
        
        // Apply damage to structure
        structure.health = (structure.health || 100) - structureDamage;
        if (structure.health <= 0) {
          // Structure is destroyed or captured (handled at battle end)
          structure.health = 0;
        }
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/health`] = structure.health;
      }
      
      // Recalculate powers after attrition
      side1Power = calculateSidePower(side1Groups);
      side2Power = calculateSidePower(side2Groups) + (structure?.health > 0 ? calculateStructurePower(structure) : 0);
      
      // Update battle data
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/side1Power`] = side1Power;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/side2Power`] = side2Power;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/tickCount`] = (battleData.tickCount || 0) + 1;
      
      // Check if battle should end
      if (side1Power <= 0 || side2Power <= 0) {
        // Determine winner
        const winningSide = side1Power > 0 ? 1 : 2;
        const winningGroups = winningSide === 1 ? side1Groups : side2Groups;
        const losingGroups = winningSide === 1 ? side2Groups : side1Groups;
        
        // End the battle
        await endBattle(worldId, chunkKey, locationKey, battleId, winningSide, winningGroups, structure);
        
        // Add battle end message
        updates[`worlds/${worldId}/chat/battle_${now}_${battleId}_${Math.floor(Math.random() * 1000)}`] = {
          text: `Battle at (${locationKey.split(',')[0]},${locationKey.split(',')[1]}) has ended after ${battleData.tickCount + 1} ticks! Victorious: ${getWinnerName(winningGroups)} Defeated: ${getLoserName(losingGroups)} (${side1Casualties + side2Casualties} casualties)`,
          type: "event",
          location: { x: parseInt(locationKey.split(',')[0]), y: parseInt(locationKey.split(',')[1]) },
          timestamp: now
        };
      } else {
        // Battle continues - add message about casualties if any
        if (side1Casualties + side2Casualties > 0) {
          updates[`worlds/${worldId}/chat/battle_progress_${now}_${battleId}_${Math.floor(Math.random() * 1000)}`] = {
            text: `Battle rages at (${locationKey.split(',')[0]},${locationKey.split(',')[1]})! ${side1Casualties + side2Casualties} casualties this tick.`,
            type: "event",
            location: { x: parseInt(locationKey.split(',')[0]), y: parseInt(locationKey.split(',')[1]) },
            timestamp: now
          };
        }
      }
    }
    
    // Apply all updates
    await db.ref().update(updates);
    
    return { success: true };
    
  } catch (error) {
    console.error("Error processing battle tick:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Apply attrition to a side's groups
 * @returns {number} Number of casualties
 */
function applyAttrition(groups, casualtyRatio, worldId, chunkKey, locationKey, updates, now) {
  let totalCasualties = 0;
  
  // Base chance of losing a unit each tick
  const baseCasualtyChance = casualtyRatio * 0.3; // Adjust this value to control battle length
  
  // Apply casualties to each group
  Object.values(groups).forEach(group => {
    if (!group.units || Object.keys(group.units).length === 0) return;
    
    // Determine how many units should be lost
    const unitCount = Object.keys(group.units).length;
    const expectedCasualties = Math.max(0, Math.floor(unitCount * baseCasualtyChance * (0.8 + Math.random() * 0.4)));
    const actualCasualties = Math.min(unitCount - 1, expectedCasualties); // Leave at least one unit
    
    // If no casualties, skip
    if (actualCasualties <= 0) return;
    
    // Select random units to remove
    const unitKeys = Object.keys(group.units);
    const casualtyKeys = [];
    
    // Shuffle and pick first N units
    for (let i = 0; i < actualCasualties; i++) {
      const randomIndex = Math.floor(Math.random() * unitKeys.length);
      casualtyKeys.push(unitKeys[randomIndex]);
      unitKeys.splice(randomIndex, 1); // Remove so we don't pick it again
    }
    
    // Remove the selected units
    casualtyKeys.forEach(unitKey => {
      const unit = group.units[unitKey];
      
      // Handle player death if this is a player unit
      if ((unit.type === 'player') || 
          (unit.id && unit.id === group.owner) || 
          (unitKey === group.owner) || 
          (unit.displayName && !unit.npc)) {
        
        // Determine the player ID - could be unit.id, unitKey, or group.owner
        const playerId = unit.id || unitKey;
        if (!playerId) {
          logger.error(`Cannot determine player ID for unit in group ${group.id}`);
          return;
        }
        
        // Add death message to chat
        updates[`worlds/${worldId}/chat/death_${now}_${playerId}`] = {
          text: `${unit.displayName || "Unknown player"} was defeated in battle at (${locationKey})`,
          type: "event",
          location: { x: parseInt(locationKey.split(',')[0]), y: parseInt(locationKey.split(',')[1]) },
          timestamp: now
        };
        
        // Send defeat message to player
        updates[`players/${playerId}/worlds/${worldId}/lastMessage`] = {
          text: "You were defeated in battle.",
          timestamp: now
        };
        
        // Mark player as not alive in top-level player data
        updates[`players/${playerId}/worlds/${worldId}/alive`] = false;
        
        logger.info(`Marking player ${playerId} (${unit.displayName || "Unknown"}) as not alive due to battle casualty`);
      }

      // Remove the unit from the group
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/units/${unitKey}`] = null;
      totalCasualties++;
    });
    
    // Check if this was the last unit in the group
    const remainingUnitCount = unitKeys.length;
    
    if (remainingUnitCount <= 0) {
      // No units left, remove the entire group
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] = null;
      
      // Add group defeat notification to the chat log
      if (group.owner) {
        updates[`worlds/${worldId}/chat/death_${now}_${group.owner}`] = {
          text: `${group.name || "Unknown player"} was defeated in battle at (${locationKey})`,
          type: "event",
          location: { x: parseInt(locationKey.split(',')[0]), y: parseInt(locationKey.split(',')[1]) },
          timestamp: now
        };
      }
      
      logger.info(`Group ${group.id} (${group.name || "Unknown"}) completely destroyed in battle`);
    } else {
      // Update the unit count
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/unitCount`] = remainingUnitCount;
    }
  });
  
  return totalCasualties;
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
    
    // Delete the battle entirely instead of marking it as completed
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}`] = null;
    
    // Process groups based on battle outcome
    const losingGroups = winningSide === 1 ? defenders : attackers;
    
    // Update winning groups
    if (winningGroups) {
      // Track unique winning owners for achievements
      const winningOwners = new Set();
      
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
        
        // Add owner to the set of winners if they exist
        if (group.owner) {
          winningOwners.add(group.owner);
        }
      }
      
      // Grant first_victory achievement to all winning owners
      winningOwners.forEach(ownerId => {
        updates[`players/${ownerId}/worlds/${worldId}/achievements/first_victory`] = true;
        updates[`players/${ownerId}/worlds/${worldId}/achievements/first_victory_date`] = now;
        logger.info(`Granting first_victory achievement to player ${ownerId}`);
      });
    }
    
    // Count casualties from the losing side for the battle outcome message
    // Do not try to remove groups - they should already be removed if they have no units
    let casualties = losingGroups.length;
    
    // Just add battle result messages to the chat for each losing group's owner
    for (const group of losingGroups) {
      if (group.owner) {
        // Add group defeat notification to the chat log
        updates[`worlds/${worldId}/chat/death_${now}_${group.owner}`] = {
          text: `${group.name || "Unknown player"} was defeated in battle at (${locationKey})`,
          type: "event",
          location: { x: parseInt(locationKey.split(',')[0]), y: parseInt(locationKey.split(',')[1]) },
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

// Helper function to get names
function getWinnerName(winningGroups) {
  if (winningGroups && winningGroups.length > 0) {
    return winningGroups[0].name || "Unknown Force";
  }
  return "Unknown Force";
}

function getLoserName(losingGroups) {
  if (losingGroups && losingGroups.length > 0) {
    return losingGroups[0].name || "Unknown Force";
  }
  return "Unknown Force";
}

// Helper function to fetch all groups for a side
async function fetchBattleGroups(worldId, chunkKey, locationKey, groupIds) {
  const db = getDatabase();
  const groups = [];
  
  for (const groupId of Object.keys(groupIds)) {
    const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}`);
    const groupSnapshot = await groupRef.once("value");
    const group = groupSnapshot.val();
    
    if (group) {
      groups.push({...group, id: groupId});
    }
  }
  
  return groups;
}
