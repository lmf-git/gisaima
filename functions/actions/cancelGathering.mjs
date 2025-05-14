import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

export const cancelGathering = onCall({ maxInstances: 10 }, async (request) => {
  // Check authentication context provided by onCall
  if (!request.auth) {
    logger.error('Unauthenticated call to cancelGather');
    throw new HttpsError('unauthenticated', 'User must be logged in to cancel gathering');
  }

  const uid = request.auth.uid;
  const { groupId, locationX, locationY, worldId } = request.data;

  // Validate required parameters
  if (!groupId || locationX === undefined || locationY === undefined || !worldId) {
    logger.warn('Missing required parameters for cancelGather');
    throw new HttpsError('invalid-argument', 'Missing required parameters: groupId, locationX, locationY, worldId');
  }

  logger.info('cancelGather function called by user', { uid, worldId, groupId, locationX, locationY });

  const db = getDatabase();
  const chunkSize = 20;
  const chunkX = Math.floor(locationX / chunkSize);
  const chunkY = Math.floor(locationY / chunkSize);
  const chunkKey = `${chunkX},${chunkY}`;
  const tileKey = `${locationX},${locationY}`;
  
  // Full database path to the group
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  const groupRef = db.ref(groupPath);
  
  try {
    // Get the current state of the group
    const groupSnapshot = await groupRef.once('value');
    
    if (!groupSnapshot.exists()) {
      logger.warn(`Group ${groupId} not found at position (${locationX},${locationY})`);
      throw new HttpsError('not-found', 'Group not found at the specified location');
    }

    const group = groupSnapshot.val();
    
    // Verify ownership
    if (group.owner !== uid) {
      logger.warn(`User ${uid} attempted to cancel gathering of group ${groupId} owned by ${group.owner}`);
      throw new HttpsError('permission-denied', 'You can only cancel gathering of your own groups');
    }
    
    // Check if group is in a gathering state
    if (group.status !== 'gathering') {
      logger.info(`Group ${groupId} is in ${group.status} state, not gathering - no need to cancel`);
      return {
        success: true,
        message: 'Group is not gathering',
        status: group.status
      };
    }
    
    const now = Date.now();
    
    // Update the group to cancel gathering
    // Update status to 'idle' and remove all gathering-related properties
    const updates = {};
    updates[`${groupPath}/status`] = 'idle';
    updates[`${groupPath}/gatheringBiome`] = null;
    updates[`${groupPath}/gatheringTicksRemaining`] = null;
    
    // Add a system message to the world chat
    const chatMessageId = `gather_cancel_${now}_${groupId}`;
    const chatMessagePath = `worlds/${worldId}/chat/${chatMessageId}`;
    const groupName = group.name || "Unnamed group";
    
    updates[chatMessagePath] = {
      text: `${groupName} has stopped gathering resources at (${locationX},${locationY})`,
      type: 'event',
      timestamp: now,
      userId: uid, // Include userId for attribution
      userName: group.ownerName || groupName, // Use group name if owner name not available
      location: {
        x: parseInt(locationX),
        y: parseInt(locationY),
        timestamp: now
      }
    };
    
    // Apply all updates in a single operation
    await db.ref().update(updates);
    
    logger.info(`Successfully cancelled gathering for group ${groupId} at (${locationX},${locationY})`);
    
    return {
      success: true,
      message: 'Gathering cancelled successfully',
      timestamp: now,
      data: { worldId, groupId, locationX, locationY, uid }
    };
  } catch (error) {
    logger.error(`Error cancelling gathering for group ${groupId}:`, error);
    throw new HttpsError('internal', `Failed to cancel gathering: ${error.message}`);
  }
});