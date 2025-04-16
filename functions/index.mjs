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
  try {
    logger.info("Processing game ticks...");
    
    // Get database reference
    const db = getDatabase();
    
    // Get all worlds to determine their speeds
    const worldsSnapshot = await db.ref('worlds').once('value');
    const worlds = worldsSnapshot.val();
    
    if (!worlds) {
      logger.info("No worlds found");
      return;
    }
    
    // Current server timestamp
    const now = Date.now();
    
    // Process each world based on its speed
    for (const [worldId, worldData] of Object.entries(worlds)) {
      const worldInfo = worldData.info || {};
      const worldSpeed = worldInfo.speed || 1.0;
      
      logger.info(`Processing world: ${worldId} with speed: ${worldSpeed}`);
      
      // Skip if no chunks data
      if (!worldData.chunks) {
        continue;
      }
      
      // Track updates to make
      const updates = {};
      
      // Process each chunk
      for (const [chunkKey, chunkData] of Object.entries(worldData.chunks)) {
        for (const [tileKey, tileData] of Object.entries(chunkData)) {
          // Skip lastUpdated metadata field
          if (tileKey === 'lastUpdated') continue;
          
          // Process groups in this tile
          if (tileData.groups) {
            for (const [groupId, groupData] of Object.entries(tileData.groups)) {
              // Process mobilizing groups
              if (groupData.status === 'mobilizing' && groupData.readyAt) {
                const readyAt = groupData.readyAt;
                
                // Check if mobilization is complete based on world speed
                if (now >= readyAt) {
                  logger.info(`Mobilization complete for group ${groupId} in world ${worldId}`);
                  
                  // Update group status to idle
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`] = 'idle';
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/readyAt`] = null;
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/lastProcessed`] = now;
                }
              }
              
              // Process moving groups
              if (groupData.status === 'moving' && 
                  groupData.targetX !== undefined && 
                  groupData.targetY !== undefined &&
                  groupData.moveStarted) {
                
                // Calculate chunk coordinates for target
                const targetX = groupData.targetX;
                const targetY = groupData.targetY;
                const chunkSize = 20; // Same chunk size as in the app
                const targetChunkX = Math.floor(targetX / chunkSize);
                const targetChunkY = Math.floor(targetY / chunkSize);
                const targetChunkKey = `${targetChunkX},${targetChunkY}`;
                const targetTileKey = `${targetX},${targetY}`;
                
                // Calculate elapsed time and check if move should complete based on world speed
                const moveStarted = groupData.moveStarted;
                const moveSpeed = groupData.moveSpeed || 1.0;
                const adjustedSpeed = moveSpeed * worldSpeed;
                const moveTime = (1000 * 60) / adjustedSpeed; // Base 1 minute per tile, adjusted by speed
                
                if (now >= (moveStarted + moveTime)) {
                  logger.info(`Movement complete for group ${groupId} from ${tileKey} to ${targetX},${targetY} in world ${worldId}`);
                  
                  // If target is in the same chunk, just update the group's position
                  if (chunkKey === targetChunkKey) {
                    // Move group within the same chunk
                    // 1. Delete from old tile
                    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`] = null;
                    
                    // 2. Copy to new tile with updated coordinates and status
                    updates[`worlds/${worldId}/chunks/${chunkKey}/${targetTileKey}/groups/${groupId}`] = {
                      ...groupData,
                      status: 'idle',
                      x: targetX,
                      y: targetY,
                      lastUpdated: now,
                      lastProcessed: now,
                      // Remove movement properties
                      targetX: null,
                      targetY: null,
                      moveStarted: null,
                      moveSpeed: null
                    };
                  } else {
                    // Move group to different chunk
                    // 1. Delete from old chunk/tile
                    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`] = null;
                    
                    // 2. Create in new chunk/tile with updated data
                    updates[`worlds/${worldId}/chunks/${targetChunkKey}/${targetTileKey}/groups/${groupId}`] = {
                      ...groupData,
                      status: 'idle',
                      x: targetX,
                      y: targetY,
                      lastUpdated: now,
                      lastProcessed: now,
                      // Remove movement properties
                      targetX: null,
                      targetY: null,
                      moveStarted: null,
                      moveSpeed: null
                    };
                  }
                }
              }
              
              // Process other time-based statuses like gathering, etc.
              // (Add future game logic here as needed)
            }
          }
        }
      }
      
      // Apply all updates for this world
      if (Object.keys(updates).length > 0) {
        logger.info(`Applying ${Object.keys(updates).length} updates for world ${worldId}`);
        await db.ref().update(updates);
      }
    }
    
    logger.info("Game tick processing completed successfully");
    return null;
  } catch (error) {
    logger.error("Error processing game ticks:", error);
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
  const { worldId, tileX, tileY, units: unitIds, includePlayer, name } = data;
  
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
      // Create new mobilizing group
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${newGroupId}`] = {
        id: newGroupId,
        name: name || "New Force",
        owner: uid,
        unitCount: selectedUnits.length,
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
