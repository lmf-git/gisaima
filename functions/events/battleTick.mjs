/**
 * Battle tick processing for Gisaima
 * Handles battle resolution at the end of each tick cycle
 */

import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Define CHUNK_SIZE constant for consistent usage
const CHUNK_SIZE = 20;

// Function to calculate chunk key consistently
function getChunkKey(x, y) {
  // Simple integer division works for both positive and negative coordinates
  const chunkX = Math.floor(x / CHUNK_SIZE);
  const chunkY = Math.floor(y / CHUNK_SIZE);
  return `${chunkX},${chunkY}`;
}

/**
 * Utility function to check if a group has zero units
 * 
 * @param {Object} group The group object to check
 * @returns {boolean} True if the group has zero units and should be removed
 */
function isEmptyGroup(group) {
  if (!group) return true;
  
  // Check unitCount property first
  if (group.unitCount !== undefined) {
    return group.unitCount <= 0;
  }
  
  // If no unitCount, check units array/object
  if (group.units) {
    if (Array.isArray(group.units)) {
      return group.units.length === 0;
    } else {
      return Object.keys(group.units).length === 0;
    }
  }
  
  // Default to false - don't remove if we can't determine
  return false;
}

/**
 * Process all active battles for a given world
 * 
 * @param {string} worldId The ID of the world to process battles for
 * @returns {Promise<number>} The number of battles processed
 */
export async function processBattles(worldId) {
  try {
    const db = getDatabase();
    const now = Date.now();
    
    // Get active battles
    const battlesRef = db.ref(`battles/${worldId}`).orderByChild('status').equalTo('active');
    const battlesSnapshot = await battlesRef.once('value');
    
    if (!battlesSnapshot.exists()) {
      logger.debug(`No active battles found for world ${worldId}`);
      return 0;
    }
    
    const battles = [];
    battlesSnapshot.forEach(snapshot => {
      battles.push({
        id: snapshot.key,
        ...snapshot.val()
      });
    });
    
    logger.info(`Processing ${battles.length} active battles in world ${worldId}`);
    let battleProcessCount = 0;
    
    for (const battle of battles) {
      try {
        // First check if the battle is one-sided (one side has no participants)
        const isOneSided = await checkForOneSidedBattle(db, worldId, battle);
        
        if (isOneSided) {
          // Immediately resolve one-sided battles
          await processBattleResolution(db, worldId, battle, isOneSided);
          battleProcessCount++;
          logger.info(`Battle ${battle.id} resolved early: one side has no participants`);
        }
        // If not one-sided but time has expired, resolve normally
        else if (battle.endTime && battle.endTime <= now) {
          await processBattleResolution(db, worldId, battle);
          battleProcessCount++;
        }
      } catch (error) {
        logger.error(`Error processing battle ${battle.id}:`, error);
        // Continue with other battles even if one fails
      }
    }
    
    return battleProcessCount;
  } catch (error) {
    logger.error(`Error processing battles for world ${worldId}:`, error);
    return 0;
  }
}

/**
 * Check if a battle has become one-sided (one side has no participants)
 * 
 * @param {Object} db Database reference
 * @param {string} worldId World ID
 * @param {Object} battle Battle data
 * @returns {Promise<number|false>} The winning side number if one-sided, false otherwise
 */
async function checkForOneSidedBattle(db, worldId, battle) {
  // Get the tile reference to check current groups
  const chunkKey = getChunkKey(battle.locationX, battle.locationY);
  const tileKey = `${battle.locationX},${battle.locationY}`;
  const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
  
  const tileSnapshot = await tileRef.once('value');
  if (!tileSnapshot.exists()) {
    // If tile doesn't exist, consider battle invalid
    return 1; // Default to side 1 winning if tile is gone
  }
  
  const tileData = tileSnapshot.val();
  const groupsData = tileData.groups || {};
  
  // Count active groups on each side
  let side1Count = 0;
  let side2Count = 0;
  
  // Check each group mentioned in the battle
  if (battle.side1 && battle.side1.groups) {
    for (const groupId of Object.keys(battle.side1.groups)) {
      // Group must still exist in tile data and be in this battle
      if (groupsData[groupId] && 
          groupsData[groupId].inBattle && 
          groupsData[groupId].battleId === battle.id) {
        side1Count++;
      }
    }
  }
  
  if (battle.side2 && battle.side2.groups) {
    for (const groupId of Object.keys(battle.side2.groups)) {
      // Group must still exist in tile data and be in this battle
      if (groupsData[groupId] && 
          groupsData[groupId].inBattle && 
          groupsData[groupId].battleId === battle.id) {
        side2Count++;
      }
    }
  }
  
  // If one side has no participants, the other side wins
  if (side1Count > 0 && side2Count === 0) {
    return 1; // Side 1 wins
  } else if (side1Count === 0 && side2Count > 0) {
    return 2; // Side 2 wins
  }
  
  // If both sides have participants, or neither side has participants, it's not one-sided
  return false;
}

/**
 * Process the resolution of a specific battle
 * 
 * @param {Object} db Database reference
 * @param {string} worldId World ID
 * @param {Object} battle Battle data
 * @param {number|null} forcedWinner If provided, forces this side to be the winner
 * @returns {Promise<void>}
 */
async function processBattleResolution(db, worldId, battle, forcedWinner = null) {
  try {
    const now = Date.now();
    
    let winnerSide;
    
    // If a forced winner is provided, use it
    if (forcedWinner === 1 || forcedWinner === 2) {
      winnerSide = forcedWinner;
      battle.result = {
        winningSide: winnerSide,
        earlyResolution: true,
        reason: "opposing_side_eliminated"
      };
    } else {
      // SIMPLIFIED: Randomly determine a winner instead of using power calculations
      // 50% chance for either side to win
      winnerSide = Math.random() < 0.5 ? 1 : 2;
      battle.result = {
        winningSide: winnerSide,
        randomlyDetermined: true
      };
    }
    
    // Set winner and loser based on selection
    const winningSide = winnerSide === 1 ? battle.side1 : battle.side2;
    const losingSide = winnerSide === 1 ? battle.side2 : battle.side1;
    
    // Update battle status
    battle.status = 'completed';
    battle.completedAt = now;
    
    // Get the chunk key
    const chunkKey = getChunkKey(battle.locationX, battle.locationY);
    const tileKey = `${battle.locationX},${battle.locationY}`;
    
    // Prepare updates
    const updates = {};
    
    // Update battle in database
    updates[`battles/${worldId}/${battle.id}/status`] = battle.status;
    updates[`battles/${worldId}/${battle.id}/completedAt`] = battle.completedAt;
    updates[`battles/${worldId}/${battle.id}/result`] = battle.result;

    // Update battle status in tile data as well
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/status`] = battle.status;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/winner`] = winnerSide;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/completedAt`] = now;
    
    // Schedule removal of the battle reference after a delay to allow clients to see the result
    setTimeout(async () => {
      try {
        await db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}`).remove();
      } catch (err) {
        logger.warn(`Failed to remove battle reference: ${err.message}`);
      }
    }, 60000); // Keep completed battle visible for 1 minute
    
    // Get groups from this tile to update them
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
    const tileSnapshot = await tileRef.once('value');
    
    // Prepare data for chat message
    let winningGroups = [];
    let losingGroups = [];
    
    if (tileSnapshot.exists()) {
      const tileData = tileSnapshot.val();
      
      // Process all groups on both sides
      if (tileData.groups) {
        // Get groups for chat message before processing
        const allGroups = tileData.groups;
        
        // Collect winning group names
        if (winningSide && winningSide.groups) {
          winningGroups = Object.keys(winningSide.groups)
            .map(groupId => {
              const group = allGroups[groupId];
              return group ? (group.name || `Group ${groupId}`) : `Unknown group`;
            });
        }
        
        // Collect losing group names
        if (losingSide && losingSide.groups) {
          losingGroups = Object.keys(losingSide.groups)
            .map(groupId => {
              const group = allGroups[groupId];
              return group ? (group.name || `Group ${groupId}`) : `Unknown group`;
            });
        }
        
        await processWinningGroups(updates, worldId, chunkKey, tileKey, tileData.groups, winningSide);
        await processLosingGroups(updates, worldId, chunkKey, tileKey, tileData.groups, losingSide);
      }
    }
    
    // Create battle outcome chat message with more detail
    const winSideText = winnerSide === 1 ? "Attackers" : "Defenders";
    const battleChatText = `Battle at (${battle.locationX}, ${battle.locationY}) has ended!`;
    
    // Add details about groups
    let detailedMessage = battleChatText;
    if (winningGroups.length > 0) {
      detailedMessage += ` Victorious: ${winningGroups.join(', ')}`;
    }
    if (losingGroups.length > 0) {
      detailedMessage += ` Defeated: ${losingGroups.join(', ')}`;
    }
    
    // Add special message if it was a one-sided victory
    if (forcedWinner) {
      detailedMessage += ` (Decisive Victory)`;
    }

    // Add to world chat
    const chatMessageId = `battle_${now}_${battle.id}`;
    updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
      text: detailedMessage,
      type: 'event',
      timestamp: now,
      location: {
        x: battle.locationX,
        y: battle.locationY
      }
    };
    
    // Apply all updates
    await db.ref().update(updates);
    
    const resolutionReason = forcedWinner ? "one-sided battle" : "time expiration";
    logger.info(`Completed battle ${battle.id} in world ${worldId} - Side ${winnerSide} won (${resolutionReason})`);
    
  } catch (error) {
    logger.error(`Error processing battle ${battle.id}:`, error);
    throw error; // Re-throw to be handled by caller
  }
}

/**
 * Process winning groups - set them back to idle state
 * Groups with zero units will be removed
 */
async function processWinningGroups(updates, worldId, chunkKey, tileKey, groups, winningSide) {
  const winningGroupIds = Object.keys(winningSide.groups || {});
  
  for (const groupId of winningGroupIds) {
    const group = groups[groupId];
    if (!group) continue;
    
    // Check if group has any units left
    if (isEmptyGroup(group)) {
      // Remove empty groups
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`] = null;
      logger.info(`Removing empty winning group ${groupId} at ${tileKey}`);
      continue;
    }

    // Only update status for groups that still have units
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/inBattle`] = false;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleId`] = null;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleSide`] = null;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleRole`] = null;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`] = 'idle';
    
    // Only add victory message for groups with units
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/lastMessage`] = {
      text: `Victory in battle!`,
      timestamp: Date.now()
    };
  }
}

/**
 * Process losing groups - remove them and mark players as dead
 */
async function processLosingGroups(updates, worldId, chunkKey, tileKey, groups, losingSide) {
  const losingGroupIds = Object.keys(losingSide.groups || {});
  const now = Date.now();
  
  for (const groupId of losingGroupIds) {
    if (groups[groupId]) {
      const group = groups[groupId];
      
      // Find any player in this group and mark them as dead
      if (group.units) {
        // Handle both array and object structure for units
        const units = Array.isArray(group.units) ? 
          group.units : Object.values(group.units);
        
        for (const unit of units) {
          if (unit.type === 'player' && unit.id) {
            // Mark player as dead (not alive)
            logger.info(`Player ${unit.id} died in battle (group ${groupId})`);
            updates[`players/${unit.id}/worlds/${worldId}/alive`] = false;
            updates[`players/${unit.id}/worlds/${worldId}/inGroup`] = null;
            updates[`players/${unit.id}/worlds/${worldId}/lastMessage`] = {
              text: `You were defeated in battle.`,
              timestamp: now
            };
            
            // Add player death announcement to chat
            const playerName = unit.name || "Unknown player";
            const chatMessageId = `death_${now}_${unit.id}`;
            updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
              text: `${playerName} was defeated in battle at (${tileKey.replace(',', ', ')})`,
              type: 'event',
              timestamp: now,
              location: {
                x: parseInt(tileKey.split(',')[0]),
                y: parseInt(tileKey.split(',')[1])
              }
            };
          }
        }
      }
      
      // Remove the entire losing group
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`] = null;
    }
  }
}
