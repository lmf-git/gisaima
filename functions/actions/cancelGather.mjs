import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';

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

  console.log(`User ${uid} canceling gathering for group ${groupId} at (${locationX},${locationY}) in world ${worldId}`);

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
      console.log(`Group ${groupId} not found at (${locationX},${locationY})`);
      throw new HttpsError('not-found', 'Group not found at specified location');
    }

    const group = groupSnapshot.val();
    
    // Verify ownership
    if (group.owner !== uid) {
      console.log(`User ${uid} tried to cancel gathering for group ${groupId} owned by ${group.owner}`);
      throw new HttpsError('permission-denied', 'You can only cancel gathering of your own groups');
    }
    
    // Check if group is in a gathering state
    if (group.status !== 'gathering') {
      console.log(`Group ${groupId} is not gathering (current status: ${group.status})`);
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
    console.error(`Error cancelling gathering for group ${groupId}:`, error);
    throw new HttpsError('internal', 'Failed to cancel gathering: ' + error.message, error);
  }
});