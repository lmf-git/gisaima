import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions';

/**
 * Process crafting operations
 * @param {string} worldId - The ID of the world to process
 * @returns {Promise<{processed: number}>} - Result with count of processed items 
 */
export async function processCrafting(worldId) {
  try {
    const db = getDatabase();
    const now = Date.now();
    let processed = 0;
    
    // Get all crafting operations for this world
    const craftingRef = db.ref(`worlds/${worldId}/crafting`);
    const craftingSnapshot = await craftingRef.once('value');
    const craftingData = craftingSnapshot.val();
    
    if (!craftingData) {
      return { processed };
    }
    
    // Get the world's tick count for tick-based processing
    const worldTicksRef = db.ref(`worlds/${worldId}/info/tickCount`);
    const worldTicksSnapshot = await worldTicksRef.once('value');
    let currentTickCount = (worldTicksSnapshot.val() || 0);
    
    // Increment the world tick count for this cycle
    await worldTicksRef.set(currentTickCount + 1);
    
    // Process each crafting operation
    const updates = {};
    const craftingToProcess = Object.entries(craftingData);
    
    for (const [craftingId, crafting] of craftingToProcess) {
      // Skip already processed crafting
      if (crafting.processed || crafting.status !== 'in_progress') {
        continue;
      }
      
      // Check if this crafting has a ticksRequired property (new system)
      if (typeof crafting.ticksRequired === 'number') {
        // If we have ticksRequired, use tick-based completion
        if (typeof crafting.ticksCompleted !== 'number') {
          // Initialize ticksCompleted if not present
          updates[`worlds/${worldId}/crafting/${craftingId}/ticksCompleted`] = 1;
          continue; // Skip this iteration - we'll process it in the next tick
        }
        
        // Increment completed ticks
        const newTicksCompleted = crafting.ticksCompleted + 1;
        updates[`worlds/${worldId}/crafting/${craftingId}/ticksCompleted`] = newTicksCompleted;
        
        // Check if crafting is complete
        if (newTicksCompleted >= crafting.ticksRequired) {
          completeCrafting(worldId, craftingId, crafting, updates);
          processed++;
        }
      } 
      // Fallback for legacy time-based crafting (completesAt property)
      else if (crafting.completesAt && crafting.completesAt <= now) {
        completeCrafting(worldId, craftingId, crafting, updates);
        processed++;
      }
      // Convert old time-based to new tick-based
      else if (crafting.craftingTime) {
        // Convert time-based to tick-based (assuming 1 tick per minute)
        const ticksRequired = crafting.craftingTime;
        updates[`worlds/${worldId}/crafting/${craftingId}/ticksRequired`] = ticksRequired;
        updates[`worlds/${worldId}/crafting/${craftingId}/ticksCompleted`] = 1;
      }
    }
    
    // Apply all updates
    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }
    
    return { processed };
  } catch (error) {
    logger.error('Error processing crafting:', error);
    return { processed: 0, error: error.message };
  }
}

/**
 * Complete a crafting operation
 */
function completeCrafting(worldId, craftingId, crafting, updates) {
  const now = Date.now();
  
  // Mark crafting as complete
  updates[`worlds/${worldId}/crafting/${craftingId}/status`] = 'completed';
  updates[`worlds/${worldId}/crafting/${craftingId}/processed`] = true;
  updates[`worlds/${worldId}/crafting/${craftingId}/completedAt`] = now;
  
  // Add the crafted item to player's inventory
  if (crafting.playerId && crafting.result) {
    const inventoryPath = `players/${crafting.playerId}/worlds/${worldId}/inventory`;
    const newItemId = `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Create new item with proper structure
    const newItem = {
      ...crafting.result,
      id: newItemId,
      craftedAt: now
    };
    
    updates[`${inventoryPath}/${newItemId}`] = newItem;
  }
  
  // Clear player's current crafting status
  if (crafting.playerId) {
    updates[`players/${crafting.playerId}/worlds/${worldId}/crafting/current`] = null;
    updates[`players/${crafting.playerId}/worlds/${worldId}/crafting/completesAt`] = null;
  }
  
  // Add a notification
  const notificationId = `crafting_completed_${craftingId}`;
  updates[`players/${crafting.playerId}/worlds/${worldId}/notifications/${notificationId}`] = {
    id: notificationId,
    type: 'crafting_completed',
    message: `You have completed crafting ${crafting.result.name}!`,
    craftingId: craftingId,
    itemName: crafting.result.name,
    read: false
  };
  
  // Add chat event
  updates[`worlds/${worldId}/chat/crafting_complete_${craftingId}`] = {
    location: crafting.structureLocation,
    text: `${crafting.playerName} completed crafting ${crafting.result.name}.`,
    timestamp: now,
    type: 'event'
  };
}
