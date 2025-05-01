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
  
  // Use the detailed battle processing instead of the simpler logic
  try {
    // ALSO GET THE TILE DATA HERE TO AVOID EXTRA DATABASE CALLS LATER
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}`);
    const tileSnapshot = await tileRef.once("value");
    const tileData = tileSnapshot.val();
    
    if (!tileData) {
      logger.error(`Tile data not found for battle ${battleId}`);
      return;
    }
    
    // Pass both battle data AND tile data to processBattleTick
    const result = await processBattleTick(worldId, chunkKey, locationKey, battleId, currentBattleData, tileData);
    if (!result.success) {
      logger.error(`Error in battle tick processing for battle ${battleId}: ${result.error || "Unknown error"}`);
    }
    return;
  } catch (error) {
    logger.error(`Error calling processBattleTick for battle ${battleId}:`, error);
    return;
  }
}

/**
 * Process a battle tick, handling unit attrition
 * Modified to accept tileData parameter and avoid extra database calls
 */
async function processBattleTick(worldId, chunkKey, locationKey, battleId, battleData, tileData) {
  const db = getDatabase();
  const updates = {};
  const now = Date.now();
  
  try {
    // Extract groups from tile data
    const groups = tileData.groups || {};
    
    // Get groups for each side from the already-loaded tile data
    const side1Groups = getGroupsForSide(groups, battleData.side1?.groups || {});
    const side2Groups = getGroupsForSide(groups, battleData.side2?.groups || {});
    
    // Early check if either side has no groups - end battle immediately
    if (shouldEndBattleEarly(side1Groups, side2Groups)) {
      const winningSide = side1Groups.length > 0 ? 1 : 2;
      const winningGroups = winningSide === 1 ? side1Groups : side2Groups;
      
      // Get structure directly from tileData if involved
      let structure = battleData.targetTypes?.includes("structure") ? tileData.structure : null;
      
      // Ensure the battle is deleted even if endBattle fails
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}`] = null;
      
      await endBattle(worldId, chunkKey, locationKey, battleId, winningSide, winningGroups, structure);
      
      // Add battle end message
      addBattleEndMessageToUpdates(
        updates, worldId, now, battleId, locationKey,
        "Battle has ended! One side had no units."
      );
      
      await db.ref().update(updates);
      return { success: true };
    }
    
    // Get structure directly from tileData if involved - no extra database call needed
    let structure = battleData.targetTypes?.includes("structure") ? tileData.structure : null;
    
    // Calculate current power for each side
    let side1Power = calculateSidePower(side1Groups);
    let side2Power = calculateSidePower(side2Groups) + (structure ? calculateStructurePower(structure) : 0);
    
    // Only process attrition if both sides have power
    const totalPower = side1Power + side2Power;
    
    if (totalPower > 0) {
      // Calculate casualty rates based on power differential
      const side1Ratio = side2Power / totalPower;
      const side2Ratio = side1Power / totalPower;
      
      // Create collectors for items from defeated groups
      let side1Loot = [];
      let side2Loot = [];
      
      // Apply attrition to both sides and collect loot from defeated groups
      const side1Casualties = applyAttrition(side1Groups, side1Ratio, worldId, chunkKey, locationKey, updates, now, side1Loot);
      const side2Casualties = applyAttrition(side2Groups, side2Ratio, worldId, chunkKey, locationKey, updates, now, side2Loot);
      
      // Apply damage to structure if involved
      let structureDamage = 0;
      if (structure && side1Power > 0) {
        structureDamage = applyStructureDamage(structure, side1Power, side2Power, updates, worldId, chunkKey, locationKey);
      }
      
      // Filter out empty groups after attrition
      const filteredSide1Groups = filterAndRemoveEmptyGroups(
        side1Groups, worldId, chunkKey, locationKey, updates, battleId, 1
      );
      
      const filteredSide2Groups = filterAndRemoveEmptyGroups(
        side2Groups, worldId, chunkKey, locationKey, updates, battleId, 2
      );
      
      // Distribute loot to surviving groups
      if (side1Loot.length > 0 && filteredSide2Groups.length > 0) {
        // Side 1 lost units and had loot, distribute to side 2
        distributeItemsToGroups(side1Loot, filteredSide2Groups, worldId, chunkKey, locationKey, updates, now);
      }
      
      if (side2Loot.length > 0 && filteredSide1Groups.length > 0) {
        // Side 2 lost units and had loot, distribute to side 1
        distributeItemsToGroups(side2Loot, filteredSide1Groups, worldId, chunkKey, locationKey, updates, now);
      }
      
      // Recalculate powers after attrition
      side1Power = calculateSidePower(filteredSide1Groups);
      side2Power = calculateSidePower(filteredSide2Groups) + (structure?.health > 0 ? calculateStructurePower(structure) : 0);
      
      // Update battle data
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/side1Power`] = side1Power;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/side2Power`] = side2Power;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/tickCount`] = (battleData.tickCount || 0) + 1;
      
      // Check if battle should end after filtering
      if (shouldEndBattleAfterAttrition(filteredSide1Groups, filteredSide2Groups, side1Power, side2Power)) {
        // Determine winner based on remaining groups and power
        const winningSide = determineWinningSide(filteredSide1Groups, filteredSide2Groups, side1Power, side2Power);
        const winningGroups = winningSide === 1 ? filteredSide1Groups : filteredSide2Groups;
        const losingGroups = winningSide === 1 ? filteredSide2Groups : filteredSide1Groups;
        
        // End the battle
        await endBattle(worldId, chunkKey, locationKey, battleId, winningSide, winningGroups, structure);
        
        // Add battle end message with casualties
        addBattleEndMessageToUpdates(
          updates, worldId, now, battleId, locationKey,
          `Battle has ended after ${battleData.tickCount + 1} ticks! ` +
          `Victorious: ${getWinnerName(winningGroups)} Defeated: ${getLoserName(losingGroups)} ` +
          `(${side1Casualties + side2Casualties} casualties)`
        );
      } else if (side1Casualties + side2Casualties > 0) {
        // Battle continues - add message about casualties if any
        const lootMessage = (side1Loot.length > 0 || side2Loot.length > 0) ? 
          ` Items were looted from the fallen.` : '';
          
        addBattleProgressMessageToUpdates(
          updates, worldId, now, battleId, locationKey,
          `Battle rages! ${side1Casualties + side2Casualties} casualties this tick.${lootMessage}`
        );
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
 * Modified to collect items from defeated units with backward compatibility
 * @param {Array} groups - Groups to apply attrition to
 * @param {number} casualtyRatio - Ratio of units to be casualties
 * @param {string} worldId - World ID
 * @param {string} chunkKey - Chunk key
 * @param {string} locationKey - Tile location key
 * @param {Object} updates - Firebase updates object
 * @param {number} now - Current timestamp
 * @param {Array} [lootCollector] - Optional array to collect items from defeated groups
 * @returns {number} Number of casualties
 */
function applyAttrition(groups, casualtyRatio, worldId, chunkKey, locationKey, updates, now, lootCollector = null) {
  let casualties = 0;
  
  groups.forEach(group => {
    const groupCasualties = Math.ceil((group.unitCount || 1) * casualtyRatio);
    casualties += groupCasualties;
    
    // Update group unit count
    const remainingUnits = Math.max(0, (group.unitCount || 1) - groupCasualties);
    
    // If group is wiped out, collect items (if collector provided) and mark it for removal
    if (remainingUnits === 0) {
      // Collect items from the group before marking for removal (if collector is provided)
      if (lootCollector !== null) {
        collectItemsFromGroup(group, lootCollector);
      }
      
      // Mark group for removal (instead of also updating unitCount)
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] = null;
    } else {
      // Only update unitCount if the group is not being deleted
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/unitCount`] = remainingUnits;
    }
  });
  
  return casualties;
}

/**
 * Collect items from a group that is being removed
 * @param {Object} group - The group being removed
 * @param {Array} lootCollector - Array to collect items
 */
function collectItemsFromGroup(group, lootCollector) {
  if (!group.items) return;
  
  // Handle items stored as array
  if (Array.isArray(group.items)) {
    group.items.forEach(item => {
      if (item) lootCollector.push({...item, source: group.id});
    });
  } 
  // Handle items stored as object
  else if (typeof group.items === 'object') {
    Object.values(group.items).forEach(item => {
      if (item) lootCollector.push({...item, source: group.id});
    });
  }
  
  logger.info(`Collected ${lootCollector.length} items from defeated group ${group.id} (${group.name || "Unknown"})`);
}

/**
 * Distribute collected items to surviving groups
 * @param {Array} items - Items collected from defeated groups
 * @param {Array} groups - Surviving groups to receive items
 * @param {string} worldId - World ID
 * @param {string} chunkKey - Chunk key
 * @param {string} locationKey - Location key
 * @param {Object} updates - Firebase updates object
 * @param {number} now - Current timestamp
 */
function distributeItemsToGroups(items, groups, worldId, chunkKey, locationKey, updates, now) {
  if (items.length === 0 || groups.length === 0) return;
  
  // Sort groups by power/size (larger groups get more items)
  const sortedGroups = [...groups].sort((a, b) => {
    return (b.unitCount || 1) - (a.unitCount || 1);
  });
  
  logger.info(`Distributing ${items.length} items to ${sortedGroups.length} surviving groups`);
  
  // Distribute items proportionally based on group size
  let itemIndex = 0;
  const totalUnits = sortedGroups.reduce((sum, group) => sum + (group.unitCount || 1), 0);
  
  // Calculate how many items each group should get based on their proportion of total units
  for (let i = 0; i < sortedGroups.length; i++) {
    const group = sortedGroups[i];
    const groupUnitRatio = (group.unitCount || 1) / totalUnits;
    const itemCount = Math.max(1, Math.round(items.length * groupUnitRatio));
    
    // Don't exceed remaining items
    const itemsToAdd = Math.min(itemCount, items.length - itemIndex);
    if (itemsToAdd <= 0) break;
    
    // Get group's current items
    let existingItems = [];
    if (Array.isArray(group.items)) {
      existingItems = [...group.items];
    } else if (group.items) {
      existingItems = Object.values(group.items);
    }
    
    // Add new items to the group
    for (let j = 0; j < itemsToAdd; j++) {
      if (itemIndex >= items.length) break;
      
      const item = items[itemIndex];
      const itemWithNewId = {
        ...item,
        id: `item_battle_loot_${now}_${Math.floor(Math.random() * 10000)}`,
        lootedFrom: item.source
      };
      
      delete itemWithNewId.source;
      existingItems.push(itemWithNewId);
      itemIndex++;
    }
    
    // Update the group's items in Firebase
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/items`] = existingItems;
    
    // Add a message about looting
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/lastMessage`] = {
      text: `Looted ${itemsToAdd} item${itemsToAdd !== 1 ? 's' : ''} from the battlefield`,
      timestamp: now
    };
    
    logger.info(`Added ${itemsToAdd} looted items to group ${group.id} (${group.name || "Unknown"})`);
  }
}

// Helper function to get groups for a battle side
function getGroupsForSide(allGroups, sideGroups) {
  const result = [];
  
  for (const groupId of Object.keys(sideGroups)) {
    if (allGroups[groupId]) {
      result.push({...allGroups[groupId], id: groupId});
    }
  }
  
  return result;
}

// Helper function to check if battle should end early
function shouldEndBattleEarly(side1Groups, side2Groups) {
  return side1Groups.length === 0 || side2Groups.length === 0;
}

// Helper function to check if battle should end after attrition
function shouldEndBattleAfterAttrition(side1Groups, side2Groups, side1Power, side2Power) {
  return side1Power <= 0 || side2Power <= 0 || side1Groups.length === 0 || side2Groups.length === 0;
}

// Helper function to determine winning side
function determineWinningSide(side1Groups, side2Groups, side1Power, side2Power) {
  return (side1Groups.length > 0 && side1Power > 0) ? 1 : 2;
}

// Helper function to add battle end message to updates
function addBattleEndMessageToUpdates(updates, worldId, now, battleId, locationKey, message) {
  const [x, y] = locationKey.split(',').map(Number);
  updates[`worlds/${worldId}/chat/battle_${now}_${battleId}_${Math.floor(Math.random() * 1000)}`] = {
    text: message,
    type: "event",
    location: { x, y },
    timestamp: now
  };
}

// Helper function to add battle progress message to updates
function addBattleProgressMessageToUpdates(updates, worldId, now, battleId, locationKey, message) {
  const [x, y] = locationKey.split(',').map(Number);
  updates[`worlds/${worldId}/chat/battle_progress_${now}_${battleId}_${Math.floor(Math.random() * 1000)}`] = {
    text: message,
    type: "event",
    location: { x, y },
    timestamp: now
  };
}

// Helper function to filter out empty groups and update battle data
function filterAndRemoveEmptyGroups(groups, worldId, chunkKey, locationKey, updates, battleId, side) {
  return groups.filter(group => {
    // A group is removed if it has no units or unitCount is 0
    const hasUnits = group.units && Object.keys(group.units).length > 0;
    if (!hasUnits) {
      // Double-check that we've added the group deletion to the updates
      logger.info(`Verifying deletion of empty group ${group.id} from side ${side}`);
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] = null;
      
      // Remove from battle's side groups if battle still exists
      if (battleId) {
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/side${side}/groups/${group.id}`] = null;
      }
    }
    return hasUnits;
  });
}

// Helper function to apply damage to structure
function applyStructureDamage(structure, attackerPower, defenderPower, updates, worldId, chunkKey, locationKey) {
  // Structure takes damage proportional to attacker's power
  const baseStructureDamage = attackerPower / (attackerPower + defenderPower - calculateStructurePower(structure)) * 0.3;
  const structureDamage = Math.max(1, Math.floor(baseStructureDamage * 10));
  
  // Apply damage to structure
  structure.health = (structure.health || 100) - structureDamage;
  if (structure.health <= 0) {
    // Structure is destroyed or captured (handled at battle end)
    structure.health = 0;
  }
  updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/health`] = structure.health;
  
  return structureDamage;
}

// Helper function to calculate total power of all groups on a side
function calculateSidePower(groups) {
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
    
    // FIX: Ensure all losing groups' owners are properly marked as not alive
    // AND explicitly remove any empty losing groups
    for (const group of losingGroups) {
      if (group.owner) {
        // Make sure player is marked as not alive in their record
        updates[`players/${group.owner}/worlds/${worldId}/alive`] = false;
        logger.info(`Marking losing player ${group.owner} as not alive during battle completion`);
      }
      
      // Check if group is empty (either has no units property or units is empty)
      const hasUnits = group.units && Object.keys(group.units).length > 0;
      if (!hasUnits || group.unitCount <= 0) {
        // Explicitly remove empty groups
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] = null;
        logger.info(`Removing empty losing group ${group.id} (${group.name || "Unknown"}) during battle completion`);
      }
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
    let structureItems = [];
    let structureWasLooted = false;
    
    // Handle structure if it was in the battle
    if (includesStructure && structure) {
      if (winningSide === 1) {
        // Attackers won - structure could be destroyed or claimed
        
        // Collect structure items for looting if they exist
        if (structure.items && attackers.length > 0) {
          // Handle both array and object formats for structure items
          if (Array.isArray(structure.items)) {
            structureItems = [...structure.items];
          } else if (typeof structure.items === 'object') {
            structureItems = Object.values(structure.items);
          }
          
          // Add source info to each item
          structureItems = structureItems.map(item => ({
            ...item,
            source: `structure_${structure.id || structure.type || 'unknown'}`
          }));
          
          // Distribute items to winning groups
          if (structureItems.length > 0) {
            distributeItemsToGroups(structureItems, attackers, worldId, chunkKey, locationKey, updates, now);
            structureWasLooted = true;
          }
        }
        
        if (structure.type === "spawn") {
          // Spawn points can't be destroyed, just reset battle status
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/inBattle`] = false;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/battleId`] = null;
          
          // Spawn points keep their items
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
                
                // Remove all items since they've been looted
                if (structureWasLooted) {
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/items`] = [];
                }
                
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
        
        if (structureWasLooted) {
          resultMessage += ` (${structureItems.length} items looted)`;
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
        
        if (structureWasLooted) {
          resultMessage += ` (${structureItems.length} items looted)`;
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
    
    // Add specific loot message if structure was looted
    if (structureWasLooted) {
      const lootMessageId = `structure_looted_${now}_${Math.floor(Math.random() * 1000)}`;
      updates[`worlds/${worldId}/chat/${lootMessageId}`] = {
        text: `${attackerName} looted ${structureItems.length} items from ${structure.name || 'the structure'} at (${locationKey})`,
        type: "event",
        location: { x: parseInt(locationKey.split(',')[0]), y: parseInt(locationKey.split(',')[1]) },
        timestamp: now + 1 // +1 to ensure it appears after the battle message
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
