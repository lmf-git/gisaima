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
 * Collect all items from the losing groups
 * 
 * @param {Object} groups All groups on the tile
 * @param {Object} losingSide The side that lost the battle
 * @returns {Array} Array of collected items
 */
function collectLootFromLosingGroups(groups, losingSide) {
  const losingGroupIds = Object.keys(losingSide.groups || {});
  const allLoot = [];
  
  for (const groupId of losingGroupIds) {
    const group = groups[groupId];
    if (!group) continue;
    
    // Check if group has items
    if (group.items) {
      // Handle both array and object structure for items
      const items = Array.isArray(group.items) ? 
        group.items : Object.values(group.items);
      
      // Add all items to the loot pile
      allLoot.push(...items);
    }
  }
  
  return allLoot;
}

/**
 * Distribute collected loot among winning groups
 * 
 * @param {Object} updates Database updates object
 * @param {string} worldId The world ID
 * @param {string} chunkKey Chunk key for the location
 * @param {string} tileKey Tile key for the location
 * @param {Object} groups All groups on the tile
 * @param {Object} winningSide The side that won the battle
 * @param {Array} loot The items collected from losing groups
 */
function distributeLootToWinningGroups(updates, worldId, chunkKey, tileKey, groups, winningSide, loot) {
  if (!loot || loot.length === 0) return; // No loot to distribute
  
  const winningGroupIds = Object.keys(winningSide.groups || {});
  // Filter out any winning groups that don't actually exist in the groups data
  const activeWinningGroups = winningGroupIds.filter(groupId => groups[groupId]);
  
  if (activeWinningGroups.length === 0) return; // No groups to receive loot
  
  // If only one winning group, give them all the loot
  if (activeWinningGroups.length === 1) {
    const groupId = activeWinningGroups[0];
    const group = groups[groupId];
    
    // Get existing items (if any)
    let existingItems = [];
    if (group.items) {
      existingItems = Array.isArray(group.items) ? 
        [...group.items] : [...Object.values(group.items)];
    }
    
    // Add all loot to this group
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/items`] = [
      ...existingItems,
      ...loot
    ];
    
    // Add message about looting
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/lastMessage`] = {
      text: `Looted ${loot.length} items from battle!`,
      timestamp: Date.now()
    };
    
    return;
  }
  
  // Distribute items randomly among winning groups
  // Create a counter to track how many items each group receives
  const lootCounts = {};
  activeWinningGroups.forEach(groupId => lootCounts[groupId] = 0);
  
  // For each item, pick a random winning group
  for (const item of loot) {
    const randomIndex = Math.floor(Math.random() * activeWinningGroups.length);
    const groupId = activeWinningGroups[randomIndex];
    const group = groups[groupId];
    
    // Get existing items (if any) for this group
    let existingItems = [];
    if (group.items) {
      existingItems = Array.isArray(group.items) ? 
        [...group.items] : [...Object.values(group.items)];
    }
    
    // The path to this group's items
    const itemsPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/items`;
    
    // Add this item to the existing items array
    if (!updates[itemsPath]) {
      updates[itemsPath] = [...existingItems];
    }
    
    // Add the item
    updates[itemsPath].push(item);
    
    // Increment the counter for this group
    lootCounts[groupId] = (lootCounts[groupId] || 0) + 1;
  }
  
  // Add looting messages for each group that received items
  for (const [groupId, count] of Object.entries(lootCounts)) {
    if (count > 0) {
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/lastMessage`] = {
        text: `Looted ${count} items from battle!`,
        timestamp: Date.now()
      };
    }
  }
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
    
    // Find active battles by scanning world chunks
    // We'll build a list of all active battles by checking tile data
    const activeBattles = [];
    
    // Get all chunks in the world
    const chunksRef = db.ref(`worlds/${worldId}/chunks`);
    const chunksSnapshot = await chunksRef.once('value');
    
    if (!chunksSnapshot.exists()) {
      logger.debug(`No chunks found for world ${worldId}`);
      return 0;
    }
    
    // Scan each chunk for battles
    await chunksSnapshot.forEach(async (chunkSnapshot) => {
      const chunkKey = chunkSnapshot.key;
      const chunk = chunkSnapshot.val();
      
      // Skip non-tile entries like 'lastUpdated'
      if (typeof chunk !== 'object') return;
      
      // Check each tile in the chunk
      for (const [tileKey, tileData] of Object.entries(chunk)) {
        // Skip non-tile entries
        if (!tileData || typeof tileData !== 'object') continue;
        
        // Check if the tile has battles
        if (tileData.battles) {
          for (const [battleId, battle] of Object.entries(tileData.battles)) {
            // Only process active battles
            if (battle.status !== 'completed') {
              // Extract coordinates from tileKey
              const [x, y] = tileKey.split(',').map(Number);
              
              // Collect the battle data with location info
              activeBattles.push({
                id: battleId,
                locationX: x,
                locationY: y,
                ...battle,
                tileRef: `worlds/${worldId}/chunks/${chunkKey}/${tileKey}`
              });
            }
          }
        }
      }
    });
    
    logger.info(`Processing ${activeBattles.length} active battles in world ${worldId}`);
    let battleProcessCount = 0;
    
    for (const battle of activeBattles) {
      try {
        // For ALL active battles, check if they're one-sided
        // Remove the endTime condition - battles continue until one side is eliminated
        const isOneSided = await checkForOneSidedBattle(db, worldId, battle);
        
        if (isOneSided) {
          // Resolve battles when they become one-sided
          await processBattleResolution(db, worldId, battle, isOneSided);
          battleProcessCount++;
          logger.info(`Battle ${battle.id} resolved: one side has no participants`);
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
  
  // Get the battle data directly from the tile
  const battleData = tileData.battles && tileData.battles[battle.id];
  if (!battleData) {
    return 1; // Default to side 1 if battle data is missing
  }
  
  // Scan all groups to find those participating in this battle
  for (const [groupId, group] of Object.entries(groupsData)) {
    if (group.inBattle && group.battleId === battle.id) {
      if (group.battleSide === 1) {
        side1Count++;
      } else if (group.battleSide === 2) {
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
        reason: "opposing_side_eliminated"
      };
    } else {
      // This should rarely happen since we're only resolving one-sided battles
      // But keep it as a fallback
      winnerSide = Math.random() < 0.5 ? 1 : 2;
      battle.result = {
        winningSide: winnerSide,
        randomlyDetermined: true
      };
    }
    
    // Get the chunk key
    const chunkKey = getChunkKey(battle.locationX, battle.locationY);
    const tileKey = `${battle.locationX},${battle.locationY}`;
    
    // Prepare updates
    const updates = {};
    
    // Get groups from this tile to process them
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
    const tileSnapshot = await tileRef.once('value');
    
    if (!tileSnapshot.exists()) {
      logger.warn(`Tile ${tileKey} does not exist, cannot resolve battle ${battle.id}`);
      return;
    }
    
    const tileData = tileSnapshot.val();
    const groupsData = tileData.groups || {};
    
    // Rebuild the sides data from the current groups state
    const side1Groups = {};
    const side2Groups = {};
    
    // Find all groups involved in this battle
    for (const [groupId, group] of Object.entries(groupsData)) {
      if (group.inBattle && group.battleId === battle.id) {
        if (group.battleSide === 1) {
          side1Groups[groupId] = true;
        } else if (group.battleSide === 2) {
          side2Groups[groupId] = true;
        }
      }
    }
    
    // Use the reconstructed sides info for battle resolution
    const winningSide = { 
      groups: winnerSide === 1 ? side1Groups : side2Groups 
    };
    const losingSide = { 
      groups: winnerSide === 1 ? side2Groups : side1Groups 
    };
    
    // Prepare data for chat message
    let winningGroups = [];
    let losingGroups = [];
    let battleLoot = []; // Track looted items
    
    // Process all groups on both sides
    if (Object.keys(groupsData).length > 0) {
      // Collect winning group names
      if (winningSide && winningSide.groups) {
        winningGroups = Object.keys(winningSide.groups)
          .map(groupId => {
            const group = groupsData[groupId];
            return group ? (group.name || `Group ${groupId}`) : `Unknown group`;
          });
      }
      
      // Collect losing group names
      if (losingSide && losingSide.groups) {
        losingGroups = Object.keys(losingSide.groups)
          .map(groupId => {
            const group = groupsData[groupId];
            return group ? (group.name || `Group ${groupId}`) : `Unknown group`;
          });
      }
      
      // Collect loot from losing groups before processing them
      battleLoot = collectLootFromLosingGroups(groupsData, losingSide);
      
      // Distribute loot to winning groups if there's any loot
      if (battleLoot.length > 0) {
        distributeLootToWinningGroups(
          updates, 
          worldId, 
          chunkKey, 
          tileKey, 
          groupsData, 
          winningSide, 
          battleLoot
        );
      }
      
      // Process winning and losing groups
      await processWinningGroups(updates, worldId, chunkKey, tileKey, groupsData, winningSide);
      await processLosingGroups(updates, worldId, chunkKey, tileKey, groupsData, losingSide);
    }
    
    // Update battle status in the tile record to completed
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/status`] = 'completed';
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/winner`] = winnerSide;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/completedAt`] = now;
    
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
    
    // Add information about items looted
    if (battleLoot.length > 0) {
      detailedMessage += ` (${battleLoot.length} items seized)`;
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
    
    const resolutionReason = forcedWinner ? "one side eliminated" : "system resolution";
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
