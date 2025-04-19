/**
 * Demobilization function for Gisaima
 * Handles disbanding mobile groups back to structures
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Demobilise units function
export const demobiliseUnits = onCall({ maxInstances: 10 }, async (request) => {
  // Make targetStructureId optional since we can use the structure at the location
  const { groupId, locationX, locationY, worldId = 'default', storageDestination = 'shared' } = request.data;
  const userId = request.auth?.uid;
  
  if (!userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  
  if (!groupId || locationX === undefined || locationY === undefined) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }
  
  try {
    const db = getDatabase();
    
    // Fix chunk calculation for negative coordinates
    const CHUNK_SIZE = 20;
    function getChunkKey(x, y) {
      // Handle negative coordinates correctly by adjusting division for negative values
      const chunkX = Math.floor((x >= 0 ? x : x - CHUNK_SIZE + 1) / CHUNK_SIZE);
      const chunkY = Math.floor((y >= 0 ? y : y - CHUNK_SIZE + 1) / CHUNK_SIZE);
      return `${chunkX},${chunkY}`;
    }
    
    const chunkKey = getChunkKey(locationX, locationY);
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
    
    // Get the structure data and extract the ID
    const structureData = structureSnapshot.val();
    const structureId = structureData.id;
    
    if (!structureId) {
      throw new HttpsError("failed-precondition", "Structure has no ID");
    }
    
    // Parse chunk coordinates from the chunk key
    const [chunkXStr, chunkYStr] = chunkKey.split(',');
    const chunkX = parseInt(chunkXStr);
    const chunkY = parseInt(chunkYStr);
    
    // Check if the group has a player unit
    let hasPlayerUnit = false;
    if (groupData.units) {
      // Handle both array and object formats
      const units = Array.isArray(groupData.units) ? groupData.units : Object.values(groupData.units);
      hasPlayerUnit = units.some(unit => unit.type === 'player');
    }
    
    // Use status flag for tick processing instead of time calculation
    const now = Date.now();
    
    // Enhanced update with more precise location data for player placement
    await groupRef.update({
      status: 'demobilising',  // This status alone is sufficient for the tick processor
      startedAt: now,
      lastUpdated: now,
      targetStructureId: structureId, // Still include this for tick processor compatibility
      storageDestination: storageDestination,
      // Add precise location data for player placement
      demobilizationData: {
        hasPlayer: hasPlayerUnit,
        exactLocation: {
          x: locationX,
          y: locationY,
          chunkX: chunkX,
          chunkY: chunkY,
          tileKey: tileKey,
          chunkKey: chunkKey
        }
      }
    });
    
    // If this group has a player, also update player's world data to indicate pending relocation
    if (hasPlayerUnit) {
      const playerWorldRef = db.ref(`players/${userId}/worlds/${worldId}`);
      await playerWorldRef.update({
        // Simplified pendingRelocation - just basic coordinates needed
        lastLocation: {
          x: locationX,
          y: locationY
        },
        // Flag to indicate demobilization in progress
        pendingRelocation: {
          timestamp: now
        }
      });
      
      logger.info(`Player ${userId} will be relocated to ${locationX},${locationY} after demobilization`);
    }
    
    return {
      status: "demobilising",
      message: "Group is demobilising and will complete on next world update",
      hasPlayer: hasPlayerUnit
    };
  } catch (error) {
    console.error("Error in demobiliseUnits:", error);
    throw new HttpsError("internal", error.message);
  }
});
