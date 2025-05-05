import { getDatabase } from 'firebase-admin/database';
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { BUILDINGS } from 'gisaima-shared';
import { ITEMS } from 'gisaima-shared/definitions/ITEMS.js';

/**
 * Normalize a resource name to a standard format for comparison
 * @param {string} resourceName - The resource name to normalize
 * @returns {string} Normalized resource key
 */
function normalizeResourceName(resourceName) {
  if (!resourceName) return '';
  
  // First try to find exact match in ITEMS
  const itemKey = Object.keys(ITEMS).find(key => 
    ITEMS[key].name === resourceName);
  
  if (itemKey) {
    return itemKey;
  }
  
  // If no exact match, normalize the name
  return resourceName.toUpperCase().replace(/ /g, '_');
}

/**
 * Get item definition from ITEMS by name
 * @param {string} name - Item name to look up
 * @returns {Object|null} Item definition or null if not found
 */
function getItemByName(name) {
  const normalizedName = normalizeResourceName(name);
  
  // First try direct match with normalized name
  if (ITEMS[normalizedName]) {
    return ITEMS[normalizedName];
  }
  
  // If that fails, try to find by the name property
  return Object.values(ITEMS).find(item => 
    normalizeResourceName(item.name) === normalizedName) || null;
}

/**
 * Start a structure upgrade
 * @param {Object} data - The upgrade data
 * @param {string} data.worldId - The world ID
 * @param {number} data.x - Structure X coordinate
 * @param {number} data.y - Structure Y coordinate
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
    
    // Get the structure
    const structureRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`);
    const structureSnapshot = await structureRef.once('value');
    
    if (!structureSnapshot.exists()) {
      throw new Error('Structure not found');
    }
    
    const structure = structureSnapshot.val();
    
    // Check if structure is already being upgraded
    if (structure.upgradeInProgress) {
      throw new Error('Structure is already being upgraded');
    }
    
    // Check if player is owner of the structure or if it's a spawn point
    const isOwner = structure.owner === playerId;
    const isSpawn = structure.type === 'spawn';
    
    if (!isOwner && !isSpawn) {
      throw new Error('You do not have permission to upgrade this structure');
    }
    
    // Calculate current and next level
    const currentLevel = structure.level || 1;
    const nextLevel = currentLevel + 1;
    
    // Check if structure is already at max level (assume max level 5)
    if (currentLevel >= 5) {
      throw new Error('Structure is already at maximum level');
    }
    
    // Get player data for display name
    const playerRef = db.ref(`players/${playerId}/worlds/${worldId}`);
    const playerSnapshot = await playerRef.once('value');
    
    if (!playerSnapshot.exists()) {
      throw new Error('Player data not found');
    }
    
    const player = playerSnapshot.val();
    
    // Calculate required resources based on structure type and current level
    const requiredResources = getUpgradeRequirements(structure.type, currentLevel);
    
    // NEW: Check resources in both personal bank and shared storage
    const personalBankRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/banks/${playerId}`);
    const personalBankSnapshot = await personalBankRef.once('value');
    const personalBank = personalBankSnapshot.val() || [];
    
    // Create resource map from player's bank items
    const bankResources = {};
    if (Array.isArray(personalBank)) {
      personalBank.forEach(item => {
        if (item.type === 'resource') {
          // Store by both ID and name for flexibility
          if (item.id) {
            const upperCaseId = item.id.toUpperCase();
            bankResources[upperCaseId] = (bankResources[upperCaseId] || 0) + item.quantity;
          }
          
          // Also normalize name (e.g., "Wooden Sticks" -> "WOODEN_STICKS")
          if (item.name) {
            const normalizedName = item.name.toUpperCase().replace(/ /g, '_');
            bankResources[normalizedName] = (bankResources[normalizedName] || 0) + item.quantity;
          }
        }
      });
    }
    
    // Get shared storage resources
    const sharedResources = {};
    if (isOwner && structure.items) {
      const structureItems = Array.isArray(structure.items) ? structure.items : [];
      structureItems.forEach(item => {
        if (item.type === 'resource') {
          if (item.id) {
            const upperCaseId = item.id.toUpperCase();
            sharedResources[upperCaseId] = (sharedResources[upperCaseId] || 0) + item.quantity;
          }
          
          if (item.name) {
            const normalizedName = item.name.toUpperCase().replace(/ /g, '_');
            sharedResources[normalizedName] = (sharedResources[normalizedName] || 0) + item.quantity;
          }
        }
      });
    }
    
    // Combine available resources (for checking only, deduction will be handled separately)
    const combinedResources = {...bankResources};
    if (isOwner) {
      Object.entries(sharedResources).forEach(([key, value]) => {
        combinedResources[key] = (combinedResources[key] || 0) + value;
      });
    }
    
    // Check if required resources are available in the combined storage
    const insufficientResources = [];
    for (const resource of requiredResources) {
      // Normalize the resource name to ITEMS format
      const itemDef = getItemByName(resource.name);
      const resourceKey = itemDef ? itemDef.id : normalizeResourceName(resource.name);
      
      const amountNeeded = resource.quantity;
      
      // Look for the resource using normalized keys
      let availableAmount = 0;
      
      // Check if we have this resource in combined inventory using various possible keys
      if (combinedResources[resourceKey]) {
        availableAmount = combinedResources[resourceKey];
      } else if (itemDef && combinedResources[itemDef.name]) {
        availableAmount = combinedResources[itemDef.name];
      } else if (combinedResources[resource.name]) {
        availableAmount = combinedResources[resource.name];
      }
      
      if (availableAmount < amountNeeded) {
        insufficientResources.push({
          resource: itemDef?.name || resource.name,
          needed: amountNeeded,
          available: availableAmount
        });
      }
    }
    
    if (insufficientResources.length > 0) {
      throw new Error(`Insufficient resources: ${insufficientResources.map(r => 
        `${r.resource} (need ${r.needed}, have ${r.available})`).join(', ')}`);
    }
    
    // Calculate upgrade time based on level and structure type
    const upgradeTime = calculateUpgradeTime(structure.type, currentLevel);
    const upgradeTimeMs = upgradeTime * 1000; // Convert to ms
    
    // Generate a unique upgrade ID
    const now = Date.now();
    const upgradeId = `structure_upgrade_${worldId}_${tileKey.replace(',', '_')}_${now}`;
    
    // Create upgrade entry in database
    const upgradeData = {
      id: upgradeId,
      type: 'structure',
      worldId,
      structureId: structure.id,
      structureType: structure.type,
      structureName: structure.name || formatText(structure.type),
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
    
    // Track which resources were deducted from which storage
    const deductionSummary = {
      personal: {},
      shared: {}
    };
    
    // Perform the database operations in a transaction
    await db.ref().transaction((data) => {
      if (!data) return null;
      
      // Update structure to mark as upgrading
      if (!data.worlds) data.worlds = {};
      if (!data.worlds[worldId]) data.worlds[worldId] = {};
      if (!data.worlds[worldId].chunks) data.worlds[worldId].chunks = {};
      if (!data.worlds[worldId].chunks[chunkKey]) data.worlds[worldId].chunks[chunkKey] = {};
      if (!data.worlds[worldId].chunks[chunkKey][tileKey]) data.worlds[worldId].chunks[chunkKey][tileKey] = {};
      if (!data.worlds[worldId].chunks[chunkKey][tileKey].structure) {
        data.worlds[worldId].chunks[chunkKey][tileKey].structure = {};
      }
      
      const structure = data.worlds[worldId].chunks[chunkKey][tileKey].structure;
      
      // Mark structure as upgrading
      structure.upgradeInProgress = true;
      structure.upgradeId = upgradeId;
      structure.upgradeCompletesAt = now + upgradeTimeMs;
      
      // Add upgrade to world upgrades list
      if (!data.worlds[worldId].upgrades) data.worlds[worldId].upgrades = {};
      data.worlds[worldId].upgrades[upgradeId] = upgradeData;
      
      // Prepare for resource deduction
      const resourcesNeeded = {};
      requiredResources.forEach(resource => {
        const itemDef = getItemByName(resource.name);
        const key = itemDef ? itemDef.id : normalizeResourceName(resource.name);
        resourcesNeeded[key] = resource.quantity;
      });
      
      const isStructureOwner = structure.owner === playerId;
      
      // 1. First try deducting from personal bank
      if (!structure.banks) structure.banks = {};
      if (!structure.banks[playerId]) structure.banks[playerId] = [];
      
      // Create updated bank with resources deducted
      const updatedBank = [];
      
      // Process each item in the personal bank
      if (Array.isArray(structure.banks[playerId])) {
        for (const item of structure.banks[playerId]) {
          // Skip non-resource items
          if (!item || item.type !== 'resource') {
            updatedBank.push(item);
            continue;
          }
          
          // Check if this item needs to be deducted
          let deductFromThisItem = 0;
          
          // Check if item ID matches any resource we need
          if (item.id) {
            const upperItemId = item.id.toUpperCase();
            for (const [resourceKey, amountNeeded] of Object.entries(resourcesNeeded)) {
              if (upperItemId === resourceKey && amountNeeded > 0) {
                deductFromThisItem = Math.min(item.quantity, amountNeeded);
                resourcesNeeded[resourceKey] -= deductFromThisItem;
                
                // Track what was deducted from personal storage
                deductionSummary.personal[resourceKey] = 
                  (deductionSummary.personal[resourceKey] || 0) + deductFromThisItem;
                break;
              }
            }
          }
          
          // If no match by ID, try matching by normalized name
          if (deductFromThisItem === 0 && item.name) {
            const normalizedName = normalizeResourceName(item.name);
            for (const [resourceKey, amountNeeded] of Object.entries(resourcesNeeded)) {
              if (normalizedName === resourceKey && amountNeeded > 0) {
                deductFromThisItem = Math.min(item.quantity, amountNeeded);
                resourcesNeeded[resourceKey] -= deductFromThisItem;
                
                // Track what was deducted from personal storage
                deductionSummary.personal[resourceKey] = 
                  (deductionSummary.personal[resourceKey] || 0) + deductFromThisItem;
                break;
              }
            }
          }
          
          // If we're deducting from this item
          if (deductFromThisItem > 0) {
            // If there's quantity remaining, keep the item with reduced quantity
            if (item.quantity > deductFromThisItem) {
              updatedBank.push({
                ...item,
                quantity: item.quantity - deductFromThisItem
              });
            }
            // Otherwise the entire item is consumed, so don't add it to updatedBank
          } else {
            // Item not affected, keep it as is
            updatedBank.push(item);
          }
        }
      }
      
      // Update the personal bank with our modified items
      structure.banks[playerId] = updatedBank;
      
      // 2. If player is structure owner and still needs resources, try deducting from shared storage
      if (isStructureOwner && Object.values(resourcesNeeded).some(amount => amount > 0)) {
        // Create updated shared storage with remaining resources deducted
        const updatedSharedItems = [];
        
        // Process each item in shared storage
        if (Array.isArray(structure.items)) {
          for (const item of structure.items) {
            // Skip non-resource items
            if (!item || item.type !== 'resource') {
              updatedSharedItems.push(item);
              continue;
            }
            
            // Check if this item needs to be deducted
            let deductFromThisItem = 0;
            
            // Check if item ID matches any resource we still need
            if (item.id) {
              const upperItemId = item.id.toUpperCase();
              for (const [resourceKey, amountNeeded] of Object.entries(resourcesNeeded)) {
                if (resourceKey === upperItemId && amountNeeded > 0) {
                  deductFromThisItem = Math.min(item.quantity, amountNeeded);
                  resourcesNeeded[resourceKey] -= deductFromThisItem;
                  
                  // Track what was deducted from shared storage
                  deductionSummary.shared[resourceKey] = 
                    (deductionSummary.shared[resourceKey] || 0) + deductFromThisItem;
                  break;
                }
              }
            }
            
            // If no match by ID, try matching by normalized name
            if (deductFromThisItem === 0 && item.name) {
              const normalizedName = normalizeResourceName(item.name);
              for (const [resourceKey, amountNeeded] of Object.entries(resourcesNeeded)) {
                if (resourceKey === normalizedName && amountNeeded > 0) {
                  deductFromThisItem = Math.min(item.quantity, amountNeeded);
                  resourcesNeeded[resourceKey] -= deductFromThisItem;
                  
                  // Track what was deducted from shared storage
                  deductionSummary.shared[resourceKey] = 
                    (deductionSummary.shared[resourceKey] || 0) + deductFromThisItem;
                  break;
                }
              }
            }
            
            // If we're deducting from this item
            if (deductFromThisItem > 0) {
              // If there's quantity remaining, keep the item with reduced quantity
              if (item.quantity > deductFromThisItem) {
                updatedSharedItems.push({
                  ...item,
                  quantity: item.quantity - deductFromThisItem
                });
              }
              // Otherwise the entire item is consumed, so don't add it to updatedSharedItems
            } else {
              // Item not affected, keep it as is
              updatedSharedItems.push(item);
            }
          }
        }
        
        // Update the shared storage with our modified items
        structure.items = updatedSharedItems;
      }
      
      // Add deduction summary to upgrade data
      data.worlds[worldId].upgrades[upgradeId].resourceDeduction = deductionSummary;
      
      return data;
    });
    
    // Add upgrade event to chat
    const chatRef = db.ref(`worlds/${worldId}/chat/upgrade_${upgradeId}`);
    await chatRef.set({
      location: { x, y },
      text: `${player.displayName} started upgrading a ${structure.name || structure.type} from level ${currentLevel} to ${nextLevel}.`,
      timestamp: now,
      type: 'event'
    });
    
    return {
      success: true,
      upgradeId,
      fromLevel: currentLevel,
      toLevel: nextLevel,
      completesAt: now + upgradeTimeMs,
      timeToComplete: upgradeTimeMs,
      resourceDeduction: deductionSummary
    };
    
  } catch (error) {
    console.error('Error starting structure upgrade:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Get required resources for a structure upgrade
 * @param {string} structureType - Type of structure
 * @param {number} currentLevel - Current structure level
 * @returns {Array<Object>} Array of required resources
 */
function getUpgradeRequirements(structureType, currentLevel) {
  const resources = [];
  const levelMultiplier = currentLevel * 1.5;
  
  // Base resources required for all structures
  resources.push({ name: 'Wooden Sticks', quantity: Math.floor(10 * levelMultiplier) });
  resources.push({ name: 'Stone Pieces', quantity: Math.floor(8 * levelMultiplier) });
  
  // Additional resources based on structure type
  switch (structureType) {
    case 'outpost':
      // Standard resources, no extra
      break;
      
    case 'fortress':
    case 'stronghold':
      resources.push({ name: 'Iron Ore', quantity: Math.floor(5 * levelMultiplier) });
      break;
      
    case 'watchtower':
      resources.push({ name: 'Rope', quantity: Math.floor(3 * levelMultiplier) });
      break;
      
    case 'citadel':
      resources.push({ name: 'Iron Ore', quantity: Math.floor(8 * levelMultiplier) });
      resources.push({ name: 'Gold Ore', quantity: Math.floor(3 * levelMultiplier) });
      break;
      
    case 'spawn':
      // Spawn points need more resources to upgrade
      resources.forEach(resource => {
        resource.quantity = Math.floor(resource.quantity * 1.5);
      });
      resources.push({ name: 'Crystal Shard', quantity: currentLevel });
      break;
      
    default:
      // Default case for other structure types
      break;
  }
  
  // Higher level structures need special resources
  if (currentLevel >= 3) {
    resources.push({ name: 'Crystal Shard', quantity: currentLevel - 2 });
  }
  
  return resources;
}

/**
 * Calculate upgrade time for a structure
 * @param {string} structureType - Type of structure
 * @param {number} currentLevel - Current structure level
 * @returns {number} Upgrade time in seconds
 */
function calculateUpgradeTime(structureType, currentLevel) {
  // Base upgrade time in seconds
  const baseUpgradeTime = 120; 
  
  // Each level adds 50% more time
  const levelMultiplier = 1 + (currentLevel * 0.5); 
  
  // Type-specific multiplier
  let typeMultiplier = 1;
  
  switch (structureType) {
    case 'outpost':
      typeMultiplier = 0.8;
      break;
      
    case 'fortress':
    case 'stronghold':
      typeMultiplier = 1.5;
      break;
      
    case 'watchtower':
      typeMultiplier = 0.7;
      break;
      
    case 'citadel':
      typeMultiplier = 2.0;
      break;
      
    case 'spawn':
      typeMultiplier = 2.5;
      break;
      
    default:
      typeMultiplier = 1.0;
      break;
  }
  
  // Calculate final time in seconds
  return Math.ceil(baseUpgradeTime * levelMultiplier * typeMultiplier);
}

/**
 * Start a building upgrade within a structure
 * @param {Object} data - The upgrade data
 * @param {string} data.worldId - The world ID
 * @param {number} data.x - Structure X coordinate
 * @param {number} data.y - Structure Y coordinate
 * @param {string} data.buildingId - ID of the building to upgrade
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
    
    // Check if all resources are available - use improved resource matching
    for (const resource of requiredResources) {
      const itemDef = getItemByName(resource.name);
      const resourceName = itemDef?.name || resource.name;
      
      // Try multiple matching strategies to find the right item
      let availableQuantity = 0;
      let foundItem = null;
      
      // First try exact name match
      foundItem = structureItems.find(item => item.name === resourceName);
      
      // If not found by name, try by ID
      if (!foundItem && itemDef) {
        foundItem = structureItems.find(item => item.id === itemDef.id);
      }
      
      // If still not found, try with normalized names
      if (!foundItem) {
        const normalizedResourceName = normalizeResourceName(resourceName);
        foundItem = structureItems.find(item => 
          normalizeResourceName(item.name) === normalizedResourceName || 
          (item.id && normalizeResourceName(item.id) === normalizedResourceName)
        );
      }
      
      availableQuantity = foundItem ? foundItem.quantity : 0;
      
      if (availableQuantity < resource.quantity) {
        throw new Error(`Insufficient ${resourceName}: need ${resource.quantity}, have ${availableQuantity}`);
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