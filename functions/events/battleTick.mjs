import { logger } from "firebase-functions";

export async function processBattle(worldId, chunkKey, tileKey, battleId, battle, updates, tile) {
  try {
    // Use serverTimestamp for database records only
    const basePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`;
    
    // Increment the tick count - this is now our primary battle progression metric
    const tickCount = (battle.tickCount || 0) + 1;
    updates[`${basePath}/tickCount`] = tickCount;
    
    // Get sides data
    const side1 = battle.side1;
    const side2 = battle.side2;
    
    // Get current power values
    const side1Power = side1.power || 0;
    const side2Power = side2.power || 0;
    const totalPower = side1Power + side2Power;
    
    // Calculate power ratio to determine attrition rate
    // Higher difference means more damage to the weaker side
    const powerRatio1 = side1Power / totalPower;
    const powerRatio2 = side2Power / totalPower;
    
    // Base attrition per tick (5-10% of opponent's power)
    const baseAttritionRate = 0.05 + (Math.random() * 0.05);
    
    // Calculate attrition with advantage multipliers
    // The side with more power deals more damage
    const side1Attrition = Math.round(side1Power * baseAttritionRate * (powerRatio1 + 0.5));
    const side2Attrition = Math.round(side2Power * baseAttritionRate * (powerRatio2 + 0.5));
    
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
    const side1Groups = side1.groups || {};
    for (const groupId in side1Groups) {
      if (tile.groups[groupId]) {
        const group = tile.groups[groupId];
        const units = group.units || {};
        
        // Calculate this group's share of attrition based on its proportion of side power
        const groupPower = group.unitCount || 0;
        const groupShare = groupPower / side1Power;
        const groupAttrition = Math.round(side2Attrition * groupShare);
        
        // Apply casualties by removing specific units
        const unitIds = Object.keys(units);
        const totalUnits = unitIds.length;
        let remainingAttrition = Math.min(groupAttrition, totalUnits);
        
        // This will track which units are killed
        const unitsToRemove = [];
        
        // First check if there are any regular (non-player) units
        const regularUnitIds = unitIds.filter(id => units[id].type !== 'player');
        
        // Remove regular units first as much as possible
        while (remainingAttrition > 0 && regularUnitIds.length > 0) {
          // Choose random unit for removal
          const randomIndex = Math.floor(Math.random() * regularUnitIds.length);
          const unitToRemove = regularUnitIds.splice(randomIndex, 1)[0];
          
          unitsToRemove.push(unitToRemove);
          remainingAttrition--;
        }
        
        // If we still need to remove more units, and we only have player units left
        if (remainingAttrition > 0) {
          // Get player units
          const playerUnitIds = unitIds.filter(id => units[id].type === 'player');
          
          while (remainingAttrition > 0 && playerUnitIds.length > 0) {
            // Choose random player unit
            const randomIndex = Math.floor(Math.random() * playerUnitIds.length);
            const playerUnitId = playerUnitIds.splice(randomIndex, 1)[0];
            const playerUnit = units[playerUnitId];
            
            // Track this player for marking as dead later
            playersKilled.push({
              playerId: playerUnit.id,
              displayName: playerUnit.displayName || "Unknown Player"
            });
            
            unitsToRemove.push(playerUnitId);
            remainingAttrition--;
          }
        }
        
        // Remove the selected units from the group
        unitsToRemove.forEach(unitId => {
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/units/${unitId}`] = null;
        });
        
        // Calculate how many units remain
        const newUnitCount = totalUnits - unitsToRemove.length;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/unitCount`] = newUnitCount;
        
        // Add to side casualties
        side1Casualties += unitsToRemove.length;
        
        // Add remaining power (1 unit = 1 power)
        newSide1Power += newUnitCount;
        
        // If no units left, mark for deletion and collect items for looting
        if (newUnitCount <= 0) {
          groupsToDelete.push({
            side: 1,
            groupId
          });
          
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
        }
      }
    }
    
    // Apply attrition to side 2 groups - similar logic to side 1
    const side2Groups = side2.groups || {};
    for (const groupId in side2Groups) {
      if (tile.groups[groupId]) {
        const group = tile.groups[groupId];
        const units = group.units || {};
        
        // Calculate this group's share of attrition based on its proportion of side power
        const groupPower = group.unitCount || 0;
        const groupShare = groupPower / side2Power;
        const groupAttrition = Math.round(side1Attrition * groupShare);
        
        // Apply casualties by removing specific units
        const unitIds = Object.keys(units);
        const totalUnits = unitIds.length;
        let remainingAttrition = Math.min(groupAttrition, totalUnits);
        
        // This will track which units are killed
        const unitsToRemove = [];
        
        // First check if there are any regular (non-player) units
        const regularUnitIds = unitIds.filter(id => units[id].type !== 'player');
        
        // Remove regular units first as much as possible
        while (remainingAttrition > 0 && regularUnitIds.length > 0) {
          // Choose random unit for removal
          const randomIndex = Math.floor(Math.random() * regularUnitIds.length);
          const unitToRemove = regularUnitIds.splice(randomIndex, 1)[0];
          
          unitsToRemove.push(unitToRemove);
          remainingAttrition--;
        }
        
        // If we still need to remove more units, and we only have player units left
        if (remainingAttrition > 0) {
          // Get player units
          const playerUnitIds = unitIds.filter(id => units[id].type === 'player');
          
          while (remainingAttrition > 0 && playerUnitIds.length > 0) {
            // Choose random player unit
            const randomIndex = Math.floor(Math.random() * playerUnitIds.length);
            const playerUnitId = playerUnitIds.splice(randomIndex, 1)[0];
            const playerUnit = units[playerUnitId];
            
            // Track this player for marking as dead later
            playersKilled.push({
              playerId: playerUnit.id,
              displayName: playerUnit.displayName || "Unknown Player"
            });
            
            unitsToRemove.push(playerUnitId);
            remainingAttrition--;
          }
        }
        
        // Remove the selected units from the group
        unitsToRemove.forEach(unitId => {
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/units/${unitId}`] = null;
        });
        
        // Calculate how many units remain
        const newUnitCount = totalUnits - unitsToRemove.length;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/unitCount`] = newUnitCount;
        
        // Add to side casualties
        side2Casualties += unitsToRemove.length;
        
        // Add remaining power (1 unit = 1 power)
        newSide2Power += newUnitCount;
        
        // If no units left, mark for deletion and collect items for looting
        if (newUnitCount <= 0) {
          groupsToDelete.push({
            side: 2,
            groupId
          });
          
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
        }
      }
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
    
    // Handle player deaths
    for (const player of playersKilled) {
      const now = Date.now();
      
      // Mark player as dead in their main record
      updates[`players/${player.playerId}/worlds/${worldId}/alive`] = false;
      updates[`players/${player.playerId}/worlds/${worldId}/lastDeathTime`] = now;
      
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
    
    // Delete any groups with no units left
    for (const groupToDelete of groupsToDelete) {
      updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupToDelete.groupId}`] = null;
      
      // Remove from the battle's side groups
      updates[`${basePath}/side${groupToDelete.side}/groups/${groupToDelete.groupId}`] = null;
    }
    
    // Update power values and casualties for both sides
    updates[`${basePath}/side1/power`] = newSide1Power;
    updates[`${basePath}/side1/casualties`] = side1Casualties;
    updates[`${basePath}/side2/power`] = newSide2Power;
    updates[`${basePath}/side2/casualties`] = side2Casualties;
    
    // Check if battle should end - based only on power
    // A battle ends when one side has no power left or after many ticks (safety cap at 20)
    if (newSide1Power <= 0 || newSide2Power <= 0) {
      // Determine the winner
      let winner = 0; // Draw
      if (newSide1Power > newSide2Power) {
        winner = 1; // Side 1 wins
      } else if (newSide2Power > newSide1Power) {
        winner = 2; // Side 2 wins
      }
      
      // End the battle
      return await endBattle(worldId, chunkKey, tileKey, battleId, battle, updates, winner, tile);
    }
    
    return true;
  } catch (error) {
    logger.error(`Error processing battle ${battleId}:`, error);
    return false;
  }
}

async function endBattle(worldId, chunkKey, tileKey, battleId, battle, updates, winner, tile) {
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
    // Update side 1 groups
    const side1Groups = battle.side1.groups || {};
    for (const groupId in side1Groups) {
      if (tile.groups[groupId]) {
        // Set group status based on result
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/inBattle`] = false;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleId`] = null;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleSide`] = null;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`] = 'idle';
      }
    }
    
    // Update side 2 groups
    const side2Groups = battle.side2.groups || {};
    for (const groupId in side2Groups) {
      if (tile.groups[groupId]) {
        // Set group status based on result
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/inBattle`] = false;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleId`] = null;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/battleSide`] = null;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`] = 'idle';
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
  
  return true;
}
