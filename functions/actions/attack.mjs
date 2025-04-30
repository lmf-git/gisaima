/**
 * Attack function for Gisaima
 * Handles starting battles between groups and structures
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Attack function that supports targeting both groups and structures
export const attack = onCall({ maxInstances: 10 }, async (request) => {
  const { 
    worldId,
    attackerGroupIds, 
    defenderGroupIds,
    structureId,
    locationX, 
    locationY 
  } = request.data;
  
  const userId = request.auth?.uid;
  
  if (!userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  
  if (!attackerGroupIds || !Array.isArray(attackerGroupIds) || attackerGroupIds.length === 0) {
    throw new HttpsError("invalid-argument", "Must provide at least one attacker group");
  }
  
  if (locationX === undefined || locationY === undefined) {
    throw new HttpsError("invalid-argument", "Must provide location coordinates");
  }
  
  // Validate that we have at least one target (groups or structure)
  if ((!defenderGroupIds || !Array.isArray(defenderGroupIds) || defenderGroupIds.length === 0) && 
      !structureId) {
    throw new HttpsError("invalid-argument", "Must provide at least one target (groups or structure)");
  }
  
  try {
    const db = getDatabase();
    
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
    
    // Get the tile data which includes groups and structure
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}`);
    const tileSnapshot = await tileRef.once("value");
    const tileData = tileSnapshot.val() || {};
    
    if (!tileData) {
      throw new HttpsError("not-found", "Location not found");
    }
    
    // Get groups at the location
    const groupsAtLocation = tileData.groups || {};
    
    // Verify all attacker groups exist at the location and are owned by the user
    const attackerGroups = [];
    for (const groupId of attackerGroupIds) {
      const group = groupsAtLocation[groupId];
      if (!group) {
        throw new HttpsError("not-found", `Attacker group ${groupId} not found at this location`);
      }
      
      if (group.owner !== userId) {
        throw new HttpsError("permission-denied", `You do not own group ${groupId}`);
      }
      
      if (group.inBattle) {
        throw new HttpsError("failed-precondition", `Group ${groupId} is already in battle`);
      }
      
      if (group.status !== "idle") {
        throw new HttpsError("failed-precondition", `Group ${groupId} is not idle (status: ${group.status})`);
      }
      
      attackerGroups.push({
        ...group,
        id: groupId
      });
    }
    
    // Track what types of targets we're attacking
    const targetTypes = [];
    
    // Verify defender groups if provided
    const defenderGroups = [];
    if (defenderGroupIds && defenderGroupIds.length > 0) {
      targetTypes.push("group");
      
      for (const groupId of defenderGroupIds) {
        const group = groupsAtLocation[groupId];
        if (!group) {
          throw new HttpsError("not-found", `Defender group ${groupId} not found at this location`);
        }
        
        // Cannot attack your own groups
        if (group.owner === userId) {
          throw new HttpsError("permission-denied", "You cannot attack your own groups");
        }
        
        if (group.inBattle) {
          throw new HttpsError("failed-precondition", `Group ${groupId} is already in battle`);
        }
        
        if (group.status !== "idle") {
          throw new HttpsError("failed-precondition", `Group ${groupId} is not idle (status: ${group.status})`);
        }
        
        defenderGroups.push({
          ...group,
          id: groupId
        });
      }
    }
    
    // Verify structure if provided
    let structure = null;
    if (structureId) {
      targetTypes.push("structure");
      
      if (!tileData.structure || tileData.structure.id !== structureId) {
        throw new HttpsError("not-found", "Structure not found at this location");
      }
      
      structure = tileData.structure;
      
      // Cannot attack structures you own
      if (structure.owner === userId) {
        throw new HttpsError("permission-denied", "You cannot attack your own structure");
      }
      
      // Cannot attack spawn points
      if (structure.type === "spawn") {
        throw new HttpsError("permission-denied", "Cannot attack spawn points");
      }
      
      // Cannot attack structures already in battle
      if (structure.inBattle) {
        throw new HttpsError("failed-precondition", "Structure is already in battle");
      }
      
      structure = {
        ...structure,
        id: structureId
      };
    }
    
    // Create a battle ID
    const battleId = `battle_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const now = Date.now();
    
    // Calculate initial power for each side
    const attackerPower = calculateTotalPower(attackerGroups);
    
    let defenderGroupPower = 0;
    if (defenderGroups.length > 0) {
      defenderGroupPower = calculateTotalPower(defenderGroups);
    }
    
    let structurePower = 0;
    if (structure) {
      structurePower = calculateStructurePower(structure);
    }
    
    // Total defender power combines groups and structure
    const defenderTotalPower = defenderGroupPower + structurePower;
    
    // Prepare the battle data
    const battleData = {
      id: battleId,
      createdAt: now,
      status: "active",
      locationX,
      locationY,
      targetTypes,
      side1Power: attackerPower,
      side2Power: defenderTotalPower,
      defenderGroupPower,
      structurePower,
      side1: {
        power: attackerPower,
        groups: attackerGroupIds.reduce((acc, id) => {
          acc[id] = true;
          return acc;
        }, {})
      },
      side2: {
        power: defenderTotalPower,
        groups: defenderGroupIds ? defenderGroupIds.reduce((acc, id) => {
          acc[id] = true;
          return acc;
        }, {}) : {}
      },
      tickCount: 0
    };
    
    // Prepare updates object for atomicity
    const updates = {};
    
    // Add battle data
    updates[`battles/${worldId}/${battleId}`] = battleData;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}`] = battleData;
    
    // Update attacker groups
    for (const group of attackerGroups) {
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/inBattle`] = true;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleId`] = battleId;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleSide`] = 1;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleRole`] = 'attacker';
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/status`] = 'fighting';
    }
    
    // Update defender groups
    for (const group of defenderGroups) {
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/inBattle`] = true;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleId`] = battleId;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleSide`] = 2;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleRole`] = 'defender';
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/status`] = 'fighting';
    }
    
    // Update structure if attacking one
    if (structure) {
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/inBattle`] = true;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/battleId`] = battleId;
    }
    
    // Add chat message for battle start
    const attackerName = attackerGroups.length > 0 ? attackerGroups[0].name || "Unknown Force" : "Unknown Force";
    
    let targetDescription = "";
    if (defenderGroups.length > 0 && structure) {
      const defenderName = defenderGroups[0].name || "Unknown Force";
      targetDescription = `${defenderName} and ${structure.name || "a structure"}`;
    } else if (defenderGroups.length > 0) {
      targetDescription = defenderGroups[0].name || "Unknown Force";
    } else if (structure) {
      targetDescription = structure.name || "a structure";
    }
    
    updates[`worlds/${worldId}/chat/battle_start_${now}_${battleId}`] = {
      text: `Battle has begun at (${locationX}, ${locationY})! ${attackerName} is attacking ${targetDescription}!`,
      type: 'event',
      timestamp: now,
      location: {
        x: locationX,
        y: locationY
      }
    };
    
    // Add achievement for first attack if applicable
    if (attackerGroups.length > 0) {
      const attackerOwnerId = attackerGroups[0].owner;
      updates[`players/${attackerOwnerId}/worlds/${worldId}/achievements/first_attack`] = true;
      updates[`players/${attackerOwnerId}/worlds/${worldId}/achievements/first_attack_date`] = now;
    }
    
    // Execute all updates atomically
    await db.ref().update(updates);
    
    return {
      success: true,
      message: "Attack started successfully",
      battleId
    };
    
  } catch (error) {
    logger.error("Error starting attack:", error);
    throw new HttpsError("internal", "Failed to start attack: " + (error.message || "Unknown error"));
  }
});

// Helper function to calculate total power of groups
function calculateTotalPower(groups) {
  if (!groups || groups.length === 0) return 0;
  
  return groups.reduce((total, group) => {
    let groupPower = group.unitCount || 1;
    
    // If we have unit details, use those
    if (group.units) {
      if (Array.isArray(group.units)) {
        groupPower = group.units.length;
      } else if (typeof group.units === 'object') {
        groupPower = Object.keys(group.units).length;
      }
    }
    
    return total + groupPower;
  }, 0);
}

// Helper function to calculate structure power
function calculateStructurePower(structure) {
  if (!structure) return 0;
  
  // Base power by structure type
  let basePower = 5;
  
  switch (structure.type) {
    case 'spawn':
      basePower = 15;
      break;
    case 'fortress':
      basePower = 30;
      break;
    case 'watchtower':
      basePower = 10;
      break;
    case 'stronghold':
      basePower = 25;
      break;
    default:
      basePower = 5;
  }
  
  return basePower;
}
