/**
 * Movement function for Gisaima
 * Handles movement of groups across the map
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Define CHUNK_SIZE constant for consistent usage
const CHUNK_SIZE = 20;

// Function to calculate chunk key consistently
function getChunkKey(x, y) {
  // Simple integer division works for both positive and negative coordinates
  const chunkX = Math.floor(x / CHUNK_SIZE);
  const chunkY = Math.floor(y / CHUNK_SIZE);
  return `${chunkX},${chunkY}`;
}

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
  logger.info('moveGroup function called with data:', request.data);
  
  // Ensure user is authenticated
  if (!request.auth) {
    logger.warn('Unauthenticated call to moveGroup');
    throw new HttpsError('unauthenticated', 'User must be logged in to move groups');
  }
  
  const uid = request.auth.uid;
  const { groupId, fromX, fromY, toX, toY, path, worldId = 'default' } = request.data;
  
  // Validate required parameters
  if (!groupId) {
    logger.warn('Missing groupId parameter');
    throw new HttpsError('invalid-argument', 'Missing groupId parameter');
  }
  
  if (fromX === undefined || fromY === undefined || 
      toX === undefined || toY === undefined) {
    logger.warn('Missing coordinates parameters');
    throw new HttpsError('invalid-argument', 'Missing coordinates parameters');
  }
  
  logger.info(`User ${uid} moving group ${groupId} from (${fromX},${fromY}) to (${toX},${toY}) in world ${worldId}`);
  
  try {
    const db = getDatabase();
    
    // Calculate chunk coordinates for the starting position - use getChunkKey function
    const chunkKey = getChunkKey(fromX, fromY);
    const tileKey = `${fromX},${fromY}`;
    
    // Check if the group exists at the specified location
    const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`);
    const groupSnapshot = await groupRef.once('value');
    
    if (!groupSnapshot.exists()) {
      logger.warn(`Group ${groupId} not found at (${fromX},${fromY})`);
      throw new HttpsError('not-found', 'Group not found at specified location');
    }
    
    const group = groupSnapshot.val();
    
    // Verify ownership
    if (group.owner !== uid) {
      logger.warn(`User ${uid} tried to move group ${groupId} owned by ${group.owner}`);
      throw new HttpsError('permission-denied', 'You can only move your own groups');
    }
    
    // Check if group can be moved (must be idle, not mobilizing, etc.)
    if (group.status !== 'idle') {
      logger.warn(`Group ${groupId} cannot be moved while in ${group.status} status`);
      throw new HttpsError('failed-precondition', `Group cannot be moved while in ${group.status} status`);
    }
    
    // Use provided path or calculate one if not provided
    let movementPath = path && Array.isArray(path) && path.length > 1 
      ? path 
      : calculatePath(fromX, fromY, toX, toY);
    
    logger.info(`Movement path has ${movementPath.length} points`);
    
    // Get world speed to adjust movement time
    const worldInfoRef = db.ref(`worlds/${worldId}/info`);
    const worldInfoSnapshot = await worldInfoRef.once('value');
    const worldInfo = worldInfoSnapshot.val() || {};
    const worldSpeed = worldInfo.speed || 1.0;
    
    // Calculate time for the first movement step
    const now = Date.now();
    const baseTickTime = 60000; // 1 minute in ms
    const adjustedTickTime = Math.round(baseTickTime / worldSpeed);
    const nextMoveTime = now + adjustedTickTime;
    
    // Add a chat message about the journey starting
    const groupName = group.name || "Unnamed group";
    const chatMessageId = `move_start_${now}_${groupId}`;
    const chatRef = db.ref(`worlds/${worldId}/chat/${chatMessageId}`);
    await chatRef.set({
      type: 'system',
      text: `${groupName} is setting out from (${fromX},${fromY}) to (${toX},${toY})`,
      timestamp: now,
      location: {
        x: fromX,
        y: fromY
      }
    });
    
    // Update the group with path information and set status to 'moving'
    await groupRef.update({
      status: 'moving',
      movementPath: movementPath,
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
      path: movementPath,
      totalSteps: movementPath.length,
      estimatedTimeMs: adjustedTickTime * (movementPath.length - 1) // -1 because we're already at the first position
    };
    
  } catch (error) {
    logger.error(`Error moving group ${groupId}:`, error);
    throw new HttpsError('internal', 'Failed to move group: ' + error.message, error);
  }
});

