/**
 * Building tick processing for Gisaima
 * Handles structure building during tick cycles
 */

import { logger } from "firebase-functions";

/**
 * Process building structures for a given world
 * 
 * @param {string} worldId The ID of the world to process
 * @param {Object} updates Reference to the updates object to modify
 * @param {string} chunkKey Current chunk key
 * @param {string} tileKey Current tile key
 * @param {Object} tile Current tile data
 * @param {number} now Current timestamp
 * @returns {boolean} Whether a building was processed
 */
export function processBuilding(worldId, updates, chunkKey, tileKey, tile, now) {
  // Skip if no structure or structure not in building state
  if (!tile.structure || tile.structure.status !== 'building') {
    return false;
  }
  
  // Get structure data
  const structure = tile.structure;
  const builderId = structure.builder;
  
  // Log for debugging
  console.log(`Processing building at ${tileKey} in chunk ${chunkKey}, builder: ${builderId}`);
  
  // Skip if not yet time to complete a build tick
  if (structure.buildCompletionTime > now) {
    return false;
  }
  
  // Check if we have a builder group
  if (!tile.groups || !tile.groups[builderId]) {
    console.warn(`Builder group ${builderId} not found on tile ${tileKey}`);
    return false;
  }
  
  // Get builder group
  const builder = tile.groups[builderId];
  
  // Skip if builder is not in building state
  if (builder.status !== 'building') {
    console.warn(`Builder group ${builderId} is not in building state`);
    return false;
  }
  
  // Calculate progress
  const progress = structure.buildProgress + 1;
  const total = structure.buildTotalTime || 1;
  
  // Full paths for updates
  const structurePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`;
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${builderId}`;

  // Handle structure completion
  if (progress >= total) {
    console.log(`Building complete at ${tileKey} in chunk ${chunkKey}`);
    
    // Complete the structure
    updates[`${structurePath}/status`] = 'complete';
    updates[`${structurePath}/buildProgress`] = null;
    updates[`${structurePath}/buildTotalTime`] = null;
    updates[`${structurePath}/buildStartTime`] = null;
    updates[`${structurePath}/buildCompletionTime`] = null;
    updates[`${structurePath}/completedAt`] = now;
    
    // Reset the group status
    updates[`${groupPath}/status`] = 'idle';
    updates[`${groupPath}/buildingUntil`] = null;
    
    // Create a chat message for the world
    const chatMessageKey = `chat_${now}_${Math.floor(Math.random() * 1000)}`;
    updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
      text: `${structure.name} has been completed at (${tileKey.replace(',', ', ')})`,
      type: 'event',
      timestamp: now,
      userId: builder.owner || 'system',
      userName: structure.ownerName || 'Unknown',
      location: {
        x: parseInt(tileKey.split(',')[0]),
        y: parseInt(tileKey.split(',')[1]),
        timestamp: now
      }
    };
  } else {
    console.log(`Building progress at ${tileKey} in chunk ${chunkKey}: ${progress}/${total}`);
    
    // Update progress only
    updates[`${structurePath}/buildProgress`] = progress;
  }
  
  return true;
}
