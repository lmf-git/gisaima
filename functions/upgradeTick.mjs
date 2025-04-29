import { db } from './config.mjs';
import { ref, get, update, set, query, orderByChild, equalTo } from "firebase/database";

/**
 * Process pending structure upgrades
 * @param {Object} data - The context data
 * @param {string} data.worldId - The world ID to process upgrades for
 * @returns {Promise<Object>} Processing results
 */
export async function processUpgrades(data = {}) {
  try {
    const worldId = data.worldId || 'ancient-lands'; // Default to ancient-lands if no worldId provided
    const now = Date.now();
    
    console.log(`Processing upgrades for world ${worldId} at ${new Date(now).toISOString()}`);
    
    // Get completed but unprocessed upgrades
    const upgradesRef = ref(db, `worlds/${worldId}/upgrades`);
    const upgradesQuery = query(
      upgradesRef,
      orderByChild('status'),
      equalTo('pending')
    );
    
    const upgradesSnapshot = await get(upgradesQuery);
    
    if (!upgradesSnapshot.exists()) {
      console.log(`No pending upgrades found for world ${worldId}`);
      return { processed: 0 };
    }
    
    const upgrades = [];
    upgradesSnapshot.forEach(child => {
      const upgrade = child.val();
      // Only include upgrades that are complete but not yet processed
      if (upgrade.completesAt <= now && !upgrade.processed) {
        upgrades.push(upgrade);
      }
    });
    
    console.log(`Found ${upgrades.length} completed upgrades to process`);
    
    let completed = 0;
    let failed = 0;
    
    // Process each upgrade
    for (const upgrade of upgrades) {
      try {
        const result = await applyUpgrade(worldId, upgrade);
        if (result.success) {
          completed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Error processing upgrade ${upgrade.id}:`, error);
        failed++;
        
        // Mark upgrade as failed
        const upgradeRef = ref(db, `worlds/${worldId}/upgrades/${upgrade.id}`);
        await update(upgradeRef, {
          processed: true,
          failed: true,
          error: error.message,
          processedAt: now
        });
      }
    }
    
    console.log(`Processed ${completed} upgrades successfully, ${failed} failed`);
    
    return {
      processed: completed,
      failed: failed,
      total: upgrades.length
    };
    
  } catch (error) {
    console.error('Error processing upgrades:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Apply a structure upgrade
 * @param {string} worldId - The world ID
 * @param {Object} upgrade - The upgrade data
 * @returns {Promise<Object>} Result of the upgrade
 */
async function applyUpgrade(worldId, upgrade) {
  const now = Date.now();
  const { chunkKey, tileKey, fromLevel, toLevel } = upgrade;
  
  try {
    // Get the structure
    const structureRef = ref(db, `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`);
    const structureSnapshot = await get(structureRef);
    
    if (!structureSnapshot.exists()) {
      throw new Error('Structure not found');
    }
    
    const structure = structureSnapshot.val();
    
    // Check if structure level matches expected level
    if ((structure.level || 1) !== fromLevel) {
      throw new Error('Structure level mismatch');
    }
    
    // Apply upgrade - create the updated structure object with new level and features
    const updatedStructure = {
      ...structure,
      level: toLevel,
      upgradeInProgress: false,
      upgradeId: null,
      upgradeCompletesAt: null,
      lastUpgraded: now
    };
    
    // Add new features based on level
    updatedStructure.features = updatedStructure.features || [];
    
    // Add new level-specific features
    const newFeatures = getNewFeaturesForLevel(structure.type, toLevel);
    if (newFeatures && newFeatures.length) {
      updatedStructure.features = [...updatedStructure.features, ...newFeatures];
    }
    
    // Increase capacity
    if (updatedStructure.capacity) {
      // Each level increases capacity by 20%
      updatedStructure.capacity = Math.floor(updatedStructure.capacity * 1.2);
    }
    
    // Update the structure in database
    await set(structureRef, updatedStructure);
    
    // Mark upgrade as processed
    const upgradeRef = ref(db, `worlds/${worldId}/upgrades/${upgrade.id}`);
    await update(upgradeRef, {
      processed: true,
      failed: false,
      processedAt: now,
      status: 'completed'
    });
    
    // Add a completion event to the world chat
    const [x, y] = tileKey.split(',').map(Number);
    const chatRef = ref(db, `worlds/${worldId}/chat/upgrade_complete_${upgrade.id}`);
    await set(chatRef, {
      location: { x, y },
      text: `A structure at (${x}, ${y}) has been upgraded to level ${toLevel}!`,
      timestamp: now,
      type: 'system'
    });
    
    // Notify the player who started the upgrade
    if (upgrade.startedBy) {
      const notificationRef = ref(db, `players/${upgrade.startedBy}/notifications/upgrade_${now}`);
      await set(notificationRef, {
        type: 'upgrade_complete',
        worldId,
        structureId: structure.id,
        structureName: structure.name,
        location: { x, y },
        fromLevel,
        toLevel,
        timestamp: now
      });
    }
    
    return {
      success: true,
      structure: updatedStructure
    };
    
  } catch (error) {
    console.error(`Error applying upgrade ${upgrade.id}:`, error);
    
    // Mark upgrade as failed
    const upgradeRef = ref(db, `worlds/${worldId}/upgrades/${upgrade.id}`);
    await update(upgradeRef, {
      processed: true,
      failed: true,
      error: error.message,
      processedAt: now,
      status: 'failed'
    });
    
    // Update the structure to remove upgrade in progress
    try {
      const structureRef = ref(db, `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`);
      await update(structureRef, {
        upgradeInProgress: false,
        upgradeId: null,
        upgradeCompletesAt: null
      });
    } catch (err) {
      console.error('Error updating structure after failed upgrade:', err);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get new features to add for this structure type at a specific level
 */
function getNewFeaturesForLevel(structureType, level) {
  const features = [];
  
  // Default features added at various levels
  if (level === 2) {
    if (['outpost', 'fortress'].includes(structureType)) {
      features.push({
        name: 'Storage Expansion',
        description: 'Increased storage capacity for items',
        icon: '📦'
      });
    }
    
    if (['stronghold', 'fortress', 'citadel'].includes(structureType)) {
      features.push({
        name: 'Basic Workshop',
        description: 'Allows crafting of simple items',
        icon: '🔨'
      });
    }
  }
  
  if (level === 3) {
    if (['stronghold', 'fortress', 'citadel'].includes(structureType)) {
      features.push({
        name: 'Training Yard',
        description: 'Allows training advanced units',
        icon: '🛡️'
      });
    }
    
    if (['watchtower', 'outpost'].includes(structureType)) {
      features.push({
        name: 'Extended View',
        description: 'Increases visibility range',
        icon: '👁️'
      });
    }
  }
  
  if (level === 4) {
    if (['fortress', 'citadel', 'stronghold'].includes(structureType)) {
      features.push({
        name: 'Advanced Forge',
        description: 'Craft powerful weapons and armor',
        icon: '⚒️'
      });
    }
  }
  
  if (level === 5) {
    // Level 5 is max level, add special features
    features.push({
      name: 'Mastery',
      description: 'This structure has reached its maximum potential',
      icon: '✨'
    });
    
    if (['fortress', 'citadel'].includes(structureType)) {
      features.push({
        name: 'Legendary Workshop',
        description: 'Craft legendary items',
        icon: '🌟'
      });
    }
  }
  
  // Race-specific features based on structure race
  // (These could be expanded later)
  
  return features;
}

/**
 * Scheduled function to automatically process upgrades
 * This is called on a timer/schedule
 */
export async function upgradeTickProcessor(context) {
  try {
    // Get all worlds that might have upgrades
    const worldsRef = ref(db, 'worlds');
    const worldsSnapshot = await get(worldsRef);
    
    if (!worldsSnapshot.exists()) {
      console.log('No worlds found');
      return { processed: 0 };
    }
    
    let totalProcessed = 0;
    let totalFailed = 0;
    
    // Process upgrades for each world
    const worlds = [];
    worldsSnapshot.forEach(child => {
      worlds.push(child.key);
    });
    
    console.log(`Processing upgrades for ${worlds.length} worlds`);
    
    for (const worldId of worlds) {
      const result = await processUpgrades({ worldId });
      totalProcessed += result.processed || 0;
      totalFailed += result.failed || 0;
    }
    
    return {
      processed: totalProcessed,
      failed: totalFailed
    };
    
  } catch (error) {
    console.error('Error in upgrade tick processor:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
