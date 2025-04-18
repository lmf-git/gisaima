/**
 * Mobilization function for Gisaima
 * Handles creating new mobile groups
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Function to start a mobilization for a group
export const startMobilization = onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in to mobilize units');
  }
  
  const uid = context.auth.uid;
  const { worldId, tileX, tileY, units: unitIds, includePlayer, name, race } = data;
  
  if (!worldId || tileX === undefined || tileY === undefined) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  try {
    // Get database reference
    const db = getDatabase();
    
    // Get world speed to adjust mobilization time
    const worldInfoRef = db.ref(`worlds/${worldId}/info`);
    const worldInfoSnapshot = await worldInfoRef.once('value');
    const worldInfo = worldInfoSnapshot.val() || {};
    const worldSpeed = worldInfo.speed || 1.0;
    
    // Calculate chunk coordinates (inline chunk calculation, always using 20)
    const chunkX = Math.floor(tileX / 20);
    const chunkY = Math.floor(tileY / 20);
    const chunkKey = `${chunkX},${chunkY}`;
    const tileKey = `${tileX},${tileY}`;
    
    // Get current time
    const now = Date.now();
    
    // Create a new group ID with timestamp for uniqueness
    const newGroupId = `group_${uid}_${now}`;
    const selectedUnits = [];
    
    // Create a mapping of chunk/tile paths to their group data for later lookup
    const groupLookup = {};
    
    // Updates to apply
    const updates = {};
    
    // Process selected units
    if (unitIds && unitIds.length > 0) {
      // First find all units from existing groups
      for (const unitId of unitIds) {
        // We need to find which group/tile contains this unit
        // This requires querying the database to find where the unit is located
        const unitRef = db.ref(`worlds/${worldId}`).orderByChild('units/id').equalTo(unitId);
        const unitSnapshot = await unitRef.once('value');
        
        if (!unitSnapshot.exists()) {
          logger.warn(`Unit ${unitId} not found`);
          continue;
        }
        
        unitSnapshot.forEach((groupSnapshot) => {
          const groupPath = groupSnapshot.ref.path;
          const groupData = groupSnapshot.val();
          
          // Store group data for later lookup
          if (!groupLookup[groupPath]) {
            groupLookup[groupPath] = groupData;
          }
          
          // Find the specific unit in this group
          if (groupData.units) {
            const unit = groupData.units.find(u => u.id === unitId);
            if (unit) {
              selectedUnits.push(unit);
            }
          }
        });
      }
    }
    
    // Handle player mobilization if requested
    if (includePlayer) {
      // Verify player is at this location
      const playerLocRef = db.ref(`players/${uid}/worlds/${worldId}/lastLocation`);
      const playerLocSnapshot = await playerLocRef.once('value');
      
      if (playerLocSnapshot.exists()) {
        const playerLoc = playerLocSnapshot.val();
        
        if (playerLoc.x === tileX && playerLoc.y === tileY) {
          // Get player data for adding to units
          const playerDataRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/players/${uid}`);
          const playerDataSnapshot = await playerDataRef.once('value');
          
          if (playerDataSnapshot.exists()) {
            const playerData = playerDataSnapshot.val();
            // Add player as a unit
            selectedUnits.push({
              id: uid,
              type: 'player',
              race: playerData.race,
              name: playerData.displayName || context.auth.token.name || 'Player',
              strength: 10 // Default player strength
            });
          }
        }
      }
    }
    
    // Only proceed if we have units to mobilize
    if (selectedUnits.length > 0) {
      // Determine the race to use
      const playerData = selectedUnits.find(u => u.type === 'player');
      const groupRace = race || (playerData ? playerData.race : null);
      
      // Create new mobilizing group
      const mobilizeData = {
        id: newGroupId,
        name: name || "New Force",
        owner: uid,
        unitCount: selectedUnits.length,
        race: groupRace, // Save race directly on the group
        created: now,
        lastUpdated: now,
        x: tileX,
        y: tileY,
        status: 'mobilizing',
        pendingAction: true,  // Flag for the tick processor
        startedAt: now,
        units: selectedUnits
      };
      
      // Update the group structure with the mobilization status
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${newGroupId}`] = mobilizeData;
      
      // Apply all updates
      await db.ref().update(updates);
      return { 
        status: "mobilizing",
        message: "Units are being mobilized and will be ready on next world update"
      };
    } else {
      return { success: false, error: 'No valid units to mobilize' };
    }
    
  } catch (error) {
    logger.error("Error starting mobilization:", error);
    throw new HttpsError('internal', 'Error starting mobilization', error);
  }
});
