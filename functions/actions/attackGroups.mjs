/**
 * Attack function for Gisaima
 * Handles initiating battles between groups
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Attack another group function - updated for multi-group battles
export const attackGroups = onCall({ maxInstances: 10 }, async (request) => {
  const { attackerGroupIds, defenderGroupIds, locationX, locationY } = request.data;
  const userId = request.auth?.uid;
  
  if (!userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  
  // Validate that we have arrays of attacker and defender IDs
  if (!Array.isArray(attackerGroupIds) || !Array.isArray(defenderGroupIds) || 
      attackerGroupIds.length === 0 || defenderGroupIds.length === 0 || 
      locationX === undefined || locationY === undefined) {
    throw new HttpsError("invalid-argument", "Missing required parameters or invalid group selections");
  }
  
  try {
    const db = getDatabase();
    const worldId = request.data.worldId || 'default';
    
    // Calculate chunk key (inline, always using 20 for chunk size)
    const chunkX = Math.floor(locationX / 20);
    const chunkY = Math.floor(locationY / 20);
    const chunkKey = `${chunkX},${chunkY}`;
    
    const locationKey = `${locationX},${locationY}`;
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}`);
    
    // Get the current tile data
    const tileSnapshot = await tileRef.once("value");
    const tileData = tileSnapshot.val() || {};
    
    // Check for groups
    const groups = tileData.groups || {};
    if (Object.keys(groups).length === 0) {
      throw new HttpsError("not-found", "No groups found at this location");
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
    
    // Validate defender groups - all must exist and not already be in battle
    const defenderGroups = [];
    let defenderTotalPower = 0;
    
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
      defenderTotalPower += calculateGroupPower(group);
    }
    
    // Create a battle ID
    const battleId = `battle_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Set up initial battle data
    const worldInfoRef = db.ref(`worlds/${worldId}/info`);
    const worldInfoSnapshot = await worldInfoRef.once("value");
    const worldInfo = worldInfoSnapshot.val() || {};
    const worldSpeed = worldInfo.speed || 1.0;
    
    const baseBattleTime = 3 * 60000; // 3 minutes
    const battleDuration = Math.round(baseBattleTime / worldSpeed);
    
    const now = Date.now();
    const battleEndTime = now + battleDuration;
    
    // Prepare side groups
    const side1Groups = {};
    attackerGroupIds.forEach(id => side1Groups[id] = true);
    
    const side2Groups = {};
    defenderGroupIds.forEach(id => side2Groups[id] = true);
    
    // Choose leaders (first group of each side)
    const side1Leader = attackerGroupIds[0];
    const side2Leader = defenderGroupIds[0];
    
    // Battle data
    const battleData = {
      id: battleId,
      locationX,
      locationY,
      started: now,
      endTime: battleEndTime,
      side1: {
        groups: side1Groups,
        power: attackerTotalPower,
        leader: side1Leader
      },
      side2: {
        groups: side2Groups,
        power: defenderTotalPower,
        leader: side2Leader
      },
      status: 'active'
    };
    
    // Update all groups to be in battle
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
    
    // Update defender groups
    defenderGroupIds.forEach(groupId => {
      groupUpdates[groupId] = {
        inBattle: true,
        battleId,
        battleSide: 2,
        battleRole: 'defender',
        status: 'fighting'
      };
    });
    
    // Create transaction for atomic updates
    const updates = {};
    
    // Create battle entry
    updates[`battles/${worldId}/${battleId}`] = battleData;
    
    // Update groups
    for (const [groupId, groupUpdate] of Object.entries(groupUpdates)) {
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/inBattle`] = groupUpdate.inBattle;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/battleId`] = groupUpdate.battleId;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/battleSide`] = groupUpdate.battleSide;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/battleRole`] = groupUpdate.battleRole;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/status`] = groupUpdate.status;
    }
    
    // Execute the multi-path update
    await db.ref().update(updates);
    
    return {
      success: true,
      message: `Battle started between ${attackerGroups.length} attackers and ${defenderGroups.length} defenders`,
      battleId,
      endTime: battleEndTime
    };
  } catch (error) {
    logger.error("Error starting battle:", error);
    throw new HttpsError("internal", "Failed to start battle");
  }
});

// Helper function to calculate group power
function calculateGroupPower(group) {
  // Base calculation using unit count
  let power = group.unitCount || 1;
  
  // If we have detailed units data, use it for better calculations
  if (group.units && Array.isArray(group.units)) {
    power = group.units.reduce((total, unit) => {
      // Calculate unit strength (default to 1 if not specified)
      const unitStrength = unit.strength || 1;
      return total + unitStrength;
    }, 0);
    
    // Ensure minimum power of 1
    power = Math.max(1, power);
  }
  
  return power;
}
