/**
 * Mobilization tick processing for Gisaima
 * Handles completing group mobilization during tick cycles
 */

import { logger } from "firebase-functions";
import { getDatabase } from 'firebase-admin/database';
import { ref, push } from "firebase/database";

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
    
    // Create a chat message for the world
    const chatMessageText = createMobilizationMessage(group, tileKey);
    updates[`worlds/${worldId}/chat/${now}_${groupId}`] = {
      text: chatMessageText,
      type: 'event',
      timestamp: now,
      location: {
        x: parseInt(tileKey.split(',')[0]),
        y: parseInt(tileKey.split(',')[1])
      }
    };
    
    // Update player records if the owner is a player
    if (group.owner) {
      updates[`players/${group.owner}/worlds/${worldId}/groups/${groupId}/status`] = 'idle';
      updates[`players/${group.owner}/worlds/${worldId}/groups/${groupId}/readyAt`] = null;
    }
    
    mobilizationsProcessed++;
    logger.info(`Group ${groupId} completed mobilization at ${tileKey} in chunk ${chunkKey}`);
  }
  
  return mobilizationsProcessed;
}

/**
 * Create a descriptive message for the mobilization chat announcement
 * @param {Object} group The group that completed mobilization
 * @param {string} tileKey The location of the mobilization
 * @returns {string} Formatted message for chat
 */
function createMobilizationMessage(group, tileKey) {
  const groupName = group.name || "Unnamed force";
  const groupSize = group.unitCount || "unknown size";
  const groupRace = group.race ? `${group.race}` : "";
  const location = tileKey.replace(',', ', ');
  
  // Construct a more interesting message based on race and size
  let message = "";
  
  if (groupSize === 1) {
    message = `A lone ${groupRace} warrior has mobilized`;
  } else if (groupSize <= 5) {
    message = `A small band of ${groupRace} fighters has mobilized`;
  } else if (groupSize <= 20) {
    message = `A company of ${groupRace} troops has mobilized`;
  } else {
    message = `A large army of ${groupRace} forces has mobilized`;
  }
  
  return `${message} at (${location}) - "${groupName}"`;
}
