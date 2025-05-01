/**
 * Join Battle function for Gisaima
 * Handles joining existing battles
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";
import { getChunkKey } from 'gisaima-shared/map/cartography.js';

// Join a battle function
export const joinBattle = onCall({ maxInstances: 10 }, async (request) => {
  const { groupId, battleId, side, locationX, locationY } = request.data;
  const userId = request.auth?.uid;
  
  if (!userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  
  if (!groupId || !battleId || !side || locationX === undefined || locationY === undefined) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }
  
  try {
    const db = getDatabase();
    const worldId = request.data.worldId || 'default';
    

    
    const chunkKey = getChunkKey(locationX, locationY);
    
    const locationKey = `${locationX},${locationY}`;
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}`);
    
    // Get tile data which includes battle information
    const tileSnapshot = await tileRef.once("value");
    const tileData = tileSnapshot.val() || {};
    
    if (!tileData.battles || !tileData.battles[battleId]) {
      throw new HttpsError("not-found", "Battle not found at this location");
    }
    
    const battleData = tileData.battles[battleId];
    
    // Check if the battle is in the same location
    if (battleData.locationX !== locationX || battleData.locationY !== locationY) {
      throw new HttpsError("failed-precondition", "Battle is not at this location");
    }
    
    // Find the group that wants to join
    const groups = tileData.groups || {};
    
    const joiningGroup = Object.values(groups).find(g => g.id === groupId);
    if (!joiningGroup) {
      throw new HttpsError("not-found", "Group not found at this location");
    }
    
    // Verify ownership
    if (joiningGroup.owner !== userId) {
      throw new HttpsError("permission-denied", "You can only join battles with your own groups");
    }
    
    // Check if the group is already in battle
    if (joiningGroup.inBattle) {
      throw new HttpsError("failed-precondition", "This group is already in battle");
    }
    
    // Validate side choice
    if (side !== 1 && side !== 2) {
      throw new HttpsError("invalid-argument", "Side must be 1 or 2");
    }
    
    // Extract participant info from the joining group
    let participants = [];
    if (joiningGroup.units) {
      if (Array.isArray(joiningGroup.units)) {
        participants = joiningGroup.units.filter(unit => unit.type === 'player').map(unit => ({
          id: unit.id,
          displayName: unit.displayName || 'Unknown',
          race: unit.race || 'unknown'
        }));
      } else {
        participants = Object.values(joiningGroup.units)
          .filter(unit => unit.type === 'player')
          .map(unit => ({
            id: unit.id,
            displayName: unit.displayName || 'Unknown',
            race: unit.race || 'unknown'
          }));
      }
    }
    
    // Always include the group owner
    if (joiningGroup.owner && !participants.some(p => p.id === joiningGroup.owner)) {
      participants.push({
        id: joiningGroup.owner,
        displayName: joiningGroup.ownerName || 'Unknown', 
        race: joiningGroup.race || 'unknown'
      });
    }
    
    // Calculate group power
    const groupPower = joiningGroup.unitCount || 1;
    
    const participantInfo = {
      groupId: groupId,
      groupName: joiningGroup.name || `Group ${groupId.slice(-4)}`,
      groupPower: groupPower,
      players: participants
    };
    
    // Get current time for updates
    const now = Date.now();
    
    const updates = {};
    
    // Add group to the battle side
    const battleSideKey = side === 1 ? 'side1' : 'side2';
    updates[`battles/${worldId}/${battleId}/${battleSideKey}/groups/${groupId}`] = true;
    updates[`battles/${worldId}/${battleId}/${battleSideKey}/power`] = 
      battleData[battleSideKey].power + groupPower;

    // Update battle side power
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/${battleSideKey}Power`] = 
      battleData[battleSideKey + 'Power'] + groupPower;
    
    // Update enhanced battle data in the battle object
    // Add the group to side participants
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/${battleSideKey}/participants`] = 
      [...(battleData[battleSideKey].participants || []), participantInfo];
    
    // Extract player IDs and add to overall participants
    const playerIds = participantInfo.players.map(p => p.id);
    const currentParticipants = battleData.participants || [];
    const newParticipants = [...new Set([...currentParticipants, ...playerIds])];
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/participants`] = newParticipants;
    
    // Recalculate advantage
    const side1Power = side === 1 ? battleData.side1Power + groupPower : battleData.side1Power;
    const side2Power = side === 2 ? battleData.side2Power + groupPower : battleData.side2Power;
    const powerDifference = side1Power - side2Power;
    const powerTotal = side1Power + side2Power;
    const advantageSide = powerDifference > 0 ? 1 : powerDifference < 0 ? 2 : 0;
    const advantageStrength = Math.abs(powerDifference) / Math.max(1, powerTotal);
    
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/advantage`] = {
      side: advantageSide,
      strength: advantageStrength
    };
    
    // Add battle event
    const sideName = battleData[battleSideKey]?.name || `Side ${side}`;
    const groupName = joiningGroup.name || `Group ${groupId.slice(-4)}`;
    
    const newEvent = {
      type: 'join',
      timestamp: now,
      text: `${groupName} has joined the battle on ${sideName}'s side!`,
      groupId: groupId
    };
    
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/events`] = 
      [...(battleData.events || []), newEvent];
    
    // Update group status
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/inBattle`] = true;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/battleId`] = battleId;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/battleSide`] = side;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/battleRole`] = 'supporter';
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}/status`] = 'fighting';

    // Add achievement for joining a battle
    updates[`players/${userId}/worlds/${worldId}/achievements/battle_joiner`] = true;
    updates[`players/${userId}/worlds/${worldId}/achievements/battle_joiner_date`] = now;

    // Add chat message for joining battle
    const battleSideName = battleData[battleSideKey]?.name || `Side ${side}`;
    const chatMessageId = `battle_join_${now}_${groupId}`;
    updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
      text: `${groupName} has joined the battle at (${locationX}, ${locationY}) on ${battleSideName}'s side!`,
      type: 'event',
      timestamp: now,
      location: {
        x: locationX,
        y: locationY
      }
    };

    // Execute the updates
    await db.ref().update(updates);
    
    return {
      success: true,
      message: `Joined battle on ${battleSideName}'s side`,
      battleId
    };
  } catch (error) {
    logger.error("Error joining battle:", error);
    throw new HttpsError("internal", "Failed to join battle");
  }
});
