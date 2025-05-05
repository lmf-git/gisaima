/**
 * Building tick processing for Gisaima
 * Handles structure building during tick cycles
 */

import { logger } from "firebase-functions";
import { STRUCTURES } from 'gisaima-shared/definitions/STRUCTURES.js';

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
  
  // Calculate progress
  const progress = (structure.buildProgress || 0) + 1;
  // Get total build time from STRUCTURES definition
  const total = STRUCTURES[structure.type]?.buildTime || 1;
  
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
  const owner = structure.owner;
  
  console.log(`Building complete at ${tileKey} in chunk ${chunkKey}`);
  
  // Complete the structure
  const structurePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`;
  updates[`${structurePath}/status`] = null;
  updates[`${structurePath}/buildProgress`] = null;
  
  // Update the builder group's status if it exists
  if (tile.groups && tile.groups[owner]) {
    const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${owner}`;
    updates[`${groupPath}/status`] = 'idle';
  }
  
  // Create a chat message for the world
  const chatMessageKey = `chat_${now}_${Math.floor(Math.random() * 1000)}`;
  
  updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
    text: `${structure.name} has been completed at (${tileKey.replace(',', ', ')})`,
    type: 'event',
    timestamp: now,
    userId: structure.owner || 'system',
    userName: structure.ownerName || (structure.monster === true ? 'Monsters' : 'Unknown'),
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
    
    // Calculate progress directly based on buildProgress and STRUCTURES definition
    const progress = structure.buildProgress || 0;
    const total = STRUCTURES[structure.type]?.buildTime || 1;
    const progressPercent = Math.min(100, Math.floor((progress / total) * 100));
    
    if (progress >= total) {
      // Building is complete - remove status entirely
      await doc.ref.update({
        status: null,
        buildProgress: null
      });
    } else {
      // Update progress
      await doc.ref.update({
        buildProgress: progress + 1
      });
    }
  }
}
