/**
 * Attack function for Gisaima
 * Handles initiating battles between groups and targeting structures simultaneously
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Attack function - supports attacking groups and structures simultaneously
export const attack = onCall({ maxInstances: 10 }, async (request) => {
  const { 
    attackerGroupIds, 
    locationX, 
    locationY, 
    defenderGroupIds, 
    structureId
  } = request.data;
  
  const userId = request.auth?.uid;
  
  if (!userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  
  // Validate common parameters
  if (!Array.isArray(attackerGroupIds) || 
      attackerGroupIds.length === 0 || 
      locationX === undefined || 
      locationY === undefined) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }
  
  // Validate that at least one target type is specified
  if (!defenderGroupIds && !structureId) {
    throw new HttpsError("invalid-argument", "No attack targets specified (missing defenderGroupIds and structureId)");
  }
  
  // Validate defender groups if provided
  if (defenderGroupIds && !Array.isArray(defenderGroupIds)) {
    throw new HttpsError("invalid-argument", "defenderGroupIds must be an array");
  }
  
  try {
    const db = getDatabase();
    const worldId = request.data.worldId || 'default';
    
    // Fix chunk calculation for negative coordinates
    const CHUNK_SIZE = 20;
    function getChunkKey(x, y) {
      // Simple integer division works for both positive and negative coordinates
      const chunkX = Math.floor(x / CHUNK_SIZE);
      const chunkY = Math.floor(y / CHUNK_SIZE);
      return `${chunkX},${chunkY}`;
    }
    
    const chunkKey = getChunkKey(locationX, locationY);
    const locationKey = `${locationX},${locationY}`;
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}`);
    
    // Get the current tile data
    const tileSnapshot = await tileRef.once("value");
    const tileData = tileSnapshot.val() || {};
    
    // Check for groups
    const groups = tileData.groups || {};
    if (Object.keys(groups).length === 0 && defenderGroupIds && defenderGroupIds.length > 0) {
      throw new HttpsError("not-found", "No groups found at this location");
    }
    
    // Check for structure if targeting a structure
    let structure = null;
    if (structureId) {
      if (!tileData.structure) {
        throw new HttpsError("not-found", "No structure found at this location");
      }
      
      // Verify the structure matches the provided ID
      if (tileData.structure.id !== structureId) {
        throw new HttpsError("not-found", "Structure ID mismatch");
      }
      
      // Check if structure is already in battle
      if (tileData.structure.inBattle) {
        throw new HttpsError("failed-precondition", "Structure is already under attack");
      }
      
      // Check if structure is owned by the attacker (can't attack your own structure)
      if (tileData.structure.owner === userId) {
        throw new HttpsError("permission-denied", "You cannot attack your own structure");
      }
      
      structure = tileData.structure;
    }
    
    // Validate attacker groups - all must exist and belong to the user
    const attackerGroups = [];
    let attackerTotalPower = 0;
    
    for (const groupId of attackerGroupIds) {
      const group = groups[groupId];
      if (!group) {
        throw new HttpsError("not-found", `Attacker group ${groupId} not found at this location`);
      }
      if (group.owner !== userId) {
        throw new HttpsError("permission-denied", "You can only attack with your own groups");
      }
      if (group.inBattle) {
        throw new HttpsError("failed-precondition", `Group ${group.name || group.id} is already in battle`);
      }
      
      // Add to our validated list and calculate power
      attackerGroups.push(group);
      attackerTotalPower += calculateGroupPower(group);
    }
    
    // Process defender groups if provided
    const defenderGroups = [];
    let defenderGroupPower = 0;
    let defenderRace = null;
    
    if (defenderGroupIds && defenderGroupIds.length > 0) {
      for (const groupId of defenderGroupIds) {
        const group = groups[groupId];
        if (!group) {
          throw new HttpsError("not-found", `Defender group ${groupId} not found at this location`);
        }
        if (group.inBattle) {
          throw new HttpsError("failed-precondition", `Target group ${group.name || group.id} is already in battle`);
        }
        
        // Add to our validated list and calculate power
        defenderGroups.push(group);
        defenderGroupPower += calculateGroupPower(group);
        
        // Record race of first defender for battle message
        if (!defenderRace && group.race) {
          defenderRace = group.race;
        }
      }
    }
    
    // Process structure defense power if structure is targeted
    let structurePower = 0;
    if (structure) {
      // Calculate structure defense power based on type
      switch (structure.type) {
        case 'spawn':
          structurePower = 15;
          break;
        case 'fortress':
          structurePower = 30;
          break;
        case 'watchtower':
          structurePower = 10;
          break;
        case 'stronghold':
          structurePower = 25;
          break;
        default:
          structurePower = 5;
      }
      
      // Use structure race if we don't have a defender race yet
      if (!defenderRace && structure.race) {
        defenderRace = structure.race;
      }
    }
    
    // Calculate total defender power
    const defenderTotalPower = defenderGroupPower + structurePower;

    // Create a battle ID
    const battleId = `battle_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const now = Date.now();
    
    // Determine what types of targets are in this battle
    const targetTypes = [];
    if (defenderGroups.length > 0) targetTypes.push("group");
    if (structure) targetTypes.push("structure");
    
    // Update all attacker groups to be in battle
    const groupUpdates = {};
    
    // Update attacker groups
    attackerGroupIds.forEach(groupId => {
      groupUpdates[groupId] = {
        inBattle: true,
        battleId,
        battleSide: 1,
        battleRole: 'attacker',
        status: 'fighting'
      };
    });
    
    // Update defender groups if any
    if (defenderGroupIds && defenderGroupIds.length > 0) {
      defenderGroupIds.forEach(groupId => {
        groupUpdates[groupId] = {
          inBattle: true,
          battleId,
          battleSide: 2,
          battleRole: 'defender',
          status: 'fighting'
        };
      });
    }
    
    // Create transaction for atomic updates
    const updates = {};
    
    // Add battle reference to the tile with target types
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}`] = {
      id: battleId,
      side1Power: attackerTotalPower,
      side2Power: defenderTotalPower,
      targetTypes: targetTypes,
      defenderGroupPower,
      structurePower,
      tickCount: 0,
      status: 'active',
      startedAt: now
    };
    
    // Update attacker and defender groups
    for (const [groupId, groupUpdate] of Object.entries(groupUpdates)) {
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/inBattle`] = groupUpdate.inBattle;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/battleId`] = groupUpdate.battleId;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/battleSide`] = groupUpdate.battleSide;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/battleRole`] = groupUpdate.battleRole;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/status`] = groupUpdate.status;
    }
    
    // Update structure battle status if targeted
    if (structure) {
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/inBattle`] = true;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/battleId`] = battleId;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/battleSide`] = 2; // Structure is always defender (side 2)
    }
    
    // Add system chat message about battle
    const attackerGroupName = attackerGroups[0]?.name || "Unknown force";
    
    // Create appropriate message based on what's being attacked
    let chatMessage;
    if (defenderGroups.length > 0 && structure) {
      // Both groups and structure
      chatMessage = `${attackerGroupName} is attacking ${defenderGroups.length} ${defenderRace || ''} groups and ${structure.name || "a structure"} at (${locationX},${locationY})`;
    } else if (defenderGroups.length > 0) {
      // Only groups
      chatMessage = `${attackerGroupName} is attacking ${defenderGroups.length} ${defenderRace || ''} groups at (${locationX},${locationY})`;
    } else {
      // Only structure
      chatMessage = `${attackerGroupName} is attacking ${structure.name || "a structure"} at (${locationX},${locationY})`;
    }
    
    const chatId = `battle_start_${battleId}`;
    updates[`worlds/${worldId}/chat/${chatId}`] = {
      text: chatMessage,
      type: "system",
      timestamp: now,
      location: { x: locationX, y: locationY },
      battleId
    };
    
    // Execute the multi-path update
    await db.ref().update(updates);
    
    return {
      success: true,
      message: chatMessage,
      battleId,
      targetTypes
    };
  } catch (error) {
    logger.error("Error starting battle:", error);
    throw new HttpsError("internal", error.message || "Failed to start battle");
  }
});

// Helper function to calculate group power
function calculateGroupPower(group) {
  // Base calculation using unit count
  let power = group.unitCount || 1;
  
  // If we have detailed units data, use it for better calculations
  if (group.units && typeof group.units === 'object') {
    // Check if it's an array or object
    if (Array.isArray(group.units)) {
      power = group.units.reduce((total, unit) => {
        // Calculate unit strength (default to 1 if not specified)
        const unitStrength = unit.strength || 1;
        return total + unitStrength;
      }, 0);
    } else {
      // Handle object format (keys are unit IDs)
      power = Object.values(group.units).reduce((total, unit) => {
        const unitStrength = unit.strength || 1;
        return total + unitStrength;
      }, 0);
    }
    
    // Ensure minimum power of 1
    power = Math.max(1, power);
  }
  
  return power;
}
