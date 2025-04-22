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
      // Check if battle should end
      if (battle.endTime && battle.endTime <= now) {
        await processBattleResolution(db, worldId, battle);
        battleProcessCount++;
      }
    }
    
    return battleProcessCount;
  } catch (error) {
    logger.error(`Error processing battles for world ${worldId}:`, error);
    return 0;
  }
}

/**
 * Process the resolution of a specific battle
 * 
 * @param {Object} db Database reference
 * @param {string} worldId World ID
 * @param {Object} battle Battle data
 * @returns {Promise<void>}
 */
async function processBattleResolution(db, worldId, battle) {
  try {
    const now = Date.now();
    
    // SIMPLIFIED: Randomly determine a winner instead of using power calculations
    // 50% chance for either side to win
    const randomWinner = Math.random() < 0.5 ? 1 : 2;
    
    // Set winner and loser based on random selection
    const winningSide = randomWinner === 1 ? battle.side1 : battle.side2;
    const losingSide = randomWinner === 1 ? battle.side2 : battle.side1;
    
    battle.result = {
      winningSide: randomWinner,
      randomlyDetermined: true  // Flag to indicate this was random
    };
    
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
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/winner`] = randomWinner;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/completedAt`] = now;
    
    // Schedule removal of the battle reference after a delay to allow clients to see the result
    setTimeout(async () => {
      await db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}`).remove();
    }, 60000); // Keep completed battle visible for 1 minute
    
    // Get groups from this tile to update them
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
    const tileSnapshot = await tileRef.once('value');
    
    if (tileSnapshot.exists()) {
      const tileData = tileSnapshot.val();
      
      // Process all groups on both sides
      if (tileData.groups) {
        await processWinningGroups(updates, worldId, chunkKey, tileKey, tileData.groups, winningSide);
        await processLosingGroups(updates, worldId, chunkKey, tileKey, tileData.groups, losingSide);
      }
    }
    
    // Apply all updates
    await db.ref().update(updates);
    logger.info(`Completed battle ${battle.id} in world ${worldId} - Side ${randomWinner} won (randomly decided)`);
  } catch (error) {
    logger.error(`Error processing battle ${battle.id}:`, error);
    throw error; // Re-throw to be handled by caller
  }
}

/**
 * Process winning groups - set them back to idle state
 */
async function processWinningGroups(updates, worldId, chunkKey, tileKey, groups, winningSide) {
  const winningGroupIds = Object.keys(winningSide.groups || {});
  
  for (const groupId of winningGroupIds) {
    if (groups[groupId]) {
      // Set winning groups back to idle state
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/inBattle`] = false;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleId`] = null;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleSide`] = null;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleRole`] = null;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`] = 'idle';
      
      // Add victory message
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/lastMessage`] = {
        text: `Victory in battle!`,
        timestamp: Date.now()
      };
    }
  }
}

/**
 * Process losing groups - remove them and mark players as dead
 */
async function processLosingGroups(updates, worldId, chunkKey, tileKey, groups, losingSide) {
  const losingGroupIds = Object.keys(losingSide.groups || {});
  
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
              timestamp: Date.now()
            };
          }
        }
      }
      
      // Remove the entire losing group
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`] = null;
    }
  }
}
