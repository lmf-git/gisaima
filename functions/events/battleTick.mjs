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
        // Load tile data once for each battle
        const chunkKey = getChunkKey(battle.locationX, battle.locationY);
        const tileKey = `${battle.locationX},${battle.locationY}`;
        const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
        const tileSnapshot = await tileRef.once('value');
        
        if (!tileSnapshot.exists()) {
          logger.warn(`Tile ${tileKey} does not exist, skipping battle ${battle.id}`);
          continue;
        }
        
        const tileData = tileSnapshot.val();
        
        // Check if battle has become one-sided
        const winningSide = checkForOneSidedBattle(battle, tileData);
        
        if (winningSide) {
          // Resolve battles when they become one-sided
          await processBattleResolution(db, worldId, battle, tileData, winningSide);
          battleProcessCount++;
          logger.info(`Battle ${battle.id} resolved: side ${winningSide} victorious`);
          continue;
        }
        
        // Calculate total units involved in battle
        const totalUnits = calculateTotalUnitsInBattle(battle, tileData);
        
        // For ongoing battles, determine if they should be resolved this tick based on size
        const battleAge = now - (battle.startTime || battle.started || now);
        const shouldResolveNow = shouldResolveBattle(totalUnits, battleAge);
        
        if (shouldResolveNow) {
          // Determine winner normally since it's not one-sided
          const calculatedWinner = calculateBattleWinner(battle, tileData);
          
          await processBattleResolution(db, worldId, battle, tileData, calculatedWinner);
          battleProcessCount++;
          logger.info(`Battle ${battle.id} resolved after duration: stronger side ${calculatedWinner} victorious`);
        } else {
          logger.debug(`Battle ${battle.id} continues - ${totalUnits} units involved, age: ${Math.round(battleAge/1000)}s`);
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
 * Calculate the total number of units involved in a battle
 * 
 * @param {Object} battle Battle data
 * @param {Object} tileData Tile data
 * @returns {number} Total units
 */
function calculateTotalUnitsInBattle(battle, tileData) {
  const groupsData = tileData.groups || {};
  let totalUnits = 0;
  
  // Add up all units from groups involved in this battle
  for (const [groupId, group] of Object.entries(groupsData)) {
    if (group.inBattle && group.battleId === battle.id) {
      totalUnits += group.unitCount || 1;
    }
  }
  
  return totalUnits;
}

/**
 * Determine if a battle should be resolved this tick based on size and age
 * 
 * @param {number} totalUnits Total units involved
 * @param {number} battleAge Age of battle in milliseconds
 * @returns {boolean} Whether the battle should be resolved
 */
function shouldResolveBattle(totalUnits, battleAge) {
  // Base probability of resolution each tick
  let baseChance = 0.4; // 40% chance for small battles
  
  // If battle has fewer than 5 units, use base chance
  if (totalUnits <= 5) {
    return Math.random() < baseChance;
  }
  
  // For larger battles, reduce the chance based on unit count
  const unitFactor = Math.log10(totalUnits) * 0.5; // Logarithmic scaling
  const chance = baseChance / (1 + unitFactor);
  
  // Increase chance based on battle age (battles shouldn't last forever)
  const ageInMinutes = battleAge / (60 * 1000);
  const ageBonus = Math.min(0.3, ageInMinutes * 0.05); // Max +30% after 6 minutes
  
  // Calculate final resolution probability
  const finalChance = chance + ageBonus;
  
  // Add some debug logging
  logger.debug(`Battle resolution chance: ${(finalChance * 100).toFixed(1)}% (${totalUnits} units, ${ageInMinutes.toFixed(1)} minutes)`);
  
  return Math.random() < finalChance;
}

/**
 * Calculate the winner based on relative strength when battle is not one-sided
 * 
 * @param {Object} battle Battle data
 * @param {Object} tileData Tile data
 * @returns {number} Winning side (1 or 2)
 */
function calculateBattleWinner(battle, tileData) {
  const groupsData = tileData.groups || {};
  let side1Power = 0;
  let side2Power = 0;
  
  // Calculate power for each side
  for (const [groupId, group] of Object.entries(groupsData)) {
    if (group.inBattle && group.battleId === battle.id) {
      if (group.battleSide === 1) {
        side1Power += group.unitCount || 1;
      } else if (group.battleSide === 2) {
        side2Power += group.unitCount || 1;
      }
    }
  }
  
  // Handle exactly equal power - pure 50/50 random outcome
  if (side1Power === side2Power) {
    logger.info(`Battle ${battle.id} has exactly equal sides (${side1Power} vs ${side2Power}) - picking random winner`);
    return Math.random() < 0.5 ? 1 : 2;
  }
  
  // For nearly equal power (within 20%), increase randomness
  const powerDifferenceRatio = Math.abs(side1Power - side2Power) / Math.max(side1Power, side2Power);
  if (powerDifferenceRatio < 0.2) { // Power difference less than 20%
    logger.info(`Battle ${battle.id} has nearly equal sides (${side1Power} vs ${side2Power}) - mostly random outcome`);
    
    // Give slight advantage to stronger side, but mostly random
    const strongerSide = side1Power > side2Power ? 1 : 2;
    const weakerSide = strongerSide === 1 ? 2 : 1;
    
    // 60/40 odds favoring stronger side for small differences
    return Math.random() < 0.6 ? strongerSide : weakerSide;
  }
  
  // For more significant differences, use power ratio
  const powerRatio = side1Power / Math.max(side2Power, 1);
  
  // Use power ratio to determine winner with some randomness
  // Stronger side has better odds but upsets are possible
  const threshold = 1 / (1 + powerRatio); // Converts ratio to probability
  return Math.random() > threshold ? 1 : 2;
}

/**
 * Check if a battle has become one-sided (one side has no participants)
 * 
 * @param {Object} battle Battle data
 * @param {Object} tileData Pre-loaded tile data
 * @returns {number|false} The winning side number (1 or 2) if one-sided, false otherwise
 */
function checkForOneSidedBattle(battle, tileData) {
  // No need to load tile data again - use what was provided
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
 * @param {Object} tileData Pre-loaded tile data
 * @param {number} winningSide The winning side (1 or 2)
 * @returns {Promise<void>}
 */
async function processBattleResolution(db, worldId, battle, tileData, winningSide) {
  try {
    const now = Date.now();
    
    // Get the chunk key
    const chunkKey = getChunkKey(battle.locationX, battle.locationY);
    const tileKey = `${battle.locationX},${battle.locationY}`;
    
    // Update tileData if needed (fallback for direct API calls)
    if (!tileData) {
      const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
      const tileSnapshot = await tileRef.once('value');
      
      if (!tileSnapshot.exists()) {
        logger.warn(`Tile ${tileKey} does not exist, cannot resolve battle ${battle.id}`);
        return;
      }
      
      tileData = tileSnapshot.val();
    }
    
    // Validate winning side
    if (winningSide !== 1 && winningSide !== 2) {
      logger.error(`Invalid winningSide value: ${winningSide}`);
      return;
    }
    
    // Set battle result
    battle.result = {
      winningSide,
      reason: "opposing_side_eliminated"
    };
    
    // Prepare updates
    const updates = {};
    const groupsData = tileData.groups || {};
    
    // Rebuild the sides data from the current groups state
    const side1Groups = {};
    const side2Groups = {};
    let side1Power = 0;
    let side2Power = 0;
    
    // Track initial unit counts for calculating casualties
    const initialUnitCounts = {};
    
    // Find all groups involved in this battle
    for (const [groupId, group] of Object.entries(groupsData)) {
      if (group.inBattle && group.battleId === battle.id) {
        // Store initial unit count for casualty calculation
        initialUnitCounts[groupId] = group.unitCount || 1;
        
        if (group.battleSide === 1) {
          side1Groups[groupId] = true;
          side1Power += group.unitCount || 1;
        } else if (group.battleSide === 2) {
          side2Groups[groupId] = true;
          side2Power += group.unitCount || 1;
        }
      }
    }
    
    // Use the reconstructed sides info for battle resolution
    const victorSide = { 
      groups: winningSide === 1 ? side1Groups : side2Groups,
      power: winningSide === 1 ? side1Power : side2Power 
    };
    const defeatedSide = { 
      groups: winningSide === 1 ? side2Groups : side1Groups,
      power: winningSide === 1 ? side2Power : side1Power
    };
    
    // Prepare data for casualties and battle statistics
    const battleStats = {
      startTime: battle.startTime || battle.started,
      endTime: now,
      duration: now - (battle.startTime || battle.started),
      initialStrength: {
        side1: side1Power,
        side2: side2Power
      },
      winningSide: winningSide,
      casualties: {
        side1: 0,
        side2: 0,
        total: 0
      },
      survivingUnits: {
        side1: 0,
        side2: 0,
        total: 0
      }
    };
    
    // Calculate casualties based on relative strength
    const powerRatio = Math.max(victorSide.power, 1) / Math.max(defeatedSide.power || 1, 1);
    let victorCasualtyRate;
    
    // Calculate casualty rate based on the power ratio
    if (powerRatio > 5) {
      // Overwhelming advantage - very minimal casualties
      victorCasualtyRate = 0.01 + (Math.random() * 0.04); // 1-5%
    } else if (powerRatio > 3) {
      // Strong advantage - low casualties
      victorCasualtyRate = 0.03 + (Math.random() * 0.07); // 3-10%
    } else if (powerRatio > 1.5) {
      // Moderate advantage - some casualties
      victorCasualtyRate = 0.05 + (Math.random() * 0.10); // 5-15%
    } else {
      // Close match - higher casualties
      victorCasualtyRate = 0.10 + (Math.random() * 0.15); // 10-25%
    }
    
    // Prepare data for chat message
    let winningGroups = [];
    let losingGroups = [];
    let battleLoot = []; // Track looted items
    
    // Calculate total initial units on each side for statistics
    const totalInitialSide1 = Object.keys(side1Groups).reduce((total, groupId) => 
      total + (initialUnitCounts[groupId] || 0), 0);
    const totalInitialSide2 = Object.keys(side2Groups).reduce((total, groupId) => 
      total + (initialUnitCounts[groupId] || 0), 0);
    
    // Process all groups on both sides
    if (Object.keys(groupsData).length > 0) {
      // Collect winning group names
      if (victorSide && victorSide.groups) {
        winningGroups = Object.keys(victorSide.groups)
          .map(groupId => {
            const group = groupsData[groupId];
            return group ? (group.name || `Group ${groupId}`) : `Unknown group`;
          });
      }
      
      // Collect losing group names
      if (defeatedSide && defeatedSide.groups) {
        losingGroups = Object.keys(defeatedSide.groups)
          .map(groupId => {
            const group = groupsData[groupId];
            return group ? (group.name || `Group ${groupId}`) : `Unknown group`;
          });
      }
      
      // Collect loot from losing groups before processing them
      battleLoot = collectLootFromLosingGroups(groupsData, defeatedSide);
      
      // Distribute loot to winning groups if there's any loot
      if (battleLoot.length > 0) {
        distributeLootToWinningGroups(
          updates, 
          worldId, 
          chunkKey, 
          tileKey, 
          groupsData, 
          victorSide, 
          battleLoot
        );
      }
      
      // Process losing groups (complete defeat - all units lost)
      const losingCasualties = processLosingGroups(updates, worldId, chunkKey, tileKey, groupsData, defeatedSide);
      battleStats.casualties[winningSide === 1 ? 'side2' : 'side1'] = losingCasualties;
      
      // Process winning groups with casualties
      const winningCasualties = processWinningGroupsWithCasualties(
        updates, worldId, chunkKey, tileKey, groupsData, victorSide, victorCasualtyRate
      );
      battleStats.casualties[winningSide === 1 ? 'side1' : 'side2'] = winningCasualties;
    }
    
    // Calculate totals for battle statistics
    battleStats.casualties.total = battleStats.casualties.side1 + battleStats.casualties.side2;
    battleStats.survivingUnits.side1 = totalInitialSide1 - battleStats.casualties.side1;
    battleStats.survivingUnits.side2 = totalInitialSide2 - battleStats.casualties.side2;
    battleStats.survivingUnits.total = battleStats.survivingUnits.side1 + battleStats.survivingUnits.side2;
    
    // Update battle status and store detailed results in the tile record
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/status`] = 'completed';
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/winner`] = winningSide;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/completedAt`] = now;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/results`] = battleStats;
    
    // Create battle outcome chat message with more detail
    const winSideText = winningSide === 1 ? "Attackers" : "Defenders";
    const battleChatText = `Battle at (${battle.locationX}, ${battle.locationY}) has ended!`;
    
    // Add details about groups
    let detailedMessage = battleChatText;
    if (winningGroups.length > 0) {
      detailedMessage += ` Victorious: ${winningGroups.join(', ')}`;
    }
    if (losingGroups.length > 0) {
      detailedMessage += ` Defeated: ${losingGroups.join(', ')}`;
    }
    
    // Add information about casualties
    detailedMessage += ` (${battleStats.casualties.total} casualties)`;
    
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
    
    logger.info(`Completed battle ${battle.id} in world ${worldId} - Side ${winningSide} won (elimination victory)`);
    
  } catch (error) {
    logger.error(`Error processing battle ${battle.id}:`, error);
    throw error; // Re-throw to be handled by caller
  }
}

/**
 * Process winning groups with casualties - set them back to idle state
 * Groups with zero units will be removed, others will have reduced unit counts
 * 
 * @param {Object} updates Database updates object
 * @param {string} worldId World ID
 * @param {string} chunkKey Chunk key for location
 * @param {string} tileKey Tile key for location
 * @param {Object} groups Groups data
 * @param {Object} winningSide Winning side data
 * @param {number} casualtyRate Percentage of units to remove (0.0-1.0)
 * @returns {number} Total casualties inflicted on winning side
 */
function processWinningGroupsWithCasualties(updates, worldId, chunkKey, tileKey, groups, winningSide, casualtyRate) {
  const winningGroupIds = Object.keys(winningSide.groups || {});
  let totalCasualties = 0;
  
  for (const groupId of winningGroupIds) {
    const group = groups[groupId];
    if (!group) continue;
    
    // Check if group has player units
    const hasPlayers = group.units ? Object.values(group.units).some(unit => unit.type === 'player') : false;
    
    // Get current unit count
    const currentUnits = group.unitCount || 1;
    
    // Calculate casualties - ensure at least 1 unit survives
    let casualties = Math.min(
      currentUnits - 1,  // Leave at least 1 unit
      Math.floor(currentUnits * casualtyRate)
    );
    
    // Special handling for player units - they die last and only at high casualty rates
    if (hasPlayers) {
      // Count how many player units vs regular units
      const units = Array.isArray(group.units) ? group.units : Object.values(group.units);
      const playerUnits = units.filter(unit => unit.type === 'player');
      const playerUnitCount = playerUnits.length;
      const nonPlayerUnitCount = currentUnits - playerUnitCount;
      
      // Calculate casualties differently based on unit composition
      if (nonPlayerUnitCount > 0) {
        // If there are non-player units, they take casualties first
        const nonPlayerCasualties = Math.min(nonPlayerUnitCount, casualties);
        const playerCasualties = casualties - nonPlayerCasualties;
        
        // Only apply player casualties if they're above 80% of total player units
        if (playerCasualties > 0 && (playerCasualties / playerUnitCount <= 0.8)) {
          // Reduce casualties to only affect non-player units
          casualties = nonPlayerCasualties;
          
          logger.info(`Protected player units in group ${groupId}: ${playerUnitCount} players, casualty rate: ${casualtyRate}`);
        }
      }
      // If it's only player units, standard casualty calculation applies
    }
    
    // Calculate remaining units
    const remainingUnits = currentUnits - casualties;
    totalCasualties += casualties;
    
    // Check if group has any units left
    if (remainingUnits <= 0) {
      // This shouldn't happen with our calculation, but just in case
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`] = null;
      logger.info(`Removing empty winning group ${groupId} at ${tileKey}`);
      continue;
    }

    // Update group status and unit count
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/inBattle`] = false;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleId`] = null;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleSide`] = null;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleRole`] = null;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`] = 'idle';
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/unitCount`] = remainingUnits;
    
    // Add victory message with casualty information
    const casualtyText = casualties > 0 ? 
      ` Lost ${casualties} units in the fighting.` : 
      ' All units survived the battle.';
      
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/lastMessage`] = {
      text: `Victory in battle!${casualtyText}`,
      timestamp: Date.now()
    };
  }
  
  return totalCasualties;
}

/**
 * Process losing groups - remove them and mark players as dead
 * 
 * @param {Object} updates Database updates object
 * @param {string} worldId World ID
 * @param {string} chunkKey Chunk key for location
 * @param {string} tileKey Tile key for location
 * @param {Object} groups Groups data
 * @param {Object} losingSide Losing side data
 * @returns {number} Total casualties from losing side
 */
function processLosingGroups(updates, worldId, chunkKey, tileKey, groups, losingSide) {
  const losingGroupIds = Object.keys(losingSide.groups || {});
  const now = Date.now();
  let totalCasualties = 0;
  const survivingPlayerUnits = [];
  
  // Count total units to calculate overall casualty rate
  let totalLosingUnits = 0;
  let totalPlayerUnits = 0;
  let isPlayerVsPlayerOnly = true;
  
  // First pass - count units and check if this is a player-vs-player battle only
  losingGroupIds.forEach(groupId => {
    const group = groups[groupId];
    if (!group) return;
    
    totalLosingUnits += (group.unitCount || 1);
    
    // Count player units and check if there are non-player units
    if (group.units) {
      const units = Array.isArray(group.units) ? group.units : Object.values(group.units);
      const playerUnitsInGroup = units.filter(unit => unit.type === 'player');
      totalPlayerUnits += playerUnitsInGroup.length;
      
      // If any unit is not a player, this isn't purely player vs player
      if (units.some(unit => unit.type !== 'player')) {
        isPlayerVsPlayerOnly = false;
      }
    }
  });
  
  // Calculate the actual casualty percentage for players
  // In pure player vs player battles, don't apply special protection
  const shouldProtectPlayers = !isPlayerVsPlayerOnly && (totalPlayerUnits > 0);
  
  // Second pass - process groups and handle casualties
  for (const groupId of losingGroupIds) {
    if (groups[groupId]) {
      const group = groups[groupId];
      
      // Track casualties
      totalCasualties += (group.unitCount || 1);
      
      // Find any player in this group and handle them specially
      if (group.units) {
        // Handle both array and object structure for units
        const units = Array.isArray(group.units) ? 
          group.units : Object.values(group.units);
        
        for (const unit of units) {
          if (unit.type === 'player' && unit.id) {
            if (shouldProtectPlayers) {
              // Apply special player protection - only let players die if:
              // 1. Over 80% of all losing units are casualties (total elimination)
              // 2. It's a player vs player battle where protection doesn't apply
              
              const highCasualtyRate = Math.random() > 0.2; // 80% chance of death
              
              if (highCasualtyRate) {
                // Mark player as dead
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
              } else {
                // Player survived despite being on losing side - create a survival message
                logger.info(`Player ${unit.id} survived battle despite losing (group ${groupId})`);
                updates[`players/${unit.id}/worlds/${worldId}/inGroup`] = null; // Remove from group
                updates[`players/${unit.id}/worlds/${worldId}/lastMessage`] = {
                  text: `You survived the battle but your forces were defeated.`,
                  timestamp: now
                };
                
                // Add player to survivors list to potentially create a new group for them
                survivingPlayerUnits.push(unit);
              }
            } else {
              // No special protection - standard player death
              logger.info(`Player ${unit.id} died in battle (group ${groupId}) - no protection applied`);
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
      }
      
      // Remove the entire losing group
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`] = null;
    }
  }
  
  // Create a new group for surviving player units if needed
  if (survivingPlayerUnits.length > 0) {
    const newGroupId = `group_${now}_survivors`;
    const unitsByPlayer = {};
    
    // Organize surviving units by player
    survivingPlayerUnits.forEach(unit => {
      unitsByPlayer[unit.id] = unit;
    });
    
    // Create a new group for survivors
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${newGroupId}`] = {
      id: newGroupId,
      name: "Battle Survivors",
      createdAt: now,
      status: 'idle',
      unitCount: survivingPlayerUnits.length,
      units: unitsByPlayer,
      lastMessage: {
        text: "Your group was reformed from battle survivors.",
        timestamp: now
      },
      x: parseInt(tileKey.split(',')[0]),
      y: parseInt(tileKey.split(',')[1])
    };
    
    // Update player references to the new group
    survivingPlayerUnits.forEach(unit => {
      updates[`players/${unit.id}/worlds/${worldId}/inGroup`] = newGroupId;
    });
    
    // Add chat message about survivors
    const chatMessageId = `survivors_${now}`;
    updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
      text: `${survivingPlayerUnits.length} players survived the battle at (${tileKey.replace(',', ', ')}) and formed a new group.`,
      type: 'event',
      timestamp: now,
      location: {
        x: parseInt(tileKey.split(',')[0]),
        y: parseInt(tileKey.split(',')[1])
      }
    };
  }
  
  return totalCasualties;
}
