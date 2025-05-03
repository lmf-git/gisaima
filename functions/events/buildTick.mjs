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
export async function processBuilding(worldId, updates, chunkKey, tileKey, tile, now) {
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
  
  // Handle monster group building
  if (tile.groups) {
    for (const [groupId, group] of Object.entries(tile.groups)) {
      if (group.status === 'building' && group.type === 'monster') {
        // Check for completion using either buildingUntil or buildingStart+buildingTime
        let isComplete = false;
        
        if (group.buildingUntil) {
          // Use the same format as player groups
          isComplete = now >= group.buildingUntil;
        } else if (group.buildingStart && group.buildingTime) {
          // Backward compatibility for older format
          const buildTime = group.buildingTime * 60000; // Convert to milliseconds
          const elapsedTime = now - group.buildingStart;
          isComplete = elapsedTime >= buildTime;
        }
        
        // Check if building is complete
        if (isComplete) {
          // Reset monster group status
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`] = 'idle';
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/buildingStart`] = null;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/buildingTime`] = null;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/buildingUntil`] = null;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/buildingLocation`] = null;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/buildingType`] = null;
          
          // Check if the structure was built
          if (group.buildingLocation) {
            const { x, y } = group.buildingLocation;
            const structureChunkX = Math.floor(x / 20);
            const structureChunkY = Math.floor(y / 20);
            const structureChunkKey = `${structureChunkX},${structureChunkY}`;
            const structureTileKey = `${x},${y}`;
            
            // Mark the structure as completed
            updates[`worlds/${worldId}/chunks/${structureChunkKey}/${structureTileKey}/structure/status`] = 'complete';
            updates[`worlds/${worldId}/chunks/${structureChunkKey}/${structureTileKey}/structure/buildProgress`] = null;
            updates[`worlds/${worldId}/chunks/${structureChunkKey}/${structureTileKey}/structure/buildTotalTime`] = null;
            updates[`worlds/${worldId}/chunks/${structureChunkKey}/${structureTileKey}/structure/buildStartTime`] = null;
            updates[`worlds/${worldId}/chunks/${structureChunkKey}/${structureTileKey}/structure/buildCompletionTime`] = null;
            updates[`worlds/${worldId}/chunks/${structureChunkKey}/${structureTileKey}/structure/completedAt`] = now;
            
            // Add a chat message about structure completion
            const messagePath = `worlds/${worldId}/chat/build_complete_${now}_${groupId}`;
            updates[messagePath] = {
              text: `${group.name || "Monster group"} has completed building a ${group.buildingType || "structure"} at (${x}, ${y}).`,
              type: 'event',
              timestamp: now,
              location: { x, y }
            };
          }
          
          return true;
        }
        
        // If building is still in progress, update the progress
        if (!isComplete && group.buildingLocation) {
          const { x, y } = group.buildingLocation;
          const structureChunkX = Math.floor(x / 20);
          const structureChunkY = Math.floor(y / 20);
          const structureChunkKey = `${structureChunkX},${structureChunkY}`;
          const structureTileKey = `${x},${y}`;
          
          // Get the structure and update progress
          const structureRef = db.ref(`worlds/${worldId}/chunks/${structureChunkKey}/${structureTileKey}/structure`);
          const structureSnapshot = await structureRef.once('value');
          const structure = structureSnapshot.val();
          
          if (structure && structure.status === 'building') {
            const progress = (structure.buildProgress || 0) + 1;
            updates[`worlds/${worldId}/chunks/${structureChunkKey}/${structureTileKey}/structure/buildProgress`] = progress;
          }
        }
      }
    }
  }

  return false;
}
