/**
 * Mobilization tick processing for Gisaima
 * Handles completing group mobilization during tick cycles
 */

// Use the same import pattern as other files
import { logger } from "firebase-functions";
import { getDatabase } from 'firebase-admin/database';


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
  
  // Debug: Log if groups exist in this tile
  console.log(`Checking for mobilizing groups at ${tileKey} in chunk ${chunkKey}: ${Object.keys(groups).length} groups found`);
  
  // Iterate through all groups in the given tile
  for (const [groupId, group] of Object.entries(groups)) {
    // Debug: Log group status
    console.log(`Group ${groupId} status: ${group.status}`);
    
    // Skip groups that aren't in mobilizing state
    if (group.status !== 'mobilizing') continue;
    
    // Debug: Log when mobilizing group found
    console.log(`Found mobilizing group ${groupId} at ${tileKey} in chunk ${chunkKey}`);
    
    // Full database path to this group
    const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
    
    // Complete mobilization and update group status to idle
    updates[`${groupPath}/status`] = 'idle';
    updates[`${groupPath}/readyAt`] = null;
    
    // Create a chat message for the world
    const chatMessageText = createMobilizationMessage(group, tileKey);
    
    // Generate a unique key for the chat message
    const chatMessageKey = `chat_${now}_${Math.floor(Math.random() * 1000)}`;
    
    // Create a proper chat message with all required fields
    updates[`worlds/${worldId}/chat/${chatMessageKey}`] = {
      text: chatMessageText,
      type: 'event',
      timestamp: now,
      userId: group.owner || "system", // Include userId (owner or system)
      userName: group.name || "System", // Use group name as userName
      location: {
        x: parseInt(tileKey.split(',')[0]),
        y: parseInt(tileKey.split(',')[1]),
        timestamp: now
      }
    };
    
    
    mobilizationsProcessed++;
    logger.info(`Group ${groupId} completed mobilization at ${tileKey} in chunk ${chunkKey}`);
    
    // Debug: Log updates keys added for this group
    console.log(`Added updates for mobilized group ${groupId}: ${Object.keys(updates).filter(key => key.includes(groupId)).join(', ')}`);
  }
  
  // Debug: Log number of mobilizations processed in this tile
  console.log(`Processed ${mobilizationsProcessed} mobilizations at ${tileKey} in chunk ${chunkKey}`);
  
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
  const groupSize = group.units?.length || "unknown size";
  const groupRace = group.race ? `${group.race}` : "";
  const location = tileKey.replace(',', ', ');
  
  // Create more descriptive messages based on force composition
  let message = "";
  
  if (groupSize === 1) {
    message = `A lone ${groupRace} warrior has mobilized`;
  } else if (groupSize <= 3) {
    message = `A small band of ${groupRace} fighters has mobilized`;
  } else if (groupSize <= 10) {
    message = `A company of ${groupRace} troops has mobilized`;
  } else {
    message = `A large army of ${groupRace} forces has mobilized`;
  }
  
  return `${message} at (${location}) - "${groupName}"`;
}
