/**
 * Movement tick processing for Gisaima
 * Handles group movement steps during tick cycles
 */

import { logger } from "firebase-functions";
import { getChunkKey } from "./utils.mjs";

/**
 * Process movement for a group
 * 
 * @param {string} worldId World ID
 * @param {Object} updates Reference to the updates object to modify
 * @param {Object} group Group data to process
 * @param {string} chunkKey Current chunk key
 * @param {string} tileKey Current tile key
 * @param {string} groupId Group ID
 * @param {number} now Current timestamp
 * @returns {boolean} Whether movement was processed
 */
export async function processMovement(worldId, updates, group, chunkKey, tileKey, groupId, now, db) {
  // Skip if not in moving state or not time to move yet
  if (group.status !== 'moving' || !group.nextMoveTime || group.nextMoveTime > now) {
    return false;
  }
  
  // Full database path to this group
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  
  // Only proceed if we have a path
  if (!group.movementPath || !Array.isArray(group.movementPath) || group.pathIndex === undefined) {
    // Path is invalid, reset the group status
    logger.warn(`Invalid path for group ${groupId} in world ${worldId}`);
    updates[`${groupPath}/status`] = 'idle';
    updates[`${groupPath}/lastUpdated`] = now;
    updates[`${groupPath}/movementPath`] = null;
    updates[`${groupPath}/pathIndex`] = null;
    return false;
  }
  
  const currentIndex = group.pathIndex || 0;
  const nextIndex = currentIndex + 1;
  
  // Check if there are more steps in the path
  if (nextIndex >= group.movementPath.length) {
    // Path is complete, update the group status
    updates[`${groupPath}/status`] = 'idle';
    updates[`${groupPath}/lastUpdated`] = now;
    updates[`${groupPath}/movementPath`] = null;
    updates[`${groupPath}/pathIndex`] = null;
    updates[`${groupPath}/moveStarted`] = null;
    updates[`${groupPath}/moveSpeed`] = null;
    updates[`${groupPath}/nextMoveTime`] = null;
    updates[`${groupPath}/targetX`] = null;
    updates[`${groupPath}/targetY`] = null;
    
    // Add message about completed movement
    updates[`${groupPath}/lastMessage`] = {
      text: `Journey completed`,
      timestamp: now
    };
    
    return true;
  }
  
  // Get the next point in the path
  const nextPoint = group.movementPath[nextIndex];
  
  // Calculate the next chunk and tile for the new position
  const nextChunkKey = getChunkKey(nextPoint.x, nextPoint.y);
  const nextTileKey = `${nextPoint.x},${nextPoint.y}`;
  
  // Calculate time for the next step based on world speed
  const worldInfoRef = db.ref(`worlds/${worldId}/info`);
  const worldInfoSnap = await worldInfoRef.once('value');
  const worldInfo = worldInfoSnap.val() || {};
  const worldSpeed = worldInfo.speed || 1.0;
  const moveInterval = Math.round(60000 / worldSpeed); // 1 minute adjusted for world speed
  const nextMoveTime = now + moveInterval;
  
  // If position is changing (next point is different from current tile)
  if (nextChunkKey !== chunkKey || nextTileKey !== tileKey) {
    // Create a new group at the next position with the correct status
    updates[`worlds/${worldId}/chunks/${nextChunkKey}/${nextTileKey}/groups/${groupId}`] = {
      ...group,
      x: nextPoint.x,
      y: nextPoint.y,
      lastUpdated: now,
      pathIndex: nextIndex,
      nextMoveTime: nextMoveTime,
      // Ensure status remains 'moving' throughout the path
      status: nextIndex < group.movementPath.length - 1 ? 'moving' : 'idle',
      // Add message about progress
      lastMessage: {
        text: `Moving to next location (${nextPoint.x},${nextPoint.y})`,
        timestamp: now
      }
    };
    
    // Remove the group from the current position
    updates[`${groupPath}`] = null;
    
    // Update player position if they're in this group
    if (group.units) {
      const units = Array.isArray(group.units) ? group.units : Object.values(group.units);
      
      for (const unit of units) {
        if (unit.type === 'player' && unit.id) {
          // Update player location record with simplified structure
          updates[`players/${unit.id}/worlds/${worldId}/lastLocation`] = {
            x: nextPoint.x,
            y: nextPoint.y,
            timestamp: now
          };
        }
      }
    }
  } else {
    // Just update status, path index, and next move time without changing position
    updates[`${groupPath}/pathIndex`] = nextIndex;
    updates[`${groupPath}/lastUpdated`] = now;
    updates[`${groupPath}/nextMoveTime`] = nextMoveTime;
    
    // If this is the last step, set status to idle
    if (nextIndex === group.movementPath.length - 1) {
      updates[`${groupPath}/status`] = 'idle';
      // Clean up movement data
      updates[`${groupPath}/moveStarted`] = null;
      updates[`${groupPath}/moveSpeed`] = null;
      updates[`${groupPath}/targetX`] = null;
      updates[`${groupPath}/targetY`] = null;
    }
  }
  
  return true;
}
