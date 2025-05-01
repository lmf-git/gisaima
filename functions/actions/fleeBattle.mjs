/**
 * Flee Battle function for Gisaima
 * Allows players to withdraw their groups from ongoing battles
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
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

// Function to flee from a battle
export const fleeBattle = onCall({ maxInstances: 10 }, async (request) => {
  logger.info('fleeBattle function called with data:', request.data);
  
  // Ensure user is authenticated
  if (!request.auth) {
    logger.warn('Unauthenticated call to fleeBattle');
    throw new HttpsError('unauthenticated', 'User must be logged in to flee from battles');
  }
  
  const uid = request.auth.uid;
  const { groupId, x, y, worldId = 'default' } = request.data;
  
  // Validate required parameters
  if (!groupId) {
    logger.warn('Missing groupId parameter');
    throw new HttpsError('invalid-argument', 'Missing groupId parameter');
  }
  
  if (x === undefined || y === undefined) {
    logger.warn('Missing coordinates parameters');
    throw new HttpsError('invalid-argument', 'Missing coordinates parameters');
  }
  
  logger.info(`User ${uid} fleeing from battle with group ${groupId} at (${x},${y}) in world ${worldId}`);
  
  try {
    const db = getDatabase();
    
    // Calculate chunk key for the position
    const chunkKey = getChunkKey(x, y);
    const tileKey = `${x},${y}`;
    
    // Check if the group exists at the specified location
    const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`);
    const groupSnapshot = await groupRef.once('value');
    
    if (!groupSnapshot.exists()) {
      logger.warn(`Group ${groupId} not found at (${x},${y})`);
      throw new HttpsError('not-found', 'Group not found at specified location');
    }
    
    const group = groupSnapshot.val();
    
    // Verify ownership
    if (group.owner !== uid) {
      logger.warn(`User ${uid} tried to flee battle for group ${groupId} owned by ${group.owner}`);
      throw new HttpsError('permission-denied', 'You can only flee battles with your own groups');
    }
    
    // Check if group is actually in a battle
    if (!group.inBattle || !group.battleId) {
      logger.warn(`Group ${groupId} is not in a battle`);
      throw new HttpsError('failed-precondition', 'This group is not currently in a battle');
    }
    
    const battleId = group.battleId;
    const battleSide = group.battleSide;
    
    // Get the battle data to update power values
    const battleRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`);
    const battleSnapshot = await battleRef.once('value');
    
    if (!battleSnapshot.exists()) {
      logger.warn(`Battle ${battleId} not found at (${x},${y})`);
      // Still allow fleeing even if battle data is inconsistent
      logger.info(`Continuing with flee operation despite missing battle data`);
    }
    
    const battleData = battleSnapshot.exists() ? battleSnapshot.val() : null;
    
    const now = Date.now();
    const updates = {};
    
    // Remove group from the battle
    if (battleData) {
      const battleSideKey = `side${battleSide}`;
      
      // Calculate new power for the side
      const currentPower = battleData[`${battleSideKey}Power`] || 0;
      const groupPower = group.unitCount || 1;
      const newPower = Math.max(0, currentPower - groupPower);
      
      // Update battle power
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}/${battleSideKey}Power`] = newPower;
      
      // Remove group from the side's groups list if it exists
      if (battleData[battleSideKey] && battleData[battleSideKey].groups) {
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}/${battleSideKey}/groups/${groupId}`] = null;
      }
      
      logger.info(`Updated battle power for ${battleSideKey} from ${currentPower} to ${newPower}`);
    }
    
    // Apply casualties to the fleeing group (25-40% of units are lost when fleeing)
    const fleeingCasualtyRate = 0.25 + (Math.random() * 0.15);
    const originalUnitCount = group.unitCount || 1;
    const casualtiesCount = Math.floor(originalUnitCount * fleeingCasualtyRate);
    const newUnitCount = Math.max(1, originalUnitCount - casualtiesCount);
    
    // Update the group's status
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/inBattle`] = false;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleId`] = null;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleSide`] = null;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleRole`] = null;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`] = 'idle';
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/unitCount`] = newUnitCount;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/lastUpdated`] = now;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/lastMessage`] = {
      text: `Fled from battle! Lost ${casualtiesCount} units while retreating.`,
      timestamp: now
    };
    
    // Add chat message about fleeing
    const chatMessageId = `battle_flee_${now}_${groupId}`;
    updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
      text: `${group.name || 'A group'} has fled from battle at (${x}, ${y})! Lost ${casualtiesCount} units in retreat.`,
      type: 'event',
      timestamp: now,
      location: {
        x: x,
        y: y
      }
    };
    
    // Execute all updates in a single transaction
    await db.ref().update(updates);
    
    return {
      success: true,
      message: 'Successfully fled from battle',
      casualties: casualtiesCount,
      newUnitCount: newUnitCount,
      timestamp: now
    };
    
  } catch (error) {
    logger.error(`Error fleeing battle for group ${groupId}:`, error);
    throw new HttpsError('internal', 'Failed to flee battle: ' + error.message, error);
  }
});
