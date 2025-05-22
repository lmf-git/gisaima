/**
 * Handles scheduled game tick processing for Gisaima
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Import TerrainGenerator
import { TerrainGenerator } from 'gisaima-shared/map/noise.js';
import { mergeWorldMonsterGroups, monsterSpawnTick, spawnMonsters } from './events/monsterSpawnTick.mjs';

// Import specialized tick handlers
import { processBattle } from "./events/battleTick.mjs";
import { processMobilizations } from "./events/mobiliseTick.mjs";
import { processDemobilization } from "./events/demobiliseTick.mjs";
import { processMovement } from "./events/moveTick.mjs";
import { processGathering } from "./events/gatheringTick.mjs";
import { processBuilding } from "./events/buildTick.mjs";
import { upgradeTickProcessor } from "./events/upgradeTick.mjs";
import { processCrafting } from "./events/craftingTick.mjs"; 
import { processMonsterStrategies } from "./events/monsterStrategyTick.mjs"; 

// Maximum number of chat messages to keep per world
const MAX_CHAT_HISTORY = 500;

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
    let monsterStrategiesProcessed = 0;
    let monsterGroupsMerged = 0;
    let battlesProcessed = 0;
    let structuresAdopted = 0;
    let totalMessagesRemoved = 0;
    
    // Process each world
    for (const worldId in worlds) {
      // Create TerrainGenerator for this world
      const worldInfo = worlds[worldId]?.info;
      const terrainGenerator = new TerrainGenerator(worldInfo.seed, 10000);
      
      // Update world's lastTick timestamp
      await db.ref(`worlds/${worldId}/info/lastTick`).set(now);
      
      // Always run chat cleanup on every tick
      const worldData = worlds[worldId];
      const chatData = worldData.chat;
      
      if (chatData) {
        console.log(`Running chat cleanup for world ${worldId}`);
        const messagesRemoved = await cleanupChatMessages(db, worldId, chatData);
        totalMessagesRemoved += messagesRemoved;
      }
      
      // Access chunks directly from the world data we already loaded
      const chunks = worlds[worldId]?.chunks;
      
      if (!chunks) {
        console.log(`No chunks found in world ${worldId}`);
        continue;
      }
      
      // Batch updates
      const updates = {};
      
      // MODIFIED: Track groups already processed in this tick to avoid conflicts
      const processedGroups = new Set();
      
      // Process all chunks
      for (const chunkKey in chunks) {
        const chunk = chunks[chunkKey];
        
        // MODIFIED: First process all battles before handling other activities
        // This ensures that monsters in battles don't get moved or assigned other actions
        for (const tileKey in chunk) {
          const tile = chunk[tileKey];
          
          // Process battles on this tile
          if (tile.battles) {
            console.log(`Processing battles in tile ${tileKey} of world ${worldId}`);
            for (const battleId in tile.battles) {
              const battle = tile.battles[battleId];
              if (battle) {
                const battleResult = await processBattle(worldId, chunkKey, tileKey, battleId, battle, updates, tile);
                battlesProcessed++;
                
                // Mark all groups in this battle as processed
                if (battle.side1 && battle.side1.groups) {
                  Object.keys(battle.side1.groups).forEach(groupId => {
                    processedGroups.add(`${chunkKey}_${tileKey}_${groupId}`);
                  });
                }
                if (battle.side2 && battle.side2.groups) {
                  Object.keys(battle.side2.groups).forEach(groupId => {
                    processedGroups.add(`${chunkKey}_${tileKey}_${groupId}`);
                  });
                }
              }
            }
          }
        }
      }
      
      // Now process other group activities
      for (const chunkKey in chunks) {
        const chunk = chunks[chunkKey];
        
        // Process all tile data in the chunk
        for (const tileKey in chunk) {
          const tile = chunk[tileKey];
          
          // Check if there's a structure being built on this tile
          if (tile.structure && tile.structure.status === 'building') {
            if (await processBuilding(worldId, updates, chunkKey, tileKey, tile, now)) {
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
              const groupKey = `${chunkKey}_${tileKey}_${groupId}`;
              
              // Skip groups already processed in battles
              if (processedGroups.has(groupKey)) {
                console.log(`Skipping group ${groupId} as it's already in battle processing`);
                continue;
              }
              
              // Process groups based on their status
              switch (group.status) {
                case 'demobilising':
                  // Process demobilization using imported function
                  if (processDemobilization(worldId, updates, group, chunkKey, tileKey, groupId, tile, now)) {
                    demobilizationsProcessed++;
                    processedGroups.add(groupKey);
                  }
                  break;
                  
                case 'moving':
                  // Process movement using imported function - pass worldInfo/worldData
                  if (await processMovement(worldId, updates, group, chunkKey, tileKey, groupId, now, db, worldInfo)) {
                    movementsProcessed++;
                    processedGroups.add(groupKey);
                  }
                  break;

                case 'gathering':
                  // Process gathering using imported function - now passing terrainGenerator
                  if (processGathering(worldId, updates, group, chunkKey, tileKey, groupId, tile, now, terrainGenerator)) {
                    gatheringsProcessed++;
                    processedGroups.add(groupKey);
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
        // MODIFIED: Added check for conflicting status updates
        const sanitizedUpdates = sanitizeStatusUpdates(updates);
        
        console.log(`Attempting to apply ${Object.keys(sanitizedUpdates).length} updates to world ${worldId}`);
        console.log(`Update keys: ${Object.keys(sanitizedUpdates).slice(0, 5).join(', ')}${Object.keys(sanitizedUpdates).length > 5 ? '...' : ''}`);
        
        try {
          await db.ref().update(sanitizedUpdates);
          console.log(`Successfully applied ${Object.keys(sanitizedUpdates).length} updates to world ${worldId}`);
        } catch (updateError) {
          console.error(`Failed to apply updates to world ${worldId}:`, updateError);
        }
      }
      
      // Process structure upgrades - pass world data to avoid redundant loading
      console.log(`Processing structure upgrades for world ${worldId}`);
      const upgradeResult = await upgradeTickProcessor(worldId, worldData);
      console.log(`Processed ${upgradeResult.processed || 0} structure upgrades in world ${worldId}`);
      
      // Process crafting operations - pass world data to avoid redundant loading
      console.log(`Processing crafting for world ${worldId}`);
      const craftingResult = await processCrafting(worldId, worldData);
      console.log(`Processed ${craftingResult.processed || 0} crafting operations in world ${worldId}`);
      
      // Process monster strategies with a 66.6% chance each tick
      if (Math.random() < 0.666) {
        console.log(`Processing monster strategies for world ${worldId}`);
        
        const strategyResult = await processMonsterStrategies(worldId, chunks, terrainGenerator);
        
        if (strategyResult.totalProcessed) {
          monsterStrategiesProcessed += strategyResult.totalProcessed;
          console.log(`Processed ${strategyResult.totalProcessed} monster strategies in world ${worldId}`);
          console.log(`Monster strategies: ${strategyResult.movesInitiated} moves, ${strategyResult.gatheringStarted} gathering, ` + 
                     `${strategyResult.structuresBuildStarted} building, ${strategyResult.structuresUpgraded} upgrades, ` +
                     `${strategyResult.battlesJoined} battles joined, ${strategyResult.groupsMerged} groups merged`);
        }
      }
      
      // Spawn monsters with a 20% chance on each tick
      if (Math.random() < 0.2) {
        const spawnedCount = await spawnMonsters(worldId, chunks, terrainGenerator);
        monstersSpawned += spawnedCount;
        console.log(`Spawned ${spawnedCount} monster groups in world ${worldId}`);
      }
      
      // Add separate merging process with 15% chance each tick
      if (Math.random() < 0.15) {
        const mergeCount = await mergeWorldMonsterGroups(worldId, chunks, terrainGenerator);
        monsterGroupsMerged += mergeCount;
        console.log(`Merged ${mergeCount} monster groups in world ${worldId}`);
      }
    }
    
    // Update log message to include chat cleanup metrics
    let logMessage = `Processed ${mobilizationsProcessed} mobilizations, ${demobilizationsProcessed} demobilizations, ` +
                 `${movementsProcessed} movement steps, ${gatheringsProcessed} gatherings, ${buildingsProcessed} building updates, ` +
                 `${monsterStrategiesProcessed} monster strategies, ${monsterGroupsMerged} monster groups merged, ` +
                 `${structuresAdopted} structures adopted, and spawned ${monstersSpawned} monster groups`;
    
    // Always include chat cleanup metrics
    logMessage += `, and removed ${totalMessagesRemoved} old chat messages`;
    
    console.log(logMessage);    
    return null;
  } catch (error) {
    console.error("Error processing game ticks:", error);
    return null;
  }
});

/**
 * Process chat cleanup for a given world
 * 
 * @param {Object} db Database reference
 * @param {string} worldId The ID of the world to process
 * @param {Object|null} preloadedChatData Optional preloaded chat data
 * @returns {Promise<number>} Number of messages cleaned up
 */
async function cleanupChatMessages(db, worldId, preloadedChatData) {
  try {
    let messages = [];
    
    // Only use preloaded chat data, no fallback
    if (preloadedChatData) {
      // Convert the chat data object to our required format
      for (const messageId in preloadedChatData) {
        const message = preloadedChatData[messageId];
        messages.push({
          id: messageId,
          timestamp: message.timestamp || 0
        });
      }
    } else {
      logger.debug(`No chat data found for world ${worldId}`);
      return 0;
    }
    
    if (messages.length === 0) {
      logger.debug(`No chat messages found for world ${worldId}`);
      return 0;
    }
    
    // Sort messages by timestamp (oldest first)
    messages.sort((a, b) => a.timestamp - b.timestamp);
    
    // If we have more than the maximum allowed messages, remove the oldest ones
    const messagesToRemove = messages.length - MAX_CHAT_HISTORY;
    
    if (messagesToRemove <= 0) {
      logger.debug(`Chat cleanup for world ${worldId}: ${messages.length} messages (under limit)`);
      return 0;
    }
    
    logger.info(`Chat cleanup for world ${worldId}: removing ${messagesToRemove} oldest messages`);
    
    // Batch deletion for better performance
    const updates = {};
    for (let i = 0; i < messagesToRemove; i++) {
      updates[`worlds/${worldId}/chat/${messages[i].id}`] = null;
    }
    
    // Apply the batch update
    await db.ref().update(updates);
    
    return messagesToRemove;
  } catch (error) {
    logger.error(`Error cleaning up chat for world ${worldId}:`, error);
    return 0;
  }
}

/**
 * Sanitize updates to resolve conflicting status changes
 * @param {Object} updates Original updates object
 * @returns {Object} Sanitized updates without conflicts
 */
function sanitizeStatusUpdates(updates) {
  const sanitizedUpdates = {...updates};
  const statusUpdates = new Map();
  const statusRegex = /\/groups\/([^\/]+)\/status$/;
  
  // Find all status updates
  for (const path in sanitizedUpdates) {
    const match = path.match(statusRegex);
    if (match) {
      const groupId = match[1];
      const basePath = path.substring(0, path.lastIndexOf('/status'));
      
      if (!statusUpdates.has(basePath)) {
        statusUpdates.set(basePath, {
          path,
          status: sanitizedUpdates[path],
          priority: getStatusPriority(sanitizedUpdates[path])
        });
      } else {
        // Compare priorities and keep the highest priority status
        const existing = statusUpdates.get(basePath);
        const newPriority = getStatusPriority(sanitizedUpdates[path]);
        
        if (newPriority > existing.priority) {
          // Remove the previous status path from sanitizedUpdates
          delete sanitizedUpdates[existing.path];
          
          // Update the status map with the new higher priority status
          statusUpdates.set(basePath, {
            path,
            status: sanitizedUpdates[path],
            priority: newPriority
          });
        } else {
          // Remove the current path as it has lower priority
          delete sanitizedUpdates[path];
        }
      }
    }
  }
  
  // Clean up related properties for overridden status updates
  for (const [basePath, statusData] of statusUpdates.entries()) {
    const status = statusData.status;
    
    // For each property path, check if it should be removed based on the winning status
    for (const path in sanitizedUpdates) {
      // Skip the status path itself
      if (path === statusData.path) continue;
      
      // If this is a property related to the same group
      if (path.startsWith(basePath + '/')) {
        const propName = path.substring(basePath.length + 1);
        
        // Handle conflicting properties based on status
        if (status === 'fighting') {
          // Remove movement-related properties if the group is fighting
          if (propName.startsWith('movement') || 
              propName.startsWith('path') || 
              propName.startsWith('target') || 
              propName.startsWith('moveSpeed') ||
              propName.startsWith('moveStart')) {
            delete sanitizedUpdates[path];
          }
        } else if (status === 'moving') {
          // Remove battle-related properties if the group is moving
          if (propName.startsWith('battle')) {
            delete sanitizedUpdates[path];
          }
        }
      }
    }
  }
  
  return sanitizedUpdates;
}

/**
 * Get priority value for different status types
 * Higher value = higher priority in conflict resolution
 * @param {string} status The status value
 * @returns {number} Priority value
 */
function getStatusPriority(status) {
  switch (status) {
    case 'fighting': return 10;    // Highest priority
    case 'building': return 8;
    case 'gathering': return 6;
    case 'moving': return 4;
    case 'demobilising': return 5;
    case 'idle': return 2;
    default: return 1;
  }
}

export default processGameTicks;