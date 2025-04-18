/**
 * Movement function for Gisaima
 * Handles moving groups across the map
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Move group function
export const moveGroup = onCall({ maxInstances: 10 }, async (request) => {
  const { 
    groupId, 
    fromX, 
    fromY, 
    toX, 
    toY, 
    path, 
    worldId = 'default' 
  } = request.data;
  
  const userId = request.auth?.uid;
  
  if (!userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  
  logger.info(`User ${userId} attempting to move group ${groupId} from (${fromX},${fromY}) to (${toX},${toY}) in world ${worldId}`);
  
  if (!groupId) {
    throw new HttpsError("invalid-argument", "Missing groupId parameter");
  }
  
  if (fromX === undefined || fromY === undefined) {
    throw new HttpsError("invalid-argument", "Missing source coordinates");
  }
  
  if (toX === undefined || toY === undefined) {
    throw new HttpsError("invalid-argument", "Missing target coordinates");
  }
  
  try {
    const db = getDatabase();
    
    // Calculate chunk coordinates for the starting location
    const chunkSize = 20;
    const chunkX = Math.floor(fromX / chunkSize);
    const chunkY = Math.floor(fromY / chunkSize);
    const chunkKey = `${chunkX},${chunkY}`;
    const locationKey = `${fromX},${fromY}`;
    
    // Get group data to validate ownership
    const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}`);
    const groupSnapshot = await groupRef.once("value");
    const groupData = groupSnapshot.val();
    
    if (!groupData) {
      logger.error(`Group not found: ${groupId} at location (${fromX},${fromY}) in chunk ${chunkKey}`);
      throw new HttpsError("not-found", "Group not found at this location");
    }
    
    logger.info(`Group found: ${JSON.stringify(groupData)}`);
    
    // Verify ownership
    if (groupData.owner !== userId) {
      logger.error(`Permission denied: User ${userId} does not own group ${groupId} (owner: ${groupData.owner})`);
      throw new HttpsError("permission-denied", "You can only move your own groups");
    }
    
    // Verify group status is appropriate for movement
    if (groupData.status !== 'idle') {
      logger.error(`Group cannot move: Group ${groupId} has status ${groupData.status}`);
      throw new HttpsError("failed-precondition", `Group cannot move while in ${groupData.status} state`);
    }
    
    // Validate the path
    let movementPath = path || [];
    if (!Array.isArray(movementPath) || movementPath.length < 1) {
      // Create a simple path from source to destination
      movementPath = [
        { x: fromX, y: fromY }, 
        { x: toX, y: toY }
      ];
      logger.info(`Created default path: ${JSON.stringify(movementPath)}`);
    }
    
    // Validate the first point in path matches starting position
    if (movementPath[0].x !== fromX || movementPath[0].y !== fromY) {
      logger.error(`Invalid path: First point ${JSON.stringify(movementPath[0])} doesn't match start position (${fromX},${fromY})`);
      // Fix the path by prepending the starting position
      movementPath.unshift({ x: fromX, y: fromY });
    }
    
    // Validate the last point in path matches destination
    const lastPoint = movementPath[movementPath.length - 1];
    if (lastPoint.x !== toX || lastPoint.y !== toY) {
      logger.error(`Invalid path: Last point ${JSON.stringify(lastPoint)} doesn't match destination (${toX},${toY})`);
      // Fix the path by appending the destination
      movementPath.push({ x: toX, y: toY });
    }
    
    // Get world info to calculate movement speed
    const worldInfoRef = db.ref(`worlds/${worldId}/info`);
    const worldInfoSnapshot = await worldInfoRef.once("value");
    const worldInfo = worldInfoSnapshot.val() || {};
    const worldSpeed = worldInfo.speed || 1.0;
    
    // Calculate timing
    const now = Date.now();
    const moveSpeed = 1;  // Base move speed (adjust as needed)
    const actualSpeed = moveSpeed * worldSpeed;
    
    // Calculate next move time (in milliseconds)
    const moveInterval = Math.round(60000 / worldSpeed);  // 1 minute adjusted for world speed
    const nextMoveTime = now + moveInterval;
    
    logger.info(`Updating group ${groupId} for movement to (${toX},${toY}) with path of ${movementPath.length} points`);
    
    try {
      // Update group with movement data
      await groupRef.update({
        status: 'moving',
        targetX: toX,
        targetY: toY,
        moveStarted: now,
        moveSpeed: actualSpeed,
        lastUpdated: now,
        movementPath: movementPath,
        pathIndex: 0,
        nextMoveTime: nextMoveTime
      });
      
      logger.info(`Successfully started movement for group ${groupId}`);
      
      return {
        success: true,
        message: "Group movement started",
        nextMoveTime: nextMoveTime,
        path: movementPath
      };
    } catch (dbError) {
      logger.error(`Database update failed: ${dbError.message}`, dbError);
      throw new HttpsError("internal", "Failed to update group data", dbError);
    }
    
  } catch (error) {
    // Check if this is already an HttpsError
    if (error instanceof HttpsError) {
      throw error;
    }
    
    logger.error(`Error moving group:`, error);
    throw new HttpsError("internal", "Failed to move group", error);
  }
});

