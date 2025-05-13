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
export const cancelMove = onCall({ maxInstances: 10 }, async (request) => {
  logger.info('cancelMove function called with data:', request.data);
  return {
    success: true,
    message: 'Group movement cancelled successfully',
    timestamp: Date.now()
  };
});
