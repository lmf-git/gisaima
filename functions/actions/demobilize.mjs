/**
 * Demobilization function for Gisaima
 * Handles disbanding mobile groups back to structures
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Demobilise units function
export const demobiliseUnits = onCall({ maxInstances: 10 }, async (request) => {
  const { groupId, targetStructureId, locationX, locationY, worldId = 'default', storageDestination = 'shared' } = request.data;
  const userId = request.auth?.uid;
  
  if (!userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  
  if (!groupId || locationX === undefined || locationY === undefined) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }
  
  try {
    const db = getDatabase();
    
    // Calculate chunk coordinates (inline, always using 20)
    const chunkX = Math.floor(locationX / 20);
    const chunkY = Math.floor(locationY / 20);
    
    const chunkKey = `${chunkX},${chunkY}`;
    const tileKey = `${locationX},${locationY}`;
    
    // Get the full path to this group
    const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`);
    
    // Get the group data
    const groupSnapshot = await groupRef.once('value');
    const groupData = groupSnapshot.val();
    
    if (!groupData) {
      throw new HttpsError("not-found", "Group not found");
    }
    
    // Check ownership
    if (groupData.owner !== userId) {
      throw new HttpsError("permission-denied", "You do not own this group");
    }
    
    // Check status
    if (groupData.status === 'demobilising') {
      throw new HttpsError("failed-precondition", "Group is already demobilising");
    }
    
    // Check if there's a structure to demobilize into
    const structureRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`);
    const structureSnapshot = await structureRef.once('value');
    
    if (!structureSnapshot.exists()) {
      throw new HttpsError("failed-precondition", "No structure found at this location");
    }
    
    // Group timestamp based updates
    const now = Date.now();
    
    // Calculate demobilization time based on world speed
    const worldInfoRef = db.ref(`worlds/${worldId}/info`);
    const worldInfoSnapshot = await worldInfoRef.once('value');
    const worldInfo = worldInfoSnapshot.val() || {};
    const worldSpeed = worldInfo.speed || 1.0;
    
    // Base demobilization time is 5 minutes, adjusted for world speed
    const demobilizeTimeMs = Math.round(300000 / worldSpeed); 
    const readyAt = now + demobilizeTimeMs;
    
    // Update the group to demobilising status
    await groupRef.update({
      status: 'demobilising',
      readyAt: readyAt,
      lastUpdated: now,
      targetStructureId: targetStructureId,
      storageDestination: storageDestination // Add the storage choice
    });
    
    // Transfer items immediately if using tick function, otherwise wait for tick
    // Using tick function, so we don't need to transfer items here.
    
    return {
      status: "demobilising",
      readyAt: readyAt,
      message: "Group is demobilising"
    };
  } catch (error) {
    console.error("Error in demobiliseUnits:", error);
    throw new HttpsError("internal", error.message);
  }
});
