/**
 * Demobilization tick processing for Gisaima
 * Handles completing group demobilization during tick cycles
 */

import { logger } from "firebase-functions";
import { merge } from "gisaima-shared/economy/items.js";

/**
 * Process demobilizing groups for a given world
 * 
 * @param {string} worldId The ID of the world to process
 * @param {Object} updates Reference to the updates object to modify
 * @param {Object} group Group data 
 * @param {string} chunkKey Current chunk key
 * @param {string} tileKey Current tile key
 * @param {string} groupId Group ID
 * @param {Object} tile Tile data
 * @param {number} now Current timestamp
 * @returns {boolean} Whether demobilization was processed
 */
export function processDemobilization(worldId, updates, group, chunkKey, tileKey, groupId, tile, now) {
  // Skip if not in demobilising status
  if (group.status !== 'demobilising') return false;
  
  // Full database path to this group
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  
  // Check if there's a structure to demobilize into
  if (!tile.structure) {
    logger.warn(`No structure found for demobilizing group ${groupId}`);
    updates[`${groupPath}/status`] = 'idle'; // Reset to idle if no structure
    return false;
  }
  
  // Get storage preference (defaults to shared if not specified)
  const storageDestination = group.storageDestination || 'shared';
  
  // Get the group name for chat messages
  const groupName = group.name || "Unnamed group";
  const structureName = tile.structure.name || "structure";
  
  // Transfer items from group to structure based on storage preference
  if (group.items && Object.keys(group.items).length > 0) {
    const groupItems = group.items; // This could be array (legacy) or object (new format)
    
    if (storageDestination === 'personal' && group.owner) {
      // Store in personal bank
      const bankPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/banks/${group.owner}`;
    
      // Check if personal bank already exists
      let existingBankItems = {};
      if (tile.structure.banks && tile.structure.banks[group.owner]) {
        existingBankItems = tile.structure.banks[group.owner];
      }
    
      // Combine existing bank items with new items from group, merging identical items
      updates[bankPath] = merge(existingBankItems, groupItems);
    } else {
      // Store in shared storage (default behavior)
      const structurePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/items`;
    
      // If structure doesn't have items yet, create it
      if (!tile.structure.items) {
        // If group items are already in the new format, use directly
        if (!Array.isArray(groupItems) && typeof groupItems === 'object') {
          updates[structurePath] = {...groupItems};
        } else {
          // Convert legacy format to new format
          updates[structurePath] = merge({}, groupItems);
        }
      } else {
        // Merge group items with structure items, combining identical items
        updates[structurePath] = merge(tile.structure.items, groupItems);
      }
    }
    
    // Count item types for logging
    const itemCount = Array.isArray(groupItems) ? 
      groupItems.length : Object.keys(groupItems).length;
      
    logger.info(`Transferred ${itemCount} item types to ${storageDestination} storage`);
  }
  
  // Handle units based on group type
  if (group.units) {
    // Check if this is a monster group
    const isMonsterGroup = group.type === 'monster';
    
    if (isMonsterGroup) {
      // MONSTER GROUP HANDLING
      // Instead of transferring units, increment monsterCount on the structure
      
      // Get unit count for monster groups
      const unitValues = Array.isArray(group.units) ? 
        group.units : Object.values(group.units);
      const monsterCount = unitValues.length;
      
      // Get current monster count or initialize to 0
      const currentMonsterCount = tile.structure.monsterCount || 0;
      
      // Update structure's monster count - add units from this group
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/monsterCount`] = 
        currentMonsterCount + monsterCount;
      
      // Also track monster types for future spawning preferences
      const monsterTypes = {};
      unitValues.forEach(unit => {
        const type = unit.type || 'unknown';
        monsterTypes[type] = (monsterTypes[type] || 0) + 1;
      });
      
      // Store or update the monster type distribution in the structure
      if (!tile.structure.monsterTypes) {
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/monsterTypes`] = monsterTypes;
      } else {
        const updatedTypes = {...tile.structure.monsterTypes};
        Object.entries(monsterTypes).forEach(([type, count]) => {
          updatedTypes[type] = (updatedTypes[type] || 0) + count;
        });
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/monsterTypes`] = updatedTypes;
      }
      
      // Update last reinforcement timestamp for decay calculations
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/lastReinforced`] = now;
      
      logger.info(`Added ${monsterCount} monsters to structure count, now at ${currentMonsterCount + monsterCount}`);
    } else {
      // PLAYER GROUP HANDLING - Keep original behavior for player units
      const unitValues = Array.isArray(group.units) ? 
        group.units : Object.values(group.units);
        
      // Separate player and non-player units
      const playerUnits = unitValues.filter(unit => unit.type === 'player');
      const nonPlayerUnits = unitValues.filter(unit => unit.type !== 'player');
    
      // For each player unit, make sure they remain on the tile 
      // but are no longer in the group
      for (const playerUnit of playerUnits) {
        if (playerUnit.id) {
          // Use the exact location data from demobilizationData if available
          // This ensures consistent chunk calculation
          let exactLocationData;
          if (group.demobilizationData && group.demobilizationData.exactLocation) {
            exactLocationData = group.demobilizationData.exactLocation;
          } else {
            // Fallback to current tile location if exact data is missing
            exactLocationData = {
              x: parseInt(tileKey.split(',')[0]),
              y: parseInt(tileKey.split(',')[1]),
              chunkKey: chunkKey
            };
          }
          
          // Use the exact chunk key from demobilization data to ensure proper placement
          const playerChunkKey = exactLocationData.chunkKey || chunkKey;
          const playerTileKey = `${exactLocationData.x},${exactLocationData.y}`;
          const playerId = playerUnit.id;
          
          // Create or update a standalone player entry on this tile
          const playerPath = `worlds/${worldId}/chunks/${playerChunkKey}/${playerTileKey}/players/${playerId}`;
          updates[playerPath] = {
            displayName: playerUnit.displayName || playerUnit.name || `Player ${playerId}`,
            id: playerId,
            race: playerUnit.race || 'human'
          };
          
          // Update player's world record to keep everything in sync
          updates[`players/${playerId}/worlds/${worldId}/lastLocation`] = {
            x: exactLocationData.x,
            y: exactLocationData.y,
            timestamp: now
          };
          
          // Clean up any pendingRelocation status for the player
          updates[`players/${playerId}/worlds/${worldId}/inGroup`] = null;
          
          logger.info(`Player ${playerId} placed at ${playerTileKey} in chunk ${playerChunkKey} after demobilization`);
        }
      }
      
      // Handle non-player units - add them to structure.units[playerid]
      if (nonPlayerUnits.length > 0) {
        const ownerId = group.owner || 'shared';
        const structureUnitsPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/units/${ownerId}`;
        
        // Check if the structure already has units for this owner
        let existingUnits = [];
        if (tile.structure && 
            tile.structure.units && 
            tile.structure.units[ownerId]) {
          existingUnits = Array.isArray(tile.structure.units[ownerId]) ? 
            tile.structure.units[ownerId] : Object.values(tile.structure.units[ownerId]);
        }
        
        // Add non-player units to the owner's unit collection in the structure
        updates[structureUnitsPath] = [...existingUnits, ...nonPlayerUnits];
        
        logger.info(`Transferred ${nonPlayerUnits.length} non-player units to structure under owner ${ownerId}`);
      }
    }
  }
  
  // Create chat message for demobilization completion
  const chatMessageId = `demob_complete_${now}_${groupId}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `${groupName} has been demobilized into ${structureName} at (${tileKey.replace(',', ', ')})`,
    type: 'event',
    timestamp: now,
    location: {
      x: parseInt(tileKey.split(',')[0]),
      y: parseInt(tileKey.split(',')[1])
    }
  };
  
  // Now that we've handled all the transfers, delete the group
  updates[groupPath] = null;
  
  return true;
}
