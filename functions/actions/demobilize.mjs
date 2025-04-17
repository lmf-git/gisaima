/**
 * Demobilization function for Gisaima
 * Handles disbanding mobile groups back to structures
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Demobilise units function
export const demobiliseUnits = onCall({ maxInstances: 10 }, async (request) => {
  const { groupId, targetStructureId, locationX, locationY, worldId = 'default' } = request.data;
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
    const locationKey = `${locationX},${locationY}`;
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}`);
    
    // Get the current tile data
    const tileSnapshot = await tileRef.once("value");
    const tileData = tileSnapshot.val() || {};
    
    // Find the group to demobilise
    const groups = tileData.groups || {};
    const groupToProcess = Object.values(groups).find(g => g.id === groupId);
    
    if (!groupToProcess) {
      throw new HttpsError("not-found", "Group not found at this location");
    }
    
    // Verify ownership
    if (groupToProcess.owner !== userId) {
      throw new HttpsError("permission-denied", "You can only demobilise your own groups");
    }
    
    // Check if there's a valid structure for demobilisation
    const structure = tileData.structure;
    if (!structure) {
      throw new HttpsError("failed-precondition", "No structure available for demobilisation");
    }
    
    if (targetStructureId && structure.id !== targetStructureId) {
      throw new HttpsError("failed-precondition", "Target structure not found at this location");
    }
    
    // Calculate time for demobilisation to complete
    const worldInfoRef = db.ref(`worlds/${worldId}/info`);
    const worldInfoSnapshot = await worldInfoRef.once("value");
    const worldInfo = worldInfoSnapshot.val() || {};
    
    const worldSpeed = worldInfo.speed || 1.0;
    const baseTickTime = 60000; // 1 minute
    const tickTime = Math.round(baseTickTime / worldSpeed);
    
    const now = Date.now();
    const readyAt = now + tickTime;
    
    // Update the group's status
    await db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${groupId}`).update({
      status: 'demobilising',
      readyAt: readyAt,
      targetStructureId: targetStructureId || structure.id
    });
    
    return {
      success: true,
      message: "Group is demobilising",
      readyAt: readyAt
    };
  } catch (error) {
    console.error("Error demobilising units:", error);
    throw new HttpsError("internal", "Failed to demobilise units");
  }
});
