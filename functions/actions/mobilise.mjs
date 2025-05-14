/**
 * Mobilization function for Gisaima
 * Handles creating new mobile groups
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getDatabase } from 'firebase-admin/database';
import { getChunkKey } from 'gisaima-shared/map/cartography.js';
// Import unit definitions to check boat capacities
import UNITS from 'gisaima-shared/definitions/UNITS.js';

/**
 * Mobilizes units into a new group at a specific location.
 * Requires authentication.
 */

// Enhanced function to check if player exists on tile with better debugging
function isPlayerOnTile(tileData, playerId) {
  console.log(`Checking if player ${playerId} is on tile:`, JSON.stringify(tileData || "no tile data"));
  
  if (!tileData) {
    console.log("Tile data is null or undefined");
    return false;
  }
  
  // Log the exact keys available
  console.log("Available properties in tile data:", Object.keys(tileData));
  
  // DIRECT CHECK: Try to access player directly with playerId as the key
  if (tileData.players?.[playerId]) {
    console.log(`Direct hit! Found player ${playerId} as direct key in players object`);
    return true;
  }
  
  // First, check directly in the players property
  if (tileData?.players) {
    console.log('Players property exists on tile');
    console.log('Players property type:', typeof tileData.players);
    
    // Handle players stored as an array
    if (Array.isArray(tileData.players)) {
      console.log('Players stored as array with length:', tileData.players.length);
      console.log('Players array contents:', JSON.stringify(tileData.players));
      
      const found = tileData.players.some(p => p.id === playerId);
      if (found) {
        console.log(`Found player ${playerId} in players array`);
        return true;
      }
    }
    
    // Handle players stored as an object with keys
    if (typeof tileData.players === 'object') {
      console.log('Players stored as object with keys:', Object.keys(tileData.players));
      
      // First check if the player's ID is a direct key in the object
      if (tileData.players[playerId]) {
        console.log(`Found player directly with key ${playerId}`);
        return true;
      }
      
      // Then check all player objects for matching uid/id
      const playerValues = Object.values(tileData.players);
      console.log(`Checking ${playerValues.length} player objects for matching UID/ID`);
      
      for (const player of playerValues) {
        console.log(`Checking player:`, JSON.stringify(player));
        if (player && (player.id === playerId)) {
          console.log(`Found matching player: ${JSON.stringify(player)}`);
          return true;
        }
      }
      
      console.log(`No matching player found in player objects`);
    }
  } else {
    console.log('No players property on tile');
  }
  
  // Second, check in groups for player units
  if (tileData?.groups) {
    console.log('Checking groups for player units');
    console.log('Groups property type:', typeof tileData.groups);
    console.log('Available group IDs:', Object.keys(tileData.groups));
    
    for (const groupId in tileData.groups) {
      const group = tileData.groups[groupId];
      console.log(`Checking group ${groupId}:`, JSON.stringify(group));
      
      if (group.units) {
        console.log(`Group ${groupId} has units property of type:`, typeof group.units);
        
        // Handle units as array
        if (Array.isArray(group.units)) {
          console.log(`Group ${groupId} units as array with length:`, group.units.length);
          
          for (const unit of group.units) {
            console.log(`Checking unit:`, JSON.stringify(unit));
            if (unit.type === 'player' && (unit.id === playerId)) {
              console.log(`Found player ${playerId} in group ${groupId} units array`);
              return true;
            }
          }
        }
        // Handle units as object
        else if (typeof group.units === 'object') {
          console.log(`Group ${groupId} units as object with keys:`, Object.keys(group.units));
          
          for (const unitId in group.units) {
            const unit = group.units[unitId];
            console.log(`Checking unit ${unitId}:`, JSON.stringify(unit));
            
            if (unit.type === 'player' && (unit.id === playerId)) {
              console.log(`Found player ${playerId} in group ${groupId} units object`);
              return true;
            }
          }
        }
      } else {
        console.log(`Group ${groupId} has no units property`);
      }
    }
  } else {
    console.log('No groups property on tile');
  }
  
  console.log(`Player ${playerId} not found on tile after all checks`);
  return false;
}

export const mobiliseUnits = onCall({ maxInstances: 10 }, async (request) => {
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

  const chunkKey = getChunkKey(tileX, tileY);

  console.log(`Calculated chunk coordinates: ${chunkKey} for tile ${tileKey}`);
  
  let tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
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
    let tileData = tileSnapshot.val() || {};
    console.log(`Mobilizing at coordinates ${tileX},${tileY} in chunk ${chunkKey}`);
    console.log(`Tile data fetched from database:`, JSON.stringify(tileData));
    
    // Check if player exists at this location
    let playerFoundOnTile = isPlayerOnTile(tileData, uid);
    
    // If still not found, do extra debugging before throwing error
    if (!playerFoundOnTile) {
      console.warn(`mobiliseUnits: Player ${uid} not found on tile at ${tileKey} in chunk ${chunkKey}`);
      console.info(`Players data:`, JSON.stringify(tileData.players || {}));
      
      console.log(`Full path checked: worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
      
      // Try to find the player's actual location to help debugging
      const playerWorldRef = db.ref(`players/${uid}/worlds/${worldId}`);
      const playerWorldSnapshot = await playerWorldRef.once('value');
      const playerWorldData = playerWorldSnapshot.val();
      
      if (playerWorldData?.lastLocation) {
        console.log(`Player last location according to player record:`, playerWorldData.lastLocation);
        
        // Calculate what chunk this location would be in
        const playerLocX = playerWorldData.lastLocation.x;
        const playerLocY = playerWorldData.lastLocation.y;
        const playerLocChunk = getChunkKey(playerLocX, playerLocY);
        
        console.log(`This location would be in chunk: ${playerLocChunk}`);
        
        if (playerLocChunk !== chunkKey) {
          console.warn(`Chunk mismatch! Request is for chunk ${chunkKey} but player seems to be in chunk ${playerLocChunk}`);
        }
      }
      
      // Desperate measures - scan the entire chunk for the player
      console.log(`Scanning entire chunk ${chunkKey} for player ${uid}...`);
      const chunkRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}`);
      const chunkSnapshot = await chunkRef.once('value');
      const chunkData = chunkSnapshot.val();
      
      let playerFoundInChunk = false;
      if (chunkData) {
        for (const [tileLoc, tileContent] of Object.entries(chunkData)) {
          if (tileContent.players && (tileContent.players[uid] || 
             Object.values(tileContent.players).some(p => p.id === uid))) {
            playerFoundInChunk = true;
            console.log(`Found player ${uid} in chunk ${chunkKey} but at tile ${tileLoc} instead of requested ${tileKey}`);
            
            throw new HttpsError(
              'failed-precondition', 
              `You appear to be at coordinates ${tileLoc}, not at ${tileKey}. Please refresh or try from your actual location.`
            );
          }
        }
      }
      
      throw new HttpsError('failed-precondition', 'Player not found on this tile');
    }

    // Verify ownership of units and calculate boat capacity
    if (units.length > 0) {
      const groups = tileData.groups || {};
      const ownedUnits = new Set();
      const unitDetails = new Map(); // Store unit details for capacity checking
      
      Object.values(groups).forEach(group => {
        if (group.owner === uid && group.units) {
          Object.values(group.units).forEach(unit => {
            if (unit.type !== 'player') {
              ownedUnits.add(unit.id);
              unitDetails.set(unit.id, unit);
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
      
      // Check boat capacity
      let boatCapacity = 0;
      let nonBoatUnitCount = 0;
      
      // Count boat capacity
      units.forEach(unitId => {
        const unit = unitDetails.get(unitId);
        if (unit && UNITS[unit.type]) {
          const unitDef = UNITS[unit.type];
          if (unitDef.motion?.includes('water') && unitDef.capacity) {
            boatCapacity += unitDef.capacity;
          } else {
            nonBoatUnitCount++;
          }
        }
      });
      
      // Add player to count if including them
      if (includePlayer && !isPlayerInBoat(units, unitDetails)) {
        nonBoatUnitCount++;
      }
      
      // Check for water units and capacity restrictions
      if (boatCapacity > 0 && nonBoatUnitCount > boatCapacity) {
        throw new HttpsError(
          'failed-precondition',
          `Boat capacity exceeded. Your boats can carry ${boatCapacity} units but you're trying to transport ${nonBoatUnitCount} units.`
        );
      }
    }

    // Calculate when mobilization will complete (next world tick)
    const now = Date.now();

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
        x: tileX,
        y: tileY,
        race: race || null,
        units: {}
      };
      
      if (!currentTile.groups) currentTile.groups = {};
      
      // Track motion capabilities for the group
      const motionCapabilities = new Set();
      
      if (units.length > 0) {
        Object.keys(currentTile.groups || {}).forEach(groupId => {
          const group = currentTile.groups[groupId];
          
          if (group.owner === uid && group.units) {
            const groupUnitKeys = Object.keys(group.units);
            
            groupUnitKeys.forEach(unitKey => {
              const unit = group.units[unitKey];
              
              if (units.includes(unit.id) && unit.type !== 'player') { 
                newGroup.units[unitKey] = unit;
                delete group.units[unitKey];
                
                // Check if this is a boat unit
                if (UNITS[unit.type]?.motion?.includes('water') && UNITS[unit.type]?.capacity) {
                  hasBoatUnits = true;
                  boatCapacity += UNITS[unit.type].capacity;
                } else {
                  nonBoatUnitCount++;
                }
                
                // Track motion capabilities from this unit's type
                if (unit.type) {
                  // Get unit definition to determine motion capabilities
                  const unitDef = getUnitDefinition(unit.type);
                  if (unitDef && unitDef.motion) {
                    unitDef.motion.forEach(motionType => motionCapabilities.add(motionType));
                  } else {
                    // Default to ground if not specified
                    motionCapabilities.add('ground');
                  }
                }
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
          const playerIndex = currentTile.players.findIndex(p => p.id === uid);
          if (playerIndex !== -1) {
            const player = currentTile.players[playerIndex];
            // Generate a consistent key for the player
            const playerKey = player.id;
            
            newGroup.units[playerKey] = {
              ...player,
              type: 'player'
            };
            
            // Players can traverse ground by default
            motionCapabilities.add('ground');
            
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
            
            if (player.id === uid) {
              newGroup.units[playerKey] = {
                ...player,
                type: 'player'
              };
              
              // Players can traverse ground by default
              motionCapabilities.add('ground');
              
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
      
      // If there are boat units, force water motion and validate capacity
      if (hasBoatUnits) {
        // Force water-only motion for boat groups
        newGroup.motion = ['water'];
        
        // Double check capacity (should already be verified above, but just in case)
        if (nonBoatUnitCount > boatCapacity) {
          console.warn(`Boat capacity exceeded: ${nonBoatUnitCount} units with only ${boatCapacity} capacity`);
          // We don't throw an error here because we already checked earlier,
          // but we could implement automatic unit removal if needed
        }
      } else {
        // Set motion capabilities for the group
        newGroup.motion = Array.from(motionCapabilities);
        
        // If there are no explicit motion capabilities, default to ground
        if (newGroup.motion.length === 0) {
          newGroup.motion = ['ground'];
        }
        
        // Special case: If units can ONLY traverse water (no ground/flying units),
        // make sure motion is restricted to water only
        const hasGroundOrFlying = newGroup.motion.includes('ground') || newGroup.motion.includes('flying');
        if (newGroup.motion.includes('water') && !hasGroundOrFlying) {
          // This is a water-only group
          newGroup.motion = ['water'];
        }
      }
      
      // Add boat capacity info to the group if applicable
      if (hasBoatUnits) {
        newGroup.boatCapacity = boatCapacity;
        newGroup.transportedUnits = nonBoatUnitCount;
      }
      
      currentTile.groups[newGroupId] = newGroup;

      if (!currentData.players) currentData.players = {};
      if (!currentData.players[uid]) currentData.players[uid] = {};
      if (!currentData.players[uid].worlds) currentData.players[uid].worlds = {};
      if (!currentData.players[uid].worlds[worldId]) currentData.players[uid].worlds[worldId] = {};
      if (!currentData.players[uid].worlds[worldId].groups) currentData.players[uid].worlds[worldId].groups = {};

      if (includePlayer) {
        currentData.players[uid].worlds[worldId].lastLocation = { x: tileX, y: tileY };
        currentData.players[uid].worlds[worldId].inGroup = newGroupId;
      }

      // Add chat message for mobilization
      if (!currentData.worlds[worldId].chat) {
        currentData.worlds[worldId].chat = {};
      }
      
      const chatMessageId = db.ref().push().key;
      currentData.worlds[worldId].chat[chatMessageId] = {
        type: 'system',
        text: `${name} is being mobilized at (${tileX},${tileY})`,
        timestamp: now,
        location: { x: tileX, y: tileY }
      };

      // Simplified achievement handling
      if (!currentData.players[uid].worlds[worldId].achievements) {
        currentData.players[uid].worlds[worldId].achievements = {};
      }
      
      // Check if player doesn't already have achievement and add it
      if (!currentData.players[uid].worlds[worldId].achievements.mobilised) {
        currentData.players[uid].worlds[worldId].achievements.mobilised = true;
      }

      return currentData;
    });

    console.log(`Mobilization successful for user ${uid}, group ${newGroupId}`);
    return { 
      success: true, 
      groupId: newGroupId
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

/**
 * Helper function to get unit definition with motion capabilities
 * @param {string} unitType - The type of unit
 * @returns {object|null} - Unit definition or null if not found
 */
function getUnitDefinition(unitType) {
  // This is a simplified version - in production, you would
  // import the Units class from your shared code
  const unitDefinitions = {
    'player': { motion: ['ground'] },
    'human_warrior': { motion: ['ground'] },
    'human_scout': { motion: ['ground'] },
    'elf_warrior': { motion: ['ground'] },
    'elf_scout': { motion: ['ground'] },
    'dwarf_warrior': { motion: ['ground'] },
    'dwarf_scout': { motion: ['ground'] },
    'goblin_warrior': { motion: ['ground'] },
    'goblin_scout': { motion: ['ground'] },
    'fairy_warrior': { motion: ['ground', 'flying'] },
    'fairy_scout': { motion: ['ground', 'flying'] },
    'merfolk_warrior': { motion: ['water'] },
    'shark_rider': { motion: ['water'] },
    'sea_elf': { motion: ['water', 'ground'] }
    // Add more unit definitions as needed
  };
  
  return unitDefinitions[unitType] || null;
}

/**
 * Helper function to check if a player is already in a boat unit
 */
function isPlayerInBoat(selectedUnitIds, unitDetails) {
  // This is a placeholder - you'd need to implement based on your data structure
  // This would check if the player is already considered part of a boat's capacity
  return false; 
}
