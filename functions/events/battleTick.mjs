import { getDatabase } from 'firebase-admin/database';
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
    
    // Update power values after attrition
    const newSide1Power = Math.max(0, side1Power - side2Attrition);
    const newSide2Power = Math.max(0, side2Power - side1Attrition);
    
    // Update casualties
    const side1Casualties = (side1.casualties || 0) + side2Attrition;
    const side2Casualties = (side2.casualties || 0) + side1Attrition;
    
    // Update power values
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
  
  // Update battle status
  updates[`${basePath}/status`] = 'completed';
  updates[`${basePath}/winner`] = winner;
  
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
        
        // Apply casualties to group if it lost
        if (winner !== 1) {
          const group = tile.groups[groupId];
          // Reduce unit count based on casualties
          const casualtyRate = Math.min(0.8, battle.side1.casualties / (battle.side1.power || 1));
          const newUnitCount = Math.max(1, Math.floor(group.unitCount * (1 - casualtyRate)));
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/unitCount`] = newUnitCount;
        }
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
        
        // Apply casualties to group if it lost
        if (winner !== 2) {
          const group = tile.groups[groupId];
          // Reduce unit count based on casualties
          const casualtyRate = Math.min(0.8, battle.side2.casualties / (battle.side2.power || 1));
          const newUnitCount = Math.max(1, Math.floor(group.unitCount * (1 - casualtyRate)));
          updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/unitCount`] = newUnitCount;
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
  
  return true;
}
