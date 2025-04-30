/**
 * Handles scheduled game tick processing for Gisaima
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Import specialized tick handlers
import { processBattles } from "./events/battleTick.mjs";
import { processMobilizations } from "./events/mobiliseTick.mjs";
import { processDemobilization } from "./events/demobiliseTick.mjs";
import { processMovement } from "./events/moveTick.mjs";
import { processGathering } from "./events/gatheringTick.mjs";
import { processBuilding } from "./events/buildTick.mjs";
import { spawnMonsters } from "./events/monsterSpawnTick.mjs";
import { upgradeTickProcessor } from "./events/upgradeTick.mjs";
import { processCrafting } from "./events/craftingTick.mjs"; // Import the crafting processor

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
    // Get all world info
    const worldsRef = db.ref('worlds');
    const worldsSnapshot = await worldsRef.once('value');
    const worlds = worldsSnapshot.val();
    
    if (!worlds) {
      console.log("No worlds found to process");
      return null;
    }
    
    // Track how many updates were made
    let mobilizationsProcessed = 0;
    let demobilizationsProcessed = 0;
    let movementsProcessed = 0;
    let gatheringsProcessed = 0;
    let buildingsProcessed = 0;
    let monstersSpawned = 0;
    
    // Process each world
    for (const worldId in worlds) {
      if (worldId === 'lastUpdated') continue;
      
      // Update world's lastTick timestamp
      await db.ref(`worlds/${worldId}/info/lastTick`).set(now);
      
      // Process the world's chunks to find groups for processing
      const worldRef = db.ref(`worlds/${worldId}/chunks`);
      const chunksSnapshot = await worldRef.once('value');
      const chunks = chunksSnapshot.val();
      
      if (!chunks) {
        console.log(`No chunks found in world ${worldId}`);
        continue;
      }
      
      // Batch updates
      const updates = {};
      
      // Process all chunks
      for (const chunkKey in chunks) {
        if (chunkKey === 'lastUpdated') continue;
        
        const chunk = chunks[chunkKey];
        
        // Process all tile data in the chunk
        for (const tileKey in chunk) {
          if (tileKey === 'lastUpdated') continue;
          
          const tile = chunk[tileKey];
          
          // Check if there's a structure being built on this tile
          if (tile.structure && tile.structure.status === 'building') {
            if (processBuilding(worldId, updates, chunkKey, tileKey, tile, now)) {
              buildingsProcessed++;
            }
          }
          
          // Check if there are groups on this tile
          if (tile.groups) {
            // Process mobilizations using imported function
            const mobileProcessed = processMobilizations(
              worldId, updates, tile.groups, chunkKey, tileKey, now
            );
            mobilizationsProcessed += mobileProcessed;
            
            // Process each group for other actions
            for (const groupId in tile.groups) {
              const group = tile.groups[groupId];
              
              // Process groups based on their status
              switch (group.status) {
                case 'demobilising':
                  // Process demobilization using imported function
                  if (processDemobilization(worldId, updates, group, chunkKey, tileKey, groupId, tile, now)) {
                    demobilizationsProcessed++;
                  }
                  break;
                  
                case 'moving':
                  // Process movement using imported function
                  if (await processMovement(worldId, updates, group, chunkKey, tileKey, groupId, now, db)) {
                    movementsProcessed++;
                  }
                  break;

                case 'gathering':
                  // Process gathering using imported function
                  if (processGathering(worldId, updates, group, chunkKey, tileKey, groupId, tile, now)) {
                    gatheringsProcessed++;
                  }
                  break;
                
                // Add more status handlers as needed
                default:
                  // Do nothing for other statuses
                  break;
              }
            }
          }
        }
      }
      
      // Apply all updates in a single batch
      if (Object.keys(updates).length > 0) {
        console.log(`Attempting to apply ${Object.keys(updates).length} updates to world ${worldId}`);
        console.log(`Update keys: ${Object.keys(updates).slice(0, 5).join(', ')}${Object.keys(updates).length > 5 ? '...' : ''}`);
        
        try {
          await db.ref().update(updates);
          console.log(`Successfully applied ${Object.keys(updates).length} updates to world ${worldId}`);
        } catch (updateError) {
          console.error(`Failed to apply updates to world ${worldId}:`, updateError);
        }
      }

      // Process battles for the world using the imported function
      const battlesProcessed = await processBattles(worldId);
      console.log(`Processed ${battlesProcessed} battles in world ${worldId}`);
      
      // Process structure upgrades for this world
      console.log(`Processing structure upgrades for world ${worldId}`);
      const upgradeResult = await upgradeTickProcessor({ worldId });
      console.log(`Processed ${upgradeResult.processed || 0} structure upgrades in world ${worldId}`);
      
      // Process crafting operations for this world
      console.log(`Processing crafting for world ${worldId}`);
      const craftingResult = await processCrafting(worldId);
      console.log(`Processed ${craftingResult.processed || 0} crafting operations in world ${worldId}`);
      
      // Spawn monsters with a 20% chance on each tick (to avoid spawning too many)
      if (Math.random() < 0.2) {
        const spawnedCount = await spawnMonsters(worldId);
        monstersSpawned += spawnedCount;
        console.log(`Spawned ${spawnedCount} monster groups in world ${worldId}`);
      }
    }
    
    console.log(`Processed ${mobilizationsProcessed} mobilizations, ${demobilizationsProcessed} demobilizations, ${movementsProcessed} movement steps, ${gatheringsProcessed} gatherings, ${buildingsProcessed} building updates, and spawned ${monstersSpawned} monster groups`);    
    return null;
  } catch (error) {
    console.error("Error processing game ticks:", error);
    return null;
  }
});

export default processGameTicks;
