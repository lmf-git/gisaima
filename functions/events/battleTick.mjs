import { logger } from "firebase-functions";
import { 
  calculateGroupPower, 
  calculatePowerRatios, 
  calculateAttrition, 
  selectUnitsForCasualties,
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
    
    // Add structure power if applicable
    if (battle.structurePower) {
      side2Power += battle.structurePower;
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
    let side1Attrition = calculateAttrition(side1Power, side1Ratio);
    let side2Attrition = calculateAttrition(side2Power, side2Ratio);

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
    battleUpdates.side1 = { casualties: side1Casualties, groups: {} };
    battleUpdates.side2 = { casualties: side2Casualties, groups: {} };
    
    // Track groups to be deleted and players to be killed
    const groupsToDelete = [];
    const playersKilled = [];
    
    // Replace the existing loot tracking with battle.loot
    const battleLoot = battle.loot || [];

    // Helper function to process each side
    function processSide(sideNumber, sideGroups, sidePower, oppositeAttrition, sideCasualties) {
      let newSidePower = 0;
      let updatedCasualties = sideCasualties;  // Changed from const to let
      const sideKey = `side${sideNumber}`;
      
      for (const groupId in sideGroups) {
        if (!tile.groups[groupId]) continue;
        
        const group = tile.groups[groupId];
        const units = group.units || {};
        
        // Use the stored group power
        const groupPower = groupPowers[groupId];
        const groupShare = sidePower > 0 ? groupPower / sidePower : 1;
        const groupAttrition = Math.round(oppositeAttrition * groupShare);
        
        // Select units for casualties
        const { unitsToRemove, playersKilled: groupPlayersKilled } = 
          selectUnitsForCasualties(units, groupAttrition);
          
        // Add players killed to the list
        playersKilled.push(...groupPlayersKilled);
        
        // Calculate remaining units
        const remainingUnits = { ...units };
        unitsToRemove.forEach(unitId => delete remainingUnits[unitId]);
        const newUnitCount = Object.keys(remainingUnits).length;
        
        // Update casualty count
        const casualties = unitsToRemove.length;
        updatedCasualties += casualties;
        battleUpdates[sideKey].casualties = updatedCasualties;
        
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
          battleUpdates[sideKey].groups[groupId] = null;
          updates[groupPath] = null;
          updates[`${basePath}/${sideKey}/groups/${groupId}`] = null;
          
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
          // Remove selected units
          unitsToRemove.forEach(unitId => {
            updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/units/${unitId}`] = null;
            updates[`${basePath}/${sideKey}/groups/${groupId}/units/${unitId}`] = null;
          });
          
          // Calculate new group power
          const newGroupPower = calculateGroupPower({ units: remainingUnits });
          console.log(`Group ${groupId} new power after casualties: ${newGroupPower}`);
          newSidePower += newGroupPower;
        }
      }
      
      return { newSidePower, updatedCasualties };
    }
    
    // Process both sides using the helper function
    const side1Result = processSide(1, side1Groups, side1Power, side2Attrition, side1Casualties);
    newSide1Power = side1Result.newSidePower;
    side1Casualties = side1Result.updatedCasualties;
    
    const side2Result = processSide(2, side2Groups, side2Power, side1Attrition, side2Casualties);
    newSide2Power = side2Result.newSidePower;
    side2Casualties = side2Result.updatedCasualties;
    
    // Add structure power if applicable
    if (battle.structurePower) {
      newSide2Power += battle.structurePower;
    }
    
    // Log the new power values for debugging
    console.log(`New battle powers after tick ${tickCount} - Side 1: ${newSide1Power}, Side 2: ${newSide2Power}`);
    
    // Get surviving groups for both sides
    const side1Surviving = Object.keys(side1Groups)
      .filter(id => !groupsToDelete.some(g => g.groupId === id && g.side === 1));
    
    const side2Surviving = Object.keys(side2Groups)
      .filter(id => !groupsToDelete.some(g => g.groupId === id && g.side === 2));
    
    // --------- PHASE 4: CHECK FOR BATTLE END CONDITIONS ---------
    
    // A battle ends when one side has no power left or after many ticks with minimal progress
    const side1Defeated = side1Surviving.length === 0;
    const side2Defeated = side2Surviving.length === 0;
    
    // Determine the winner directly from defeat flags
    let winner;
    if (side1Defeated && side2Defeated) {
      // If both sides are defeated, it's a draw
      winner = 0; // Use 0 to represent a draw
      console.log("Battle ended in a draw: both sides defeated");
    } else if (side1Defeated && !side2Defeated) {
      winner = 2; // Side 2 wins
    } else if (!side1Defeated && side2Defeated) {
      winner = 1; // Side 1 wins
    }
    
    if (winner === undefined) {
      battleUpdates.loot = battleLoot;
      
      // Apply the battle updates to the main battle object
      updates[basePath] = {
        ...battle,              // Keep existing battle properties
        ...battleUpdates,       // Apply our new updates
      };
    } else {
      console.log(`Battle ${battleId} ending after ${tickCount} ticks. Power levels: Side 1: ${newSide1Power}, Side 2: ${newSide2Power}`);
      
      // Distribute loot to winner or leave on tile if no survivors
      function distributeLootToWinner(winner) {
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
          
          // Add a message about looting
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${receivingGroupId}/lastMessage`] = {
            text: `Looted ${battleLoot.length} items from battle`,
            timestamp: Date.now()
          };
        } else if (winner !== 0) {
          // If winner is determined but no surviving groups, leave loot on tile
          // This creates a "treasure" for other groups to find later
          battleLoot.forEach(item => {
            const itemId = item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/items/${itemId}`] = item;
          });
        }
      }
      
      distributeLootToWinner(winner);
      
      // Delete the battle instead of updating it
      updates[basePath] = null;
      
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
            // Reset group status for all groups that were in battle
            updates[`${groupPath}/inBattle`] = false;
            updates[`${groupPath}/battleId`] = null;
            updates[`${groupPath}/battleSide`] = null;
            updates[`${groupPath}/battleRole`] = null;
            updates[`${groupPath}/status`] = 'idle';
            
            // Add victory or defeat message based on which side the group was on
            const wasOnWinningSide = 
              (winner === 1 && battle.side1.groups && battle.side1.groups[groupId]) ||
              (winner === 2 && battle.side2.groups && battle.side2.groups[groupId]);
            
            if (winner !== 0) {
              updates[`${groupPath}/lastMessage`] = {
                text: wasOnWinningSide ? "Your group has won the battle!" : "Your group was defeated in battle.",
                timestamp: now
              };
            } else {
              // Draw message
              updates[`${groupPath}/lastMessage`] = {
                text: "The battle ended in a stalemate.",
                timestamp: now
              };
            }
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
    }
    
    return true;
  } catch (error) {
    logger.error(`Error processing battle ${battleId}:`, error);
    return false;
  }
}
