import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions';

/**
 * Handles battle progression for each tick of the game
 * Applies attrition to units, removes dead groups, distributes items,
 * and determines battle outcomes
 */
export async function battleTick(worldId) {
  const db = getDatabase();
  
  try {
    logger.info(`Processing battle tick for world: ${worldId}`);
    
    // Instead of getting battles from top-level, get all chunks in this world
    const chunksRef = db.ref(`worlds/${worldId}/chunks`);
    const chunksSnapshot = await chunksRef.once('value');
    const chunks = chunksSnapshot.val() || {};
    
    const now = Date.now();
    const batchUpdates = {};
    let processingCount = 0;
    
    // Process each chunk to find battles
    for (const [chunkKey, chunkData] of Object.entries(chunks)) {
      // Process each location in the chunk
      for (const [locationKey, locationData] of Object.entries(chunkData)) {
        // Skip if no battles at this location
        if (!locationData.battles) continue;
        
        // Process each battle at this location
        for (const [battleId, battle] of Object.entries(locationData.battles)) {
          // Skip battles that aren't active
          if (battle.status !== 'active') continue;
          
          processingCount++;
          logger.info(`Processing battle ${battleId} at (${battle.locationX}, ${battle.locationY})`);
          
          // Increment tick count for battle
          const newTickCount = (battle.tickCount || 0) + 1;
          batchUpdates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}/tickCount`] = newTickCount;
          
          // Process battle attrition and update battle state
          const result = await processBattleTick(worldId, chunkKey, locationKey, battle, db);
          
          // Apply updates from battle processing
          Object.assign(batchUpdates, result.updates);
          
          // If battle ended, create a final message
          if (result.ended) {
            const chatMessageId = `battle_end_${now}_${battleId}`;
            batchUpdates[`worlds/${worldId}/chat/${chatMessageId}`] = {
              text: result.endMessage,
              type: 'event',
              timestamp: now,
              location: {
                x: battle.locationX,
                y: battle.locationY
              }
            };
          }
        }
      }
    }
    
    logger.info(`Processed ${processingCount} battles for world ${worldId}`);
    
    // Apply all updates atomically
    if (Object.keys(batchUpdates).length > 0) {
      await db.ref().update(batchUpdates);
    }
    
    return { processedBattles: processingCount };
  } catch (error) {
    logger.error('Error in battle tick:', error);
    throw error;
  }
}

/**
 * Process a single battle tick
 * Handles attrition, unit deaths, group removal, and battle resolution
 */
async function processBattleTick(worldId, chunkKey, locationKey, battle, db) {
  const updates = {};
  let ended = false;
  let endMessage = '';
  
  try {
    // Get current state of all groups in the battle location
    const groupsRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups`);
    const groupsSnapshot = await groupsRef.once('value');
    const allGroups = groupsSnapshot.val() || {};
    
    // Get structure if involved in battle
    let structure = null;
    if (battle.targetTypes && battle.targetTypes.includes('structure')) {
      const structureRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure`);
      const structureSnapshot = await structureRef.once('value');
      structure = structureSnapshot.val();
    }
    
    // Separate groups by side
    const side1Groups = [];
    const side2Groups = [];
    
    // Get groups from both sides
    if (battle.side1 && battle.side1.groups) {
      for (const groupId in battle.side1.groups) {
        if (allGroups[groupId]) {
          side1Groups.push({
            id: groupId,
            ...allGroups[groupId]
          });
        }
      }
    }
    
    if (battle.side2 && battle.side2.groups) {
      for (const groupId in battle.side2.groups) {
        if (allGroups[groupId]) {
          side2Groups.push({
            id: groupId,
            ...allGroups[groupId]
          });
        }
      }
    }
    
    // Calculate initial power for each side
    let side1Power = calculateSidePower(side1Groups);
    let side2Power = calculateSidePower(side2Groups);
    
    // Add structure power to side 2 if present
    if (structure && structure.inBattle && structure.battleId === battle.id) {
      side2Power += calculateStructurePower(structure);
    }
    
    // If either side starts with no power, resolve the battle immediately
    if (side1Power === 0 || side2Power === 0) {
      const winner = side1Power > 0 ? 1 : 2;
      const now = Date.now();
      
      // Determine side names for better messaging
      const side1Name = battle.side1?.name || 'Side 1';
      const side2Name = battle.side2?.name || 'Side 2';
      const winnerName = winner === 1 ? side1Name : side2Name;
      const loserName = winner === 1 ? side2Name : side1Name;
      
      // Delete battle completely instead of marking as resolved
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}`] = null;
      
      // End message
      endMessage = `Battle at (${battle.locationX}, ${battle.locationY}) has ended! ${winnerName} has defeated ${loserName}!`;
      ended = true;
      
      return { updates, ended, endMessage };
    }
    
    // Calculate advantage and attrition for this tick
    const totalPower = side1Power + side2Power;
    const powerRatio = Math.min(side1Power, side2Power) / Math.max(side1Power, side2Power);
    
    // Randomly assign advantage when powers are equal
    if (side1Power === side2Power && (!battle.advantage || battle.advantage.side === 0)) {
      // 50/50 chance to give advantage to either side
      const randomSide = Math.random() < 0.5 ? 1 : 2;
      const randomStrength = 0.1 + (Math.random() * 0.2); // Random advantage between 10-30%
      
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/advantage/side`] = randomSide;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/advantage/strength`] = randomStrength;
      
      // Update battle object for this tick's processing
      if (!battle.advantage) battle.advantage = {};
      battle.advantage.side = randomSide;
      battle.advantage.strength = randomStrength;
      
      // Add event about advantage
      const advantageEvent = {
        type: 'battle_advantage',
        timestamp: Date.now(),
        text: `${randomSide === 1 ? battle.side1?.name || 'Side 1' : battle.side2?.name || 'Side 2'} has gained a tactical advantage!`,
      };
      
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/events`] = 
        [...(battle.events || []), advantageEvent];
    }
    
    // Scale attrition based on battle size - larger battles should last longer
    const totalUnits = side1Power + side2Power;
    const sizeFactor = 1 / Math.max(1, Math.sqrt(totalUnits / 2)); // Square root scaling
    
    // Calculate base attrition rates
    const baseAttritionRate = (0.05 + (powerRatio * 0.05)) * sizeFactor;
    
    // Calculate actual attrition rates based on advantage
    let side1AttritionRate = baseAttritionRate;
    let side2AttritionRate = baseAttritionRate;
    
    // Apply advantage to attrition rates
    if (battle.advantage) {
      if (battle.advantage.side === 1) {
        side1AttritionRate *= (1 - battle.advantage.strength * 0.5);
        side2AttritionRate *= (1 + battle.advantage.strength * 0.5);
      } else if (battle.advantage.side === 2) {
        side1AttritionRate *= (1 + battle.advantage.strength * 0.5);
        side2AttritionRate *= (1 - battle.advantage.strength * 0.5);
      }
    }
    
    // Process attrition for side 1
    const side1Result = processGroupAttrition(
      worldId,
      chunkKey, 
      locationKey, 
      side1Groups, 
      side1AttritionRate, 
      battle.id,
      db
    );
    
    Object.assign(updates, side1Result.updates);
    side1Power = side1Result.remainingPower;
    
    // Process attrition for side 2
    const side2Result = processGroupAttrition(
      worldId,
      chunkKey, 
      locationKey, 
      side2Groups, 
      side2AttritionRate, 
      battle.id,
      db
    );
    
    Object.assign(updates, side2Result.updates);
    side2Power = side2Result.remainingPower;
    
    // Process structure attrition if present
    if (structure && structure.inBattle && structure.battleId === battle.id) {
      const structureResult = processStructureAttrition(
        worldId,
        chunkKey,
        locationKey,
        structure,
        side1Power / totalPower * 0.1, // Structure takes damage based on enemy power ratio
        battle.id,
        db
      );
      
      Object.assign(updates, structureResult.updates);
      
      // If structure is destroyed, add to events
      if (structureResult.destroyed) {
        const destroyedEvent = {
          type: 'structure_destroyed',
          timestamp: Date.now(),
          text: `${structure.name || 'The structure'} has been destroyed!`,
          structureId: structure.id
        };
        
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/events`] = 
          [...(battle.events || []), destroyedEvent];
      }
    }
    
    // Update battle power values
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/side1Power`] = side1Power;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/side2Power`] = side2Power;
    
    // Update battle advantage
    const powerDifference = side1Power - side2Power;
    const advantageSide = powerDifference > 0 ? 1 : powerDifference < 0 ? 2 : 0;
    const advantageStrength = Math.abs(powerDifference) / Math.max(1, side1Power + side2Power);
    
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/advantage/side`] = advantageSide;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/advantage/strength`] = advantageStrength;
    
    // Update last update timestamp
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/lastUpdate`] = Date.now();
    
    // Add battle tick event
    const tickEvent = {
      type: 'battle_tick',
      timestamp: Date.now(),
      text: `The battle continues! Side 1 has ${side1Power} strength remaining. Side 2 has ${side2Power} strength remaining.`,
    };
    
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/events`] = 
      [...(battle.events || []), tickEvent];
    
    // Check if battle should end based on remaining power
    if (side1Power === 0 || side2Power === 0) {
      const now = Date.now();
      const winner = side1Power > 0 ? 1 : 2;
      const winningGroups = winner === 1 ? side1Groups : side2Groups;
      const losingGroups = winner === 1 ? side2Groups : side1Groups;
      
      // Determine side names for better messaging
      const side1Name = battle.side1?.name || 'Side 1';
      const side2Name = battle.side2?.name || 'Side 2';
      const winnerName = winner === 1 ? side1Name : side2Name;
      const loserName = winner === 1 ? side2Name : side1Name;
      
      // Create a final battle end event before deleting
      const endEvent = {
        type: 'battle_end',
        timestamp: now,
        text: `${winnerName} has emerged victorious over ${loserName}!`,
        winner
      };
      
      // Add the end event to a temporary event list for the chat message
      const finalEvents = [...(battle.events || []), endEvent];
      
      // Delete battle completely
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}`] = null;
      
      // Handle item distribution from losing groups to winning groups
      if (losingGroups.length > 0 && winningGroups.length > 0) {
        // Collect all items from losing groups
        const allLootItems = [];
        
        for (const group of losingGroups) {
          if (group.items) {
            const groupItems = typeof group.items === 'object' ? Object.values(group.items) : [];
            allLootItems.push(...groupItems);
            
            // Clear items from losing group
            updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/items`] = null;
          }
        }
        
        // Distribute items to winning groups if there are any items and winning groups
        if (allLootItems.length > 0 && winningGroups.length > 0) {
          // Randomly assign each item to a winning group
          for (const item of allLootItems) {
            const randomGroupIndex = Math.floor(Math.random() * winningGroups.length);
            const winningGroup = winningGroups[randomGroupIndex];
            
            // Generate an item ID if one doesn't exist
            const itemId = item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Add item to winning group
            updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${winningGroup.id}/items/${itemId}`] = {
              ...item,
              id: itemId,
              lootedAt: now,
              lootedFrom: 'battle'
            };
          }
          
          // Add message about looting
          endMessage += ` ${winnerName} looted ${allLootItems.length} items from the defeated groups.`;
        }
      }
      
      // Handle structure capture or destruction if relevant
      if (structure && structure.inBattle && structure.battleId === battle.id) {
        // Remove battle flags from structure
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/inBattle`] = false;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/battleId`] = null;
        
        // If attackers won (side 1), handle structure capture/destruction
        if (winner === 1) {
          // If structure was destroyed during battle
          if (structure.destroyed || (structure.health !== undefined && structure.health <= 0)) {
            // Remove structure entirely
            updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure`] = null;
            endMessage += ` The structure was destroyed in the battle!`;
          } else {
            // Capture structure - assign to first winning group owner
            if (winningGroups.length > 0) {
              const newOwner = winningGroups[0].owner;
              const newOwnerName = winningGroups[0].ownerName || 'Unknown';
              
              updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/owner`] = newOwner;
              updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/ownerName`] = newOwnerName;
              updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/capturedAt`] = now;
              updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/previousOwner`] = structure.owner;
              
              endMessage += ` The structure was captured by ${newOwnerName}!`;
            }
          }
        } else {
          // Defenders won (side 2), structure remains with current owner
          endMessage += ` The structure was successfully defended!`;
        }
      }
      
      // Clear battle flags from surviving groups
      for (const group of winningGroups) {
        if (!group.empty && group.unitCount > 0) {
          // Group survived - clear battle flags
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/inBattle`] = false;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleId`] = null;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleSide`] = null;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleRole`] = null;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/status`] = 'idle';
        }
      }
      
      ended = true;
    }
    
    return { updates, ended, endMessage };
  } catch (error) {
    logger.error(`Error processing battle ${battle.id}:`, error);
    return { updates, ended: false, endMessage: '' };
  }
}

/**
 * Process attrition for a group of units and handle removal of empty groups
 * Returns updates to be applied to the database and the remaining power
 */
function processGroupAttrition(worldId, chunkKey, locationKey, groups, attritionRate, battleId, db) {
  const updates = {};
  let remainingPower = 0;
  const playersKilled = [];
  
  for (const group of groups) {
    // Skip groups that don't have units
    if (!group.units) continue;
    
    const units = typeof group.units === 'object' ? Object.entries(group.units) : [];
    
    // For small battles, use probability-based attrition
    let unitLosses = 0;
    
    if (units.length <= 5) {
      // For small groups (5 or fewer units), use probability for each unit
      for (let i = 0; i < units.length; i++) {
        if (Math.random() < attritionRate) {
          unitLosses++;
        }
      }
    } else {
      // For larger groups, use the deterministic approach with minimum loss
      unitLosses = Math.ceil(units.length * attritionRate);
      // Ensure at least one unit is lost if there are units and attrition rate > 5%
      if (units.length > 0 && unitLosses === 0 && attritionRate > 0.05) {
        unitLosses = 1;
      }
    }
    
    // Separate player units and non-player units
    const playerUnits = [];
    const nonPlayerUnits = [];
    
    for (const [unitId, unit] of units) {
      if (unit.type === 'player') {
        playerUnits.push([unitId, unit]);
      } else {
        nonPlayerUnits.push([unitId, unit]);
      }
    }
    
    // Remove non-player units first
    const unitsToRemove = [];
    
    while (unitLosses > 0 && nonPlayerUnits.length > 0) {
      const randomIndex = Math.floor(Math.random() * nonPlayerUnits.length);
      const [unitId, unit] = nonPlayerUnits.splice(randomIndex, 1)[0];
      unitsToRemove.push(unitId);
      unitLosses--;
    }
    
    // If we still need to remove more units, start removing player units
    // But make player units more resilient in small battles
    if (unitLosses > 0 && playerUnits.length > 0) {
      // For small groups where player is alone or nearly alone, give them more protection
      if (playerUnits.length === 1 && units.length <= 3) {
        // 50% chance to avoid death in 1v1 or small battles
        if (Math.random() > 0.5) {
          unitLosses = 0;
        }
      }
      
      while (unitLosses > 0 && playerUnits.length > 0) {
        const randomIndex = Math.floor(Math.random() * playerUnits.length);
        const [unitId, unit] = playerUnits.splice(randomIndex, 1)[0];
        unitsToRemove.push(unitId);
        
        // Track player deaths
        playersKilled.push({
          playerId: unit.id,
          groupId: group.id
        });
        
        unitLosses--;
      }
    }
    
    // Remove units from the group
    for (const unitId of unitsToRemove) {
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/units/${unitId}`] = null;
    }
    
    // Calculate remaining units
    const remainingUnits = units.length - unitsToRemove.length;
    
    // Update unit count
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/unitCount`] = remainingUnits;
    
    // Add remaining power from this group
    remainingPower += remainingUnits;
    
    // If group has no units left, remove it completely
    if (remainingUnits === 0) {
      // Remove the group entirely
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] = null;
      
      // If this was a player's group, update their record
      if (group.owner) {
        updates[`players/${group.owner}/worlds/${worldId}/groups/${group.id}`] = null;
        
        // If player was in this group, update their status
        if (group.units) {
          const units = typeof group.units === 'object' ? Object.values(group.units) : [];
          for (const unit of units) {
            if (unit.type === 'player' && unit.id === group.owner) {
              // Player was in this group that got wiped out
              updates[`players/${group.owner}/worlds/${worldId}/inGroup`] = null;
            }
          }
        }
      }
    }
  }
  
  // Handle player deaths
  for (const { playerId, groupId } of playersKilled) {
    // Update player record to mark as dead
    updates[`players/${playerId}/worlds/${worldId}/alive`] = false;
    updates[`players/${playerId}/worlds/${worldId}/lastDeathTime`] = Date.now();
    updates[`players/${playerId}/worlds/${worldId}/lastMessage`] = 
      `You died in battle at (${locationKey}) while in group ${groupId}.`;
    
    // Create death notification
    const deathMessageId = `death_${Date.now()}_${playerId}`;
    updates[`worlds/${worldId}/chat/${deathMessageId}`] = {
      text: `A player has died in battle at (${locationKey}).`,
      type: 'death',
      timestamp: Date.now(),
      location: {
        x: parseInt(locationKey.split(',')[0]),
        y: parseInt(locationKey.split(',')[1])
      }
    };
  }
  
  return { updates, remainingPower };
}

/**
 * Process structure attrition in battle
 */
function processStructureAttrition(worldId, chunkKey, locationKey, structure, damageRate, battleId, db) {
  const updates = {};
  let destroyed = false;
  
  // Initialize structure health if not present
  const health = structure.health || 100;
  
  // Calculate damage based on damage rate
  // Higher tier structures are more resilient
  let structureDamageMultiplier = 1.0;
  if (structure.tier) {
    structureDamageMultiplier = 1.0 - (structure.tier * 0.15); // Each tier reduces damage by 15%
  }
  
  // Calculate damage this tick
  const damage = Math.ceil(damageRate * 100 * structureDamageMultiplier);
  
  // Apply damage to structure
  let newHealth = Math.max(0, health - damage);
  
  // Update structure health
  updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/health`] = newHealth;
  
  // Check if structure is destroyed
  if (newHealth === 0) {
    // Mark structure as destroyed but don't remove it yet
    // This will be handled in endBattle if the attackers win
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/destroyed`] = true;
    destroyed = true;
  }
  
  return { updates, destroyed };
}

/**
 * Calculate the total combat power of groups on a side
 */
function calculateSidePower(groups) {
  return groups.reduce((total, group) => {
    // If we have units, count them
    if (group.units) {
      const units = typeof group.units === 'object' ? 
        (Array.isArray(group.units) ? group.units.length : Object.keys(group.units).length) : 
        0;
      return total + units;
    }
    // Otherwise use unitCount or default to 0
    return total + (group.unitCount || 0);
  }, 0);
}

/**
 * Calculate structure power
 */
function calculateStructurePower(structure) {
  if (!structure) return 0;
  
  // Base power by structure type
  let basePower = 5;
  
  switch (structure.type) {
    case 'spawn':
      basePower = 15;
      break;
    case 'fortress':
      basePower = 30;
      break;
    case 'watchtower':
      basePower = 10;
      break;
    case 'stronghold':
      basePower = 25;
      break;
    default:
      basePower = 5;
  }
  
  return basePower;
}

/**
 * Get chunk coordinates for a location
 */
function getChunkKey(x, y) {
  const CHUNK_SIZE = 20;
  // Simple integer division works for both positive and negative coordinates
  const chunkX = Math.floor(x / CHUNK_SIZE);
  const chunkY = Math.floor(y / CHUNK_SIZE);
  return `${chunkX},${chunkY}`;
}
