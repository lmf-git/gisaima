import { logger } from "firebase-functions";
import { 
  calculateGroupPower, 
  calculatePowerRatios, 
  calculateAttrition, 
  selectUnitsForCasualties,
} from "gisaima-shared/war/battles.js";
import { STRUCTURES } from "gisaima-shared/definitions/STRUCTURES.js";

export function processSide({
  sideNumber, 
  sideGroups, 
  sidePower, 
  oppositeAttrition, 
  sideCasualties,
  updates,
  groupPowers,
  groupsToBeDeleted,
  groupsToDelete,
  playersKilled,
  battleLoot,
  tile,
  worldId, 
  chunkKey, 
  tileKey,
  basePath,
  fleeingGroups
}) {
  let newSidePower = 0;
  let updatedCasualties = sideCasualties;
  const sideKey = `side${sideNumber}`;
  
  for (const groupId in sideGroups) {
    if (!tile.groups[groupId]) continue;
    
    const group = tile.groups[groupId];
    
    // Handle groups that are in fleeingBattle state
    if (group.status === 'fleeingBattle') {
      logger.info(`Processing fleeing group ${groupId} in battle - cleaning up and removing from side ${sideNumber}`);
      
      // Remove the group from battle
      const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
      
      // Update the group status to idle and remove all battle references
      updates[`${groupPath}/battleId`] = null;
      updates[`${groupPath}/battleSide`] = null;
      updates[`${groupPath}/battleRole`] = null;
      updates[`${groupPath}/status`] = 'idle';
      updates[`${groupPath}/fleeTickRequested`] = null;
      
      // Remove the group from the battle's side
      updates[`${basePath}/${sideKey}/groups/${groupId}`] = null;
      
      // Track this group as being processed for fleeing
      fleeingGroups.push({
        groupId,
        side: sideNumber,
        name: group.name || "Unknown group"
      });
      
      // Skip the rest of battle processing for this group
      continue;
    }
    
    const units = group.units || {};
    
    // Use the stored group power
    const groupPower = groupPowers[groupId];
    const groupShare = sidePower > 0 ? groupPower / sidePower : 1;
    const groupAttrition = Math.round(oppositeAttrition * groupShare);
    
    // Log the attrition calculation
    logger.info(`Side ${sideNumber} Group ${groupId} attrition calculation: ${oppositeAttrition} * ${groupShare.toFixed(2)} = ${groupAttrition}`);
    
    // Select units for casualties
    const { unitsToRemove, playersKilled: groupPlayersKilled } = 
      selectUnitsForCasualties(units, groupAttrition);
      
    // Log the units selected for removal
    logger.info(`Side ${sideNumber} Group ${groupId} units to remove: ${JSON.stringify(unitsToRemove)}`);
    
    // Add players killed to the list
    playersKilled.push(...groupPlayersKilled);
    
    // Calculate remaining units
    const remainingUnits = { ...units };
    unitsToRemove.forEach(unitId => delete remainingUnits[unitId]);
    const newUnitCount = Object.keys(remainingUnits).length;
    
    // Update casualty count
    const casualties = unitsToRemove.length;
    updatedCasualties += casualties;
    updates[`${basePath}/${sideKey}/casualties`] = updatedCasualties;
    
    // Check if the group will be destroyed
    if (newUnitCount <= 0) {
      // Add to deletion tracking
      const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
      groupsToBeDeleted.add(groupPath);
      
      groupsToDelete.push({
        side: sideNumber,
        groupId,
        path: groupPath
      });
      
      // Remove group from battle and database
      updates[`${basePath}/${sideKey}/groups/${groupId}`] = null;
      updates[groupPath] = null;
      
      // Handle players in group
      for (const unitId in units) {
        if (units[unitId].type === 'player' && units[unitId].id) {
          updates[`players/${units[unitId].id}/worlds/${worldId}/inGroup`] = null;
        }
      }
      
      // Collect loot from defeated group
      if (group.items) {
        const items = Array.isArray(group.items) ? group.items : Object.values(group.items);
        if (items.length > 0) {
          const now = Date.now();
          const lootItems = items.map(item => ({
            ...item,
            lootedFrom: 'battle',
            lootedAt: now,
            sourceSide: sideNumber // Track which side the loot came from
          }));
          
          // Add to central battle loot pool instead of side-specific arrays
          battleLoot.push(...lootItems);
        }
      }
    } else {
      // Remove selected units - adding explicit logging for each update path
      unitsToRemove.forEach(unitId => {
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/units/${unitId}`] = null;
        updates[`${basePath}/${sideKey}/groups/${groupId}/units/${unitId}`] = null;
      });
      
      // Calculate new group power
      const newGroupPower = calculateGroupPower({ units: remainingUnits });
      logger.info(`Group ${groupId} new power after casualties: ${newGroupPower} (removed ${unitsToRemove.length} units)`);
      newSidePower += newGroupPower;
    }
  }
  
  return { newSidePower, updatedCasualties };
};

export function distributeLootToWinner({
  winner,
  battleLoot,
  side1Surviving,
  side2Surviving,
  worldId,
  chunkKey,
  tileKey,
  updates
}) {
  if (battleLoot.length === 0) return;
  
  let winnerGroups = [];
  if (winner === 1) {
    winnerGroups = side1Surviving;
  } else if (winner === 2) {
    winnerGroups = side2Surviving;
  }
  
  if (winnerGroups.length > 0) {
    // Select a random surviving group from winning side
    const receivingGroupId = winnerGroups[Math.floor(Math.random() * winnerGroups.length)];
    
    battleLoot.forEach(item => {
      const itemId = item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${receivingGroupId}/items/${itemId}`] = item;
    });
    
  } else if (winner !== 0) {
    // If winner is determined but no surviving groups, leave loot on tile
    // This creates a "treasure" for other groups to find later
    battleLoot.forEach(item => {
      const itemId = item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/items/${itemId}`] = item;
    });
  }
};

export async function processBattle(worldId, chunkKey, tileKey, battleId, battle, updates, tile) {
  try {
    // Use serverTimestamp for database records only
    const basePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`;
    
    // Create a separate updates object for battle-specific updates to avoid path conflicts
    const battleUpdates = {};
    
    // Track groups that will be deleted to avoid update conflicts
    const groupsToBeDeleted = new Set();
    
    // Track groups that are fleeing
    const fleeingGroups = [];
    
    // Increment the tick count - this is now our primary battle progression metric
    const tickCount = (battle.tickCount || 0) + 1;
    battleUpdates.tickCount = tickCount;
    
    // Get sides data
    const side1 = battle.side1;
    const side2 = battle.side2;
    
    // --------- PHASE 1: CALCULATE INITIAL POWERS ---------
    // Recalculate power values using strength-based calculation
    let side1Power = 0;
    let side2Power = 0;
    
    // Store individual group powers to avoid recalculating later
    const groupPowers = {};
    
    // Calculate side1 power by summing individual group powers
    const side1Groups = side1.groups || {};
    for (const groupId in side1Groups) {
      if (tile.groups[groupId]) {
        const group = tile.groups[groupId];
        const power = calculateGroupPower(group);
        groupPowers[groupId] = power;
        side1Power += power;
        console.log(`Side 1 Group ${groupId} calculated power: ${power}`);
      }
    }
    
    // Calculate side2 power by summing individual group powers
    const side2Groups = side2.groups || {};
    for (const groupId in side2Groups) {
      if (tile.groups[groupId]) {
        const group = tile.groups[groupId];
        const power = calculateGroupPower(group);
        groupPowers[groupId] = power;
        side2Power += power;
        console.log(`Side 2 Group ${groupId} calculated power: ${power}`);
      }
    }
    
    // Add structure power if applicable - now using STRUCTURES definition
    let structurePower = 0;
    if (battle.structureId && tile.structure && tile.structure.type) {
      const structureType = tile.structure.type;
      if (STRUCTURES[structureType]) {
        structurePower = STRUCTURES[structureType].durability || 0;
        side2Power += structurePower;
        console.log(`Structure power from ${structureType} durability: ${structurePower}`);
      }
    }
    
    // Add a small random factor to prevent exact power equality and eventual stalemates
    // This ensures battles will eventually resolve even with identical forces
    const randomFactor = 0.05; // 5% maximum random variance
    side1Power = side1Power * (1 + (Math.random() * randomFactor - randomFactor/2));
    side2Power = side2Power * (1 + (Math.random() * randomFactor - randomFactor/2));
    
    console.log(`Final battle powers - Side 1: ${side1Power}, Side 2: ${side2Power}`);
    
    // --------- PHASE 2: CALCULATE ATTRITION ---------
    // Use the new functions to calculate power ratios and attrition
    const { side1Ratio, side2Ratio } = calculatePowerRatios(side1Power, side2Power);
    let side1Attrition = calculateAttrition(side1Power, side1Ratio, side2Ratio);
    let side2Attrition = calculateAttrition(side2Power, side2Ratio, side1Ratio);

    // If both sides have power but no calculated attrition (edge case),
    // ensure at least one side takes attrition to guarantee battle progress
    if (side1Power > 0 && side2Power > 0 && side1Attrition === 0 && side2Attrition === 0) {
      const randomSide = Math.random() < 0.5 ? 1 : 2;
      if (randomSide === 1) {
        side1Attrition = 1;
      } else {
        side2Attrition = 1;
      }
    }

    console.log('side1 attrition', side1Attrition);
    console.log('side2 attrition', side2Attrition);
    
    // --------- PHASE 3: APPLY CASUALTIES AND CALCULATE NEW POWERS ---------
    // Initialize casualty counts and battle updates
    let newSide1Power = 0;
    let newSide2Power = 0;
    
    // Initialize casualty counts from battle's existing values
    let side1Casualties = (side1.casualties || 0);
    let side2Casualties = (side2.casualties || 0);
    
    // Make sure our battle updates will preserve these values
    updates[`${basePath}/side1/casualties`] = side1Casualties;
    updates[`${basePath}/side2/casualties`] = side2Casualties;
    
    // Track groups to be deleted and players to be killed
    const groupsToDelete = [];
    const playersKilled = [];
    
    const battleLoot = battle.loot || [];

    // Process both sides using the extracted helper function - now with fleeingGroups parameter
    const side1Result = processSide({
      sideNumber: 1,
      sideGroups: side1Groups,
      sidePower: side1Power,
      oppositeAttrition: side2Attrition,
      sideCasualties: side1Casualties,
      updates,
      groupPowers,
      groupsToBeDeleted,
      groupsToDelete,
      playersKilled,
      battleLoot,
      tile,
      worldId,
      chunkKey,
      tileKey,
      basePath,
      fleeingGroups
    });
    newSide1Power = side1Result.newSidePower;
    side1Casualties = side1Result.updatedCasualties;
    
    const side2Result = processSide({
      sideNumber: 2,
      sideGroups: side2Groups,
      sidePower: side2Power,
      oppositeAttrition: side1Attrition,
      sideCasualties: side2Casualties,
      updates,
      groupPowers,
      groupsToBeDeleted,
      groupsToDelete,
      playersKilled,
      battleLoot,
      tile,
      worldId,
      chunkKey,
      tileKey,
      basePath,
      fleeingGroups
    });
    newSide2Power = side2Result.newSidePower;
    side2Casualties = side2Result.updatedCasualties;
    
    // Add structure power if applicable - now using the same structurePower variable
    if (structurePower > 0) {
      newSide2Power += structurePower;
    }
    
    // Add battle events for any fleeing groups
    if (fleeingGroups.length > 0) {
      // Create a new event for each fleeing group
      fleeingGroups.forEach(fleeGroup => {
        const newEvent = {
          type: 'flee',
          tickCount: tickCount,
          text: `${fleeGroup.name} has fled from the battle!`,
          groupId: fleeGroup.groupId,
          side: fleeGroup.side
        };
        
        // Only add battle events if the battle will continue
        if (side1Surviving.length > 0 && side2Surviving.length > 0) {
          if (!battle.events) battle.events = [];
          battle.events.push(newEvent);
        }
      });
      
      // Update battle events if battle continues
      if (side1Surviving.length > 0 && side2Surviving.length > 0) {
        updates[`${basePath}/events`] = battle.events;
      }
    }
    
    // Get surviving groups for both sides AFTER handling fleeing groups
    const side1Surviving = Object.keys(side1Groups)
      .filter(id => 
        !groupsToDelete.some(g => g.groupId === id && g.side === 1) && 
        !fleeingGroups.some(g => g.groupId === id && g.side === 1));
    
    const side2Surviving = Object.keys(side2Groups)
      .filter(id => 
        !groupsToDelete.some(g => g.groupId === id && g.side === 2) &&
        !fleeingGroups.some(g => g.groupId === id && g.side === 2));
    
    // Log the status of all updates
    logger.info(`Battle ${battleId} tick ${tickCount} update operations: ${Object.keys(updates).length}`);
    logger.info(`Side 1 units attrition: ${side1Attrition}, casualties: ${side1Casualties}, surviving groups: ${side1Surviving.length}`);
    logger.info(`Side 2 units attrition: ${side2Attrition}, casualties: ${side2Casualties}, surviving groups: ${side2Surviving.length}`);
    
    // --------- PHASE 4: CHECK FOR BATTLE END CONDITIONS ---------
    
    // A battle ends when one side has no power left or after many ticks with minimal progress
    const side1Defeated = side1Surviving.length === 0;
    
    // For side2, consider structure as a valid combat entity on its own
    // A structure with significant health should count as "not defeated" even without groups
    let side2Defeated = false;
    
    if (battle.structureId && tile.structure && structurePower > 0) {
      // Get current structure health
      const structureType = tile.structure.type;
      const maxDurability = STRUCTURES[structureType]?.durability || 100;
      const currentHealth = tile.structure.health !== undefined ? tile.structure.health : maxDurability;
      const criticalThreshold = Math.floor(maxDurability * 0.15);
      
      // Structure is only defeated if its health is critically low
      if (currentHealth <= criticalThreshold) {
        side2Defeated = true;
        console.log(`Structure health critical (${currentHealth}/${maxDurability}), side2 considered defeated`);
      } else {
        // Structure has sufficient health to continue fighting
        console.log(`Structure defending with ${currentHealth}/${maxDurability} health, side2 not defeated`);
      }
    } else {
      // No structure or structure with no power, so check if there are any surviving groups
      side2Defeated = side2Surviving.length === 0;
    }
    
    // Determine the winner directly from defeat flags
    let winner;
    if (side1Defeated && side2Defeated) {
      winner = 0; // Draw - both sides defeated
      console.log("Battle ended in a draw: both sides defeated");
    } else if (side1Defeated && !side2Defeated) {
      winner = 2; // Side 2 wins (defenders/structure)
      console.log("Side 2 (defenders/structure) wins - side 1 defeated");
    } else if (!side1Defeated && side2Defeated) {
      winner = 1; // Side 1 wins (attackers)
      console.log("Side 1 (attackers) wins - side 2 defeated");
    } else {
      // Both sides still have forces - battle continues
      console.log("Battle continues - both sides still have forces");
    }
    
    // Process players killed in battle - this is missing in the original code
    if (playersKilled.length > 0) {
      console.log(`Processing ${playersKilled.length} players killed in battle ${battleId}`);
      
      // For each killed player, mark them as not alive and clear their group
      playersKilled.forEach(player => {
        const playerId = player.playerId;
        if (playerId) {
          // Set alive status to false
          updates[`players/${playerId}/worlds/${worldId}/alive`] = false;
          
          // Clear their group reference
          updates[`players/${playerId}/worlds/${worldId}/inGroup`] = null;
          
          // Add a clear death message to the player's record
          updates[`players/${playerId}/worlds/${worldId}/lastMessage`] = {
            text: "Died in battle",
            timestamp: Date.now()
          };
          
          console.log(`Player ${playerId} (${player.displayName}) killed in battle and marked as dead`);
          
          // Add a chat message about player death
          const chatMessageId = `player_death_${playerId}_${Date.now()}`;
          updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
            text: `${player.displayName || "A player"} has fallen in battle at (${battle.locationX}, ${battle.locationY})`,
            type: 'event',
            timestamp: Date.now(),
            location: {
              x: battle.locationX,
              y: battle.locationY
            }
          };
        }
      });
    }
    
    if (winner === undefined) {
      // Update battle tick count directly at the path
      updates[`${basePath}/tickCount`] = tickCount;
      // Update loot
      updates[`${basePath}/loot`] = battleLoot;
    } else {
      console.log(`Battle ${battleId} ending after ${tickCount} ticks. Power levels: Side 1: ${newSide1Power}, Side 2: ${newSide2Power}`);
      
      // Use the extracted function to distribute loot
      distributeLootToWinner({
        winner,
        battleLoot,
        side1Surviving,
        side2Surviving,
        worldId,
        chunkKey,
        tileKey,
        updates
      });
      
      // Generate side names for chat message
      const side1Name = battle.side1.name || 'Attackers';
      const side2Name = battle.side2.name || 'Defenders';
      let resultText = '';
      
      if (winner === 1) {
        resultText = `${side1Name} have defeated ${side2Name}!`;
      } else if (winner === 2) {
        resultText = `${side2Name} have successfully defended against ${side1Name}!`;
      } else {
        resultText = `The battle between ${side1Name} and ${side2Name} has ended in a stalemate.`;
      }
      
      // Add chat message about battle ending
      const now = Date.now();
      updates[`worlds/${worldId}/chat/battle_end_${now}_${battleId}`] = {
        text: `Battle at (${battle.locationX}, ${battle.locationY}) has ended. ${resultText}`,
        type: 'event',
        timestamp: now,
        location: {
          x: battle.locationX,
          y: battle.locationY
        }
      };
      
      if (tile && tile.groups) {
        // Log battle result for debugging
        logger.debug(`Battle ${battleId} ended. Winner: ${winner === 1 ? side1Name : (winner === 2 ? side2Name : 'Draw')}`);
        logger.debug(`Side 1 groups: ${JSON.stringify(Object.keys(battle.side1.groups || {}))}`);
        logger.debug(`Side 2 groups: ${JSON.stringify(Object.keys(battle.side2.groups || {}))}`);
        
        // Clean up ALL groups that were in the battle, regardless of winner
        const allBattleGroups = {
          ...battle.side1.groups || {},
          ...battle.side2.groups || {}
        };
        
        logger.debug(`Cleaning up ${Object.keys(allBattleGroups).length} groups from battle`);
        
        for (const groupId in allBattleGroups) {
          const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
          
          // Skip updates for groups that are being deleted to avoid path conflicts
          if (groupsToBeDeleted && groupsToBeDeleted.has(groupPath)) {
            logger.debug(`Skipping updates for deleted group: ${groupId}`);
            continue;
          }
          
          if (tile.groups[groupId]) {
            logger.debug(`Cleaning up battle status for group ${groupId}`);
            // Reset group status for all groups still in battle on winning side.
            updates[`${groupPath}/battleId`] = null;
            updates[`${groupPath}/battleSide`] = null;
            updates[`${groupPath}/battleRole`] = null;
            updates[`${groupPath}/status`] = 'idle';
          }
        }
      }
      
      // Clean up structure if involved
      if (tile && tile.structure && battle.targetTypes && battle.targetTypes.includes('structure')) {
        // If attackers won, check if structure will be destroyed
        let willDestroyStructure = false;
        if (winner === 1) {
          const structure = tile.structure;
          const structureType = structure.type;
          const structureDurability = STRUCTURES[structureType]?.durability || 100;
          
          // Log structure state before damage calculation
          console.log(`STRUCTURE BATTLE: ${structureType} with durability ${structureDurability}`);
          
          // IMPROVED: Better handling of undefined structure health
          // If health property doesn't exist, treat as full health without writing to DB yet
          const currentHealth = structure.health !== undefined ? 
              structure.health : 
              structureDurability;
              
          console.log(`Current structure health: ${currentHealth} (${structure.health !== undefined ? 'from database' : 'at full health - not saved yet'})`);
          
          // Calculate proportional damage based on attacker power
          // Get total units in attacking side
          const attackingGroups = battle.side1.groups || {};
          let totalAttackerPower = 0;
          let totalAttackers = 0;
          
          for (const groupId in attackingGroups) {
            if (tile.groups[groupId]) {
              const group = tile.groups[groupId];
              const unitCount = group.units ? Object.keys(group.units).length : 0;
              totalAttackers += unitCount;
              totalAttackerPower += groupPowers[groupId] || 0;
            }
          }
          
          // Calculate damage - base damage is 10% of structure durability, modified by attacker power
          const baseDamage = Math.round(structureDurability * 0.10);  // Reduced from 15% to 10%
          
          // IMPROVED SCALING: Better scaling for very large attacking forces
          // Old formula: const powerFactor = Math.min(2, Math.max(0.5, totalAttackerPower / 10));
          // New formula uses logarithmic scaling to handle large numbers better
          const powerRatio = totalAttackerPower / structureDurability;
          let powerFactor;
          
          if (powerRatio <= 1) {
            // For small forces (power <= structure durability), use original scaling
            powerFactor = Math.max(0.5, powerRatio);
          } else {
            // For larger forces, use logarithmic scaling to prevent excessive caps
            // This gives diminishing returns but still rewards larger forces
            powerFactor = 1 + Math.log10(powerRatio);
          }
          
          // Cap the maximum factor for balance, but much higher than before for massive forces
          powerFactor = Math.min(5, powerFactor);
          
          console.log(`Power ratio: ${powerRatio}, calculated power factor: ${powerFactor}`);
          let damageAmount = Math.round(baseDamage * powerFactor);
          
          // Adjust damage cap based on attacker power relative to structure
          // Very large forces can do more than 25% damage per tick
          let maxDamagePercentage = 0.25; // Default 25%
          
          if (powerRatio > 3) {
            // Formula: 25% + additional % based on power ratio, capped at 75%
            maxDamagePercentage = Math.min(0.75, 0.25 + (powerRatio - 3) * 0.05);
            console.log(`Increased damage cap to ${Math.round(maxDamagePercentage * 100)}% due to overwhelming force`);
          }
          
          const maxDamagePerTick = Math.round(structureDurability * maxDamagePercentage);
          
          if (damageAmount > maxDamagePerTick) {
            console.log(`Damage capped from ${damageAmount} to ${maxDamagePerTick} to prevent excessive damage`);
            damageAmount = maxDamagePerTick;
          }
          
          console.log(`Structure taking ${damageAmount} damage from attackers: ${totalAttackers} units with power ${totalAttackerPower}`);
          
          const newHealth = currentHealth - damageAmount;
          console.log(`Structure health reduced from ${currentHealth} to ${newHealth}`);
          
          // Check if the structure should be destroyed - minimum 2 ticks for any structure
          if (newHealth <= 0 && tickCount > 1) {
              // Flag that structure will be destroyed
              willDestroyStructure = true;
              
              // Structure is destroyed
              updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`] = null;
              
              // Handle players on the destroyed structure
              if (tile.players) {
                const now = Date.now();
                const playersCount = Object.keys(tile.players).length;
                let killedPlayersCount = 0;
                const killedPlayerNames = [];
                
                console.log(`Structure destroyed - checking ${playersCount} players on tile`);
                
                // Process each player on the tile where structure was destroyed
                Object.entries(tile.players).forEach(([playerId, playerData]) => {
                  // Set alive status to false
                  updates[`players/${playerId}/worlds/${worldId}/alive`] = false;
                  
                  // Clear their group reference
                  updates[`players/${playerId}/worlds/${worldId}/inGroup`] = null;
                  
                  // Add a death message to the player's record
                  updates[`players/${playerId}/worlds/${worldId}/lastMessage`] = {
                    text: "Died in structure destruction",
                    timestamp: now
                  };
                  
                  // CRITICAL FIX: Mark lastLocation with death info instead of removing it
                  // This maintains the death location for history purposes
                  updates[`players/${playerId}/worlds/${worldId}/lastLocation`] = null;
                  
                  // CRITICAL FIX: Remove player from the tile
                  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/players/${playerId}`] = null;
                  
                  killedPlayersCount++;
                  if (playerData.displayName) {
                    killedPlayerNames.push(playerData.displayName);
                  }
                  
                  console.log(`Player ${playerId} (${playerData.displayName || 'unknown'}) marked as dead after structure destruction`);
                });
                
                // Create a single chat message for the structure destruction and all player deaths
                const structureName = structure.name || `${structureType.charAt(0).toUpperCase() + structureType.slice(1)}`;
                let deathMessage = `${structureName} at (${battle.locationX}, ${battle.locationY}) has been destroyed!`;
                
                if (killedPlayersCount > 0) {
                  deathMessage += ` ${killedPlayersCount} player${killedPlayersCount !== 1 ? 's' : ''} perished in the destruction.`;
                }
                
                const chatMessageId = `structure_destroyed_${battle.locationX},${battle.locationY}`;
                updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
                  text: deathMessage,
                  type: 'event',
                  timestamp: now,
                  location: {
                    x: battle.locationX,
                    y: battle.locationY
                  }
                };
              }
          } else if (newHealth <= 0) {
            // Structure critically damaged but not destroyed in first tick
            console.log(`Structure critically damaged but prevented from destruction in first tick`);
            updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/health`] = 1;
            
            // Create a message about critical damage
            const structureName = structure.name || `${structureType.charAt(0).toUpperCase() + structureType.slice(1)}`;
            const now = Date.now();
            const chatMessageId = `structure_critical_${now}`;
            updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
              text: `${structureName} at (${battle.locationX}, ${battle.locationY}) is critically damaged!`,
              type: 'event',
              timestamp: now,
              location: {
                x: battle.locationX, 
                y: battle.locationY
              }
            };
          } else {
            // Structure survives with reduced health
            // Only write health to DB if it's changed from full health
            if (newHealth < structureDurability || structure.health !== undefined) {
                updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/health`] = newHealth;
            }
            
            // Create a message about structure damage
            const structureName = structure.name || `${structureType.charAt(0).toUpperCase() + structureType.slice(1)}`;
            const now = Date.now();
            const chatMessageId = `structure_damaged_${now}`;
            updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
              text: `${structureName} at (${battle.locationX}, ${battle.locationY}) has been damaged! (Health: ${newHealth})`,
              type: 'event',
              timestamp: now,
              location: {
                x: battle.locationX,
                y: battle.locationY
              }
            };
          }
        }
        
        // Only update battleId if we're not destroying the entire structure
        // This prevents path conflict in Firebase updates
        if (!willDestroyStructure) {
          // Remove battle status from structure
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/battleId`] = null;
        }
      }

      // CRITICAL FIX: Remove any updates that are children of the battle path since we're deleting the entire battle
      const battlePathPrefix = `${basePath}/`;
      Object.keys(updates).forEach(key => {
        if (key.startsWith(battlePathPrefix)) {
          console.log(`Removing redundant update to ${key} since parent battle is being deleted`);
          delete updates[key];
        }
      });
      
      // Delete the battle as the last step to avoid conflicts
      updates[basePath] = null;
      
      logger.debug(`Battle ${battleId} cleanup complete`);
    }
    
    return true;
  } catch (error) {
    logger.error(`Error processing battle ${battleId}:`, error);
    return false;
  }
};
