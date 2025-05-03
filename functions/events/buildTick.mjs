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
  
  // Handle time-based completion (used by monster structures)
  if (structure.buildCompletionTime && structure.buildCompletionTime <= now) {
    completeStructure(worldId, updates, chunkKey, tileKey, tile, now);
    return true;
  }
  
  // Handle tick-based completion (used by player structures)
  if (structure.buildStartTick && structure.buildCompletionTick) {
    // Get current tick from world info
    const worldRef = db.ref(`worlds/${worldId}/info`);
    const worldSnapshot = await worldRef.once('value');
    const worldData = worldSnapshot.val();
    
    if (worldData && worldData.lastTick >= structure.buildCompletionTick) {
      completeStructure(worldId, updates, chunkKey, tileKey, tile, now);
      return true;
    }
  }
  
  // Calculate progress
  let progress = structure.buildProgress || 0;
  const total = structure.buildTotalTime || 1;
  progress += 1;
  
  // Full paths for updates
  const structurePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`;

  // Handle structure completion
  if (progress >= total) {
    completeStructure(worldId, updates, chunkKey, tileKey, tile, now);
    return true;
  } else {
    // Update progress only
    updates[`${structurePath}/buildProgress`] = progress;
    return false;
  }
}

/**
 * Complete a structure's construction
 */
function completeStructure(worldId, updates, chunkKey, tileKey, tile, now) {
  const structure = tile.structure;
  const builderId = structure.builder;
  
  console.log(`Building complete at ${tileKey} in chunk ${chunkKey}`);
  
  // Complete the structure
  const structurePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`;
  updates[`${structurePath}/status`] = 'complete';
  updates[`${structurePath}/buildProgress`] = null;
  updates[`${structurePath}/buildTotalTime`] = null;
  updates[`${structurePath}/buildStartTime`] = null;
  updates[`${structurePath}/buildCompletionTime`] = null;
  updates[`${structurePath}/buildStartTick`] = null;
  updates[`${structurePath}/buildCompletionTick`] = null;
  updates[`${structurePath}/completedAt`] = now;
  
  // Update the builder group's status if it exists
  if (tile.groups && tile.groups[builderId]) {
    const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${builderId}`;
    updates[`${groupPath}/status`] = 'idle';
    updates[`${groupPath}/buildingUntil`] = null;
    updates[`${groupPath}/buildingStart`] = null;
    updates[`${groupPath}/buildingTime`] = null;
    updates[`${groupPath}/buildingLocation`] = null;
    updates[`${groupPath}/buildingType`] = null;
  }
  
  // Create a chat message for the world
  const chatMessageKey = `chat_${now}_${Math.floor(Math.random() * 1000)}`;
  const isMonsterStructure = structure.monster === true || structure.owner === 'monster';
  
  updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
    text: `${structure.name} has been completed at (${tileKey.replace(',', ', ')})`,
    type: 'event',
    timestamp: now,
    userId: structure.owner || 'system',
    userName: structure.ownerName || (isMonsterStructure ? 'Monsters' : 'Unknown'),
    location: {
      x: parseInt(tileKey.split(',')[0]),
      y: parseInt(tileKey.split(',')[1]),
      timestamp: now
    }
  };
}

/**
 * Process building progress for all structures in a world
 * 
 * @param {Object} db Firestore database object
 * @param {string} worldId The ID of the world to process
 * @param {number} currentTick The current tick count
 */
export async function processBuildingProgress(db, worldId, currentTick) {
  const structures = await db.collection('worlds').doc(worldId).collection('structures')
    .where('status', '==', 'building').get();
  
  // Process each building structure
  for (const doc of structures.docs) {
    const structure = doc.data();
    
    // Use tick-based calculations instead of timestamps
    if (currentTick >= structure.buildCompletionTick) {
      // Building is complete
      await doc.ref.update({
        status: 'complete',
        completedAt: Date.now(),
        buildProgress: 100
      });
      
      // Notify the builder
      // ...notification code...
    } else {
      // Update progress percentage based on ticks
      const elapsedTicks = currentTick - structure.buildStartTick;
      const progressPercent = Math.min(100, Math.floor((elapsedTicks / structure.buildTotalTicks) * 100));
      
      await doc.ref.update({
        buildProgress: progressPercent
      });
    }
  }
}
