import { logger } from "firebase-functions";
import { 
  calculateGroupPower, 
  calculatePowerRatios, 
  calculateAttrition, 
  selectUnitsForCasualties,
  determineWinner
} from "gisaima-shared/war/battles.js";

export async function processBattle(worldId, chunkKey, tileKey, battleId, battle, updates, tile) {
  try {
    // Use serverTimestamp for database records only
    const basePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`;
    
    // Create a separate updates object for battle-specific updates to avoid path conflicts
    const battleUpdates = {};
    
    // Track groups that will be deleted to avoid update conflicts
    const groupsToBeDeleted = new Set();
    
    // Increment the tick count - this is now our primary battle progression metric
    const tickCount = (battle.tickCount || 0) + 1;
    battleUpdates.tickCount = tickCount;
    
    // Get sides data
    const side1 = battle.side1;
    const side2 = battle.side2;
    
    // Recalculate power values using strength-based calculation
    let side1Power = 0;
    let side2Power = 0;
    
    // Calculate side1 power by summing individual group powers
    const side1Groups = side1.groups || {};
    for (const groupId in side1Groups) {
      if (tile.groups[groupId]) {
        const group = tile.groups[groupId];
        side1Power += calculateGroupPower(group);
      }
    }
    
    // Calculate side2 power by summing individual group powers
    const side2Groups = side2.groups || {};
    for (const groupId in side2Groups) {
      if (tile.groups[groupId]) {
        const group = tile.groups[groupId];
        side2Power += calculateGroupPower(group);
      }
    }
    
    // Add structure power if applicable
    if (battle.structurePower) {
      side2Power += battle.structurePower;
    }
    
    // Add a small random factor to prevent exact power equality and eventual stalemates
    // This ensures battles will eventually resolve even with identical forces
    const randomFactor = 0.05; // 5% maximum random variance
    side1Power = side1Power * (1 + (Math.random() * randomFactor - randomFactor/2));
    side2Power = side2Power * (1 + (Math.random() * randomFactor - randomFactor/2));
    
    // Use the new functions to calculate power ratios and attrition
    const { side1Ratio, side2Ratio } = calculatePowerRatios(side1Power, side2Power);
    const side1Attrition = calculateAttrition(side1Power, side1Ratio);
    const side2Attrition = calculateAttrition(side2Power, side2Ratio);

    console.log('side1 attrition', side1Attrition);
    console.log('side2 attrition', side1Attrition);
    
    // Apply attrition to individual groups in each side
    let newSide1Power = 0;
    let newSide2Power = 0;
    let side1Casualties = side1.casualties || 0;
    let side2Casualties = side2.casualties || 0;
    
    // Track groups to be deleted and players to be killed
    const groupsToDelete = [];
    const playersKilled = [];
    
    // Keep track of loot from defeated groups
    const lootFromDefeated = {
      side1: [], // items from side 1 groups that will be looted by side 2
      side2: []  // items from side 2 groups that will be looted by side 1
    };
    
    // Apply attrition to side 1 groups
    for (const groupId in side1Groups) {
      if (tile.groups[groupId]) {
        const group = tile.groups[groupId];
        const units = group.units || {};
        
        // Calculate this group's share of attrition based on its proportion of side power
        const groupPower = calculateGroupPower(group);
        console.log('test side 1 group power', group, groupPower);
        const groupShare = side1Power > 0 ? groupPower / side1Power : 1;
        const groupAttrition = Math.round(side2Attrition * groupShare);
        
        // Use the new function to select casualties
        const { unitsToRemove, playersKilled: groupPlayersKilled } = 
          selectUnitsForCasualties(units, groupAttrition);

        // Add players killed in this group to the overall list
        playersKilled.push(...groupPlayersKilled);

        console.log('units', units);
        console.log('group attrition', groupAttrition);
        console.log('players killed in attrition', playersKilled);
        console.log('units killed in attrition', unitsToRemove);
        
        // Calculate how many units remain
        const remainingUnits = { ...units };
        unitsToRemove.forEach(unitId => delete remainingUnits[unitId]);
        const newUnitCount = Object.keys(remainingUnits).length;
        
        // Check if the group will be destroyed
        if (newUnitCount <= 0) {
          // Add to our deletion tracking sets
          const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
          groupsToBeDeleted.add(groupPath);
          
          // Mark group for deletion - will be applied at the end
          groupsToDelete.push({
            side: 1,
            groupId,
            path: groupPath
          });
          
          // Remove the group from battle side1.groups
          if (!battleUpdates.side1) battleUpdates.side1 = { groups: {} };
          else if (!battleUpdates.side1.groups) battleUpdates.side1.groups = {};
          battleUpdates.side1.groups[groupId] = null;
          
          // Actually delete the group from the database
          updates[groupPath] = null;
          
          // Also update battle data to reflect this group is gone
          updates[`${basePath}/side1/groups/${groupId}`] = null;
          
          // Handle players in this group specifically - mark them as no longer in the group
          for (const unitId in units) {
            if (units[unitId].type === 'player') {
              const playerId = units[unitId].id;
              if (playerId) {
                updates[`players/${playerId}/worlds/${worldId}/inGroup`] = null;
              }
            }
          }
          
          // Collect items from this group to be looted by side 2
          if (group.items) {
            // Handle both array and object formats
            const items = Array.isArray(group.items) ? group.items : Object.values(group.items);
            if (items.length > 0) {
              // Add metadata to items about their source
              const now = Date.now();
              const lootItems = items.map(item => ({
                ...item,
                lootedFrom: 'battle',
                lootedAt: now
              }));
              lootFromDefeated.side1.push(...lootItems);
            }
          }
        } else {
          // Remove the selected units from the group
          unitsToRemove.forEach(unitId => {
            // Remove unit from the tile group data
            updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/units/${unitId}`] = null;
            
            // Also remove unit directly from the battle data
            updates[`${basePath}/side1/groups/${groupId}/units/${unitId}`] = null;
          });
        }
        
        // Add to side casualties
        side1Casualties += unitsToRemove.length;
        
        // Calculate new group power after casualties and add to side power
        if (newUnitCount > 0) {
          const newGroupPower = calculateGroupPower({ units: remainingUnits });
          newSide1Power += newGroupPower;
        }
      }
    }
    
    // Apply attrition to side 2 groups - similar logic
    for (const groupId in side2Groups) {
      if (tile.groups[groupId]) {
        const group = tile.groups[groupId];
        const units = group.units || {};
        
        // Calculate this group's share of attrition based on its proportion of side power
        const groupPower = calculateGroupPower(group);
        logger.debug('test side 2 group power', group, groupPower);
        const groupShare = side2Power > 0 ? groupPower / side2Power : 1;
        const groupAttrition = Math.round(side1Attrition * groupShare);
        
        // Use the new function to select casualties
        const { unitsToRemove, playersKilled: groupPlayersKilled } = 
          selectUnitsForCasualties(units, groupAttrition);
        
        // Add players killed in this group to the overall list
        playersKilled.push(...groupPlayersKilled);
        
        // Calculate how many units remain
        const remainingUnits = { ...units };
        unitsToRemove.forEach(unitId => delete remainingUnits[unitId]);
        const newUnitCount = Object.keys(remainingUnits).length;
        
        // Check if the group will be destroyed
        if (newUnitCount <= 0) {
          // Add to our deletion tracking sets
          const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
          groupsToBeDeleted.add(groupPath);
          
          // Mark group for deletion - will be applied at the end
          groupsToDelete.push({
            side: 2,
            groupId,
            path: groupPath
          });
          
          // Remove the group from battle side2.groups
          if (!battleUpdates.side2) battleUpdates.side2 = { groups: {} };
          else if (!battleUpdates.side2.groups) battleUpdates.side2.groups = {};
          battleUpdates.side2.groups[groupId] = null;
          
          // Actually delete the group from the database
          updates[groupPath] = null;
          
          // Also update battle data to reflect this group is gone
          updates[`${basePath}/side2/groups/${groupId}`] = null;
          
          // Handle players in this group specifically - mark them as no longer in the group
          for (const unitId in units) {
            if (units[unitId].type === 'player') {
              const playerId = units[unitId].id;
              if (playerId) {
                updates[`players/${playerId}/worlds/${worldId}/inGroup`] = null;
              }
            }
          }
          
          // Collect items from this group to be looted by side 1
          if (group.items) {
            // Handle both array and object formats
            const items = Array.isArray(group.items) ? group.items : Object.values(group.items);
            if (items.length > 0) {
              // Add metadata to items about their source
              const now = Date.now();
              const lootItems = items.map(item => ({
                ...item,
                lootedFrom: 'battle',
                lootedAt: now
              }));
              lootFromDefeated.side2.push(...lootItems);
            }
          }
        } else {
          // Remove the selected units from the group
          unitsToRemove.forEach(unitId => {
            // Remove unit from the tile group data
            updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/units/${unitId}`] = null;
            
            // Also remove unit directly from the battle data
            updates[`${basePath}/side2/groups/${groupId}/units/${unitId}`] = null;
          });
        }
        
        // Add to side casualties
        side2Casualties += unitsToRemove.length;
        
        // Calculate new group power after casualties and add to side power
        if (newUnitCount > 0) {
          const newGroupPower = calculateGroupPower({ units: remainingUnits });
          newSide2Power += newGroupPower;
        }
      }
    }
    
    // Handle player deaths
    for (const player of playersKilled) {
      const now = Date.now();
      
      // Mark player as dead in their main record
      updates[`players/${player.playerId}/worlds/${worldId}/alive`] = false;
      updates[`players/${player.playerId}/worlds/${worldId}/lastDeathTime`] = now;
      updates[`players/${player.playerId}/worlds/${worldId}/inGroup`] = null;
      
      // Add a message notifying the player of their death
      updates[`players/${player.playerId}/worlds/${worldId}/lastMessage`] = {
        text: "You were defeated in battle.",
        timestamp: now
      };
      
      // Add a chat message about player death
      const chatId = `player_death_${now}_${player.playerId}`;
      updates[`worlds/${worldId}/chat/${chatId}`] = {
        text: `${player.displayName} has fallen in battle at (${battle.locationX}, ${battle.locationY})!`,
        type: 'event',
        timestamp: now,
        location: {
          x: battle.locationX,
          y: battle.locationY
        }
      };
    }
    
    // Distribute looted items to the winning side's surviving groups
    const side1Surviving = Object.keys(side1Groups)
      .filter(id => !groupsToDelete.some(g => g.groupId === id && g.side === 1));
    
    const side2Surviving = Object.keys(side2Groups)
      .filter(id => !groupsToDelete.some(g => g.groupId === id && g.side === 2));
    
    // Distribute side 2's items to side 1 survivors
    if (lootFromDefeated.side2.length > 0 && side1Surviving.length > 0) {
      // Select a random surviving group to receive the loot
      const receivingGroupId = side1Surviving[Math.floor(Math.random() * side1Surviving.length)];
      const group = tile.groups[receivingGroupId];
      
      // Get the existing items in the group
      let existingItems = group.items || {};
      if (Array.isArray(existingItems)) {
        // Convert array to object with numeric keys
        existingItems = Object.fromEntries(existingItems.map((item, index) => [index, item]));
      }
      
      // Add each looted item to the group
      lootFromDefeated.side2.forEach(item => {
        const itemId = item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${receivingGroupId}/items/${itemId}`] = item;
      });
      
      // Add a message about looting
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${receivingGroupId}/lastMessage`] = {
        text: `Looted ${lootFromDefeated.side2.length} items from battle`,
        timestamp: Date.now()
      };
    }
    
    // Distribute side 1's items to side 2 survivors
    if (lootFromDefeated.side1.length > 0 && side2Surviving.length > 0) {
      // Select a random surviving group to receive the loot
      const receivingGroupId = side2Surviving[Math.floor(Math.random() * side2Surviving.length)];
      const group = tile.groups[receivingGroupId];
      
      // Get the existing items in the group
      let existingItems = group.items || {};
      if (Array.isArray(existingItems)) {
        // Convert array to object with numeric keys
        existingItems = Object.fromEntries(existingItems.map((item, index) => [index, item]));
      }
      
      // Add each looted item to the group
      lootFromDefeated.side1.forEach(item => {
        const itemId = item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${receivingGroupId}/items/${itemId}`] = item;
      });
      
      // Add a message about looting
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${receivingGroupId}/lastMessage`] = {
        text: `Looted ${lootFromDefeated.side1.length} items from battle`,
        timestamp: Date.now()
      };
    }
    
    // Update power values and casualties for both sides
    if (!battleUpdates.side1) battleUpdates.side1 = {};
    if (!battleUpdates.side2) battleUpdates.side2 = {};
    
    battleUpdates.side1.casualties = side1Casualties;
    battleUpdates.side2.casualties = side2Casualties;
    
    // Apply the battle updates to the main battle object
    updates[basePath] = {
      ...battle,              // Keep existing battle properties
      ...battleUpdates,       // Apply our new updates
    };
    
    // Check if battle should end - based only on power
    // A battle ends when one side has no power left
    if (newSide1Power <= 0 || newSide2Power <= 0) {
      console.log('battle should end', newSide1Power <= 0, newSide2Power <= 0);
      logger.debug(battle);

      // Use the new function to determine the winner
      const winner = determineWinner(newSide1Power, newSide2Power);
      
      // End the battle
      return await endBattle(worldId, chunkKey, tileKey, battleId, battle, updates, winner, tile, groupsToBeDeleted);
    }
    
    return true;
  } catch (error) {
    logger.error(`Error processing battle ${battleId}:`, error);
    return false;
  }
};

async function endBattle(worldId, chunkKey, tileKey, battleId, battle, updates, winner, tile, groupsToBeDeleted) {
  const basePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`;
  
  // Delete the battle instead of updating it
  updates[`${basePath}`] = null;
  
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
    timestamp: now, // Keep timestamp for chat display
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
    
    // Update side 1 groups - set to idle only if they're on the winning side
    const side1Groups = battle.side1.groups || {};
    for (const groupId in side1Groups) {
      const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
      
      // Skip updates for groups that are being deleted to avoid path conflicts
      if (groupsToBeDeleted && groupsToBeDeleted.has(groupPath)) {
        logger.debug(`Skipping updates for deleted group: ${groupId}`);
        continue;
      }
      
      if (tile.groups[groupId]) {
        logger.debug(`Updating side 1 group ${groupId} status`);
        // Set group status based on result
        updates[`${groupPath}/inBattle`] = false;
        updates[`${groupPath}/battleId`] = null;
        updates[`${groupPath}/battleSide`] = null;
        updates[`${groupPath}/battleRole`] = null;
        updates[`${groupPath}/status`] = 'idle';
        
        // Add a message about the battle result
        updates[`${groupPath}/lastMessage`] = {
          text: winner === 1 ? "Your group has won the battle!" : "Your group has lost the battle.",
          timestamp: now
        };
      }
    }
    
    // Update side 2 groups - set to idle only if they're on the winning side
    const side2Groups = battle.side2.groups || {};
    for (const groupId in side2Groups) {
      const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
      
      // Skip updates for groups that are being deleted to avoid path conflicts
      if (groupsToBeDeleted && groupsToBeDeleted.has(groupPath)) {
        logger.debug(`Skipping updates for deleted group: ${groupId}`);
        continue;
      }
      
      if (tile.groups[groupId]) {
        logger.debug(`Updating side 2 group ${groupId} status`);
        // Set group status based on result
        updates[`${groupPath}/inBattle`] = false;
        updates[`${groupPath}/battleId`] = null;
        updates[`${groupPath}/battleSide`] = null;
        updates[`${groupPath}/battleRole`] = null;
        updates[`${groupPath}/status`] = 'idle';
        
        // Add a message about the battle result
        updates[`${groupPath}/lastMessage`] = {
          text: winner === 2 ? "Your group has won the battle!" : "Your group has lost the battle.",
          timestamp: now
        };
      }
    }
  }
  
  // Clean up structure if involved
  if (tile && tile.structure && battle.targetTypes && battle.targetTypes.includes('structure')) {
    // Remove battle status from structure
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/inBattle`] = false;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/battleId`] = null;
    
    // If attackers won, damage or destroy the structure
    if (winner === 1) {
      const structure = tile.structure;
      // Structures get destroyed when attackers win
      if (structure.type !== 'spawn') {
        // Don't destroy spawn points, just damage them
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/health`] = 
          Math.max(1, (structure.health || 100) - 50);
      } else {
        // For regular structures, destroy completely
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`] = null;
      }
    }
  }
  
  logger.debug(`Battle ${battleId} cleanup complete`);
  return true;
};
