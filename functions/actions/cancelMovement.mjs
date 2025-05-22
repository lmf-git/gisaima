/**
 * Cancel Movement function for Gisaima
 * Allows players to cancel movement of their groups
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getDatabase } from 'firebase-admin/database';

/**
 * Function to cancel a group's movement
 * Requires authentication and group ownership
 */
export const cancelMovement = onCall(async (request) => {
  // Check if user is authenticated
  if (!request.auth) {
    logger.error('Unauthenticated call to cancelMove');
    throw new HttpsError('unauthenticated', 'User must be logged in to cancel movement');
  }
  
  const { worldId, groupId, x, y } = request.data || {};
  const uid = request.auth.uid;
  
  logger.info('cancelMove function called by user', { uid, worldId, groupId, x, y });
  
  // Validate required parameters
  if (!worldId || !groupId || x === undefined || y === undefined) {
    logger.warn('Missing required parameters for cancelMove');
    throw new HttpsError('invalid-argument', 'Missing required parameters: worldId, groupId, x, y');
  }

  try {
    const db = getDatabase();
    
    // Calculate the chunk key - similar to how it's done in moveTick.mjs
    // For simplicity, assume chunk coordinates are floored integer division of position by chunk size (typically 20)
    const CHUNK_SIZE = 20;
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkY = Math.floor(y / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkY}`;
    const tileKey = `${x},${y}`;
    
    // Full database path to the group
    const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
    const groupRef = db.ref(groupPath);
    
    // Check if the group exists at the specified location
    const groupSnapshot = await groupRef.once('value');
    
    if (!groupSnapshot.exists()) {
      logger.warn(`Group ${groupId} not found at position (${x},${y})`);
      throw new HttpsError('not-found', 'Group not found at the specified location');
    }
    
    const group = groupSnapshot.val();
    
    // Check if the group belongs to the authenticated user
    if (group.owner !== uid) {
      logger.warn(`User ${uid} attempted to cancel movement of group ${groupId} owned by ${group.owner}`);
      throw new HttpsError('permission-denied', 'You can only cancel movement of your own groups');
    }
    
    // Check if the group is actually in a moving state
    if (group.status !== 'moving') {
      logger.info(`Group ${groupId} is in ${group.status} state, not moving - no need to cancel`);
      return {
        success: true,
        message: 'Group is not moving',
        status: group.status
      };
    }
    
    // Update the group to cancel movement
    // Update status to 'idle' and remove all movement-related properties
    const updates = {};
    updates[`${groupPath}/status`] = 'idle';
    updates[`${groupPath}/movementPath`] = null;
    updates[`${groupPath}/pathIndex`] = null;
    updates[`${groupPath}/moveStarted`] = null;
    updates[`${groupPath}/moveSpeed`] = null;
    updates[`${groupPath}/nextMoveTime`] = null;
    
    // Add a system message to the world chat
    const now = Date.now();
    const chatMessageId = `move_cancel_${now}_${groupId}`;
    const chatMessagePath = `worlds/${worldId}/chat/${chatMessageId}`;
    const groupName = group.name || "Unnamed group";
    
    updates[chatMessagePath] = {
      text: `${groupName} has stopped their journey at (${x},${y})`,
      type: 'event',
      timestamp: now,
      userId: uid, // Include userId for attribution
      userName: groupName, // Use group name as userName
      location: {
        x: parseInt(x),
        y: parseInt(y),
        timestamp: now
      }
    };
    
    // Apply all updates in a single operation
    await db.ref().update(updates);
    
    logger.info(`Successfully cancelled movement of group ${groupId} at (${x},${y})`);
    
    return {
      success: true,
      message: 'Movement cancelled successfully',
      timestamp: now,
      data: { worldId, groupId, x, y, uid }
    };
  } catch (error) {
    logger.error(`Error cancelling movement of group ${groupId}:`, error);
    throw new HttpsError('internal', `Failed to cancel movement: ${error.message}`);
  }
});
