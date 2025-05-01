import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions';

/**
 * Handles battle progression for each tick of the game
 * Applies attrition to units, removes dead groups, distributes items,
 * and determines battle outcomes
 */
export async function processBattles(worldId) {
  const db = getDatabase();
  
  try {
    logger.info(`Processing battle tick for world: ${worldId}`);
    
    // Instead of getting battles from top-level, get all chunks in this world
    const chunksRef = db.ref(`worlds/${worldId}/chunks`);
    const chunksSnapshot = await chunksRef.once('value');
    const chunks = chunksSnapshot.val() || {};
    
    const now = Date.now();

    // Fix for the ancestor path conflict
    for (const chunkKey in chunks) {
      const chunk = chunks[chunkKey];
      for (const locationKey in chunk) {
        const location = chunk[locationKey];
        
        // Process battles at this location
        if (location.battles) {
          for (const battleId in location.battles) {
            const battle = location.battles[battleId];
            
            // Process this battle and get updates
            const { updates, ended, endMessage } = 
              await processBattleTick(worldId, chunkKey, locationKey, battle, db);
            
            if (Object.keys(updates).length > 0) {
              // IMPROVED: Consolidate updates to avoid ancestor path conflicts
              const consolidatedUpdates = {};
              
              // Process each update to detect and resolve conflicts
              for (const path in updates) {
                safelyApplyUpdate(consolidatedUpdates, path, updates[path]);
              }
              
              // Apply consolidated updates
              await db.ref().update(consolidatedUpdates);
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Error processing battles for world: ${worldId}`, error);
    throw error;
  }
}

/**
 * Helper function to set a nested property in an object
 * Creates the path if it doesn't exist
 */
function setNestedProperty(obj, pathArray, value) {
  let current = obj;
  for (let i = 0; i < pathArray.length - 1; i++) {
    const key = pathArray[i];
    if (!current[key]) {
      current[key] = {};
    }
    current = current[key];
  }
  current[pathArray[pathArray.length - 1]] = value;
}

/**
 * Helper function to safely merge updates and avoid ancestor path conflicts
 * @param {Object} updates - The updates object to modify
 * @param {string} path - The path to update
 * @param {any} value - The value to set
 */
function safelyApplyUpdate(updates, path, value) {
  // Check if we're already updating an ancestor of this path
  const pathParts = path.split('/');
  let currentPath = '';
  
  for (let i = 0; i < pathParts.length - 1; i++) {
    currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i];
    
    if (updates[currentPath] !== undefined) {
      // We're updating an ancestor - need to merge this update into the ancestor
      let target = updates[currentPath];
      let remainingParts = pathParts.slice(i + 1);
      
      // Navigate to the right spot in the object
      for (let j = 0; j < remainingParts.length - 1; j++) {
        const part = remainingParts[j];
        if (!target[part]) target[part] = {};
        target = target[part];
      }
      
      // Set the final property
      target[remainingParts[remainingParts.length - 1]] = value;
      return;
    }
  }
  
  // Check if we're updating descendants of this path
  const prefix = `${path}/`;
  const conflictingKeys = Object.keys(updates).filter(key => key.startsWith(prefix));
  
  if (conflictingKeys.length > 0) {
    // We're already updating descendants - merge those updates into this one
    const mergedValue = typeof value === 'object' && value !== null ? { ...value } : {};
    
    for (const key of conflictingKeys) {
      const relativePath = key.substring(prefix.length);
      const parts = relativePath.split('/');
      
      let target = mergedValue;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!target[part]) target[part] = {};
        target = target[part];
      }
      
      target[parts[parts.length - 1]] = updates[key];
      delete updates[key]; // Remove the descendant update
    }
    
    updates[path] = mergedValue;
  } else {
    // No conflicts, apply normally
    updates[path] = value;
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
    
    // Get current state of all players in the battle location
    const playersRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/players`);
    const playersSnapshot = await playersRef.once('value');
    const players = playersSnapshot.val() || {};
    
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
    
    // Log any issues with battle sides
    if (side1Groups.length === 0) {
      logger.info(`Battle ${battle.id} at ${chunkKey}/${locationKey} has empty side 1`);
    }
    if (side2Groups.length === 0) {
      logger.info(`Battle ${battle.id} at ${chunkKey}/${locationKey} has empty side 2`);
    }
    
    // Calculate initial power for each side
    let side1Power = calculateSidePower(side1Groups);
    let side2Power = calculateSidePower(side2Groups);
    
    // Add structure power to side 2 if present
    if (structure && structure.inBattle && structure.battleId === battle.id) {
      side2Power += calculateStructurePower(structure);
    }
    
    // CRITICAL FIX: If either side starts with no power or no groups, resolve the battle immediately
    if (side1Power === 0 || side2Power === 0 || side1Groups.length === 0 || side2Groups.length === 0) {
      // Determine the winner based on power and group presence
      const winner = (side1Power > 0 && side1Groups.length > 0) ? 1 : 2;
      const now = Date.now();
      
      // Determine side names for better messaging
      const side1Name = battle.side1?.name || 'Side 1';
      const side2Name = battle.side2?.name || 'Side 2';
      const winnerName = winner === 1 ? side1Name : side2Name;
      const loserName = winner === 1 ? side2Name : side1Name;
      
      logger.info(`Resolving battle ${battle.id} at ${chunkKey}/${locationKey}: Side ${winner} (${winnerName}) wins with ${winner === 1 ? side1Power : side2Power} power`);
      
      // Create end message and mark battle as ended
      endMessage = `Battle at (${battle.locationX || locationKey.split(',')[0]}, ${battle.locationY || locationKey.split(',')[1]}) has ended! ${winnerName} has defeated ${loserName}!`;
      
      // End battle and clean up side information
      const winningGroups = winner === 1 ? side1Groups : side2Groups;
      
      // Clean up winning groups
      for (const group of winningGroups) {
        if (!group.empty && group.unitCount > 0) {
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/inBattle`] = false;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleId`] = null;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleSide`] = null;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/battleRole`] = null;
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/status`] = 'idle';
        }
      }
      
      // Clean up structure if involved
      if (structure && structure.inBattle && structure.battleId === battle.id) {
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/inBattle`] = false;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/structure/battleId`] = null;
      }
      
      // Delete battle
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}`] = null;
      
      ended = true;
      return { updates, ended, endMessage };
    }
    
    // Calculate advantage and attrition for this tick
    const totalPower = side1Power + side2Power;
    const powerRatio = Math.min(side1Power, side2Power) / Math.max(side1Power, side2Power);
    
    // Determine if either side has overwhelming advantage (20x or more power)
    const OVERWHELMING_ADVANTAGE_THRESHOLD = 0.05; // 1/20 = 0.05
    const side1HasOverwhelmingAdvantage = side1Power >= side2Power * 20;
    const side2HasOverwhelmingAdvantage = side2Power >= side1Power * 20;
    
    // Scale attrition based on battle size - smaller battles should resolve faster
    const totalUnits = side1Power + side2Power;
    
    // Target number of ticks the battle should last (on average)
    // Adjusted for faster small battles:
    // - 1v1 battles: ~1-2 ticks
    // - 5v5 battles: ~3-4 ticks
    // - larger battles: scale up gradually
    const TARGET_BATTLE_DURATION = Math.ceil(2 + Math.sqrt(totalUnits) / 2);
    
    // Calculate base attrition rate to achieve target duration
    // Higher minimum attrition rate for small battles
    const minAttritionRate = totalUnits <= 4 ? 0.3 : 0.15; 
    const baseAttritionRate = Math.max(minAttritionRate, (0.7 / TARGET_BATTLE_DURATION) + (powerRatio * 0.05));
    
    // Apply escalation factor - battles get bloodier over time
    // Increased early-battle escalation rate for small battles
    const tickCount = battle.tickCount || 1;
    const escalationFactor = totalUnits <= 4 ? 
      1.0 + (Math.sqrt(tickCount) * 0.3) :  // Faster escalation for small battles
      1.0 + (Math.sqrt(tickCount - 1) * 0.15); // Normal escalation for larger battles
    
    // Calculate actual attrition rates with escalation
    let side1AttritionRate = baseAttritionRate * escalationFactor;
    let side2AttritionRate = baseAttritionRate * escalationFactor;
    
    // Apply overwhelming advantage - side with massive advantage takes no losses
    if (side1HasOverwhelmingAdvantage) {
      side1AttritionRate = 0; // Dominant side takes no losses
      side2AttritionRate *= 1.5; // Weaker side takes more losses
      
      // Add advantage event if not already present
      if (!battle.advantage || battle.advantage.side !== 1 || battle.advantage.strength < 0.8) {
        const overwhelmingEvent = {
          type: 'battle_overwhelming_advantage',
          timestamp: Date.now(),
          text: `${battle.side1?.name || 'Side 1'} has an overwhelming advantage! They take no casualties while inflicting heavy losses.`,
        };
        
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/events`] = 
          [...(battle.events || []), overwhelmingEvent];
        
        // Update battle advantage
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/advantage/side`] = 1;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/advantage/strength`] = 0.9;
      }
    } 
    else if (side2HasOverwhelmingAdvantage) {
      side2AttritionRate = 0; // Dominant side takes no losses
      side1AttritionRate *= 1.5; // Weaker side takes more losses
      
      // Add advantage event if not already present
      if (!battle.advantage || battle.advantage.side !== 2 || battle.advantage.strength < 0.8) {
        const overwhelmingEvent = {
          type: 'battle_overwhelming_advantage',
          timestamp: Date.now(),
          text: `${battle.side2?.name || 'Side 2'} has an overwhelming advantage! They take no casualties while inflicting heavy losses.`,
        };
        
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/events`] = 
          [...(battle.events || []), overwhelmingEvent];
        
        // Update battle advantage
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/advantage/side`] = 2;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/advantage/strength`] = 0.9;
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
      db,
      players // Pass players data to clean up player entries
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
      db,
      players // Pass players data to clean up player entries
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
    
    // IMPROVED: Check if either side has no surviving groups after attrition
    // Count groups that will still exist after updates are applied
    const side1Survivors = side1Groups.filter(group => {
      return !group.empty && updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] !== null;
    }).length;
    
    const side2Survivors = side2Groups.filter(group => {
      return !group.empty && updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] !== null;
    }).length;
    
    // Check if battle should end based on remaining groups or power
    if (side1Survivors === 0 || side2Survivors === 0 || side1Power === 0 || side2Power === 0) {
      // Determine the winner based on survivors
      const winner = (side1Survivors > 0 && side1Power > 0) ? 1 : 2;
      const now = Date.now();
      
      // Get the groups that survived
      const winningGroups = winner === 1 ? 
        side1Groups.filter(g => !g.empty && updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${g.id}`] !== null) : 
        side2Groups.filter(g => !g.empty && updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${g.id}`] !== null);
      
      const losingGroups = winner === 1 ? 
        side2Groups.filter(g => !g.empty && updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${g.id}`] !== null) : 
        side1Groups.filter(g => !g.empty && updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${g.id}`] !== null);
      
      // Determine side names for better messaging
      const side1Name = battle.side1?.name || 'Side 1';
      const side2Name = battle.side2?.name || 'Side 2';
      const winnerName = winner === 1 ? side1Name : side2Name;
      const loserName = winner === 1 ? side2Name : side1Name;
      
      logger.info(`Battle ${battle.id} at ${chunkKey}/${locationKey} has concluded. Side ${winner} (${winnerName}) wins with ${winningGroups.length} surviving groups.`);
      
      // Create a final battle end event
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
      // This stays the same as before
      
      // Clear battle flags from surviving groups
      for (const group of winningGroups) {
        // FIXED: Create a consolidated update for each group rather than individual field updates
        const groupUpdates = {
          inBattle: false,
          battleId: null,
          battleSide: null,
          battleRole: null,
          status: 'idle'
        };
        
        // Apply consolidated update to the group
        updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] = 
          { ...group, ...groupUpdates };
      }
      
      // Set end message and mark battle as ended
      endMessage = `Battle at (${locationKey.split(',')[0]}, ${locationKey.split(',')[1]}) has ended! ${winnerName} has defeated ${loserName}!`;
      ended = true;
      
      return { updates, ended, endMessage };
    }
    
    // Add battle tick event if battle continues
    const tickEvent = {
      type: 'battle_tick',
      timestamp: Date.now(),
      text: `The battle continues${tickCount > 3 ? ' with increasing ferocity' : ''}! Side 1 has ${side1Power} strength remaining. Side 2 has ${side2Power} strength remaining.`,
    };
    
    updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battle.id}/events`] = 
      [...(battle.events || []), tickEvent];
    
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
function processGroupAttrition(worldId, chunkKey, locationKey, groups, attritionRate, battleId, db, locationPlayers) {
  // If attrition rate is zero, return immediately with no changes
  if (attritionRate === 0) {
    const remainingPower = calculateSidePower(groups);
    return { updates: {}, remainingPower };
  }
  
  const updates = {};
  let remainingPower = 0;
  const playersKilled = [];
  
  for (const group of groups) {
    // Skip groups that don't have units
    if (!group.units) continue;
    
    const units = typeof group.units === 'object' ? Object.entries(group.units) : [];
    
    // Calculate unit losses using a unified scaling algorithm
    let unitLosses = 0;
    const groupSize = units.length;
    
    // For tiny groups (1-2 units), increase baseline probability of casualties
    // to ensure battles resolve quickly
    const expectedLosses = groupSize <= 2 ? 
      groupSize * Math.max(0.5, attritionRate) : // Higher minimum for tiny groups
      groupSize * attritionRate;
    
    // For very small groups (or individual units), use pure probability
    const deterministicLosses = Math.floor(expectedLosses);
    const remainderProbability = expectedLosses - deterministicLosses;
    
    // Apply deterministic losses first
    unitLosses = deterministicLosses;
    
    // Then apply probabilistic component for the remainder
    if (Math.random() < remainderProbability) {
      unitLosses += 1;
    }
    
    // Apply consistency factor - modified for faster small battle resolution
    const consistencyFactor = groupSize <= 2 ? 
      0.85 : // Increased consistency for tiny groups
      1 - Math.min(0.9, 1 / Math.sqrt(groupSize + 1));
    
    if (unitLosses === 0 && Math.random() < consistencyFactor && attritionRate > 0.05) {
      unitLosses = 1; // Minimum loss threshold with probability based on group size
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
    
    // IMPROVED: If we still need to remove more units, handle player units with improved cleanup
    if (unitLosses > 0 && playerUnits.length > 0) {
      // Solo player protection factor reduced for faster battle resolution
      const playerProtectionFactor = Math.max(0, 0.7 - (nonPlayerUnits.length / 10));
      
      // Small battles (1v1, 1v2) should resolve faster with higher player death chance
      if (groupSize <= 2 && attritionRate > 0.3) {
        // In small battles with high attrition, remove player with higher probability
        if (Math.random() > playerProtectionFactor * 0.7) {
          unitLosses = Math.max(1, unitLosses);
        }
      } else if (Math.random() < playerProtectionFactor) {
        unitLosses = 0; // Player survives this round in larger battles
      }
      
      while (unitLosses > 0 && playerUnits.length > 0) {
        const randomIndex = Math.floor(Math.random() * playerUnits.length);
        const [unitId, unit] = playerUnits.splice(randomIndex, 1)[0];
        unitsToRemove.push(unitId);
        
        // Track player deaths with improved logging
        playersKilled.push({
          playerId: unit.id,
          displayName: unit.displayName || 'Unknown Player',
          groupId: group.id
        });
        
        // IMPROVED: Remove player from location players data
        if (locationPlayers && locationPlayers[unit.id]) {
          updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/players/${unit.id}`] = null;
        }
        
        unitLosses--;
      }
    }
    
    // Remove units from the group - Using Firebase's removal pattern with .remove()
    for (const unitId of unitsToRemove) {
      // Properly delete unit by setting to null with explicit key
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/units/${unitId}`] = null;
    }
    
    // Calculate remaining units - only count non-null units
    let remainingUnitCount = 0;
    if (group.units) {
      const allUnits = typeof group.units === 'object' ? Object.entries(group.units) : [];
      const removedUnitIds = new Set(unitsToRemove);
      
      // Count remaining units that are not in the removal list
      remainingUnitCount = allUnits.filter(([unitId]) => !removedUnitIds.has(unitId)).length;
    }
    
    // IMPROVED: Mark group as empty to help with battle conclusion checks
    group.empty = remainingUnitCount === 0;
    
    // If group has no units left, remove it completely
    if (remainingUnitCount === 0) {
      // Remove the group entirely from chunks
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] = null;
      
      // Remove the group's entry in the battle
      if (battleId) {
        const battlePath = `worlds/${worldId}/chunks/${chunkKey}/${locationKey}/battles/${battleId}`;
        
        // Remove group from side1 if it exists there
        updates[`${battlePath}/side1/groups/${group.id}`] = null;
        
        // Remove group from side2 if it exists there
        updates[`${battlePath}/side2/groups/${group.id}`] = null;
      }
      
      // If this was a player's group, update their record
      if (group.owner) {
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
    } else {
      // FIXED: Only update fields if we're not removing the entire group
      // This avoids ancestor path conflicts
      const groupUpdates = {
        unitCount: remainingUnitCount
      };

      // Apply all updates to the group at once
      updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}`] = 
        { ...group, ...groupUpdates };
        
      // Remove the unitCount path update since we've incorporated it into the group update
      delete updates[`worlds/${worldId}/chunks/${chunkKey}/${locationKey}/groups/${group.id}/unitCount`];
    }
    
    // Add this group's remaining power to the total
    remainingPower += calculateGroupPower(group, unitsToRemove);
  }
  
  // Handle player deaths with improved messaging and proper cleanup
  for (const { playerId, displayName, groupId } of playersKilled) {
    // Update player record to mark as dead
    updates[`players/${playerId}/worlds/${worldId}/alive`] = false;
    updates[`players/${playerId}/worlds/${worldId}/lastDeathTime`] = Date.now();
    updates[`players/${playerId}/worlds/${worldId}/lastMessage`] = {
      text: "You were defeated in battle.",
      timestamp: Date.now()
    };
    updates[`players/${playerId}/worlds/${worldId}/inGroup`] = null;
    
    // IMPROVED: Ensure we clean up all player location references
    updates[`players/${playerId}/worlds/${worldId}/lastLocation/timestamp`] = Date.now();
    
    // Clean up player-specific references in database
    updates[`players/${playerId}/worlds/${worldId}/currentLocation`] = null;
    
    // Log player death
    logger.info(`Player ${playerId} (${displayName}) killed in battle at ${locationKey}`);
    
    // Create death notification
    const deathMessageId = `death_${Date.now()}_${playerId}`;
    updates[`worlds/${worldId}/chat/${deathMessageId}`] = {
      text: `${displayName || 'A player'} has died in battle at (${locationKey}).`,
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
 * Calculate power for a specific group, accounting for units that will be removed
 */
function calculateGroupPower(group, unitsToRemove = []) {
  if (!group) return 0;
  
  // If group has units, calculate power based on remaining units after removal
  if (group.units) {
    const removedUnitIds = new Set(unitsToRemove);
    const units = typeof group.units === 'object' ? Object.entries(group.units) : [];
    // Count units that aren't being removed
    const remainingUnits = units.filter(([unitId]) => !removedUnitIds.has(unitId)).length;
    return remainingUnits;
  }
  
  // Otherwise use unitCount
  return group.unitCount || 0;
}

/**
 * Calculate the total combat power of groups on a side
 */
function calculateSidePower(groups) {
  return groups.reduce((total, group) => {
    // Skip empty groups
    if (group.empty) return total;
    
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