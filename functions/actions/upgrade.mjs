import { getDatabase } from 'firebase-admin/database';
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { BUILDINGS } from 'gisaima-shared/definitions/BUILDINGS.js';

/**
 * Start a structure upgrade
 * @param {Object} data - The upgrade data
 * @param {string} data.worldId - The world ID
 * @param {number} data.x - Structure X coordinate
 * @param {number} data.y - Structure Y coordinate
 * @param {string} data.playerId - The player requesting the upgrade
 * @returns {Promise<Object>} The result of the upgrade request
 */
export const startStructureUpgrade = onCall({ maxInstances: 10 }, async (request) => {
  // Ensure user is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in to upgrade structures');
  }
  
  const data = request.data;
  
  try {
    // Basic validation
    if (!data.worldId || data.x === undefined || data.y === undefined) {
      throw new Error('Missing required parameters');
    }
    
    // Use authenticated user ID
    const playerId = request.auth.uid;
    
    const db = getDatabase();
    const { worldId, x, y } = data;
    
    // Calculate chunk coordinates
    const chunkSize = 20;
    const chunkX = Math.floor(x / chunkSize);
    const chunkY = Math.floor(y / chunkSize);
    const chunkKey = `${chunkX},${chunkY}`;
    const tileKey = `${x},${y}`;
    
    // Get the structure - convert to Admin SDK methods
    const structureRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`);
    const structureSnapshot = await structureRef.once('value');
    
    if (!structureSnapshot.exists()) {
      throw new Error('Structure not found');
    }
    
    const structure = structureSnapshot.val();
    
    // Get player data for crafting level
    const playerRef = db.ref(`players/${playerId}/worlds/${worldId}`);
    const playerSnapshot = await playerRef.get();
    
    if (!playerSnapshot.exists()) {
      throw new Error('Player data not found');
    }
    
    const player = playerSnapshot.val();
    const craftingLevel = player.skills?.crafting?.level || 1;
    
    // Check if player has required crafting level
    if (data.requiredLevel && data.requiredLevel > craftingLevel) {
      throw new Error(`This recipe requires crafting level ${data.requiredLevel}`);
    }
    
    // Check building requirements
    if (data.requiredBuilding) {
      const { type, level } = data.requiredBuilding;
      
      // Check if structure has the required building at the right level
      let hasRequiredBuilding = false;
      
      if (structure.buildings) {
        for (const buildingId in structure.buildings) {
          const building = structure.buildings[buildingId];
          if (building.type === type && (building.level || 1) >= level) {
            hasRequiredBuilding = true;
            break;
          }
        }
      }
      
      if (!hasRequiredBuilding) {
        throw new Error(`This recipe requires a ${type} of level ${level} or higher`);
      }
    }
    
    // Calculate crafting time
    const baseCraftingTime = data.craftingTime || 60; // Default 60 seconds
    
    // Apply crafting time modifiers
    let craftingTimeModifier = 1.0;
    
    // Lower time for higher crafting level (up to 50% reduction)
    const levelModifier = Math.min(0.5, (craftingLevel - 1) * 0.05);
    craftingTimeModifier -= levelModifier;
    
    // Check for building bonuses
    let craftingSpeedBonus = 0;
    
    if (structure.buildings) {
      for (const buildingId in structure.buildings) {
        const building = structure.buildings[buildingId];
        if (building.type === data.requiredBuilding?.type && building.benefits) {
          for (const benefit of building.benefits) {
            if (benefit.bonus && benefit.bonus.craftingSpeed) {
              craftingSpeedBonus += benefit.bonus.craftingSpeed;
            }
          }
        }
      }
    }
    
    craftingTimeModifier -= craftingSpeedBonus;
    
    // Ensure minimum 10% of original time
    craftingTimeModifier = Math.max(0.1, craftingTimeModifier);
    
    const finalCraftingTime = Math.ceil(baseCraftingTime * craftingTimeModifier);
    const craftingTimeMs = finalCraftingTime * 1000; // Convert to ms
    
    // Create the crafting entry
    const now = Date.now();
    const craftingId = `crafting_${worldId}_${playerId}_${now}`;
    
    const craftingData = {
      id: craftingId,
      recipeId: data.recipeId,
      playerId,
      playerName: player.displayName,
      worldId,
      structureId: structure.id,
      structureLocation: { x, y },
      startedAt: now,
      completesAt: now + craftingTimeMs,
      materials: data.materials,
      result: {
        name: data.result.name,
        type: data.result.type,
        quantity: data.result.quantity || 1,
        rarity: data.result.rarity || 'common',
        description: data.result.description
      },
      status: 'in_progress',
      processed: false
    };
    
    // Save the crafting entry
    const craftingRef = db.ref(`worlds/${worldId}/crafting/${craftingId}`);
    await craftingRef.set(craftingData);
    
    // Update player's crafting status
    const updatePlayerRef = db.ref(`players/${playerId}/worlds/${worldId}`);
    await updatePlayerRef.update({
      'crafting/current': craftingId,
      'crafting/completesAt': now + craftingTimeMs
    });
    
    // Consume materials from inventory
    const playerInventoryRef = db.ref(`players/${playerId}/worlds/${worldId}/inventory`);
    const playerInventorySnapshot = await playerInventoryRef.get();
    
    let playerInventory = playerInventorySnapshot.exists() ? playerInventorySnapshot.val() : [];
    
    // Add crafting event to chat
    const chatRef = db.ref(`worlds/${worldId}/chat/crafting_${craftingId}`);
    await chatRef.set({
      location: { x, y },
      text: `${player.displayName} started crafting ${data.result.name}.`,
      timestamp: now,
      type: 'event'
    });
    
    return {
      success: true,
      craftingId,
      completesAt: now + craftingTimeMs,
      timeToComplete: craftingTimeMs,
      result: craftingData.result
    };
    
  } catch (error) {
    console.error('Error starting structure upgrade:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Start a building upgrade within a structure
 * @param {Object} data - The upgrade data
 * @param {string} data.worldId - The world ID
 * @param {number} data.x - Structure X coordinate
 * @param {number} data.y - Structure Y coordinate
 * @param {string} data.buildingId - ID of the building to upgrade
 * @param {string} data.playerId - The player requesting the upgrade
 * @returns {Promise<Object>} The result of the upgrade request
 */
export const startBuildingUpgrade = onCall({ maxInstances: 10 }, async (request) => {
  // Ensure user is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in to upgrade buildings');
  }
  
  const data = request.data;
  
  try {
    // Basic validation
    if (!data.worldId || data.x === undefined || data.y === undefined || !data.buildingId) {
      throw new Error('Missing required parameters');
    }
    
    // Use authenticated user ID
    const playerId = request.auth.uid;
    
    const db = getDatabase();
    const { worldId, x, y, buildingId } = data;
    
    // Calculate chunk coordinates
    const chunkSize = 20;
    const chunkX = Math.floor(x / chunkSize);
    const chunkY = Math.floor(y / chunkSize);
    const chunkKey = `${chunkX},${chunkY}`;
    const tileKey = `${x},${y}`;
    
    // Get the structure - convert to Admin SDK methods
    const structureRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`);
    const structureSnapshot = await structureRef.once('value');
    
    if (!structureSnapshot.exists()) {
      throw new Error('Structure not found');
    }
    
    const structure = structureSnapshot.val();
    
    // Check if the building exists
    if (!structure.buildings || !structure.buildings[buildingId]) {
      throw new Error('Building not found');
    }
    
    const building = structure.buildings[buildingId];
    
    // Check if building is already being upgraded
    if (building.upgradeInProgress) {
      throw new Error('Building is already being upgraded');
    }
    
    // Check if player is owner of the structure or if it's a spawn point
    const isOwner = structure.owner === playerId;
    const isSpawn = structure.type === 'spawn';
    
    if (!isOwner && !isSpawn) {
      throw new Error('You do not have permission to upgrade this building');
    }
    
    // Calculate current and next level
    const currentLevel = building.level || 1;
    const nextLevel = currentLevel + 1;
    
    // Check if building is already at max level (assume max level 5)
    if (currentLevel >= 5) {
      throw new Error('Building is already at maximum level');
    }
    
    // Get player data
    const playerRef = db.ref(`players/${playerId}/worlds/${worldId}`);
    const playerSnapshot = await playerRef.get();
    
    if (!playerSnapshot.exists()) {
      throw new Error('Player data not found');
    }
    
    const player = playerSnapshot.val();
    
    // Calculate required resources based on building type and current level using BUILDINGS utility
    const requiredResources = BUILDINGS.getUpgradeRequirements(building.type, currentLevel);
    
    // Check if required resources are available in the structure's shared storage
    const structureItemsRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/items`);
    const structureItemsSnapshot = await structureItemsRef.get();
    
    const structureItems = structureItemsSnapshot.exists() ? structureItemsSnapshot.val() : [];
    
    // Check if all resources are available
    for (const resource of requiredResources) {
      const availableItem = structureItems.find(item => item.name === resource.name);
      const availableQuantity = availableItem ? availableItem.quantity : 0;
      
      if (availableQuantity < resource.quantity) {
        throw new Error(`Insufficient ${resource.name}: need ${resource.quantity}, have ${availableQuantity}`);
      }
    }
    
    // Calculate upgrade time based on level and building type using BUILDINGS utility
    const upgradeTime = BUILDINGS.calculateUpgradeTime(building.type, currentLevel);
    const upgradeTimeMs = upgradeTime * 1000; // Convert to ms
    
    // Generate a unique upgrade ID
    const now = Date.now();
    const upgradeId = `building_upgrade_${worldId}_${buildingId}_${now}`;
    
    // Create upgrade entry in database
    const upgradeData = {
      id: upgradeId,
      type: 'building',
      worldId,
      buildingId,
      buildingType: building.type,
      buildingName: building.name || BUILDINGS.getBuildingName(building.type),
      structureId: structure.id,
      chunkKey,
      tileKey,
      fromLevel: currentLevel,
      toLevel: nextLevel,
      startedAt: now,
      completesAt: now + upgradeTimeMs,
      startedBy: playerId,
      playerName: player.displayName,
      resources: requiredResources,
      status: 'pending',
      processed: false
    };
    
    // Save upgrade to database
    const upgradeRef = db.ref(`worlds/${worldId}/upgrades/${upgradeId}`);
    await upgradeRef.set(upgradeData);
    
    // Update building to mark as upgrading
    const buildingRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/buildings/${buildingId}`);
    await buildingRef.update({
      upgradeInProgress: true,
      upgradeId,
      upgradeStartedAt: now,
      upgradeCompletesAt: now + upgradeTimeMs
    });
    
    // Consume resources from structure storage
    for (const resource of requiredResources) {
      const itemIndex = structureItems.findIndex(item => item.name === resource.name);
      
      if (itemIndex >= 0) {
        structureItems[itemIndex].quantity -= resource.quantity;
        
        if (structureItems[itemIndex].quantity <= 0) {
          // Remove item if quantity is zero or negative
          structureItems.splice(itemIndex, 1);
        }
      }
    }
    
    // Update structure storage with consumed resources
    await structureItemsRef.set(structureItems);
    
    // Add upgrade event to chat
    const chatRef = db.ref(`worlds/${worldId}/chat/building_upgrade_${upgradeId}`);
    await chatRef.set({
      location: { x, y },
      text: `${player.displayName} started upgrading a ${building.name || building.type} from level ${currentLevel} to ${nextLevel}.`,
      timestamp: now,
      type: 'event'
    });
    
    return {
      success: true,
      upgradeId,
      buildingId,
      fromLevel: currentLevel,
      toLevel: nextLevel,
      completesAt: now + upgradeTimeMs,
      timeToComplete: upgradeTimeMs
    };
    
  } catch (error) {
    console.error('Error starting building upgrade:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Calculate required resources for building upgrade
 * @param {string} buildingType - Type of building
 * @param {number} currentLevel - Current building level
 * @returns {Array<Object>} Array of required resources
 */
function calculateBuildingUpgradeResources(buildingType, currentLevel) {
  return BUILDINGS.getUpgradeRequirements(buildingType, currentLevel);
}

/**
 * Format text by replacing underscores with spaces and capitalizing words
 * @param {string} text - Text to format
 * @returns {string} Formatted text
 */
function formatText(text) {
  if (!text) return '';
  return text.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}