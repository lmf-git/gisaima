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
  
  // Skip if the structure or builder are in battle
  const structure = tile.structure;
  if (structure.battleId) {
    logger.info(`Skipping building for structure at ${tileKey} because it's in battle`);
    return false;
  }
  
  // Skip if builder group is in battle
  if (structure.builder && tile.groups && tile.groups[structure.builder]) {
    const builderGroup = tile.groups[structure.builder];
    if (builderGroup.status === 'fighting' || builderGroup.battleId) {
      logger.info(`Skipping building for structure at ${tileKey} because builder group is in battle`);
      return false;
    }
  }
  
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
  if (structure.builder && tile.groups && tile.groups[structure.builder]) {
    const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${structure.builder}`;
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