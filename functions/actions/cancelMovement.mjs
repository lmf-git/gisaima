/**
 * Cancel Movement function for Gisaima
 * Allows players to cancel movement of their groups
 */

import { onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

/**
 * Function to cancel a group's movement
 * Requires authentication and group ownership
 */
export const cancelMovement = onCall(async (request) => {
  // Check if user is authenticated
  if (!request.auth) {
    logger.error('Unauthenticated call to cancelMove');
    throw new Error('Unauthenticated');
  }
  
  const { worldId, groupId, x, y } = request.data || {};
  const uid = request.auth.uid;
  
  logger.info('cancelMove function called by user', { uid, worldId, groupId, x, y });
  
  // Return a simple success response to test if the function works
  return {
    success: true,
    message: 'Function was called successfully',
    timestamp: Date.now(),
    data: { worldId, groupId, x, y, uid }
  };
});
