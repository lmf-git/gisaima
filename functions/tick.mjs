/**
 * Handles scheduled game tick processing for Gisaima
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Add a consistent chunk size constant and getChunkKey function
const CHUNK_SIZE = 20; // Standard chunk size used throughout codebase

// Function to ensure consistent chunk key calculation
function getChunkKey(x, y) {
  // Simple integer division works for both positive and negative coordinates
  const chunkX = Math.floor(x / CHUNK_SIZE);
  const chunkY = Math.floor(y / CHUNK_SIZE);
  return `${chunkX},${chunkY}`;
}

// Function to get local coordinates within a chunk
function getLocalCoordinates(x, y) {
  // Use modulo arithmetic for both positive and negative coordinates
  // Add CHUNK_SIZE before modulo to handle negative coordinates correctly
  const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const localY = ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return { x: localX, y: localY };
}

// Function to parse spawn location in "chunkX:chunkY:tileX:tileY" format
function parseSpawnCoordinates(key) {
  if (!key || typeof key !== 'string') return null;
  
  const parts = key.split(':').map(Number);
  if (parts.length !== 4) return null;
  
  const [chunkX, chunkY, tileX, tileY] = parts;
  return {
    chunkX, chunkY, tileX, tileY,
    // Convert to global coordinates
    globalX: (chunkX * CHUNK_SIZE) + tileX,
    globalY: (chunkY * CHUNK_SIZE) + tileY
  };
}

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
    let gatheringsProcessed = 0;  // Add a counter for gatherings
    
    // Process each world
    for (const worldId in worlds) {
      if (worldId === 'lastUpdated') continue; // Skip metadata
      
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
        if (chunkKey === 'lastUpdated') continue; // Skip metadata
        
        const chunk = chunks[chunkKey];
        
        // Process all tile data in the chunk
        for (const tileKey in chunk) {
          if (tileKey === 'lastUpdated') continue; // Skip metadata
          
          const tile = chunk[tileKey];
          
          // Check if there are groups on this tile
          if (tile.groups) {
            // Process each group
            for (const groupId in tile.groups) {
              const group = tile.groups[groupId];
              
              // Full database path to this group
              const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
              
              // Process groups based on their status
              switch (group.status) {
                case 'mobilizing':
                  // UPDATED: Complete mobilization on next tick regardless of time elapsed
                  // Update group status to idle
                  updates[`${groupPath}/status`] = 'idle';
                  updates[`${groupPath}/lastUpdated`] = now;
                  updates[`${groupPath}/readyAt`] = null; // Remove readyAt timestamp
                  mobilizationsProcessed++;
                  break;
                
                case 'demobilising':
                  // UPDATED: Complete demobilization on next tick regardless of time elapsed
                  // Handle demobilization logic
                  
                  // We don't need a target structure ID as we can use the current structure
                  if (!tile.structure) {
                    logger.warn(`No structure found for demobilizing group ${groupId}`);
                    updates[`${groupPath}/status`] = 'idle'; // Reset to idle if no structure
                    updates[`${groupPath}/lastUpdated`] = now;
                    continue;
                  }
                  
                  // Get storage preference (defaults to shared if not specified)
                  const storageDestination = group.storageDestination || 'shared';
                  
                  // Transfer items from group to structure based on storage preference
                  if (group.items && Array.isArray(group.items) && group.items.length > 0) {
                    if (storageDestination === 'personal' && group.owner) {
                      // Store in personal bank
                      const bankPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/banks/${group.owner}`;
                    
                      // Check if personal bank already exists
                      let existingBankItems = [];
                      if (tile.structure.banks && tile.structure.banks[group.owner]) {
                        existingBankItems = Array.isArray(tile.structure.banks[group.owner]) ? 
                          tile.structure.banks[group.owner] : [];
                      }
                    
                      // Combine existing bank items with new items from group
                      updates[bankPath] = [...existingBankItems, ...group.items];
                    } else {
                      // Store in shared storage (default behavior)
                      const structurePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/items`;
                    
                      // If structure doesn't have items array yet, create it
                      if (!tile.structure.items) {
                        updates[structurePath] = group.items;
                      } else {
                        // Append group items to structure items
                        const updatedItems = [...(Array.isArray(tile.structure.items) ? tile.structure.items : []), ...group.items];
                        updates[structurePath] = updatedItems;
                      }
                    }
                  }
                  
                  // Handle units: move non-player units back to the structure and keep players on the map
                  if (group.units) {
                    // Handle both array and object structure
                    const unitValues = Array.isArray(group.units) ? 
                      group.units : Object.values(group.units);
                      
                    // Separate player and non-player units
                    const playerUnits = unitValues.filter(unit => unit.type === 'player');
                  
                    // For each player unit, make sure they remain on the tile 
                    // but are no longer in the group
                    for (const playerUnit of playerUnits) {
                      if (playerUnit.id) {
                        // Use the exact location data from demobilizationData if available
                        // This ensures consistent chunk calculation
                        let exactLocationData;
                        if (group.demobilizationData && group.demobilizationData.exactLocation) {
                          exactLocationData = group.demobilizationData.exactLocation;
                        } else {
                          // Fallback to current tile location if exact data is missing
                          exactLocationData = {
                            x: parseInt(tileKey.split(',')[0]),
                            y: parseInt(tileKey.split(',')[1]),
                            chunkKey: chunkKey
                          };
                        }
                        
                        // Use the exact chunk key from demobilization data to ensure proper placement
                        const playerChunkKey = exactLocationData.chunkKey || chunkKey;
                        const playerTileKey = `${exactLocationData.x},${exactLocationData.y}`;
                        const playerId = playerUnit.id;
                        
                        // Create or update a standalone player entry on this tile
                        // IMPORTANT: Match the exact structure created by SpawnMenu.svelte
                        const playerPath = `worlds/${worldId}/chunks/${playerChunkKey}/${playerTileKey}/players/${playerId}`;
                        updates[playerPath] = {
                          displayName: playerUnit.displayName || playerUnit.name || `Player ${playerId}`,
                          lastActive: now,
                          uid: playerId,
                          race: playerUnit.race || 'human'
                        };
                        
                        // ALSO update player's world record to keep everything in sync
                        updates[`players/${playerId}/worlds/${worldId}/lastLocation`] = {
                          x: exactLocationData.x,
                          y: exactLocationData.y,
                          timestamp: now
                        };
                        
                        // Make sure alive status is true
                        updates[`players/${playerId}/worlds/${worldId}/alive`] = true;
                        
                        // Also clean up any pendingRelocation status for the player
                        updates[`players/${playerId}/worlds/${worldId}/pendingRelocation`] = null;
                        updates[`players/${playerId}/worlds/${worldId}/inGroup`] = null;
                        
                        logger.info(`Player ${playerId} placed at ${playerTileKey} in chunk ${playerChunkKey} after demobilization`);
                      }
                    }
                  }
                  
                  // Now that we've handled all the transfers, delete the group
                  updates[groupPath] = null;
                  demobilizationsProcessed++;
                  break;
                  
                case 'moving':
                  // Check if it's time for the next movement step
                  if (group.nextMoveTime && group.nextMoveTime <= now) {
                    // Only proceed if we have a path
                    if (group.movementPath && Array.isArray(group.movementPath) && group.pathIndex !== undefined) {
                      const currentIndex = group.pathIndex || 0;
                      const nextIndex = currentIndex + 1;
                      
                      // Check if there are more steps in the path
                      if (nextIndex < group.movementPath.length) {
                        // Get the next point in the path
                        const nextPoint = group.movementPath[nextIndex];
                        
                        // Calculate the next chunk and tile for the new position
                        // UPDATED: Use consistent chunk calculation
                        const nextChunkKey = getChunkKey(nextPoint.x, nextPoint.y);
                        const nextTileKey = `${nextPoint.x},${nextPoint.y}`;
                        
                        // Calculate time for the next step based on world speed
                        const worldInfoRef = db.ref(`worlds/${worldId}/info`);
                        const worldInfoSnap = await worldInfoRef.once('value');
                        const worldInfo = worldInfoSnap.val() || {};
                        const worldSpeed = worldInfo.speed || 1.0;
                        const moveInterval = Math.round(60000 / worldSpeed); // 1 minute adjusted for world speed
                        const nextMoveTime = now + moveInterval;
                        
                        // If position is changing (next point is different from current tile)
                        if (nextChunkKey !== chunkKey || nextTileKey !== tileKey) {
                          // Create a new group at the next position with the correct status
                          updates[`worlds/${worldId}/chunks/${nextChunkKey}/${nextTileKey}/groups/${groupId}`] = {
                            ...group,
                            x: nextPoint.x,
                            y: nextPoint.y,
                            lastUpdated: now,
                            pathIndex: nextIndex,
                            nextMoveTime: nextMoveTime,
                            // Ensure status remains 'moving' throughout the path
                            status: nextIndex < group.movementPath.length - 1 ? 'moving' : 'idle'
                          };
                          
                          // Remove the group from the current position
                          updates[`${groupPath}`] = null;
                          
                          // Update player position if they're in this group
                          if (group.units && Array.isArray(group.units)) {
                            for (const unit of group.units) {
                              if (unit.type === 'player' && unit.id) {
                                // Update player location record with simplified structure
                                updates[`players/${unit.id}/worlds/${worldId}/lastLocation`] = {
                                  x: nextPoint.x,
                                  y: nextPoint.y
                                };
                              }
                            }
                          }
                        } else {
                          // Just update status, path index, and next move time without changing position
                          updates[`${groupPath}/pathIndex`] = nextIndex;
                          updates[`${groupPath}/lastUpdated`] = now;
                          updates[`${groupPath}/nextMoveTime`] = nextMoveTime;
                          // If this is the last step, set status to idle
                          if (nextIndex === group.movementPath.length - 1) {
                            updates[`${groupPath}/status`] = 'idle';
                            // Clean up movement data
                            updates[`${groupPath}/moveStarted`] = null;
                            updates[`${groupPath}/moveSpeed`] = null;
                            updates[`${groupPath}/targetX`] = null;
                            updates[`${groupPath}/targetY`] = null;
                          }
                        }
                        
                        movementsProcessed++;
                      } else {
                        // Path is complete, update the group status
                        updates[`${groupPath}/status`] = 'idle';
                        updates[`${groupPath}/lastUpdated`] = now;
                        updates[`${groupPath}/movementPath`] = null;
                        updates[`${groupPath}/pathIndex`] = null;
                        updates[`${groupPath}/moveStarted`] = null;
                        updates[`${groupPath}/moveSpeed`] = null;
                        updates[`${groupPath}/nextMoveTime`] = null;
                        updates[`${groupPath}/targetX`] = null;
                        updates[`${groupPath}/targetY`] = null;
                        movementsProcessed++;
                      }
                    } else {
                      // Path is invalid, reset the group status
                      logger.warn(`Invalid path for group ${groupId} in world ${worldId}`);
                      updates[`${groupPath}/status`] = 'idle';
                      updates[`${groupPath}/lastUpdated`] = now;
                      updates[`${groupPath}/movementPath`] = null;
                      updates[`${groupPath}/pathIndex`] = null;
                    }
                  }
                  break;

                // Add case for gathering
                case 'gathering':
                  // Check if gathering is complete
                  if (group.gatheringUntil && group.gatheringUntil <= now) {
                    // Generate gathered items based on group and biome
                    const biome = group.gatheringBiome || tile.biome?.name || 'plains';
                    const gatheredItems = generateGatheredItems(group, biome);
                    
                    // Add items to group
                    if (!group.items) {
                      updates[`${groupPath}/items`] = gatheredItems;
                    } else {
                      // Combine existing items with new gathered items
                      const updatedItems = [
                        ...(Array.isArray(group.items) ? group.items : []), 
                        ...gatheredItems
                      ];
                      updates[`${groupPath}/items`] = updatedItems;
                    }
                    
                    // Reset group status to idle
                    updates[`${groupPath}/status`] = 'idle';
                    updates[`${groupPath}/lastUpdated`] = now;
                    updates[`${groupPath}/gatheringUntil`] = null;
                    updates[`${groupPath}/gatheringStarted`] = null;
                    updates[`${groupPath}/gatheringBiome`] = null;
                    
                    // Add a message about the gathering
                    const itemCount = gatheredItems.length;
                    updates[`${groupPath}/lastMessage`] = {
                      text: `Gathered ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
                      timestamp: now
                    };
                    
                    gatheringsProcessed++;
                    logger.info(`Group ${groupId} completed gathering and found ${itemCount} items`);
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
        await db.ref().update(updates);
        console.log(`Applied ${Object.keys(updates).length} updates to world ${worldId}`);
      }

      // Process battles for the world
      const battlesProcessed = await processBattles(worldId);
      console.log(`Processed ${battlesProcessed} battles in world ${worldId}`);
    }
    
    console.log(`Processed ${mobilizationsProcessed} mobilizations, ${demobilizationsProcessed} demobilizations, ${movementsProcessed} movement steps, and ${gatheringsProcessed} gatherings`);
    return null;
  } catch (error) {
    console.error("Error processing game ticks:", error);
    return null;
  }
});

// Update the battle processing code to handle multiple groups per side
async function processBattles(worldId) {
  try {
    const db = getDatabase();
    const now = Date.now();
    
    // Get active battles
    const battlesRef = db.ref(`battles/${worldId}`).orderByChild('status').equalTo('active');
    const battlesSnapshot = await battlesRef.once('value');
    
    if (!battlesSnapshot.exists()) {
      logger.debug(`No active battles found for world ${worldId}`);
      return 0;
    }
    
    const battles = [];
    battlesSnapshot.forEach(snapshot => {
      battles.push({
        id: snapshot.key,
        ...snapshot.val()
      });
    });
    
    logger.info(`Processing ${battles.length} active battles in world ${worldId}`);
    let battleProcessCount = 0;
    
    for (const battle of battles) {
      // Check if battle should end
      if (battle.endTime && battle.endTime <= now) {
        try {
          // Process battle outcome
          const side1Power = battle.side1.power || 0;
          const side2Power = battle.side2.power || 0;
          
          // Determine winner (simple power comparison for now)
          let winner, loser;
          if (side1Power >= side2Power) {
            winner = battle.side1;
            loser = battle.side2;
            battle.result = {
              winningSide: 1,
              winnerPower: side1Power,
              loserPower: side2Power
            };
          } else {
            winner = battle.side2;
            loser = battle.side1;
            battle.result = {
              winningSide: 2,
              winnerPower: side2Power,
              loserPower: side1Power
            };
          }
          
          // Calculate casualties (simplified version)
          const casualtyRate = Math.min(0.8, (loser.power / winner.power) * 0.5);
          const winnerCasualties = Math.round(winner.power * casualtyRate * 0.5);
          const loserCasualties = Math.round(loser.power * casualtyRate);
          
          battle.result.winnerCasualties = winnerCasualties;
          battle.result.loserCasualties = loserCasualties;
          
          // Update battle status
          battle.status = 'completed';
          battle.completedAt = now;
          
          // Get the chunk key - UPDATED to use consistent function
          const chunkKey = getChunkKey(battle.locationX, battle.locationY);
          const tileKey = `${battle.locationX},${battle.locationY}`;
          
          // Prepare updates
          const updates = {};
          
          // Update battle in database
          updates[`battles/${worldId}/${battle.id}/status`] = battle.status;
          updates[`battles/${worldId}/${battle.id}/completedAt`] = battle.completedAt;
          updates[`battles/${worldId}/${battle.id}/result`] = battle.result;

          // Update battle status in tile data as well
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/status`] = battle.status;
          if (battle.status === 'completed') {
            // Schedule removal of the battle reference after a delay to allow clients to see the result
            setTimeout(async () => {
              await db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}`).remove();
            }, 60000); // Keep completed battle visible for 1 minute
          }
          
          // Get groups from this tile to update them
          const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
          const tileSnapshot = await tileRef.once('value');
          
          if (tileSnapshot.exists()) {
            const tileData = tileSnapshot.val();
            
            // Process all groups on both sides
            if (tileData.groups) {
              // Process all side 1 groups (winners)
              const side1GroupIds = Object.keys(battle.side1.groups || {});
              for (const groupId of side1GroupIds) {
                if (tileData.groups[groupId]) {
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/inBattle`] = false;
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleId`] = null;
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleSide`] = null;
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleRole`] = null;
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`] = 'idle';
                  
                  // Apply casualties to winning groups
                  const group = tileData.groups[groupId];
                  if (group && group.unitCount) {
                    const groupCasualties = Math.ceil((group.unitCount / side1Power) * winnerCasualties);
                    const newUnitCount = Math.max(1, group.unitCount - groupCasualties);
                    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/unitCount`] = newUnitCount;
                    
                    // Check for player deaths in winning groups
                    if (group.units) {
                      for (const unit of group.units) {
                        if (unit.type === 'player' && unit.id) {
                          // Small chance for player death on winning side (20% of casualty rate)
                          if (Math.random() < (groupCasualties / group.unitCount) * 0.2) {
                            logger.info(`Player ${unit.id} died in battle (winner side)`);
                            // Mark player as not alive, triggering respawn
                            updates[`players/${unit.id}/worlds/${worldId}/alive`] = false;
                          }
                        }
                      }
                    }
                  }
                }
              }
              
              // Process all side 2 groups (losers)
              const side2GroupIds = Object.keys(battle.side2.groups || {});
              for (const groupId of side2GroupIds) {
                if (tileData.groups[groupId]) {
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/inBattle`] = false;
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleId`] = null;
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleSide`] = null;
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleRole`] = null;
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`] = 'idle';
                  
                  // Apply casualties to losing groups
                  const group = tileData.groups[groupId];
                  if (group && group.unitCount) {
                    const groupCasualties = Math.ceil((group.unitCount / side2Power) * loserCasualties);
                    const newUnitCount = Math.max(1, group.unitCount - groupCasualties);
                    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/unitCount`] = newUnitCount;
                    
                    // Check for player deaths in losing groups (higher chance)
                    if (group.units) {
                      for (const unit of group.units) {
                        if (unit.type === 'player' && unit.id) {
                          // Higher chance for player death on losing side (50% of casualty rate)
                          if (Math.random() < (groupCasualties / group.unitCount) * 0.5) {
                            logger.info(`Player ${unit.id} died in battle (loser side)`);
                            // Mark player as not alive, triggering respawn
                            updates[`players/${unit.id}/worlds/${worldId}/alive`] = false;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          
          // Apply all updates
          await db.ref().update(updates);
          battleProcessCount++;
          logger.info(`Completed battle ${battle.id} in world ${worldId}`);
        } catch (error) {
          logger.error(`Error processing battle ${battle.id}:`, error);
        }
      }
    }
    
    return battleProcessCount;
  } catch (error) {
    logger.error(`Error processing battles for world ${worldId}:`, error);
    return 0;
  }
}

// Generate random items based on group and biome - kept in this file as it's only used here
function generateGatheredItems(group, biome = 'plains') {
  const items = [];
  
  // Base number of items is determined by group size
  const unitCount = group.unitCount || (group.units ? group.units.length : 1);
  
  // Calculate the base number of items to generate
  const baseItems = Math.floor(Math.random() * 2) + Math.ceil(unitCount / 2);
  
  // Generate biome-specific items
  const biomeItems = getBiomeItems(biome);
  
  // Add common items every group finds
  const commonItems = [
    { id: `item_${Date.now()}_1`, name: 'Wooden Sticks', quantity: Math.floor(Math.random() * 5) + 1, type: 'resource', rarity: 'common' },
    { id: `item_${Date.now()}_2`, name: 'Stone Pieces', quantity: Math.floor(Math.random() * 3) + 1, type: 'resource', rarity: 'common' }
  ];
  
  // Combine items based on the number determined
  const itemCount = baseItems;
  
  // Add common items first
  for (let i = 0; i < Math.min(itemCount, commonItems.length); i++) {
    items.push(commonItems[i]);
  }
  
  // Add biome-specific items
  for (let i = items.length; i < itemCount; i++) {
    if (biomeItems.length > 0) {
      const randomIndex = Math.floor(Math.random() * biomeItems.length);
      const item = { ...biomeItems[randomIndex] };
      
      // Generate unique ID
      item.id = `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      items.push(item);
    }
  }
  
  // Rare chance (5%) for a special item
  if (Math.random() < 0.05) {
    items.push({
      id: `item_${Date.now()}_special`,
      name: 'Mysterious Artifact',
      description: 'A strange object of unknown origin',
      quantity: 1,
      type: 'artifact',
      rarity: 'rare'
    });
  }
  
  return items;
}

// Get biome-specific items - kept in this file as it's only used by generateGatheredItems
function getBiomeItems(biome) {
  const biomeItemMap = {
    'plains': [
      { name: 'Wheat', quantity: Math.floor(Math.random() * 3) + 1, type: 'resource', rarity: 'common' },
      { name: 'Wild Berries', quantity: Math.floor(Math.random() * 2) + 1, type: 'resource', rarity: 'common' }
    ],
    'forest': [
      { name: 'Oak Wood', quantity: Math.floor(Math.random() * 3) + 1, type: 'resource', rarity: 'common' },
      { name: 'Medicinal Herbs', quantity: Math.floor(Math.random() * 2) + 1, type: 'resource', rarity: 'uncommon' }
    ],
    'mountains': [
      { name: 'Iron Ore', quantity: Math.floor(Math.random() * 2) + 1, type: 'resource', rarity: 'uncommon' },
      { name: 'Mountain Crystal', quantity: 1, type: 'gem', rarity: 'rare' }
    ],
    'desert': [
      { name: 'Sand Crystal', quantity: Math.floor(Math.random() * 2) + 1, type: 'gem', rarity: 'uncommon' },
      { name: 'Cactus Fruit', quantity: Math.floor(Math.random() * 3) + 1, type: 'resource', rarity: 'common' }
    ],
    'rivers': [
      { name: 'Fresh Water', quantity: Math.floor(Math.random() * 3) + 1, type: 'resource', rarity: 'common' },
      { name: 'Fish', quantity: Math.floor(Math.random() * 2) + 1, type: 'resource', rarity: 'common' }
    ],
    'oasis': [
      { name: 'Pure Water', quantity: Math.floor(Math.random() * 2) + 1, type: 'resource', rarity: 'uncommon' },
      { name: 'Exotic Fruit', quantity: Math.floor(Math.random() * 2) + 1, type: 'resource', rarity: 'uncommon' }
    ],
    'ruins': [
      { name: 'Ancient Fragment', quantity: 1, type: 'artifact', rarity: 'rare' },
      { name: 'Broken Tool', quantity: Math.floor(Math.random() * 2) + 1, type: 'junk', rarity: 'common' }
    ],
    'wastes': [
      { name: 'Scrap Metal', quantity: Math.floor(Math.random() * 3) + 1, type: 'resource', rarity: 'common' },
      { name: 'Strange Device', quantity: 1, type: 'artifact', rarity: 'uncommon' }
    ]
  };
  
  // Return items for the specific biome, or default to plains
  return biomeItemMap[biome] || biomeItemMap['plains'];
}

/**
 * Process game tick events
 * 
 * @returns {Object} Result of the tick processing
 */
export async function processTick() {
  const db = getDatabase();
  const now = Date.now();
  
  try {
    // Get all worlds
    const worldsSnapshot = await db.ref('worlds').once('value');
    const worlds = worldsSnapshot.val() || {};
    
    let totalProcessed = 0;
    let gatheringProcessed = 0;
    
    // Process each world
    for (const [worldId, world] of Object.entries(worlds)) {
      // Skip if no chunks
      if (!world.chunks) continue;
      
      // Process each chunk
      for (const [chunkKey, chunk] of Object.entries(world.chunks)) {
        // Skip metadata fields
        if (chunkKey === 'lastUpdated') continue;
        
        // Process each tile in the chunk
        for (const [tileKey, tile] of Object.entries(chunk)) {
          if (tileKey === 'lastUpdated') continue;
          
          // Process gathering groups
          if (tile.groups) {
            for (const [groupId, group] of Object.entries(tile.groups)) {
              // Handle gathering groups
              if (group.status === 'gathering' && group.gatheringUntil && group.gatheringUntil <= now) {
                await processGathering(db, worldId, chunkKey, tileKey, groupId, group);
                gatheringProcessed++;
                totalProcessed++;
              }
              
              // Process other group actions here (mobilizing, demobilising, etc.)
              // ... existing code for other actions ...
            }
          }
        }
      }
    }
    
    console.log(`Tick processed: ${totalProcessed} total actions, ${gatheringProcessed} gathering actions`);
    
    return {
      success: true,
      processed: totalProcessed,
      gathering: gatheringProcessed
    };
  } catch (error) {
    console.error('Error processing tick:', error);
    throw new Error('Failed to process tick');
  }
}

/**
 * Process a gathering group
 * 
 * @param {Object} db Database reference
 * @param {string} worldId World ID
 * @param {string} chunkKey Chunk key
 * @param {string} tileKey Tile key
 * @param {string} groupId Group ID
 * @param {Object} group Group data
 */
async function processGathering(db, worldId, chunkKey, tileKey, groupId, group) {
  try {
    // Reference to the group
    const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`);
    
    // Reference to the tile
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
    
    // Get current tile data to check items
    const tileSnapshot = await tileRef.once('value');
    const tileData = tileSnapshot.val() || {};
    
    // Check if there are any items to gather
    if (!tileData.items || tileData.items.length === 0) {
      // No items to gather, reset the group to idle
      await groupRef.update({
        status: 'idle',
        gatheringStarted: null,
        gatheringUntil: null,
        itemsBeingGathered: null
      });
      return;
    }
    
    // Get or initialize group items array
    const groupItems = group.items || [];
    
    // Add gathered items to the group
    const gatheredItems = tileData.items.map(item => ({
      ...item,
      gatheredAt: Date.now()
    }));
    
    // Update group with gathered items
    await groupRef.update({
      status: 'idle',
      gatheringStarted: null,
      gatheringUntil: null,
      itemsBeingGathered: null,
      items: [...groupItems, ...gatheredItems]
    });
    
    // Remove items from the tile
    await tileRef.update({
      items: []
    });
    
    console.log(`Group ${groupId} gathered ${gatheredItems.length} items from ${tileKey}`);
  } catch (error) {
    console.error(`Error processing gathering for group ${groupId}:`, error);
    
    // Try to reset the group to idle state if there was an error
    try {
      const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`);
      await groupRef.update({
        status: 'idle',
        gatheringStarted: null,
        gatheringUntil: null,
        itemsBeingGathered: null
      });
    } catch (resetError) {
      console.error(`Failed to reset group ${groupId} state:`, resetError);
    }
  }
}

export default processTick;
