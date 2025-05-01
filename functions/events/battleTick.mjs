import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions';
import { Battles } from 'gisaima-shared/war/battles.js';

/**
 * Handles battle progression for each tick of the game
 * Applies attrition to units, removes dead groups, distributes items,
 * and determines battle outcomes
 * 
 * @param {string} worldId - The ID of the world to process
 * @param {Object} chunks - Pre-loaded chunks data to avoid redundant database reads
 * @returns {Promise<number>} Number of battles processed
 */
export async function processBattles(worldId, chunks) {
  const db = getDatabase();
  let battlesProcessed = 0;
  
  try {
    logger.info(`Processing battle tick for world: ${worldId}`);
    
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
            
            // Process this battle directly (merged from processBattleTick)
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
              } else {
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
              }
              
              // If we have updates to apply
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
              
              if (ended && endMessage) {
                logger.info(endMessage);
              }
              
            } catch (error) {
              logger.error(`Error processing battle ${battle.id}:`, error);
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