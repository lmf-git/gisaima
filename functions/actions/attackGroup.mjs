/**
 * Attack function for Gisaima
 * Handles initiating battles between groups
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Attack another group function
export const attackGroup = onCall({ maxInstances: 10 }, async (request) => {
  const { attackerGroupId, defenderGroupId, locationX, locationY } = request.data;
  const userId = request.auth?.uid;
  
  if (!userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  
  if (!attackerGroupId || !defenderGroupId || locationX === undefined || locationY === undefined) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
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
    
    // Find the attacker group
    const attackerGroup = Object.values(groups).find(g => g.id === attackerGroupId);
    if (!attackerGroup) {
      throw new HttpsError("not-found", "Attacker group not found at this location");
    }
    
    // Verify ownership of attacker group
    if (attackerGroup.owner !== userId) {
      throw new HttpsError("permission-denied", "You can only attack with your own groups");
    }
    
    // Find the defender group
    const defenderGroup = Object.values(groups).find(g => g.id === defenderGroupId);
    if (!defenderGroup) {
      throw new HttpsError("not-found", "Defender group not found at this location");
    }
    
    // Check if either group is already in battle
    if (attackerGroup.inBattle) {
      throw new HttpsError("failed-precondition", "Your group is already in battle");
    }
    if (defenderGroup.inBattle) {
      throw new HttpsError("failed-precondition", "Target group is already in battle");
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
    
    // Battle data
    const battleData = {
      id: battleId,
      locationX,
      locationY,
      started: now,
      endTime: battleEndTime,
      side1: {
        groups: { [attackerGroupId]: true },
        power: attackerGroup.unitCount || 1,
        leader: attackerGroupId
      },
      side2: {
        groups: { [defenderGroupId]: true },
        power: defenderGroup.unitCount || 1,
        leader: defenderGroupId
      },
      status: 'active'
    };
    
    // Update both groups to be in battle
    const groupUpdates = {};
    groupUpdates[attackerGroupId] = {
      inBattle: true,
      battleId,
      battleSide: 1,
      battleRole: 'attacker',
      status: 'fighting'
    };
    
    groupUpdates[defenderGroupId] = {
      inBattle: true,
      battleId,
      battleSide: 2,
      battleRole: 'defender',
      status: 'fighting'
    };
    
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
      message: "Battle started",
      battleId,
      endTime: battleEndTime
    };
  } catch (error) {
    logger.error("Error starting battle:", error);
    throw new HttpsError("internal", "Failed to start battle");
  }
});
