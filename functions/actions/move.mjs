/**
 * Movement function for Gisaima
 * Handles moving groups across the map
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getDatabase } from "firebase-admin/database";

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
    
    // Generate chunk and tile keys
    const chunkSize = 20;
    const chunkX = Math.floor(fromX / chunkSize);
    const chunkY = Math.floor(fromY / chunkSize);
    const chunkKey = `${chunkX},${chunkY}`;
    const tileKey = `${fromX},${fromY}`;
    
    // Check if group exists and belongs to user
    const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`);
    const groupSnapshot = await groupRef.once('value');
    
    if (!groupSnapshot.exists()) {
      throw new HttpsError("not-found", "Group not found at specified coordinates");
    }
    
    const group = groupSnapshot.val();
    
    if (group.owner !== userId) {
      throw new HttpsError("permission-denied", "You don't have permission to move this group");
    }
    
    if (group.status !== 'idle') {
      throw new HttpsError("failed-precondition", "Group is not idle and cannot be moved");
    }
    
    // Determine the movement path
    let movementPath;
    
    if (path && Array.isArray(path) && path.length >= 2) {
      // Use provided path
      movementPath = path;
      
      // Basic validation of path
      if (path[0].x !== fromX || path[0].y !== fromY) {
        throw new HttpsError("invalid-argument", "Path must start at the group's current position");
      }
      
      if (path[path.length - 1].x !== toX || path[path.length - 1].y !== toY) {
        throw new HttpsError("invalid-argument", "Path must end at the target position");
      }
      
      // Limit path length to prevent abuse
      if (path.length > 50) {
        throw new HttpsError("invalid-argument", "Path is too long (maximum 50 steps)");
      }
    } else {
      // Calculate a simple path if none provided
      movementPath = [
        { x: fromX, y: fromY },
        { x: toX, y: toY }
      ];
    }
    
    // Calculate world speed for movement timing
    const worldInfoRef = db.ref(`worlds/${worldId}/info`);
    const worldInfoSnap = await worldInfoRef.once('value');
    const worldInfo = worldInfoSnap.val() || {};
    const worldSpeed = worldInfo.speed || 1.0;
    
    // Calculate the next move time
    const now = Date.now();
    const moveInterval = Math.round(60000 / worldSpeed); // 1 minute adjusted by world speed
    const nextMoveTime = now + moveInterval;
    
    // Update group to start moving
    const updates = {
      [`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`]: 'moving',
      [`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/moveStarted`]: now,
      [`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/moveSpeed`]: worldSpeed,
      [`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/movementPath`]: movementPath,
      [`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/pathIndex`]: 0,
      [`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/nextMoveTime`]: nextMoveTime,
      [`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/targetX`]: toX,
      [`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/targetY`]: toY,
      [`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/lastUpdated`]: now
    };
    
    await db.ref().update(updates);
    
    logger.info(`Group ${groupId} movement started from (${fromX},${fromY}) to (${toX},${toY}) with ${movementPath.length} steps`);
    
    return {
      success: true,
      message: "Movement started",
      nextMove: nextMoveTime,
      steps: movementPath.length
    };
  } catch (error) {
    logger.error("Error starting group movement:", error);
    throw new HttpsError("internal", `Failed to start movement: ${error.message}`);
  }
});

