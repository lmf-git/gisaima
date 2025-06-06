/**
 * Recruitment tick processing for Gisaima
 * Handles completing recruitment during tick cycles
 * 
 * Note: All timing is now based on ticks rather than seconds
 * 1 tick = 60 seconds (configurable at world level)
 */

import { logger } from "firebase-functions";
import { getDatabase } from 'firebase-admin/database';
import UNITS from 'gisaima-shared/definitions/UNITS.js';

/**
 * Process recruitment queues for a given world
 * 
 * @param {string} worldId The ID of the world to process
 * @param {Object} updates Reference to the updates object to modify
 * @param {string} chunkKey Current chunk key
 * @param {string} tileKey Current tile key
 * @param {Object} tile Tile data containing structure with recruitment queue
 * @param {number} now Current timestamp
 * @returns {number} Number of recruitment items processed
 */
export function processRecruitment(worldId, updates, chunkKey, tileKey, tile, now) {
  if (!tile || !tile.structure || !tile.structure.recruitmentQueue) {
    return 0;
  }
  
  let recruitmentProcessed = 0;
  const structurePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`;
  const structure = tile.structure;
  
  // Process each recruitment item in the queue
  for (const [recruitmentId, recruitment] of Object.entries(structure.recruitmentQueue)) {
    
    // Check if the recruitment is complete
    if (recruitment.completesAt && recruitment.completesAt <= now) {
      // Get unit definition from UNITS to ensure all properties are consistent
      const unitId = recruitment.unitId;
      const unitDefinition = UNITS[unitId] || {};
      
      // Get parameters from the recruitment with fallbacks to unit definition
      const unitName = recruitment.unitName || unitDefinition.name || 'Unknown Unit';
      const quantity = recruitment.quantity || 1;
      const owner = recruitment.owner;
      const race = recruitment.race || unitDefinition.race || structure.race || 'neutral';
      const type = recruitment.type || unitDefinition.type;
      const power = unitDefinition.power || recruitment.power || 1;
      const icon = unitDefinition.icon || recruitment.icon || 'sword';
      
      // Remove the recruitment from the queue
      updates[`${structurePath}/recruitmentQueue/${recruitmentId}`] = null;
      
      // Add units to structure's inventory
      if (!structure.units) {
        updates[`${structurePath}/units`] = {};
      }
      
      // Generate a unique unit ID
      const newUnitId = `unit_${now}_${recruitmentId}`;
      
      // Create a more complete unit group with properties from UNITS definition
      const unitGroup = {
        id: newUnitId,
        name: `${unitName} Group`,
        unitId: unitId, // Store the original unit ID reference
        type,
        race,
        quantity,
        power,
        icon,
        owner,
        createdAt: now,
        // Include additional properties from unit definition if available
        category: unitDefinition.category || 'player',
        description: unitDefinition.description || `Group of ${unitName}`
      };
      
      // Add unit to structure units array or object
      if (Array.isArray(structure.units)) {
        // If structure.units is an array, we need to add it to the end
        // First, get the current length to determine the new index
        const currentLength = structure.units.length;
        updates[`${structurePath}/units/${currentLength}`] = unitGroup;
      } else {
        // If structure.units is an object with keys, use the unit ID as key
        updates[`${structurePath}/units/${unitId}`] = unitGroup;
      }
      
      // Add notification message to player
      if (owner) {        
        // Add to player's structure units reference
        updates[`players/${owner}/worlds/${worldId}/structures/${structure.id}/units/${unitId}`] = {
          id: unitId,
          name: `${unitName} Group`,
          quantity
        };
      }
      
      // Add world chat message about completed recruitment
      const chatMessageId = `recruit_complete_${now}_${Math.floor(Math.random() * 1000)}`;
      updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
        text: `${quantity} ${unitName} units completed recruitment at (${tileKey.replace(',', ', ')})`,
        type: 'event',
        timestamp: now,
        location: {
          x: parseInt(tileKey.split(',')[0]),
          y: parseInt(tileKey.split(',')[1]),
          timestamp: now
        }
      };
      
      recruitmentProcessed++;
      logger.info(`Completed recruitment of ${quantity} ${unitName} units at ${tileKey} in chunk ${chunkKey}`);
    }
  }
  
  return recruitmentProcessed;
}
