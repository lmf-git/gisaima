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
  const tileKey = `${tileX},${tileY}`; 

  // Define constants for consistency
  const CHUNK_SIZE = 20;

  // Calculate chunk coordinates to match database structure with correction for world coordinates
  function getChunkKey(x, y) {
    // FIXED VERSION: Handle negative coordinates correctly
    const chunkX = Math.floor((x >= 0 ? x : x - CHUNK_SIZE + 1) / CHUNK_SIZE);
    const chunkY = Math.floor((y >= 0 ? y : y - CHUNK_SIZE + 1) / CHUNK_SIZE);
    
    // Log the calculation for debugging
    console.log(`Chunk calculation: (${x},${y}) -> chunk (${chunkX},${chunkY})`);
    
    return `${chunkX},${chunkY}`;
  }

  const chunkKey = getChunkKey(tileX, tileY);

  console.log(`Calculated chunk coordinates: ${chunkKey} for tile ${tileKey}`);
  
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
    console.log(`Tile data fetched from chunk ${chunkKey}:`, JSON.stringify(tileData));

    // Add additional logging to help diagnose issues
    if (includePlayer) {
      console.log("Attempting to include player in mobilization");
      
      if (!tileData.players) {
        console.warn(`No players found on tile ${tileKey} in chunk ${chunkKey}`);
      } else {
        console.log(`Players on tile: ${JSON.stringify(Object.keys(tileData.players))}`);
      }
    }

    // Verify player is on the tile if including player
    if (includePlayer) {
      const players = tileData.players || {};
      console.log(`Checking if player ${uid} is on tile ${tileKey}, players:`, JSON.stringify(players));
      
      // Enhanced player detection logic to handle both array and object formats
      let playerOnTile = false;
      
      if (Array.isArray(players)) {
        // Handle array format
        console.log("Players data is in array format");
        playerOnTile = players.some(p => p.uid === uid || p.id === uid);
      } else {
        // Handle object format
        console.log("Players data is in object format");
        playerOnTile = players[uid] !== undefined || 
                       Object.values(players).some(p => p.uid === uid || p.id === uid);
      }
      
      // Log the detection result
      console.log(`Player detection result: ${playerOnTile ? "FOUND" : "NOT FOUND"}`);
      
      if (!playerOnTile) {
        console.log(`Player ${uid} not found on tile ${tileKey}`);
        throw new HttpsError('failed-precondition', 'Player not found on this tile.');
      }
    }
    
    // Verify ownership of units
    if (units.length > 0) {
      const groups = tileData.groups || {};
      const ownedUnits = new Set();
      
      Object.values(groups).forEach(group => {
        if (group.owner === uid && group.units) {
          Object.values(group.units).forEach(unit => {
            if (unit.type !== 'player') {
              ownedUnits.add(unit.id);
            }
          });
        }
      });

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
      if (!currentData.worlds) currentData.worlds = {};
      if (!currentData.worlds[worldId]) currentData.worlds[worldId] = {};
      if (!currentData.worlds[worldId].chunks) currentData.worlds[worldId].chunks = {};
      if (!currentData.worlds[worldId].chunks[chunkKey]) currentData.worlds[worldId].chunks[chunkKey] = {};
      if (!currentData.worlds[worldId].chunks[chunkKey][tileKey]) currentData.worlds[worldId].chunks[chunkKey][tileKey] = {};

      const currentTile = currentData.worlds[worldId].chunks[chunkKey][tileKey];
      
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
      
      let unitCount = 0;
      
      if (units.length > 0) {
        Object.keys(currentTile.groups || {}).forEach(groupId => {
          const group = currentTile.groups[groupId];
          
          if (group.owner === uid && group.units) {
            const groupUnitKeys = Object.keys(group.units);
            
            groupUnitKeys.forEach(unitKey => {
              const unit = group.units[unitKey];
              
              if (units.includes(unit.id) && unit.type !== 'player') { 
                newGroup.units[unitKey] = unit;
                unitCount++;
                delete group.units[unitKey];
              }
            });

            if (Object.keys(group.units).length === 0) {
              delete currentTile.groups[groupId];
            }
          }
        });
      }
      
      if (includePlayer && currentTile.players) {
        // Enhanced player handling for the transaction
        let playerFound = false;
        
        if (Array.isArray(currentTile.players)) {
          // Handle array format
          const playerIndex = currentTile.players.findIndex(p => p.uid === uid || p.id === uid);
          if (playerIndex !== -1) {
            const player = currentTile.players[playerIndex];
            // Generate a consistent key for the player
            const playerKey = player.uid || player.id;
            
            newGroup.units[playerKey] = {
              ...player,
              type: 'player'
            };
            unitCount++;
            
            // Remove the player from the array
            currentTile.players.splice(playerIndex, 1);
            if (currentTile.players.length === 0) {
              delete currentTile.players;
            }
            playerFound = true;
          }
        } else {
          // Handle object format (original logic)
          const playerKeys = Object.keys(currentTile.players);
          
          for (const playerKey of playerKeys) {
            const player = currentTile.players[playerKey];
            
            if (player.uid === uid || player.id === uid) {
              newGroup.units[playerKey] = {
                ...player,
                type: 'player'
              };
              unitCount++;
              delete currentTile.players[playerKey];
              
              if (Object.keys(currentTile.players).length === 0) {
                delete currentTile.players;
              }
              playerFound = true;
              break;
            }
          }
        }
        
        if (includePlayer && !playerFound) {
          console.log(`Warning: Player was detected but couldn't be moved to the group`);
        }
      }
      
      newGroup.unitCount = unitCount;
      currentTile.groups[newGroupId] = newGroup;

      if (!currentData.players) currentData.players = {};
      if (!currentData.players[uid]) currentData.players[uid] = {};
      if (!currentData.players[uid].worlds) currentData.players[uid].worlds = {};
      if (!currentData.players[uid].worlds[worldId]) currentData.players[uid].worlds[worldId] = {};
      if (!currentData.players[uid].worlds[worldId].groups) currentData.players[uid].worlds[worldId].groups = {};

      currentData.players[uid].worlds[worldId].groups[newGroupId] = {
        id: newGroupId,
        at: `${tileX},${tileY}`,
        status: 'mobilizing',
        readyAt: nextTickTime
      };

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
