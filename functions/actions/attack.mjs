/**
 * Attack function for Gisaima
 * Handles starting battles between groups and structures
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";
import { getChunkKey } from 'gisaima-shared/map/cartography.js';

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
        
        // Allow attacking groups that are either idle or gathering
        if (group.status !== "idle" && group.status !== "gathering") {
          throw new HttpsError("failed-precondition", 
            `Group ${groupId} cannot be attacked (status: ${group.status}). Only idle or gathering groups can be attacked.`);
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

    // Extract participants info for both sides
    const side1Participants = attackerGroups.map(group => {
      // Extract all player units from the group
      let players = [];
      if (group.units) {
        if (Array.isArray(group.units)) {
          players = group.units.filter(unit => unit.type === 'player').map(unit => ({
            id: unit.id,
            displayName: unit.displayName || 'Unknown',
            race: unit.race || 'unknown'
          }));
        } else {
          players = Object.values(group.units)
            .filter(unit => unit.type === 'player')
            .map(unit => ({
              id: unit.id,
              displayName: unit.displayName || 'Unknown',
              race: unit.race || 'unknown'
            }));
        }
      }
      
      // Always include the group owner
      if (group.owner && !players.some(p => p.id === group.owner)) {
        players.push({
          id: group.owner,
          displayName: group.ownerName || 'Unknown', 
          race: group.race || 'unknown'
        });
      }
      
      return {
        groupId: group.id,
        groupName: group.name || `Group ${group.id.slice(-4)}`,
        groupPower: calculateGroupPower(group),
        players
      };
    });
    
    const side2Participants = defenderGroups.map(group => {
      // Extract all player units from the group
      let players = [];
      if (group.units) {
        if (Array.isArray(group.units)) {
          players = group.units.filter(unit => unit.type === 'player').map(unit => ({
            id: unit.id,
            displayName: unit.displayName || 'Unknown',
            race: unit.race || 'unknown'
          }));
        } else {
          players = Object.values(group.units)
            .filter(unit => unit.type === 'player')
            .map(unit => ({
              id: unit.id,
              displayName: unit.displayName || 'Unknown',
              race: unit.race || 'unknown'
            }));
        }
      }
      
      // Always include the group owner
      if (group.owner && !players.some(p => p.id === group.owner)) {
        players.push({
          id: group.owner,
          displayName: group.ownerName || 'Unknown', 
          race: group.race || 'unknown'
        });
      }
      
      return {
        groupId: group.id,
        groupName: group.name || `Group ${group.id.slice(-4)}`,
        groupPower: calculateGroupPower(group),
        players
      };
    });
    
    // Generate meaningful side names
    const side1Name = getSideName(attackerGroups, null, 1);
    const side2Name = getSideName(defenderGroups, structure, 2);
    
    // Extract all player IDs for easy reference
    const allParticipantIds = [
      ...new Set([
        ...side1Participants.flatMap(p => p.players.map(player => player.id)),
        ...side2Participants.flatMap(p => p.players.map(player => player.id))
      ])
    ];

    // Set initial advantage based on power difference
    const powerDifference = attackerPower - defenderTotalPower;
    const powerTotal = attackerPower + defenderTotalPower;
    const advantageSide = powerDifference > 0 ? 1 : powerDifference < 0 ? 2 : 0;
    const advantageStrength = Math.abs(powerDifference) / Math.max(1, powerTotal);
    
    // Prepare the battle data with enhanced information
    const battleData = {
      id: battleId,
      createdAt: now,
      startTime: now,
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
        }, {}),
        name: side1Name,
        casualties: 0,
        participants: side1Participants
      },
      side2: {
        power: defenderTotalPower,
        groups: defenderGroupIds ? defenderGroupIds.reduce((acc, id) => {
          acc[id] = true;
          return acc;
        }, {}) : {},
        name: side2Name,
        casualties: 0,
        participants: side2Participants
      },
      advantage: {
        side: advantageSide,
        strength: advantageStrength
      },
      participants: allParticipantIds,
      lastUpdate: now,
      events: [{
        type: 'battle_start',
        timestamp: now,
        text: `Battle has begun! ${side1Name} is attacking ${side2Name}.`
      }],
      tickCount: 0,
      estimatedDuration: estimateBattleDuration(attackerPower, defenderTotalPower)
    };
    
    // Prepare updates object for atomicity
    const updates = {};
    
    // Add battle data
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
    
    // Update chat message to use the new side names
    updates[`worlds/${worldId}/chat/battle_start_${now}_${battleId}`] = {
      text: `Battle has begun at (${locationX}, ${locationY})! ${side1Name} is attacking ${side2Name}!`,
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

// Helper function to calculate individual group power
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

// Helper function to generate side names based on composition
function getSideName(groups, structure, sideNumber) {
  if (groups.length === 0 && !structure) {
    return `Side ${sideNumber}`;
  }
  
  // If there's only one group, use its name
  if (groups.length === 1) {
    const group = groups[0];
    return group.name || `Group ${group.id.slice(-4)}`;
  }
  
  // If there are multiple groups, find the dominant race
  if (groups.length > 1) {
    const races = {};
    groups.forEach(group => {
      const race = group.race || 'unknown';
      races[race] = (races[race] || 0) + 1;
    });
    
    // Find the dominant race
    let dominantRace = 'unknown';
    let maxCount = 0;
    for (const [race, count] of Object.entries(races)) {
      if (count > maxCount) {
        dominantRace = race;
        maxCount = count;
      }
    }
    
    // Return a name based on dominant race
    return `${formatRaceName(dominantRace)} Coalition`;
  }
  
  // For structure defense without groups
  if (structure) {
    return `${structure.name || 'Structure'} Defenders`;
  }
  
  return `Side ${sideNumber}`;
}

// Helper function to format race names
function formatRaceName(race) {
  if (!race || race === 'unknown') return 'Unknown';
  
  // Capitalize first letter of each word
  return race.split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Helper function to estimate battle duration based on powers
function estimateBattleDuration(side1Power, side2Power) {
  // Base duration in milliseconds - 5 minutes
  const baseDuration = 5 * 60 * 1000;
  
  // Calculate power ratio (always between 0 and 1)
  const powerRatio = Math.min(side1Power, side2Power) / Math.max(side1Power, side2Power, 1);
  
  // More equal powers mean longer battles
  // powerRatio = 1 (equal) → 2x duration
  // powerRatio = 0 (completely unequal) → 0.5x duration
  const durationMultiplier = 0.5 + (powerRatio * 1.5);
  
  // Scale duration by absolute power (more powerful forces = longer battles)
  const powerScale = Math.log10(Math.max(2, side1Power + side2Power)) / Math.log10(10);
  const scaledDuration = baseDuration * durationMultiplier * powerScale;
  
  return Math.round(scaledDuration);
}
