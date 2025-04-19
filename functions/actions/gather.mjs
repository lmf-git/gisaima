/**
 * Gathering function for Gisaima
 * Handles resource gathering by groups
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Function to safely get chunk key, consistent with other functions
function getChunkKey(x, y) {
  const CHUNK_SIZE = 20;
  // Simple integer division works for both positive and negative coordinates
  const chunkX = Math.floor(x / CHUNK_SIZE);
  const chunkY = Math.floor(y / CHUNK_SIZE);
  return `${chunkX},${chunkY}`;
}

// Initiate gathering function
export const startGathering = onCall({ maxInstances: 10 }, async (request) => {
  // Check authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  
  // Get request parameters
  const { groupId, locationX, locationY, worldId = 'default' } = request.data;
  const userId = request.auth.uid;
  
  // Validate required parameters
  if (!groupId || locationX === undefined || locationY === undefined) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  try {
    const db = getDatabase();
    const chunkKey = getChunkKey(locationX, locationY);
    const tileKey = `${locationX},${locationY}`;
    
    // Get reference to the group
    const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`);
    
    // Get the group data
    const groupSnapshot = await groupRef.once('value');
    const groupData = groupSnapshot.val();
    
    // Check if group exists
    if (!groupData) {
      throw new HttpsError('not-found', 'Group not found');
    }
    
    // Check ownership
    if (groupData.owner !== userId) {
      throw new HttpsError('permission-denied', 'You do not own this group');
    }
    
    // Check status - must be idle
    if (groupData.status !== 'idle') {
      throw new HttpsError(
        'failed-precondition', 
        `Group is currently ${groupData.status} and cannot gather resources`
      );
    }
    
    // Get world info to calculate next tick time
    const worldRef = db.ref(`worlds/${worldId}/info`);
    const worldSnapshot = await worldRef.once('value');
    const worldInfo = worldSnapshot.val();
    
    if (!worldInfo) {
      throw new HttpsError('not-found', 'World not found');
    }

    // Calculate when gathering will complete (next world tick)
    const now = Date.now();
    const worldSpeed = worldInfo.speed || 1.0;
    const baseGatherTime = 60000; // 1 minute base time
    const adjustedGatherTime = Math.round(baseGatherTime / worldSpeed);
    const gatheringUntil = now + adjustedGatherTime;
    
    // Update group status to gathering
    await groupRef.update({
      status: 'gathering',
      gatheringStarted: now,
      gatheringUntil: gatheringUntil,
      lastUpdated: now,
      // Add biome information for better resource generation
      gatheringBiome: groupData.biome || 'plains'
    });
    
    logger.info(`Group ${groupId} started gathering at ${locationX},${locationY}`);
    
    return {
      success: true,
      groupId,
      completesAt: gatheringUntil,
      message: "Gathering started"
    };
  } catch (error) {
    logger.error('Error in startGathering:', error);
    throw new HttpsError(
      error.code || 'internal',
      error.message || 'Failed to start gathering',
      error
    );
  }
});
