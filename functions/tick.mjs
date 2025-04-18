/**
 * Handles scheduled game tick processing for Gisaima
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

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
                  
                  // Ensure we have a target structure
                  const targetStructureId = group.targetStructureId;
                  if (!targetStructureId) {
                    logger.warn(`Missing target structure for demobilizing group ${groupId}`);
                    updates[`${groupPath}/status`] = 'idle'; // Reset to idle if no target
                    updates[`${groupPath}/lastUpdated`] = now;
                    continue;
                  }
                  
                  // Find if there's a structure on this tile
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
                  if (group.units && Array.isArray(group.units)) {
                    // Separate player and non-player units
                    const playerUnits = group.units.filter(unit => unit.type === 'player');
                  
                    // For each player unit, make sure they remain on the tile 
                    // but are no longer in the group
                    for (const playerUnit of playerUnits) {
                      if (playerUnit.id) {
                        // Create or update a standalone player entry on this tile
                        const playerPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/players/${playerUnit.id}`;
                        updates[playerPath] = {
                          id: playerUnit.id,
                          displayName: playerUnit.name || `Player ${playerUnit.id}`,
                          race: playerUnit.race || 'human',
                          lastActive: now,
                          uid: playerUnit.id,
                          x: parseInt(tileKey.split(',')[0]),
                          y: parseInt(tileKey.split(',')[1])
                        };
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
                        const chunkSize = 20; // Standard chunk size
                        const nextChunkX = Math.floor(nextPoint.x / chunkSize);
                        const nextChunkY = Math.floor(nextPoint.y / chunkSize);
                        const nextChunkKey = `${nextChunkX},${nextChunkY}`;
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
                                // Update player location record
                                updates[`players/${unit.id}/worlds/${worldId}/lastLocation`] = {
                                  x: nextPoint.x,
                                  y: nextPoint.y,
                                  timestamp: now
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
    }
    
    console.log(`Processed ${mobilizationsProcessed} mobilizations, ${demobilizationsProcessed} demobilizations, and ${movementsProcessed} movement steps`);
    return null;
  } catch (error) {
    console.error("Error processing game ticks:", error);
    return null;
  }
});

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
