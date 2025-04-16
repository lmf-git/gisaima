/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

/**
 * Firebase Cloud Functions for Gisaima game
 * Handles scheduled game ticks and mobilization operations
 */

// Initialize Firebase Admin SDK
initializeApp();

// Process world ticks to handle mobilizations and other time-based events
export const processGameTicks = onSchedule({
  schedule: "every 1 minutes",
  timeZone: "UTC",
  retryConfig: {
    maxRetryAttempts: 3,
    minBackoffSeconds: 30,
  },
}, async (event) => {
  console.log("Processing game ticks...");
  const db = getDatabase();
  const now = Date.now();
  
  try {
    // Get all world references
    const worldsSnapshot = await db.ref("worlds").once("value");
    const worlds = worldsSnapshot.val();
    
    if (!worlds) {
      console.log("No worlds found.");
      return;
    }
    
    // Process each world
    for (const [worldId, worldData] of Object.entries(worlds)) {
      if (!worldData.chunks) continue;
      
      // Get world speed setting
      const worldSpeed = worldData.info?.speed || 1.0;
      console.log(`Processing world: ${worldId} with speed: ${worldSpeed}`);
      
      // Process mobilizations and movements
      const updates = {};
      
      // Walk through all chunks and coordinates
      for (const [chunkKey, chunkData] of Object.entries(worldData.chunks)) {
        for (const [coordKey, tileData] of Object.entries(chunkData)) {
          if (coordKey === "lastUpdated") continue;
          
          // Skip if no groups on this tile
          if (!tileData.groups) continue;
          
          // Process all groups on this tile
          for (const [groupId, group] of Object.entries(tileData.groups)) {
            const dbPath = `worlds/${worldId}/chunks/${chunkKey}/${coordKey}/groups/${groupId}`;
            
            // Process mobilizing groups that are ready
            if (group.status === "mobilizing" && group.readyAt && group.readyAt <= now) {
              updates[`${dbPath}/status`] = "idle";
              updates[`${dbPath}/lastUpdated`] = now;
              console.log(`Group ${groupId} mobilization complete at ${coordKey}`);
            }
            
            // Process groups that are moving step by step
            if (group.status === "moving" && group.movementPath && group.nextMoveTime && group.nextMoveTime <= now) {
              // Get current position in the path
              const pathIndex = group.pathIndex || 0;
              
              // Get the movement path
              const path = group.movementPath;
              
              // Verify path exists and has more steps
              if (Array.isArray(path) && pathIndex < path.length - 1) {
                // Move to next position in path
                const nextIndex = pathIndex + 1;
                const nextPosition = path[nextIndex];
                
                console.log(`Moving group ${groupId} from ${coordKey} to step ${nextIndex}: ${nextPosition.x},${nextPosition.y}`);
                
                // Calculate time for next step based on world speed
                const moveIntervalMs = 60000 / worldSpeed; // Default 1 min per step, adjusted by world speed
                
                if (nextIndex >= path.length - 1) {
                  // This is the last step - we've reached the destination
                  // Create the group at the destination
                  const destChunkX = Math.floor(nextPosition.x / 20);
                  const destChunkY = Math.floor(nextPosition.y / 20);
                  const destChunkKey = `${destChunkX},${destChunkY}`;
                  const destCoordKey = `${nextPosition.x},${nextPosition.y}`;
                  
                  // Move the group to the new location
                  updates[`worlds/${worldId}/chunks/${destChunkKey}/${destCoordKey}/groups/${groupId}`] = {
                    ...group,
                    status: "idle",
                    x: nextPosition.x,
                    y: nextPosition.y,
                    lastUpdated: now,
                    // Remove movement-specific fields
                    movementPath: null,
                    pathIndex: null,
                    nextMoveTime: null,
                    targetX: null,
                    targetY: null,
                    moveStarted: null,
                    moveSpeed: null
                  };
                  
                  // Remove the group from the original location
                  updates[`${dbPath}`] = null;
                  
                  console.log(`Group ${groupId} movement complete to ${destCoordKey}`);
                } else {
                  // This is an intermediate step
                  // Update the pathIndex and nextMoveTime for the next step
                  updates[`${dbPath}/pathIndex`] = nextIndex;
                  updates[`${dbPath}/nextMoveTime`] = now + moveIntervalMs;
                  updates[`${dbPath}/lastUpdated`] = now;
                  
                  // Update current position to the new step
                  updates[`${dbPath}/x`] = nextPosition.x;
                  updates[`${dbPath}/y`] = nextPosition.y;
                  
                  console.log(`Group ${groupId} moved to step ${nextIndex}, next move at ${new Date(now + moveIntervalMs)}`);
                }
              }
            }
          }
        }
      }
      
      // Apply all updates for this world
      if (Object.keys(updates).length > 0) {
        console.log(`Applying ${Object.keys(updates).length} updates for world ${worldId}`);
        await db.ref().update(updates);
      }
    }
    
    console.log("Game tick processing complete");
    return null;
    
  } catch (error) {
    console.error("Error processing game ticks:", error);
    throw error;
  }
});

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
    
    // Calculate chunk coordinates
    const chunkSize = 20; // This should match your app's chunk size
    const chunkX = Math.floor(tileX / chunkSize);
    const chunkY = Math.floor(tileY / chunkSize);
    const chunkKey = `${chunkX},${chunkY}`;
    const tileKey = `${tileX},${tileY}`;
    
    // Get current time and calculate ready time based on world speed
    const now = Date.now();
    // Default mobilization time is 30 minutes if not specified
    const mobilizationMs = 30 * 60 * 1000; // 30 minutes in ms
    const adjustedTime = Math.round(mobilizationMs / worldSpeed); // Adjust by world speed
    const readyAt = now + adjustedTime;
    
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
      const groupRace = race || (playerData ? playerData.race : null);
      
      // Create new mobilizing group
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${newGroupId}`] = {
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
        readyAt: readyAt,
        lastProcessed: now,
        units: selectedUnits
      };
      
      // Apply all updates
      await db.ref().update(updates);
      return { 
        success: true, 
        readyAt,
        groupId: newGroupId
      };
    } else {
      return { success: false, error: 'No valid units to mobilize' };
    }
    
  } catch (error) {
    logger.error("Error starting mobilization:", error);
    throw new HttpsError('internal', 'Error starting mobilization', error);
  }
});
