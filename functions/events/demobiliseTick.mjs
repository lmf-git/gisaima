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
  if (group.items && Array.isArray(group.items) && group.items.length > 0) {
    if (storageDestination === 'personal' && group.owner) {
      // Store in personal bank
      const bankPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/banks/${group.owner}`;
    
      // Check if personal bank already exists
      let existingBankItems = [];
      if (tile.structure.banks && tile.structure.banks[group.owner]) {
        existingBankItems = Array.isArray(tile.structure.banks[group.owner]) ? 
          tile.structure.banks[group.owner] : [];
      }
    
      // Combine existing bank items with new items from group, merging identical items
      updates[bankPath] = merge(existingBankItems, group.items);
    } else {
      // Store in shared storage (default behavior)
      const structurePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/items`;
    
      // If structure doesn't have items array yet, create it
      if (!tile.structure.items) {
        updates[structurePath] = group.items;
      } else {
        // Merge group items with structure items, combining identical items
        const existingItems = Array.isArray(tile.structure.items) ? tile.structure.items : [];
        updates[structurePath] = merge(existingItems, group.items);
      }
    }
    
    logger.info(`Transferred ${group.items.length} items to ${storageDestination} storage`);
  }
  
  // Handle units: move non-player units back to the structure and keep players on the map
  if (group.units) {
    // Handle both array and object structure
    const unitValues = Array.isArray(group.units) ? 
      group.units : Object.values(group.units);
      
    // Separate player and non-player units
    const playerUnits = unitValues.filter(unit => unit.type === 'player');
  
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
