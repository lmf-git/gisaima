/**
 * Mobilization tick processing for Gisaima
 * Handles completing group mobilization during tick cycles
 */

import { logger } from "firebase-functions";

/**
 * Process mobilizing groups for a given world
 * 
 * @param {string} worldId The ID of the world to process
 * @param {Object} updates Reference to the updates object to modify
 * @param {Object} groups Map of group data by groupId 
 * @param {string} chunkKey Current chunk key
 * @param {string} tileKey Current tile key
 * @param {number} now Current timestamp
 * @returns {number} Number of mobilizations processed
 */
export function processMobilizations(worldId, updates, groups, chunkKey, tileKey, now) {
  let mobilizationsProcessed = 0;
  
  // Iterate through all groups in the given tile
  for (const [groupId, group] of Object.entries(groups)) {
    // Skip groups that aren't in mobilizing state
    if (group.status !== 'mobilizing') continue;
    
    // Full database path to this group
    const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
    
    // Complete mobilization and update group status to idle
    updates[`${groupPath}/status`] = 'idle';
    updates[`${groupPath}/lastUpdated`] = now;
    updates[`${groupPath}/readyAt`] = null; // Remove readyAt timestamp
    
    // Add a message about the mobilization
    updates[`${groupPath}/lastMessage`] = {
      text: `Group is fully mobilized and ready`,
      timestamp: now
    };
    
    mobilizationsProcessed++;
    logger.info(`Group ${groupId} completed mobilization at ${tileKey} in chunk ${chunkKey}`);
  }
  
  return mobilizationsProcessed;
}
