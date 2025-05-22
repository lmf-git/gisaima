import { getDatabase } from 'firebase-admin/database';
import { BUILDINGS } from 'gisaima-shared';

/**
 * Process pending structure upgrades
 * @param {Object|string} data - The context data or worldId string
 * @param {Object} worldData - World data passed from tick.mjs
 * @returns {Promise<Object>} Processing results
 */
export async function processUpgrades(data = {}, worldData) {
  try {
    const db = getDatabase();
    
    // Handle both object with worldId and direct worldId string
    const worldId = typeof data === 'string' ? data : (data.worldId || 'ancient-lands');
    const now = Date.now();
    
    console.log(`Processing upgrades for world ${worldId} at ${new Date(now).toISOString()}`);
    
    // Directly use the passed worldData
    const upgradesData = worldData?.upgrades;
    
    if (!upgradesData) {
      console.log(`No pending upgrades found for world ${worldId}`);
      return { processed: 0 };
    }
    
    const upgrades = [];
    
    // Filter manually for pending upgrades that are ready to process
    Object.entries(upgradesData).forEach(([id, upgrade]) => {
      if (upgrade.status === 'pending' && upgrade.completesAt <= now && !upgrade.processed) {
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
        const upgradeRef = db.ref(`worlds/${worldId}/upgrades/${upgrade.id}`);
        await upgradeRef.update({
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
    // Handle building upgrades differently from structure upgrades
    if (upgrade.type === 'building' && upgrade.buildingId) {
      return await applyBuildingUpgrade(worldId, upgrade);
    }
    
    // Existing structure upgrade logic
    // Get the structure
    const structureRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`);
    const structureSnapshot = await structureRef.once('value');
    
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
    await structureRef.set(updatedStructure);
    
    // Mark upgrade as processed
    const upgradeRef = db.ref(`worlds/${worldId}/upgrades/${upgrade.id}`);
    await upgradeRef.update({
      processed: true,
      failed: false,
      processedAt: now,
      status: 'completed'
    });
    
    // Add a completion event to the world chat
    const [x, y] = tileKey.split(',').map(Number);
    const chatRef = db.ref(`worlds/${worldId}/chat/upgrade_complete_${upgrade.id}`);
    await chatRef.set({
      location: { x, y },
      text: `A structure at (${x}, ${y}) has been upgraded to level ${toLevel}!`,
      timestamp: now,
      type: 'system'
    });
    
    // Notify the player who started the upgrade
    if (upgrade.startedBy) {
      const notificationRef = db.ref(`players/${upgrade.startedBy}/notifications/upgrade_${now}`);
      await notificationRef.set({
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
    const upgradeRef = db.ref(`worlds/${worldId}/upgrades/${upgrade.id}`);
    await upgradeRef.update({
      processed: true,
      failed: true,
      error: error.message,
      processedAt: now,
      status: 'failed'
    });
    
    // Update the structure to remove upgrade in progress
    try {
      const structureRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`);
      await structureRef.update({
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
 * Apply a building upgrade within a structure
 * @param {string} worldId - The world ID
 * @param {Object} upgrade - The upgrade data
 * @returns {Promise<Object>} Result of the upgrade
 */
async function applyBuildingUpgrade(worldId, upgrade) {
  const now = Date.now();
  const { chunkKey, tileKey, buildingId, fromLevel, toLevel } = upgrade;
  
  try {
    // Get the building
    const buildingPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/buildings/${buildingId}`;
    const buildingRef = db.ref(buildingPath);
    const buildingSnapshot = await buildingRef.once('value');
    
    if (!buildingSnapshot.exists()) {
      throw new Error('Building not found');
    }
    
    const building = buildingSnapshot.val();
    
    // Check if building level matches expected level
    if ((building.level || 1) !== fromLevel) {
      throw new Error('Building level mismatch');
    }
    
    // Apply upgrade - create the updated building with new level and features
    const updatedBuilding = {
      ...building,
      level: toLevel,
      upgradeInProgress: false,
      upgradeId: null,
      upgradeStartedAt: null,
      upgradeCompletesAt: null,
      lastUpgraded: now
    };
    
    // Add new benefits based on level and building type
    updatedBuilding.benefits = updatedBuilding.benefits || [];
    
    // Add new level-specific benefits using centralized BUILDINGS definitions
    const newBenefits = BUILDINGS.getNewBenefitsForLevel(building.type, toLevel);
    if (newBenefits && newBenefits.length) {
      updatedBuilding.benefits = [...updatedBuilding.benefits.filter(b => 
        !newBenefits.some(nb => nb.name === b.name)), // Remove any existing benefits with same name
        ...newBenefits];
    }
    
    // Update the building in database
    await buildingRef.set(updatedBuilding);
    
    // Mark upgrade as processed
    const upgradeRef = db.ref(`worlds/${worldId}/upgrades/${upgrade.id}`);
    await upgradeRef.update({
      processed: true,
      failed: false,
      processedAt: now,
      status: 'completed'
    });
    
    // Add a completion event to the world chat
    const [x, y] = tileKey.split(',').map(Number);
    const chatRef = db.ref(`worlds/${worldId}/chat/building_upgrade_complete_${upgrade.id}`);
    await chatRef.set({
      location: { x, y },
      text: `A ${building.name || building.type} at (${x}, ${y}) has been upgraded to level ${toLevel}!`,
      timestamp: now,
      type: 'system'
    });
    
    // Notify the player who started the upgrade
    if (upgrade.startedBy) {
      const notificationRef = db.ref(`players/${upgrade.startedBy}/notifications/building_upgrade_${now}`);
      await notificationRef.set({
        type: 'building_upgrade_complete',
        worldId,
        structureId: upgrade.structureId,
        buildingId: buildingId,
        buildingName: building.name || building.type,
        location: { x, y },
        fromLevel,
        toLevel,
        timestamp: now
      });
    }
    
    return {
      success: true,
      building: updatedBuilding
    };
    
  } catch (error) {
    console.error(`Error applying building upgrade ${upgrade.id}:`, error);
    
    // Mark upgrade as failed
    const upgradeRef = db.ref(`worlds/${worldId}/upgrades/${upgrade.id}`);
    await upgradeRef.update({
      processed: true,
      failed: true,
      error: error.message,
      processedAt: now,
      status: 'failed'
    });
    
    // Update the building to remove upgrade in progress
    try {
      const buildingRef = db.ref(`worlds/${upgrade.chunkKey}/${upgrade.tileKey}/structure/buildings/${upgrade.buildingId}`);
      await buildingRef.update({
        upgradeInProgress: false,
        upgradeId: null,
        upgradeStartedAt: null,
        upgradeCompletesAt: null
      });
    } catch (err) {
      console.error('Error updating building after failed upgrade:', err);
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
  
  return features;
}

/**
 * Scheduled function to automatically process upgrades
 * This is called on a timer/schedule
 */
export const upgradeTickProcessor = processUpgrades;
