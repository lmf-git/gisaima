/**
 * Movement function for Gisaima
 * Handles movement of groups across the map
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Function to calculate a simple path between two points using Bresenham's line algorithm
function calculatePath(startX, startY, endX, endY) {
  const path = [];
  
  let x = startX;
  let y = startY;
  
  // Add starting point
  path.push({ x, y });
  
  // Calculate deltas
  const dx = Math.abs(endX - startX);
  const dy = Math.abs(endY - startY);
  const sx = startX < endX ? 1 : -1;
  const sy = startY < endY ? 1 : -1;
  let err = dx - dy;
  
  while (!(x === endX && y === endY)) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    
    // Add this point to the path
    path.push({ x, y });
    
    // Safety check to prevent infinite loops
    if (path.length > 1000) {
      logger.warn(`Path calculation safety limit reached from (${startX},${startY}) to (${endX},${endY})`);
      break;
    }
  }
  
  return path;
}

// Function to initiate group movement
export const moveGroup = onCall({ maxInstances: 10 }, async (request) => {
  // Ensure user is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in to move groups');
  }
  
  const uid = request.auth.uid;
  const { groupId, fromX, fromY, toX, toY, worldId = 'default' } = request.data;
  
  if (!groupId || fromX === undefined || fromY === undefined || 
      toX === undefined || toY === undefined) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  try {
    const db = getDatabase();
    
    // Calculate chunk coordinates for the starting position
    const chunkX = Math.floor(fromX / 20);
    const chunkY = Math.floor(fromY / 20);
    const chunkKey = `${chunkX},${chunkY}`;
    const tileKey = `${fromX},${fromY}`;
    
    // Check if the group exists at the specified location
    const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`);
    const groupSnapshot = await groupRef.once('value');
    
    if (!groupSnapshot.exists()) {
      throw new HttpsError('not-found', 'Group not found at specified location');
    }
    
    const group = groupSnapshot.val();
    
    // Verify ownership
    if (group.owner !== uid) {
      throw new HttpsError('permission-denied', 'You can only move your own groups');
    }
    
    // Check if group can be moved (must be idle, not mobilizing, etc.)
    if (group.status !== 'idle') {
      throw new HttpsError('failed-precondition', `Group cannot be moved while in ${group.status} status`);
    }
    
    // Get world speed to adjust movement time
    const worldInfoRef = db.ref(`worlds/${worldId}/info`);
    const worldInfoSnapshot = await worldInfoRef.once('value');
    const worldInfo = worldInfoSnapshot.val() || {};
    const worldSpeed = worldInfo.speed || 1.0;
    
    // Calculate path between points
    const path = calculatePath(fromX, fromY, toX, toY);
    
    // Calculate time for the first movement step
    const now = Date.now();
    const baseTickTime = 60000; // 1 minute in ms
    const adjustedTickTime = Math.round(baseTickTime / worldSpeed);
    const nextMoveTime = now + adjustedTickTime;
    
    // Update the group with path information and set status to 'moving'
    await groupRef.update({
      status: 'moving',
      movementPath: path,
      pathIndex: 0, // Start at first position (which is current position)
      moveStarted: now,
      moveSpeed: 1, // Base speed, can be modified by terrain, items, etc.
      targetX: toX,
      targetY: toY,
      nextMoveTime: nextMoveTime,
      lastUpdated: now
    });
    
    return {
      success: true,
      message: 'Group movement started',
      path: path,
      totalSteps: path.length,
      estimatedTimeMs: adjustedTickTime * (path.length - 1) // -1 because we're already at the first position
    };
    
  } catch (error) {
    logger.error("Error moving group:", error);
    throw new HttpsError('internal', 'Failed to move group', error);
  }
});

