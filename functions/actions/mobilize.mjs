/**
 * Mobilization function for Gisaima
 * Handles creating new mobile groups
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getDatabase } from 'firebase-admin/database';

/**
 * Mobilizes units into a new group at a specific location.
 * Requires authentication.
 */
export const startMobilization = onCall(async (request) => {
  // Check authentication context provided by onCall
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const uid = request.auth.uid;
  const { worldId, tileX, tileY, units, includePlayer, name, race } = request.data;

  // --- Validation ---
  if (!worldId || typeof tileX !== 'number' || typeof tileY !== 'number' || !Array.isArray(units)) {
    throw new HttpsError('invalid-argument', 'Required parameters are missing or invalid.');
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
     throw new HttpsError('invalid-argument', 'Group name is required.');
  }

  console.log(`Mobilization request by ${uid} for world ${worldId} at ${tileX},${tileY}`);
  
  const db = getDatabase();
  const tileKey = `${tileX},${tileY}`; // Fixed: changed underscore to comma to match database format
  const chunkX = Math.floor(tileX / 20);
  const chunkY = Math.floor(tileY / 20);
  const chunkKey = `${chunkX},${chunkY}`;
  const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
  const worldRef = db.ref(`worlds/${worldId}/info`);
  
  try {
    // Get world info to calculate next tick time
    const worldSnapshot = await worldRef.once('value');
    const worldData = worldSnapshot.val();
    if (!worldData) {
      throw new HttpsError('not-found', 'World not found.');
    }
    
    // Get current tile data to validate units and player presence
    const tileSnapshot = await tileRef.once('value');
    const tileData = tileSnapshot.val() || {};
    
    console.log(`Tile data fetched:`, JSON.stringify(tileData));
    
    // Verify player is on the tile if including player
    if (includePlayer) {
      const players = tileData.players || {};
      console.log(`Checking if player ${uid} is on tile, players:`, JSON.stringify(players));
      
      // Check if player exists as a key in the players object (real database structure)
      const playerOnTile = players[uid] !== undefined || 
                          Object.values(players).some(p => p.uid === uid);
      
      if (!playerOnTile) {
        console.log(`Player ${uid} not found on tile ${tileKey}`);
        throw new HttpsError('failed-precondition', 'Player not found on this tile.');
      }
    }
    
    // Verify ownership of units
    if (units.length > 0) {
      const groups = tileData.groups || {};
      const ownedUnits = new Set();
      
      // Collect all unit IDs owned by player
      Object.values(groups).forEach(group => {
        if (group.owner === uid && group.units) {
          Object.values(group.units).forEach(unit => {
            if (unit.type !== 'player') {
              ownedUnits.add(unit.id);
            }
          });
        }
      });
      
      // Check if all requested units are owned
      const invalidUnits = units.filter(unitId => !ownedUnits.has(unitId));
      if (invalidUnits.length > 0) {
        throw new HttpsError(
          'permission-denied', 
          `You don't own some requested units: ${invalidUnits.join(', ')}`
        );
      }
    }
    
    // Calculate when mobilization will complete (next world tick)
    const now = Date.now();
    const tickInterval = worldData.tickInterval || 60000; // Default 1 minute
    let nextTickTime = worldData.lastTick + tickInterval;
    while (nextTickTime <= now) {
      nextTickTime += tickInterval;
    }
    
    // Generate new group ID
    const newGroupId = db.ref().push().key;
    
    // Use a transaction to ensure data consistency when moving units
    await db.ref().transaction(currentData => {
      if (!currentData) return null;
      
      // Get the latest tile data
      if (!currentData.tiles) currentData.tiles = {};
      if (!currentData.tiles[worldId]) currentData.tiles[worldId] = {};
      if (!currentData.tiles[worldId][tileKey]) currentData.tiles[worldId][tileKey] = {};
      
      const currentTile = currentData.tiles[worldId][tileKey];
      
      // Create new group
      const newGroup = {
        id: newGroupId,
        name,
        owner: uid,
        status: 'mobilizing',
        readyAt: nextTickTime,
        createdAt: now,
        x: tileX,
        y: tileY,
        race: race || null,
        units: {}
      };
      
      if (!currentTile.groups) currentTile.groups = {};
      
      // Add units to new group
      let unitCount = 0;
      
      // Process selected units from existing groups
      if (units.length > 0) {
        Object.keys(currentTile.groups).forEach(groupId => {
          const group = currentTile.groups[groupId];
          
          if (group.owner === uid && group.units) {
            const groupUnitKeys = Object.keys(group.units);
            
            groupUnitKeys.forEach(unitKey => {
              const unit = group.units[unitKey];
              
              if (units.includes(unit.id) && unit.type !== 'player') {
                // Add to new group
                newGroup.units[unitKey] = unit;
                unitCount++;
                
                // Remove from old group
                delete group.units[unitKey];
              }
            });
            
            // If group is now empty, delete it
            if (Object.keys(group.units).length === 0) {
              delete currentTile.groups[groupId];
            }
          }
        });
      }
      
      // Include player if requested
      if (includePlayer && currentTile.players) {
        const playerKeys = Object.keys(currentTile.players);
        
        for (const playerKey of playerKeys) {
          const player = currentTile.players[playerKey];
          
          if (player.uid === uid || player.id === uid) {
            // Copy player to the group as a unit
            newGroup.units[playerKey] = {
              ...player,
              type: 'player'
            };
            unitCount++;
            
            // Remove player from the tile's players collection
            delete currentTile.players[playerKey];
            
            // If players is now empty, delete it
            if (Object.keys(currentTile.players).length === 0) {
              delete currentTile.players;
            }
            break;
          }
        }
      }
      
      // Add the new group to the tile
      newGroup.unitCount = unitCount;
      currentTile.groups[newGroupId] = newGroup;
      
      // Update player data to track this group
      if (!currentData.players) currentData.players = {};
      if (!currentData.players[uid]) currentData.players[uid] = {};
      if (!currentData.players[uid].worlds) currentData.players[uid].worlds = {};
      if (!currentData.players[uid].worlds[worldId]) currentData.players[uid].worlds[worldId] = {};
      if (!currentData.players[uid].worlds[worldId].groups) currentData.players[uid].worlds[worldId].groups = {};
      
      // Add group reference to player data
      currentData.players[uid].worlds[worldId].groups[newGroupId] = {
        id: newGroupId,
        at: `${tileX},${tileY}`,
        status: 'mobilizing',
        readyAt: nextTickTime
      };
      
      // Update player location if they're part of the group
      if (includePlayer) {
        currentData.players[uid].worlds[worldId].lastLocation = { x: tileX, y: tileY };
        currentData.players[uid].worlds[worldId].inGroup = newGroupId;
      }
      
      return currentData;
    });
    
    console.log(`Mobilization successful for user ${uid}, group ${newGroupId}`);
    return { 
      success: true, 
      groupId: newGroupId,
      completesAt: nextTickTime
    };
    
  } catch (error) {
    console.error('Mobilization failed:', error);
    throw new HttpsError(
      error.code || 'internal',
      error.message || 'Failed to start mobilization.',
      error
    );
  }
});
