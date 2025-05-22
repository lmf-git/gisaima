/**
 * Movement tick processing for Gisaima
 * Handles group movement steps during tick cycles
 */

import { logger } from "firebase-functions";
import { ref, get } from "firebase/database";
import { db } from "../firebase.js";
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
  // Skip if group is in cancelling state - user is currently cancelling movement
  if (group.status === 'cancelling') {
    logger.info(`Skipping movement for group ${groupId} as it's being cancelled`);
    return false;
  }

  // ADDED: Immediately skip any group that has a battleId (meaning it's in combat)
  // This is critical for handling monsters that are attacked but still have movement properties
  if (group.battleId) {
    logger.info(`Skipping movement for group ${groupId} as it's in battle (battleId: ${group.battleId})`);
    
    // If the group still has 'moving' status but is in battle, fix it and clear movement properties
    if (group.status === 'moving') {
      const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
      updates[`${groupPath}/status`] = 'fighting';
      
      // Clear all movement-related properties
      updates[`${groupPath}/movementPath`] = null;
      updates[`${groupPath}/pathIndex`] = null;
      updates[`${groupPath}/moveStarted`] = null;
      updates[`${groupPath}/moveSpeed`] = null;
      updates[`${groupPath}/nextMoveTime`] = null;
      updates[`${groupPath}/targetX`] = null;
      updates[`${groupPath}/targetY`] = null;
    }
    
    return false;
  }

  // Skip if not in moving state or not time to move yet
  if (group.status !== 'moving' || !group.nextMoveTime || group.nextMoveTime > now) {
    return false;
  }
  
  // Full database path to this group
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  
  // Safety check: Verify all required movement properties exist
  if (!group.movementPath || !Array.isArray(group.movementPath) || 
      group.pathIndex === undefined || group.moveStarted === undefined) {
    // Path is invalid, reset the group status
    logger.warn(`Invalid path for group ${groupId} in world ${worldId}`);
    updates[`${groupPath}/status`] = 'idle';
    // Remove movement properties instead of setting to null
    updates[`${groupPath}/movementPath`] = null;
    updates[`${groupPath}/pathIndex`] = null;
    updates[`${groupPath}/moveStarted`] = null;
    updates[`${groupPath}/moveSpeed`] = null;
    updates[`${groupPath}/nextMoveTime`] = null;
    updates[`${groupPath}/targetX`] = null;
    updates[`${groupPath}/targetY`] = null;
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
      };
      
      // Ensure monster-specific properties are preserved after movement
      if (group.type === 'monster') {
        updatedGroup.type = 'monster';
        // Ensure status is 'idle' for monsters
        updatedGroup.status = 'idle';
        
        // LIST OF CRITICAL MONSTER PROPERTIES TO PRESERVE
        // Base properties
        if (group.personality) updatedGroup.personality = group.personality;
        // Preserve motion capabilities
        if (group.motion) updatedGroup.motion = group.motion;
        
        // Exploration properties
        if (group.explorationPhase) updatedGroup.explorationPhase = group.explorationPhase;
        if (group.explorationTicks) updatedGroup.explorationTicks = group.explorationTicks;
        
        // Structure relationships
        if (group.mobilizedFromStructure) updatedGroup.mobilizedFromStructure = group.mobilizedFromStructure;
        if (group.preferredStructureId) updatedGroup.preferredStructureId = group.preferredStructureId;
        
        // Targeting and intent
        if (group.targetStructure) updatedGroup.targetStructure = group.targetStructure;
        if (group.attackIntent) updatedGroup.attackIntent = group.attackIntent;
      }
    } else {
      // Normal movement step
      updatedGroup = {
        ...updatedGroup,
        x: nextPoint.x,
        y: nextPoint.y,
        pathIndex: nextIndex,
        nextMoveTime: nextMoveTime,
        status: 'moving'
      };
      
      // Ensure monster properties are preserved on intermediate moves too
      if (group.type === 'monster') {
        updatedGroup.type = 'monster';
        
        // PRESERVE THE SAME LIST OF CRITICAL MONSTER PROPERTIES FOR INTERMEDIATE STEPS
        // Base properties
        if (group.personality) updatedGroup.personality = group.personality;
        // Preserve motion capabilities
        if (group.motion) updatedGroup.motion = group.motion;
        
        // Exploration properties
        if (group.explorationPhase) updatedGroup.explorationPhase = group.explorationPhase;
        if (group.explorationTicks) updatedGroup.explorationTicks = group.explorationTicks;
        
        // Structure relationships
        if (group.mobilizedFromStructure) updatedGroup.mobilizedFromStructure = group.mobilizedFromStructure;
        if (group.preferredStructureId) updatedGroup.preferredStructureId = group.preferredStructureId;
        
        // Targeting and intent
        if (group.targetStructure) updatedGroup.targetStructure = group.targetStructure;
        if (group.attackIntent) updatedGroup.attackIntent = group.attackIntent;
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

/**
 * Updated function signature to accept worldData parameter
 */
export default async function moveTick(worldId, updates, now, worldData = null) {
  const moveResults = [];
  
  try {
    // Use passed worldData if available, otherwise load it (fallback)
    let world = worldData;
    if (!world) {
      logger.info(`No world data passed to moveTick, loading world ${worldId}`);
      const worldRef = ref(db, `worlds/${worldId}`);
      const worldSnapshot = await get(worldRef);
      world = worldSnapshot.exists() ? worldSnapshot.val() : null;
      
      if (!world) {
        logger.warn(`World ${worldId} not found or empty in moveTick.`);
        return { moveResults };
      }
    }
    
    // Get world seed for terrain generation
    const seed = world.info?.seed || world.seed || 12345;
    const terrainGen = new TerrainGenerator(seed);
    
    // Iterate over all groups in the world
    const groups = world.groups || {};
    for (const [groupId, group] of Object.entries(groups)) {
      // Skip if no movement data
      if (!group.movementPath || !Array.isArray(group.movementPath) || group.pathIndex === undefined) {
        continue;
      }
      
      // Process movement for each group
      const chunkKey = getChunkKey(group.x, group.y);
      const tileKey = `${group.x},${group.y}`;
      const result = await processMovement(worldId, updates, group, chunkKey, tileKey, groupId, now, db);
      moveResults.push({ groupId, result });
    }
    
    return { moveResults };
  } catch (error) {
    logger.error(`Error in moveTick for world ${worldId}:`, error);
    return { moveResults };
  }
}
