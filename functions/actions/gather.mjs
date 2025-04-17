/**
 * Gathering function for Gisaima
 * Allows groups to gather resources from their surroundings
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Start gathering resources
export const startGathering = onCall({ maxInstances: 10 }, async (request) => {
  const { groupId, locationX, locationY, worldId = 'default' } = request.data;
  const userId = request.auth?.uid;
  
  if (!userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  
  if (!groupId || locationX === undefined || locationY === undefined) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }
  
  try {
    const db = getDatabase();
    
    // Calculate chunk coordinates
    const chunkX = Math.floor(locationX / 20);
    const chunkY = Math.floor(locationY / 20);
    const chunkKey = `${chunkX},${chunkY}`;
    const locationKey = `${locationX},${locationY}`;
    const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}`);
    
    // Get group data
    const groupSnapshot = await groupRef.once("value");
    const groupData = groupSnapshot.val();
    
    if (!groupData) {
      throw new HttpsError("not-found", "Group not found at this location");
    }
    
    // Verify ownership
    if (groupData.owner !== userId) {
      throw new HttpsError("permission-denied", "You can only gather with your own groups");
    }
    
    // Verify group is not already busy
    if (groupData.status !== 'idle') {
      throw new HttpsError("failed-precondition", `Group cannot gather while ${groupData.status}`);
    }
    
    // Calculate gathering time based on group size and world speed
    const worldInfoRef = db.ref(`worlds/${worldId}/info`);
    const worldInfoSnapshot = await worldInfoRef.once("value");
    const worldInfo = worldInfoSnapshot.val() || {};
    
    const worldSpeed = worldInfo.speed || 1.0;
    const unitCount = groupData.unitCount || (groupData.units ? groupData.units.length : 1);
    const baseGatherTimeMs = 180000; // 3 minutes
    const adjustedGatherTime = Math.round(baseGatherTimeMs / worldSpeed) / Math.sqrt(unitCount);
    const gatheringUntil = Date.now() + adjustedGatherTime;
    
    // Update the group's status
    await groupRef.update({
      status: 'starting_to_gather',
      gatheringUntil: gatheringUntil,
      lastUpdated: Date.now()
    });
    
    return {
      success: true,
      message: "Group has started gathering resources",
      gatheringUntil: gatheringUntil,
      estimatedTimeMinutes: Math.round(adjustedGatherTime / 60000 * 10) / 10 // Round to 1 decimal place
    };
  } catch (error) {
    logger.error("Error starting gathering:", error);
    throw new HttpsError("internal", "Failed to start gathering");
  }
});
