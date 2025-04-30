/**
 * Cancel Movement function for Gisaima
 * Allows players to cancel movement of their groups
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Function to cancel a group's movement
export const cancelMove = onCall({ maxInstances: 10 }, async (request) => {
  logger.info('cancelMove function called with data:', request.data);
  
  // Ensure user is authenticated
  if (!request.auth) {
    logger.warn('Unauthenticated call to cancelMove');
    throw new HttpsError('unauthenticated', 'User must be logged in to cancel group movement');
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
  
  logger.info(`User ${uid} canceling movement for group ${groupId} at (${x},${y}) in world ${worldId}`);
  
  try {
    const db = getDatabase();
    
    // Calculate chunk key for the position - consider using consistent getChunkKey function
    const CHUNK_SIZE = 20;
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkY = Math.floor(y / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkY}`;
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
      logger.warn(`User ${uid} tried to cancel movement for group ${groupId} owned by ${group.owner}`);
      throw new HttpsError('permission-denied', 'You can only cancel movement of your own groups');
    }
    
    // Check if group is in a moving state
    if (group.status !== 'moving') {
      logger.warn(`Group ${groupId} is not moving (current status: ${group.status})`);
      throw new HttpsError('failed-precondition', 'Can only cancel movement for groups that are currently moving');
    }
    
    const now = Date.now();
    
    // Update the group to cancel movement
    await groupRef.update({
      status: 'idle',
      movementPath: null,
      pathIndex: null,
      moveStarted: null,
      moveSpeed: null,
      nextMoveTime: null,
      targetX: null,
      targetY: null,
      lastUpdated: now,
      lastMessage: {
        text: 'Movement cancelled',
        timestamp: now
      }
    });
    
    return {
      success: true,
      message: 'Group movement cancelled successfully',
      timestamp: now
    };
    
  } catch (error) {
    logger.error(`Error cancelling movement for group ${groupId}:`, error);
    throw new HttpsError('internal', 'Failed to cancel movement: ' + error.message, error);
  }
});
