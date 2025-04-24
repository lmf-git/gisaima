/**
 * Join Battle function for Gisaima
 * Handles joining existing battles
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Join a battle function
export const joinBattle = onCall({ maxInstances: 10 }, async (request) => {
  const { groupId, battleId, side, locationX, locationY } = request.data;
  const userId = request.auth?.uid;
  
  if (!userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  
  if (!groupId || !battleId || !side || locationX === undefined || locationY === undefined) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }
  
  try {
    const db = getDatabase();
    const worldId = request.data.worldId || 'default';
    
    // Fix chunk calculation for negative coordinates
    const CHUNK_SIZE = 20;
    function getChunkKey(x, y) {
      // Simple integer division works for both positive and negative coordinates
      const chunkX = Math.floor(x / CHUNK_SIZE);
      const chunkY = Math.floor(y / CHUNK_SIZE);
      return `${chunkX},${chunkY}`;
    }
    
    const chunkKey = getChunkKey(locationX, locationY);
    
    const locationKey = `${locationX},${locationY}`;
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}`);
    
    // Get tile data which includes battle information
    const tileSnapshot = await tileRef.once("value");
    const tileData = tileSnapshot.val() || {};
    
    if (!tileData.battles || !tileData.battles[battleId]) {
      throw new HttpsError("not-found", "Battle not found at this location");
    }
    
    const battleData = tileData.battles[battleId];
    
    if (battleData.status !== 'active') {
      throw new HttpsError("failed-precondition", "Battle is no longer active");
    }
    
    // Check if the battle is in the same location
    if (battleData.locationX !== locationX || battleData.locationY !== locationY) {
      throw new HttpsError("failed-precondition", "Battle is not at this location");
    }
    
    // Find the group that wants to join
    const groups = tileData.groups || {};
    
    const joiningGroup = Object.values(groups).find(g => g.id === groupId);
    if (!joiningGroup) {
      throw new HttpsError("not-found", "Group not found at this location");
    }
    
    // Verify ownership
    if (joiningGroup.owner !== userId) {
      throw new HttpsError("permission-denied", "You can only join battles with your own groups");
    }
    
    // Check if the group is already in battle
    if (joiningGroup.inBattle) {
      throw new HttpsError("failed-precondition", "This group is already in battle");
    }
    
    // Validate side choice
    if (side !== 1 && side !== 2) {
      throw new HttpsError("invalid-argument", "Side must be 1 or 2");
    }
    
    // Update battle data with the joining group
    const battleSideKey = side === 1 ? 'side1' : 'side2';
    const groupUnitCount = joiningGroup.unitCount || 1;
    
    const updates = {};
    
    // Add group to the battle side
    updates[`battles/${worldId}/${battleId}/${battleSideKey}/groups/${groupId}`] = true;
    updates[`battles/${worldId}/${battleId}/${battleSideKey}/power`] = 
      battleData[battleSideKey].power + groupUnitCount;

    // Update the battle power on the tile reference too
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/${battleSideKey}Power`] = 
      battleData[battleSideKey].power + groupUnitCount;
    
    // Update group status
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/inBattle`] = true;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/battleId`] = battleId;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/battleSide`] = side;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/battleRole`] = 'supporter';
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/status`] = 'fighting';

    // Add chat message for joining battle
    const groupName = joiningGroup.name || "Unnamed force";
    const now = Date.now();
    const chatMessageId = `battle_join_${now}_${groupId}`;
    updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
      text: `${groupName} has joined the battle at (${locationX}, ${locationY}) on side ${side}!`,
      type: 'event',
      timestamp: now,
      location: {
        x: locationX,
        y: locationY
      }
    };

    // Execute the updates
    await db.ref().update(updates);
    
    return {
      success: true,
      message: `Joined battle on side ${side}`,
      battleId
    };
  } catch (error) {
    logger.error("Error joining battle:", error);
    throw new HttpsError("internal", "Failed to join battle");
  }
});
