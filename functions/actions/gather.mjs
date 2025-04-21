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

    if (group.inBattle) {
      throw new HttpsError('failed-precondition', 'Group is in battle and cannot gather');
    }

    // Calculate next tick time for gathering completion
    const now = Date.now();
    const worldRef = db.ref(`worlds/${worldId}/info`);
    const worldSnapshot = await worldRef.once('value');
    const worldData = worldSnapshot.val() || {};
    const tickInterval = worldData.tickInterval || 60000; // Default 1 minute
    let nextTickTime = worldData.lastTick + tickInterval;
    while (nextTickTime <= now) {
      nextTickTime += tickInterval;
    }

    // Get biome information for the tile
    const biome = tileData.biome?.name || 'plains';

    // Update group status to gathering
    await tileRef.child(`groups/${groupId}`).update({
      status: 'gathering',
      gatheringStarted: now,
      gatheringUntil: nextTickTime,
      gatheringBiome: biome,
      lastUpdated: now
    });

    return {
      success: true,
      message: 'Gathering started',
      readyAt: nextTickTime
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