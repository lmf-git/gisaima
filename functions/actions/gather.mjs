/**
 * Gathering function for Gisaima
 * Allows groups to gather resources from their surroundings
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';

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