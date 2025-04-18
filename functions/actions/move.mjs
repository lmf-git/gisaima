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
  
  if (!groupId || fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
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
      throw new HttpsError("not-found", "Group not found at this location");
    }
    
    // Verify ownership
    if (groupData.owner !== userId) {
      throw new HttpsError("permission-denied", "You can only move your own groups");
    }
    
    // Verify group status is appropriate for movement
    if (groupData.status !== 'idle') {
      throw new HttpsError("failed-precondition", `Group cannot move while in ${groupData.status} state`);
    }
    
    // Validate the path
    const movementPath = path || [];
    if (movementPath.length < 2) {
      // If no valid path provided, create a basic path from start to end
      movementPath.push({ x: fromX, y: fromY });
      movementPath.push({ x: toX, y: toY });
    }
    
    // Validate the path starts from correct location
    if (movementPath[0].x !== fromX || movementPath[0].y !== fromY) {
      throw new HttpsError("invalid-argument", "Path must start from group's current location");
    }
    
    // Validate the path ends at the specified target
    if (movementPath[movementPath.length - 1].x !== toX || 
        movementPath[movementPath.length - 1].y !== toY) {
      throw new HttpsError("invalid-argument", "Path must end at the specified target location");
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
    
    return {
      success: true,
      message: "Group movement started",
      nextMoveTime: nextMoveTime,
      path: movementPath
    };
    
  } catch (error) {
    logger.error("Error moving group:", error);
    throw new HttpsError("internal", "Failed to move group", error);
  }
});

