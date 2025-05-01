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
  const now = Date.now();
  
  // Track groups marked for deletion to avoid update conflicts
  const deletedGroupIds = new Set();
  // Track paths that will be completely deleted to avoid conflicts
  const deletedPaths = new Set();
  
  try {
    // Extract groups from tile data
    const groups = tileData.groups || {};
    
    // Get groups for each side from the already-loaded tile data
    const side1Groups = getGroupsForSide(groups, battleData.side1?.groups || {});
    const side2Groups = getGroupsForSide(groups, battleData.side2?.groups || {});
    
    // Log clearer information about groups before processing
    logger.info(`Battle ${battleId} at (${locationKey}): Side 1 has ${side1Groups.length} groups with ${calculateSidePower(side1Groups)} power, Side 2 has ${side2Groups.length} groups with ${calculateSidePower(side2Groups)} power`);
    
    // Early check if either side has no groups or no units - end battle immediately
    if (shouldEndBattleEarly(side1Groups, side2Groups)) {
      // Determine which side has units
      const side1HasUnits = side1Groups.some(group => (group.unitCount && group.unitCount > 0));
      const side2HasUnits = side2Groups.some(group => (group.unitCount && group.unitCount > 0));
      
      // Determine the winning side based on which side has units
      let winningSide;
      if (side1HasUnits && !side2HasUnits) {
        winningSide = 1;
      } else if (!side1HasUnits && side2HasUnits) {
        winningSide = 2;
      } else {
        // If neither side has units, use side with most groups or default to side 1
        winningSide = (side1Groups.length >= side2Groups.length) ? 1 : 2;
      }
      
      const winningGroups = winningSide === 1 ? side1Groups : side2Groups;
      
      logger.info(`Battle ${battleId} ending early: Side ${winningSide} wins due to absence of opposing groups or units`);
      
      // Get structure directly from tileData if involved
      let structure = battleData.targetTypes?.includes("structure") ? tileData.structure : null;
      
      // IMPORTANT: We no longer delete the battle in this updates batch 
      // We'll prepare group updates first, then handle battle deletion separately
      const groupUpdates = {};
      
      // Add battle end message
      addBattleEndMessageToUpdates(
        groupUpdates, worldId, now, battleId, locationKey,
        "Battle has ended! One side had no units."
      );
      
      // First apply all group updates
      await db.ref().update(groupUpdates);
      
      // Then handle battle ending (which includes battle deletion)
      await endBattle(worldId, chunkKey, locationKey, battleId, winningSide, winningGroups, structure);
      
      return { success: true };
    }
    
    // ...existing code...

    // IMPORTANT: When a battle needs to end, we now separate the updates into two batches
    // One for group updates, and another for battle deletion

    // Special handling for both sides being completely eliminated
    if (filteredSide1Groups.length === 0 && filteredSide2Groups.length === 0) {
      logger.info(`Battle ${battleId}: Both sides eliminated - ending battle as a draw`);
      
      // First apply all non-battle updates (groups, chat messages, etc.)
      const nonBattleUpdates = {};
      
      // Make sure to delete any monster groups that might remain in the database
      for (const groupId in battleData.side1?.groups || {}) {
        if (groupId.startsWith('monster_')) {
          nonBattleUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}`] = null;
          logger.info(`Deleting monster group ${groupId} from side 1 in mutual destruction scenario`);
        }
      }
      
      for (const groupId in battleData.side2?.groups || {}) {
        if (groupId.startsWith('monster_')) {
          nonBattleUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}`] = null;
          logger.info(`Deleting monster group ${groupId} from side 2 in mutual destruction scenario`);
        }
      }
      
      // Add battle end message for mutual destruction
      addBattleEndMessageToUpdates(
        nonBattleUpdates, worldId, now, battleId, locationKey,
        `Battle has ended in mutual destruction! All units on both sides were defeated.`
      );
      
      // First apply non-battle updates
      await db.ref().update(nonBattleUpdates);
      
      // Then delete the battle
      await db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}`).remove();
      
      logger.info(`Battle ${battleId} ended in mutual destruction - removed battle reference`);
    } 
    else if (shouldEndBattleAfterAttrition(filteredSide1Groups, filteredSide2Groups, side1Power, side2Power)) {
      // Determine winner based on remaining groups and power
      const winningSide = determineWinningSide(filteredSide1Groups, filteredSide2Groups, side1Power, side2Power);
      const winningGroups = winningSide === 1 ? filteredSide1Groups : filteredSide2Groups;
      const losingGroups = winningSide === 1 ? filteredSide2Groups : filteredSide1Groups;
      
      logger.info(`Battle ${battleId} ending: Side ${winningSide} wins with ${winningGroups.length} groups remaining`);
      
      // First apply all group updates without touching the battle
      const nonBattleUpdates = {};
      
      // Add battle end message with casualties
      addBattleEndMessageToUpdates(
        nonBattleUpdates, worldId, now, battleId, locationKey,
        `Battle has ended after ${battleData.tickCount + 1} ticks! ` +
        `Victorious: ${getWinnerName(winningGroups)} Defeated: ${getLoserName(losingGroups)} ` +
        `(${side1Casualties + side2Casualties} casualties)`
      );
      
      // Apply non-battle updates first
      await db.ref().update(nonBattleUpdates);
      
      // Then handle battle ending (which includes battle deletion)
      await endBattle(worldId, chunkKey, locationKey, battleId, winningSide, winningGroups, structure);
    }
    // NEW: Handle the case where both sides have minimal power (stalemate)
    else if (side1Power <= 1 && side2Power <= 1) {
      // It's a stalemate with minimal forces - pick a random winner
      const randomWinningSide = Math.random() < 0.5 ? 1 : 2;
      const winningGroups = randomWinningSide === 1 ? filteredSide1Groups : filteredSide2Groups;
      const losingGroups = randomWinningSide === 1 ? filteredSide2Groups : filteredSide1Groups;
      
      logger.info(`Battle ${battleId} ending in stalemate: Randomly choosing side ${randomWinningSide} as winner`);
      
      // First apply group updates
      const nonBattleUpdates = {};
      
      // Add battle end message for stalemate
      addBattleEndMessageToUpdates(
        nonBattleUpdates, worldId, now, battleId, locationKey,
        `Battle has ended in stalemate after ${battleData.tickCount + 1} ticks! ` +
        `By fortune's favor, ${getWinnerName(winningGroups)} emerges victorious against ${getLoserName(losingGroups)}.`
      );
      
      // Apply non-battle updates first
      await db.ref().update(nonBattleUpdates);
      
      // Then handle battle ending (which includes battle deletion)
      await endBattle(worldId, chunkKey, locationKey, battleId, randomWinningSide, winningGroups, structure);
    }
    else if (side1Casualties + side2Casualties > 0) {
      // Battle continues - add message about casualties if any
      const lootMessage = (side1Loot.length > 0 || side2Loot.length > 0) ? 
        ` Items were looted from the fallen.` : '';
        
      addBattleProgressMessageToUpdates(
        updates, worldId, now, battleId, locationKey,
        `Battle rages! ${side1Casualties + side2Casualties} casualties this tick.${lootMessage}`
      );
      
      // Clean up any conflicting updates before submitting
      cleanupConflictingUpdates(updates, deletedPaths);
      
      // Apply all updates
      await db.ref().update(updates);
    }
    
    return { success: true };
    
  } catch (error) {
    console.error("Error processing battle tick:", error);
    return { success: false, error: error.message };
  }
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
    
    // Prepare updates object for groups and related data (NOT for battle deletion)
    const groupUpdates = {};
    
    // Process groups based on battle outcome
    const losingGroups = winningSide === 1 ? defenders : attackers;
    
    // Update winning groups
    if (winningGroups) {
      // Track unique winning owners for achievements
      const winningOwners = new Set();
      
      for (const group of winningGroups) {
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/inBattle`] = false;
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleId`] = null;
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleSide`] = null;
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleRole`] = null;
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/status`] = "idle";
        
        // Add victory message
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/lastMessage`] = {
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
        groupUpdates[`players/${ownerId}/worlds/${worldId}/achievements/first_victory`] = true;
        groupUpdates[`players/${ownerId}/worlds/${worldId}/achievements/first_victory_date`] = now;
        logger.info(`Granting first_victory achievement to player ${ownerId}`);
      });
    }
    
    // Explicitly check and remove all losing groups that were involved in the battle
    for (const group of losingGroups) {
      // Always check if any losing group was a monster group that should be removed
      if (group.id.startsWith('monster_')) {
        logger.info(`Removing defeated monster group ${group.id} (${group.name || "Unknown"}) after battle`);
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] = null;
        continue;
      }
      
      // Check if group is empty (either has no units property or units is empty)
      const hasUnits = group.units && Object.keys(group.units).length > 0;
      if (!hasUnits || group.unitCount <= 0) {
        // Explicitly remove empty groups
        logger.info(`Removing empty losing group ${group.id} (${group.name || "Unknown"}) after battle`);
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] = null;
      } else {
        // For non-empty groups, just reset battle status flags
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/inBattle`] = false;
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleId`] = null;
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleSide`] = null;
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/status`] = "idle";
      }
    }
    
    // ...existing code for handling casualties, structures, etc...
    
    // Handle structure if it was in the battle
    if (includesStructure && structure) {
      if (winningSide === 1) {
        // ...existing structure update code...
        
        if (structure.type === "spawn") {
          // Spawn points can't be destroyed, just reset battle status
          groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/inBattle`] = false;
          groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/battleId`] = null;
        } else {
          // Reset battle status for non-spawn structures
          groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/inBattle`] = false;
          groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/battleId`] = null;
        }
      } else {
        // Defenders won - structure stays intact
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/inBattle`] = false;
        groupUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/battleId`] = null;
      }
    }
    
    // Add battle outcome to chat
    const attackerName = attackers.length > 0 ? attackers[0].name || "Unknown Force" : "Unknown Force";
    
    // Build a result message based on what was being attacked
    let resultMessage = `Battle at (${locationKey}) has ended after ${battleData.tickCount || 1} ticks! `;
    
    // ...existing code for building result message...
    
    // Add battle outcome message to group updates
    const messageId = `battle_${now}_${battleId}_${Math.floor(Math.random() * 1000)}`;
    groupUpdates[`worlds/${worldId}/chat/${messageId}`] = {
      text: resultMessage,
      type: "event",
      location: { x: parseInt(locationKey.split(',')[0]), y: parseInt(locationKey.split(',')[1]) },
      timestamp: now
    };
    
    // 1. First apply all group updates
    await db.ref().update(groupUpdates);
    logger.info(`Applied group updates for battle ${battleId} ending`);
    
    // 2. Then delete the battle entry
    await battleRef.remove();
    logger.info(`Battle ${battleId} ended and removed. Winner: side ${winningSide}`);
    
  } catch (error) {
    logger.error(`Error ending battle ${battleId}:`, error);
  }
}

// ...existing code...

/**
 * Clean up any updates that would conflict with deleted paths
 * @param {Object} updates - Updates object for Firebase
 * @param {Set} deletedPaths - Set of paths being deleted
 */
function cleanupConflictingUpdates(updates, deletedPaths) {
  if (!updates || !deletedPaths || deletedPaths.size === 0) return;
  
  // Make a copy of the paths to check
  const updatePaths = Object.keys(updates);
  
  // For each update path, check if it's under a deleted path
  for (const updatePath of updatePaths) {
    // Skip paths that are themselves being deleted
    if (updates[updatePath] === null) continue;
    
    // Check if this path is a child of any deleted path
    for (const deletedPath of deletedPaths) {
      // If the update path starts with deleted path plus a slash, it's a child
      if (updatePath.startsWith(deletedPath + '/')) {
        // This update is under a deleted path, so remove it
        delete updates[updatePath];
        logger.info(`Removed conflicting update to ${updatePath} (under deleted path ${deletedPath})`);
        break;
      }
      
      // Also check if the deleted path is a child of this update path
      // This handles conflicts when trying to update a parent while deleting a child
      if (deletedPath.startsWith(updatePath + '/')) {
        logger.warn(`Conflict detected: Cannot update ${updatePath} while deleting its child ${deletedPath}`);
        // In this case, we should typically keep the deletion and skip the parent update
        if (updates[updatePath] !== null) {
          delete updates[updatePath];
          logger.info(`Removed conflicting parent update to ${updatePath} (has deleted child ${deletedPath})`);
        }
        break;
      }
    }
  }
}

// ...existing code...
