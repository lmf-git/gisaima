/**
 * Gathering function for Gisaima
 * Allows groups to gather resources from their surroundings
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

/**
 * Cloud function to start gathering items with a group
 */
export const startGathering = onCall({ maxInstances: 10 }, async (request) => {
  // Check authentication context provided by onCall
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const uid = request.auth.uid;
  const { groupId, locationX, locationY, itemIds, worldId } = request.data;

  // Validate required parameters
  if (!groupId || locationX === undefined || locationY === undefined || !worldId) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  const db = getDatabase();
  const chunkSize = 20;
  const chunkX = Math.floor(locationX / chunkSize);
  const chunkY = Math.floor(locationY / chunkSize);
  const chunkKey = `${chunkX},${chunkY}`;
  const tileKey = `${locationX},${locationY}`;
  
  // Reference to the tile we're gathering from
  const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
  
  try {
    // Get the current state of the tile
    const tileSnapshot = await tileRef.once('value');
    const tileData = tileSnapshot.val() || {};

    // Check if the group exists on this tile and is owned by the user
    if (!tileData.groups || !tileData.groups[groupId]) {
      throw new HttpsError('not-found', 'Group not found on this tile');
    }

    const group = tileData.groups[groupId];
    
    if (group.owner !== uid) {
      throw new HttpsError('permission-denied', 'You do not own this group');
    }

    if (group.status !== 'idle') {
      throw new HttpsError('failed-precondition', 'Group is not idle and cannot gather');
    }

    // Get world info to provide tick information
    const now = Date.now();
    const worldRef = db.ref(`worlds/${worldId}/info`);
    const worldSnapshot = await worldRef.once('value');
    const worldData = worldSnapshot.val() || {};
    const tickInterval = worldData.tickInterval || 60000; // Default 1 minute

    // Get biome information for the tile
    const biome = tileData.biome?.name || 'plains';

    // Add a chat message to indicate gathering has started
    const chatMessageId = `gather_start_${now}_${groupId}`;
    const chatRef = db.ref(`worlds/${worldId}/chat/${chatMessageId}`);
    await chatRef.set({
      type: 'system',
      text: `${group.name} has started gathering in ${biome} biome at (${locationX},${locationY})`,
      timestamp: now,
      location: { 
        x: locationX, 
        y: locationY 
      }
    });

    // Update group status to gathering
    await tileRef.child(`groups/${groupId}`).update({
      status: 'gathering',
      gatheringBiome: biome,
      gatheringTicksRemaining: 2, // Set to wait for 2 ticks before completing
    });

    // Achievement handling
    const playerRef = db.ref(`players/${uid}/worlds/${worldId}`);
    const playerSnapshot = await playerRef.child('achievements').once('value');
    const achievements = playerSnapshot.val() || {};
    if (!achievements.first_gather) {
      await playerRef.child('achievements').update({ first_gather: true });
    }

    return {
      success: true,
      message: 'Gathering started',
      completesIn: 2 // Now we report ticks remaining instead of just "next tick"
    };
  } catch (error) {
    console.error(`Error in gather function:`, error);
    throw new HttpsError(
      error.code || 'internal',
      error.message || 'Failed to start gathering',
      error
    );
  }
});

/**
 * Cloud function to cancel ongoing gathering
 */
export const cancelGather = onCall({ maxInstances: 10 }, async (request) => {
  // Check authentication context provided by onCall
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const uid = request.auth.uid;
  const { groupId, locationX, locationY, worldId } = request.data;

  // Validate required parameters
  if (!groupId || locationX === undefined || locationY === undefined || !worldId) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  logger.info(`User ${uid} canceling gathering for group ${groupId} at (${locationX},${locationY}) in world ${worldId}`);

  const db = getDatabase();
  const chunkSize = 20;
  const chunkX = Math.floor(locationX / chunkSize);
  const chunkY = Math.floor(locationY / chunkSize);
  const chunkKey = `${chunkX},${chunkY}`;
  const tileKey = `${locationX},${locationY}`;
  
  // Reference to the group
  const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`);
  
  try {
    // Get the current state of the group
    const groupSnapshot = await groupRef.once('value');
    
    if (!groupSnapshot.exists()) {
      logger.warn(`Group ${groupId} not found at (${locationX},${locationY})`);
      throw new HttpsError('not-found', 'Group not found at specified location');
    }

    const group = groupSnapshot.val();
    
    // Verify ownership
    if (group.owner !== uid) {
      logger.warn(`User ${uid} tried to cancel gathering for group ${groupId} owned by ${group.owner}`);
      throw new HttpsError('permission-denied', 'You can only cancel gathering of your own groups');
    }
    
    // Check if group is in a gathering state
    if (group.status !== 'gathering') {
      logger.warn(`Group ${groupId} is not gathering (current status: ${group.status})`);
      throw new HttpsError('failed-precondition', 'Can only cancel gathering for groups that are currently gathering');
    }
    
    const now = Date.now();
    
    // First set to cancellingGather state to signal to tick processor
    await groupRef.update({
      status: 'cancellingGather',
      cancelRequestTime: now
    });
    
    // After setting the transitional state, perform the full update
    await groupRef.update({
      status: 'idle',
      gatheringBiome: null,
      gatheringTicksRemaining: null,
      cancelRequestTime: null
    });
    
    // Add chat message about cancellation
    const chatMessageId = `cancel_gather_${now}_${groupId}`;
    await db.ref(`worlds/${worldId}/chat/${chatMessageId}`).set({
      text: `${group.name || 'A group'} has stopped gathering at (${locationX}, ${locationY})`,
      type: 'event',
      timestamp: now,
      userId: uid,
      userName: group.ownerName || "Unknown",
      location: {
        x: locationX,
        y: locationY,
        timestamp: now
      }
    });
    
    return {
      success: true,
      message: 'Gathering cancelled successfully',
      timestamp: now
    };
    
  } catch (error) {
    logger.error(`Error cancelling gathering for group ${groupId}:`, error);
    throw new HttpsError('internal', 'Failed to cancel gathering: ' + error.message, error);
  }
});