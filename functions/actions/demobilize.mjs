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
    
    // Use status flag for tick processing instead of time calculation
    const now = Date.now();
    
    // Update the group to demobilising status with pending action flag
    await groupRef.update({
      status: 'demobilising',
      pendingAction: true,  // Flag for the tick processor to handle this on next tick
      startedAt: now,
      lastUpdated: now,
      targetStructureId: targetStructureId,
      storageDestination: storageDestination
    });
    
    return {
      status: "demobilising",
      message: "Group is demobilising and will complete on next world update"
    };
  } catch (error) {
    console.error("Error in demobiliseUnits:", error);
    throw new HttpsError("internal", error.message);
  }
});
