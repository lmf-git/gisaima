/**
 * Flee Battle function for Gisaima
 * Allows players to withdraw their groups from ongoing battles
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { getChunkKey } from 'gisaima-shared/map/cartography.js';

// Function to flee from a battle
export const fleeBattle = onCall({ maxInstances: 10 }, async (request) => {
  console.log('fleeBattle function called with data:', request.data);
  
  // Ensure user is authenticated
  if (!request.auth) {
    console.log('Unauthenticated call to fleeBattle');
    throw new HttpsError('unauthenticated', 'User must be logged in to flee from battles');
  }
  
  const uid = request.auth.uid;
  const { groupId, x, y, worldId = 'default' } = request.data;
  
  // Validate required parameters
  if (!groupId) {
    console.log('Missing groupId parameter');
    throw new HttpsError('invalid-argument', 'Missing groupId parameter');
  }
  
  if (x === undefined || y === undefined) {
    console.log('Missing coordinates parameters');
    throw new HttpsError('invalid-argument', 'Missing coordinates parameters');
  }
  
  console.log(`User ${uid} fleeing from battle with group ${groupId} at (${x},${y}) in world ${worldId}`);
  
  try {
    const db = getDatabase();
    
    // Calculate chunk key for the position
    const chunkKey = getChunkKey(x, y);
    const tileKey = `${x},${y}`;
    
    // Check if the group exists at the specified location
    const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`);
    const groupSnapshot = await groupRef.once('value');
    
    if (!groupSnapshot.exists()) {
      console.log(`Group ${groupId} not found at (${x},${y})`);
      throw new HttpsError('not-found', 'Group not found at specified location');
    }
    
    const group = groupSnapshot.val();
    
    // Verify ownership
    if (group.owner !== uid) {
      console.log(`User ${uid} tried to flee battle for group ${groupId} owned by ${group.owner}`);
      throw new HttpsError('permission-denied', 'You can only flee battles with your own groups');
    }
    
    // Check if group is actually in a battle
    if (!group.battleId) {
      console.log(`Group ${groupId} is not in a battle`);
      throw new HttpsError('failed-precondition', 'This group is not currently in a battle');
    }
    
    const battleId = group.battleId;
    const battleSide = group.battleSide;
    
    // Get the battle data to check current tick
    const battleRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`);
    const battleSnapshot = await battleRef.once('value');
    
    if (!battleSnapshot.exists()) {
      console.log(`Battle ${battleId} not found at (${x},${y})`);
      throw new HttpsError('not-found', 'Associated battle not found');
    }
    
    const battleData = battleSnapshot.val();
    const currentTickCount = battleData.tickCount || 0;
    
    // MODIFIED: Use 'fleeing' instead of 'fleeingBattle' for consistency with other statuses
    const updates = {};
    
    // Set the group to "fleeing" state to signal to the battle tick processor
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`] = 'fleeing';
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/fleeTickRequested`] = currentTickCount;
    
    // Calculate casualties for chat message - don't apply them here, battle tick will handle it
    const totalUnits = Object.keys(group.units || {}).length;
    const casualtiesPercentage = 0.2; // 20% casualties for fleeing
    const casualtiesCount = Math.floor(totalUnits * casualtiesPercentage);
    
    // Add chat message about fleeing
    const chatMessageId = `battle_flee_${Date.now()}_${groupId}`;
    updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
      text: `${group.name || 'A group'} is attempting to flee from battle at (${x}, ${y})!`,
      type: 'event',
      timestamp: Date.now(),
      tickCount: currentTickCount,
      location: {
        x: x,
        y: y
      }
    };
    
    // Add an event to the battle about the flee attempt
    const newEvent = {
      type: 'flee_attempt',
      tickCount: currentTickCount,
      text: `${group.name || "A group"} is attempting to flee from the battle!`,
      groupId: groupId,
      side: battleSide
    };
    
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}/events`] = 
      [...(battleData.events || []), newEvent];
    
    // Execute updates in a single transaction
    await db.ref().update(updates);
    
    return {
      success: true,
      message: 'Flee command issued successfully. Your group will attempt to flee during the next battle tick.',
      tickCount: currentTickCount
    };
    
  } catch (error) {
    console.error(`Error fleeing battle for group ${groupId}:`, error);
    throw new HttpsError('internal', 'Failed to flee battle: ' + error.message, error);
  }
});
