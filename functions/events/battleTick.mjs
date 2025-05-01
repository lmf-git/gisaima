import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions';
import { Battles } from 'gisaima-shared/war/battles.js';

/**
 * Handles battle progression for each tick of the game
 * Applies attrition to units, removes dead groups, distributes items,
 * and determines battle outcomes
 * 
 * @param {string} worldId - The ID of the world to process
 * @param {Object} chunksData - Optional pre-loaded chunks data to avoid redundant database reads
 * @returns {Promise<number>} Number of battles processed
 */
export async function processBattles(worldId, chunksData = null) {
  const db = getDatabase();
  let battlesProcessed = 0;
  
  try {
    logger.info(`Processing battle tick for world: ${worldId}`);
    
    // Use provided chunks data or load from database
    const chunks = chunksData || await loadChunksData(db, worldId);
    
    // Fix for the ancestor path conflict
    for (const chunkKey in chunks) {
      const chunk = chunks[chunkKey];
      for (const locationKey in chunk) {
        const location = chunk[locationKey];
        
        // Process battles at this location
        if (location.battles) {
          for (const battleId in location.battles) {
            const battle = location.battles[battleId];
            battlesProcessed++;
            
            // Process this battle and get updates
            const { updates, ended, endMessage } = 
              processBattleTick(worldId, chunkKey, locationKey, battle, location);
            
            if (Object.keys(updates).length > 0) {
              // Consolidate updates to avoid ancestor path conflicts
              const consolidatedUpdates = {};
              
              // Process each update to detect and resolve conflicts
              for (const path in updates) {
                safelyApplyUpdate(consolidatedUpdates, path, updates[path]);
              }
              
              // Apply consolidated updates
              await db.ref().update(consolidatedUpdates);
            }
          }
        }
      }
    }
    
    return battlesProcessed;
  } catch (error) {
    logger.error(`Error processing battles for world: ${worldId}`, error);
    throw error;
  }
}

/**
 * Load chunks data from the database
 */
async function loadChunksData(db, worldId) {
  const chunksRef = db.ref(`worlds/${worldId}/chunks`);
  const chunksSnapshot = await chunksRef.once('value');
  return chunksSnapshot.val() || {};
}

/**
 * Process a single battle tick
 * Handles attrition, unit deaths, group removal, and battle resolution
 * 
 * @param {string} worldId - The world ID
 * @param {string} chunkKey - The chunk key
 * @param {string} locationKey - The location key
 * @param {Object} battle - The battle data
 * @param {Object} location - The location data containing groups, players, structure
 */
function processBattleTick(worldId, chunkKey, locationKey, battle, location) {
  const updates = {};
  let ended = false;
  let endMessage = '';
  
  try {
    // Get data directly from the location object instead of loading from database
    const allGroups = location.groups || {};
    const players = location.players || {};
    
    // Get structure if involved in battle
    let structure = null;
    if (battle.targetTypes && battle.targetTypes.includes('structure')) {
      structure = location.structure || null;
    }
    
    // Separate groups by side
    const side1Groups = [];
    const side2Groups = [];
    
    // Get groups from both sides
    if (battle.side1 && battle.side1.groups) {
      for (const groupId in battle.side1.groups) {
        if (allGroups[groupId]) {
          side1Groups.push({
            id: groupId,
            ...allGroups[groupId]
          });
        }
      }
    }
    
    if (battle.side2 && battle.side2.groups) {
      for (const groupId in battle.side2.groups) {
        if (allGroups[groupId]) {
          side2Groups.push({
            id: groupId,
            ...allGroups[groupId]
          });
        }
      }
    }
    
    // Log any issues with battle sides
    if (side1Groups.length === 0) {
      logger.info(`Battle ${battle.id} at ${chunkKey}/${locationKey} has empty side 1`);
    }
    if (side2Groups.length === 0) {
      logger.info(`Battle ${battle.id} at ${chunkKey}/${locationKey} has empty side 2`);
    }
    
    // Calculate initial power for each side using Battles class
    let side1Power = Battles.calculateSidePower(side1Groups);
    let side2Power = Battles.calculateSidePower(side2Groups);
    
    // Add structure power to side 2 if present
    if (structure && structure.inBattle && structure.battleId === battle.id) {
      side2Power += Battles.calculateStructurePower(structure);
    }
    
    // If either side has no power or groups, resolve the battle immediately
    if (side1Power === 0 || side2Power === 0 || side1Groups.length === 0 || side2Groups.length === 0) {
      resolveBattle(worldId, chunkKey, locationKey, battle, 
                    side1Groups, side2Groups, side1Power, side2Power,
                    structure, updates);
      ended = true;
      endMessage = Battles.generateBattleEndMessage(battle, locationKey, side1Groups.length > 0);
      return { updates, ended, endMessage };
    }
    
    // Calculate attrition factors using Battles class
    const { side1AttritionRate, side2AttritionRate } = Battles.calculateAttritionRates(
      side1Power, side2Power, battle
    );
    
    // Process attrition for each side and update group states
    const side1Result = processGroupAttrition(
      worldId, chunkKey, locationKey, side1Groups, side1AttritionRate, battle.id, players
    );
    
    const side2Result = processGroupAttrition(
      worldId, chunkKey, locationKey, side2Groups, side2AttritionRate, battle.id, players
    );
    
    // Apply attrition updates
    Object.assign(updates, side1Result.updates);
    Object.assign(updates, side2Result.updates);
    
    // Update power values after attrition
    side1Power = side1Result.remainingPower;
    side2Power = side2Result.remainingPower;
    
    // Process structure attrition if present
    if (structure && structure.inBattle && structure.battleId === battle.id) {
      const structureResult = processStructureAttrition(
        worldId, chunkKey, locationKey, structure, 
        side1Power / Math.max(1, side1Power + side2Power) * 0.1, 
        battle.id
      );
      
      Object.assign(updates, structureResult.updates);
      
      // Add destruction event if needed
      if (structureResult.destroyed) {
        addStructureDestroyedEvent(worldId, chunkKey, locationKey, battle, structure, updates);
      }
    }
    
    // Check if battle should end after attrition
    const side1HasSurvivors = side1Groups.some(g => !g.empty);
    const side2HasSurvivors = side2Groups.some(g => !g.empty);
    
    if (!side1HasSurvivors || !side2HasSurvivors || side1Power === 0 || side2Power === 0) {
      const winningSide = side1HasSurvivors && side1Power > 0 ? 1 : 2;
      
      endMessage = Battles.generateBattleEndMessage(battle, locationKey, winningSide === 1);
      handleBattleEnd(worldId, chunkKey, locationKey, battle, 
                      side1Groups, side2Groups, side1Power, side2Power, 
                      structure, winningSide, updates);
      ended = true;
    } else {
      // Update battle state and add tick event
      updateBattleState(worldId, chunkKey, locationKey, battle, 
                        side1Power, side2Power, updates);
    }
    
    return { updates, ended, endMessage };
  } catch (error) {
    logger.error(`Error processing battle ${battle.id}:`, error);
    return { updates, ended: false, endMessage: '' };
  }
}

/**
 * Process attrition for a group of units and handle removal of empty groups
 * Returns updates to be applied to the database and the remaining power
 */
function processGroupAttrition(worldId, chunkKey, locationKey, groups, attritionRate, battleId, locationPlayers) {
  // If attrition rate is zero, return immediately with no changes
  if (attritionRate === 0) {
    const remainingPower = Battles.calculateSidePower(groups);
    return { updates: {}, remainingPower };
  }
  
  const updates = {};
  let remainingPower = 0;
  const playersKilled = [];
  
  for (const group of groups) {
    // Skip groups that don't have units
    if (!group.units) continue;
    
    const units = typeof group.units === 'object' ? Object.entries(group.units) : [];
    
    // Calculate unit losses using Battles class
    const unitLosses = Battles.calculateUnitLosses(units.length, attritionRate);
    
    // Separate player units and non-player units
    const playerUnits = [];
    const nonPlayerUnits = [];
    
    for (const [unitId, unit] of units) {
      if (unit.type === 'player') {
        playerUnits.push([unitId, unit]);
      } else {
        nonPlayerUnits.push([unitId, unit]);
      }
    }
    
    // Remove non-player units first
    const unitsToRemove = [];
    let remainingLosses = unitLosses;
    
    while (remainingLosses > 0 && nonPlayerUnits.length > 0) {
      const randomIndex = Math.floor(Math.random() * nonPlayerUnits.length);
      const [unitId, unit] = nonPlayerUnits.splice(randomIndex, 1)[0];
      unitsToRemove.push(unitId);
      remainingLosses--;
    }
    
    // Apply player protection and handle player losses using Battles class
    remainingLosses = Battles.processPlayerLosses(
      remainingLosses, playerUnits, unitsToRemove, playersKilled, 
      units.length, attritionRate, group.id
    );
    
    // Remove units from the group
    for (const unitId of unitsToRemove) {
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/units/${unitId}`] = null;
    }
    
    // Calculate remaining units using Battles class
    const remainingUnitCount = Battles.calculateRemainingUnits(group, unitsToRemove);
    
    // Mark group as empty if no units left
    group.empty = remainingUnitCount === 0;
    
    // Handle group deletion or update based on remaining units
    if (remainingUnitCount === 0) {
      handleEmptyGroup(worldId, chunkKey, locationKey, group, battleId, updates);
    } else {
      // Update group with new unit count
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] = 
        { ...group, unitCount: remainingUnitCount };
    }
    
    // Calculate remaining power using Battles class
    remainingPower += Battles.calculateGroupPower(group, unitsToRemove);
  }
  
  // Handle player deaths
  for (const { playerId, displayName, groupId } of playersKilled) {
    handlePlayerDeath(worldId, chunkKey, locationKey, playerId, displayName, locationPlayers, updates);
  }
  
  return { updates, remainingPower };
}