/**
 * Demobilization function for Gisaima
 * Handles disbanding mobile groups back to structures
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";
import { getChunkKey } from 'gisaima-shared/map/cartography.js';

// Demobilise units function
export const demobiliseUnits = onCall({ maxInstances: 10 }, async (request) => {
  // Make targetStructureId optional since we can use the structure at the location
  const { groupId, locationX, locationY, worldId = 'default', storageDestination = 'shared' } = request.data;
  const userId = request.auth?.uid;
  
  // Make sure storageDestination is either 'shared' or 'personal'
  const validatedStorageDestination = ['shared', 'personal'].includes(storageDestination) ? 
    storageDestination : 'shared';
  
  if (!userId) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  
  if (!groupId || locationX === undefined || locationY === undefined) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }
  
  try {
    const db = getDatabase();
    
    
    const chunkKey = getChunkKey(locationX, locationY);
    const tileKey = `${locationX},${locationY}`;
    
    console.log(`Demobilizing at coordinates ${locationX},${locationY} in chunk ${chunkKey}`);
    
    // Get the full path to this group
    const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`);
    
    // Get the group data
    const groupSnapshot = await groupRef.once('value');
    const groupData = groupSnapshot.val();
    
    if (!groupData) {
      console.log(`Group not found at path: worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`);
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
    
    // Check if there's a structure to demobilise into
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
    
    // Add a chat message for demobilization
    const chatMessageId = `demob_start_${now}_${groupId}`;
    const chatRef = db.ref(`worlds/${worldId}/chat/${chatMessageId}`);
    await chatRef.set({
      type: 'system',
      text: `${groupData.name} is demobilizing at (${locationX},${locationY})`,
      timestamp: now,
      location: { x: locationX, y: locationY }
    });
    
    // Enhanced update with more precise location data for player placement
    await groupRef.update({
      status: 'demobilising',  // This status alone is sufficient for the tick processor
      lastUpdated: now,
      targetStructureId: structureId, // Still include this for tick processor compatibility
      storageDestination: validatedStorageDestination, // Use validated storage destination
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
      hasPlayer: hasPlayerUnit,
      storageDestination: validatedStorageDestination
    };
  } catch (error) {
    console.error("Error in demobiliseUnits:", error);
    throw new HttpsError("internal", error.message);
  }
});
