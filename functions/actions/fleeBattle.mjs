/**
 * Flee Battle function for Gisaima
 * Allows players to withdraw their groups from ongoing battles
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";
import { getChunkKey } from 'gisaima-shared/map/cartography.js';

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
    if (!group.battleId) {
      logger.warn(`Group ${groupId} is not in a battle`);
      throw new HttpsError('failed-precondition', 'This group is not currently in a battle');
    }
    
    const battleId = group.battleId;
    const battleSide = group.battleSide;
    
    // Get the battle data to check current tick
    const battleRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`);
    const battleSnapshot = await battleRef.once('value');
    
    if (!battleSnapshot.exists()) {
      logger.warn(`Battle ${battleId} not found at (${x},${y})`);
      throw new HttpsError('not-found', 'Associated battle not found');
    }
    
    const battleData = battleSnapshot.val();
    const currentTickCount = battleData.tickCount || 0;
    
    // STEP 1: Set the group to "fleeingBattle" state to signal to the battle tick processor
    // This prevents race conditions where the battle tick tries to process the group at the same time
    await groupRef.update({
      status: 'fleeingBattle',
      fleeTickRequested: currentTickCount
    });
    
    logger.info(`Set group ${groupId} to fleeingBattle state at tick ${currentTickCount}`);
    
    // STEP 2: After setting the fleeing state, perform the full update
    const updates = {};
    
    // Calculate casualties - a penalty for fleeing
    const totalUnits = Object.keys(group.units || {}).length;
    const casualtiesPercentage = 0.2; // 20% casualties for fleeing
    const casualtiesCount = Math.floor(totalUnits * casualtiesPercentage);
    let newUnitCount = totalUnits;
    
    // Apply casualties if there are units to remove
    if (casualtiesCount > 0 && totalUnits > 0) {
      // Get list of units
      const units = Object.entries(group.units || {});
      
      // Randomly select casualties
      const selectedCasualties = [];
      const availableIndexes = [...Array(units.length).keys()];
      
      for (let i = 0; i < casualtiesCount && availableIndexes.length > 0; i++) {
        const randomIndex = Math.floor(Math.random() * availableIndexes.length);
        const unitIndex = availableIndexes[randomIndex];
        availableIndexes.splice(randomIndex, 1);
        
        const [unitId, unitData] = units[unitIndex];
        selectedCasualties.push(unitId);
        
        // Don't remove player units, only NPCs
        if (unitData.type !== 'player') {
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/units/${unitId}`] = null;
        }
      }
      
      newUnitCount = totalUnits - selectedCasualties.filter(unitId => 
        group.units[unitId].type !== 'player').length;
    }
    
    // Update battle reference to remove the group
    if (battleData) {
      const sideKey = `side${battleSide}`;
      
      // Remove the group reference from the battle's side
      if (battleData[sideKey] && battleData[sideKey].groups) {
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}/${sideKey}/groups/${groupId}`] = null;
      }
      
      // Add a battle event recording the flee
      const newEvent = {
        type: 'flee',
        tickCount: currentTickCount,
        text: `${group.name || "A group"} has fled from the battle!`,
        groupId: groupId
      };
      
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}/events`] = 
        [...(battleData.events || []), newEvent];
    }
    
    // Update the group's status
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleId`] = null;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleSide`] = null;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleRole`] = null;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`] = 'idle';
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/fleeTickRequested`] = null;
    
    // Add chat message about fleeing - still need timestamp for chat ordering
    const chatMessageId = `battle_flee_${Date.now()}_${groupId}`;
    updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
      text: `${group.name || 'A group'} has fled from battle at (${x}, ${y})! Lost ${casualtiesCount} units in retreat.`,
      type: 'event',
      timestamp: Date.now(),
      tickCount: currentTickCount,
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
      tickCount: currentTickCount
    };
    
  } catch (error) {
    logger.error(`Error fleeing battle for group ${groupId}:`, error);
    throw new HttpsError('internal', 'Failed to flee battle: ' + error.message, error);
  }
});
