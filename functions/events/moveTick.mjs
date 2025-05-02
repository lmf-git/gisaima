/**
 * Movement tick processing for Gisaima
 * Handles group movement steps during tick cycles
 */

import { logger } from "firebase-functions";
import { getChunkKey } from "gisaima-shared/map/cartography.js";

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
    // Remove movement properties instead of setting to null
    updates[`${groupPath}/movementPath`] = null;
    updates[`${groupPath}/pathIndex`] = null;
    updates[`${groupPath}/moveStarted`] = null;
    updates[`${groupPath}/moveSpeed`] = null;
    updates[`${groupPath}/nextMoveTime`] = null;
    return false;
  }
  
  const currentIndex = group.pathIndex || 0;
  const nextIndex = currentIndex + 1;
  
  // Check if there are more steps in the path
  if (nextIndex >= group.movementPath.length) {
    // Path is complete, update the group status
    updates[`${groupPath}/status`] = 'idle';
    // Remove movement properties instead of setting to null
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

    // Add chat message for journey completion
    const startPoint = group.movementPath[0];
    const endPoint = group.movementPath[group.movementPath.length - 1];
    const groupName = group.name || "Unnamed force";
    const chatMessageText = `${groupName} completed their journey from (${startPoint.x},${startPoint.y}) to (${endPoint.x},${endPoint.y})`;
    
    // Add to world chat
    const chatMessageId = `move_${now}_${groupId}`;
    updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
      text: chatMessageText,
      type: 'event',
      timestamp: now,
      location: {
        x: endPoint.x,
        y: endPoint.y
      }
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
    // Create a copy of the group without movement properties if this is the last step
    let updatedGroup = {...group};
    if (nextIndex === group.movementPath.length - 1) {
      // If this is the final step, don't carry over movement properties
      const { moveSpeed, moveStarted, nextMoveTime, movementPath, pathIndex, ...cleanGroup } = updatedGroup;
      updatedGroup = {
        ...cleanGroup,
        status: 'idle',
        x: nextPoint.x,
        y: nextPoint.y,
        lastMessage: {
          text: `Moving to next location (${nextPoint.x},${nextPoint.y})`,
          timestamp: now
        }
      };
      
      // Ensure monster-specific properties are preserved after movement
      if (group.type === 'monster') {
        updatedGroup.type = 'monster';
        // Ensure status is 'idle' for monsters
        updatedGroup.status = 'idle';
      }
    } else {
      // Normal movement step
      updatedGroup = {
        ...updatedGroup,
        x: nextPoint.x,
        y: nextPoint.y,
        pathIndex: nextIndex,
        nextMoveTime: nextMoveTime,
        status: 'moving',
        lastMessage: {
          text: `Moving to next location (${nextPoint.x},${nextPoint.y})`,
          timestamp: now
        }
      };
      
      // Ensure monster type is preserved on intermediate moves
      if (group.type === 'monster') {
        updatedGroup.type = 'monster';
      }
    }
    
    updates[`worlds/${worldId}/chunks/${nextChunkKey}/${nextTileKey}/groups/${groupId}`] = updatedGroup;
    
    // Remove the group from the current position
    updates[`${groupPath}`] = null;
    
    // Add chat message for significant movement (every 3 steps or final destination)
    const isSignificantMove = nextIndex % 3 === 0 || nextIndex === group.movementPath.length - 1;
    if (isSignificantMove) {
      const groupName = group.name || "Unnamed force";
      const chatMessageText = `${groupName} has arrived at (${nextPoint.x},${nextPoint.y})${nextIndex < group.movementPath.length - 1 ? " and continues their journey" : ""}`;
      
      // Add to world chat
      const chatMessageId = `move_${now}_${groupId}_${nextIndex}`;
      updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
        text: chatMessageText,
        type: 'event',
        timestamp: now,
        location: {
          x: nextPoint.x,
          y: nextPoint.y
        }
      };
    }
    
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
    updates[`${groupPath}/nextMoveTime`] = nextMoveTime;
    
    // If this is the last step, set status to idle and remove movement properties
    if (nextIndex === group.movementPath.length - 1) {
      updates[`${groupPath}/status`] = 'idle';
      // Remove movement properties instead of setting to null
      updates[`${groupPath}/moveStarted`] = null;
      updates[`${groupPath}/moveSpeed`] = null;
      updates[`${groupPath}/movementPath`] = null;
      updates[`${groupPath}/pathIndex`] = null;
      updates[`${groupPath}/nextMoveTime`] = null;
      updates[`${groupPath}/targetX`] = null;
      updates[`${groupPath}/targetY`] = null;
    }
  }
  
  return true;
}
