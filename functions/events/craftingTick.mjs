import { getDatabase } from 'firebase-admin/database';

/**
 * Process pending crafting operations
 * @param {string} worldId - The world ID to process crafting for
 * @returns {Promise<Object>} Processing results
 */
export async function processCrafting(worldId) {
  try {
    const db = getDatabase();
    const now = Date.now();
    
    console.log(`Processing crafting for world ${worldId} at ${new Date(now).toISOString()}`);
    
    // Get completed but unprocessed crafting operations
    const craftingRef = db.ref(`worlds/${worldId}/crafting`);
    const craftingSnapshot = await craftingRef.orderByChild('status').equalTo('in_progress').once('value');
    
    if (!craftingSnapshot.exists()) {
      console.log(`No pending crafting found for world ${worldId}`);
      return { processed: 0 };
    }
    
    const craftingItems = [];
    craftingSnapshot.forEach(child => {
      const crafting = child.val();
      // Only include crafting that is complete but not yet processed
      if (crafting.completesAt <= now && !crafting.processed) {
        craftingItems.push(crafting);
      }
    });
    
    console.log(`Found ${craftingItems.length} completed crafting items to process`);
    
    let completed = 0;
    let failed = 0;
    
    // Process each crafting operation
    for (const crafting of craftingItems) {
      try {
        const result = await completeCrafting(crafting.id, worldId);
        if (result.success) {
          completed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Error processing crafting ${crafting.id}:`, error);
        failed++;
        
        // Mark crafting as failed
        const craftingItemRef = db.ref(`worlds/${worldId}/crafting/${crafting.id}`);
        await craftingItemRef.update({
          processed: true,
          failed: true,
          error: error.message,
          processedAt: now,
          status: 'failed'
        });
      }
    }
    
    console.log(`Processed ${completed} crafting operations successfully, ${failed} failed`);
    
    return {
      processed: completed,
      failed: failed,
      total: craftingItems.length
    };
    
  } catch (error) {
    console.error('Error processing crafting operations:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Complete crafting (called by scheduled function)
 * @param {string} craftingId - ID of the crafting to complete
 * @param {string} worldId - World ID
 * @returns {Promise<Object>} Result of completion
 */
async function completeCrafting(craftingId, worldId) {
  try {
    const db = getDatabase();
    // Get crafting data
    const craftingRef = db.ref(`worlds/${worldId}/crafting/${craftingId}`);
    const craftingSnapshot = await craftingRef.once('value');
    
    if (!craftingSnapshot.exists()) {
      throw new Error('Crafting not found');
    }
    
    const crafting = craftingSnapshot.val();
    
    // Skip if already processed
    if (crafting.processed) {
      return {
        success: false,
        error: 'Crafting already processed'
      };
    }
    
    // Add item to player's inventory
    const playerInventoryRef = db.ref(`players/${crafting.playerId}/worlds/${worldId}/inventory`);
    const playerInventorySnapshot = await playerInventoryRef.once('value');
    
    let playerInventory = playerInventorySnapshot.exists() ? playerInventorySnapshot.val() : [];
    
    // Create a new unique item ID
    const itemId = `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Add crafted item
    playerInventory.push({
      id: itemId,
      name: crafting.result.name,
      quantity: crafting.result.quantity || 1,
      type: crafting.result.type,
      rarity: crafting.result.rarity || 'common',
      description: crafting.result.description,
      crafted: true,
      craftedAt: Date.now(),
      craftedBy: crafting.playerId
    });
    
    // Update player's inventory
    await playerInventoryRef.set(playerInventory);
    
    // Update player's crafting status
    const playerRef = db.ref(`players/${crafting.playerId}/worlds/${worldId}`);
    await playerRef.update({
      'crafting/current': null,
      'crafting/completesAt': null,
      'crafting/lastCompleted': Date.now()
    });
    
    // Increase player's crafting XP if they have a skills object
    const playerSkillsRef = db.ref(`players/${crafting.playerId}/worlds/${worldId}/skills`);
    const playerSkillsSnapshot = await playerSkillsRef.once('value');
    
    let leveledUp = false;
    
    if (playerSkillsSnapshot.exists()) {
      const skills = playerSkillsSnapshot.val();
      const currentXP = skills.crafting?.xp || 0;
      const currentLevel = skills.crafting?.level || 1;
      
      // Calculate XP gained (based on recipe rarity and level)
      const rarityMultipliers = {
        'common': 1,
        'uncommon': 1.5,
        'rare': 2.5,
        'epic': 4,
        'legendary': 7
      };
      
      const recipeRarity = crafting.result.rarity || 'common';
      const rarityMultiplier = rarityMultipliers[recipeRarity] || 1;
      
      const baseXP = 10; // Base XP for crafting
      const xpGained = Math.round(baseXP * rarityMultiplier);
      
      const newXP = currentXP + xpGained;
      
      // Check if player leveled up
      const requiredXP = currentLevel * 100; // Simple XP curve
      let newLevel = currentLevel;
      
      if (newXP >= requiredXP) {
        newLevel = currentLevel + 1;
        leveledUp = true;
      }
      
      // Update skills
      await playerSkillsRef.update({
        'crafting/xp': newXP,
        'crafting/level': newLevel,
        'crafting/lastGain': Date.now()
      });
      
      // If player leveled up, announce it
      if (leveledUp) {
        const chatRef = db.ref(`worlds/${worldId}/chat/crafting_levelup_${crafting.playerId}_${Date.now()}`);
        await chatRef.set({
          location: crafting.structureLocation,
          text: `${crafting.playerName} reached crafting level ${newLevel}!`,
          timestamp: Date.now(),
          type: 'event'
        });
      }
    }
    
    // Mark crafting as completed
    await craftingRef.update({
      status: 'completed',
      completedAt: Date.now(),
      processed: true
    });
    
    // Add completion event to chat
    const chatRef = db.ref(`worlds/${worldId}/chat/crafting_complete_${craftingId}`);
    await chatRef.set({
      location: crafting.structureLocation,
      text: `${crafting.playerName} finished crafting ${crafting.result.name}.`,
      timestamp: Date.now(),
      type: 'event'
    });
    
    return {
      success: true,
      result: crafting.result,
      leveledUp
    };
    
  } catch (error) {
    console.error('Error completing crafting:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
