/**
 * Cancel Movement function for Gisaima
 * Allows players to cancel movement of their groups
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { getChunkKey } from 'gisaima-shared/map/cartography.js';
import { logger } from "firebase-functions"; // Add logger import

/**
 * Function to cancel a group's movement
 * Requires authentication and group ownership
 */
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
    
    // Calculate chunk key for the position using getChunkKey function
    const chunkKey = getChunkKey(x, y);
    const tileKey = `${x},${y}`;
    
    // Log the full path for debugging
    const groupRefPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
    logger.info(`Looking for group at path: ${groupRefPath}`);
    
    // Check if the group exists at the specified location
    const groupRef = db.ref(groupRefPath);
    const groupSnapshot = await groupRef.once('value');
    
    if (!groupSnapshot.exists()) {
      logger.warn(`Group ${groupId} not found at (${x},${y})`);
      throw new HttpsError('not-found', 'Group not found at specified location');
    }
    
    const group = groupSnapshot.val();
    logger.info(`Found group: ${JSON.stringify(group)}`);
    
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
    
    // First set to cancelling state to signal to tick processor
    await groupRef.update({
      status: 'cancelling',
      cancelRequestTime: now
    });
    
    // After setting the cancelling state, perform the full update
    // This two-step process helps prevent race conditions with the tick processor
    await groupRef.update({
      status: 'idle',
      movementPath: null,
      pathIndex: null,
      moveStarted: null,
      moveSpeed: null,
      nextMoveTime: null,
      targetX: null,
      targetY: null,
      cancelRequestTime: null
    });
    
    // Add chat message about cancellation
    const chatMessageId = `cancel_move_${now}_${groupId}`;
    await db.ref(`worlds/${worldId}/chat/${chatMessageId}`).set({
      text: `${group.name || 'A group'} has stopped their journey at (${x}, ${y})`,
      type: 'event',
      timestamp: now,
      location: {
        x: x,
        y: y
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
