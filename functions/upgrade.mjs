import { db } from './config.mjs';
import { ref, get, set, update, serverTimestamp } from "firebase/database";

/**
 * Start a structure upgrade
 * @param {Object} data - The upgrade data
 * @param {string} data.worldId - The world ID
 * @param {number} data.x - Structure X coordinate
 * @param {number} data.y - Structure Y coordinate
 * @param {string} data.playerId - The player requesting the upgrade
 * @returns {Promise<Object>} The result of the upgrade request
 */
export async function startStructureUpgrade(data, context) {
  try {
    // Basic validation
    if (!data.worldId || data.x === undefined || data.y === undefined || !data.playerId) {
      throw new Error('Missing required parameters');
    }
    
    const { worldId, x, y, playerId } = data;
    
    // Calculate chunk coordinates
    const chunkSize = 20; // Same as in map.js
    const chunkX = Math.floor(x / chunkSize);
    const chunkY = Math.floor(y / chunkSize);
    const chunkKey = `${chunkX},${chunkY}`;
    const tileKey = `${x},${y}`;
    
    // Ref to the structure
    const structureRef = ref(db, `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`);
    const structureSnapshot = await get(structureRef);
    
    if (!structureSnapshot.exists()) {
      throw new Error('Structure not found');
    }
    
    const structure = structureSnapshot.val();
    
    // Check if structure can be upgraded
    const currentLevel = structure.level || 1;
    const maxLevel = 5;
    
    if (currentLevel >= maxLevel) {
      throw new Error('Structure is already at maximum level');
    }
    
    // Check ownership - allow upgrades for public structures and owned structures
    const isOwner = structure.owner === playerId;
    const isPublic = structure.type === 'spawn';
    
    if (!isOwner && !isPublic) {
      throw new Error('You do not own this structure');
    }
    
    // Calculate upgrade requirements based on current level and structure type
    const requirements = getUpgradeRequirements(structure);
    
    // Check if resources are available in structure or personal bank
    const hasResources = await checkAvailableResources(worldId, chunkKey, tileKey, playerId, requirements);
    
    if (!hasResources) {
      throw new Error('Insufficient resources for upgrade');
    }
    
    // Calculate upgrade time (longer for higher levels)
    const baseUpgradeTime = 5 * 60 * 1000; // 5 minutes in ms
    const upgradeTime = baseUpgradeTime * currentLevel;
    
    // Create upgrade entry
    const now = Date.now();
    const upgradeId = `upgrade_${worldId}_${chunkKey}_${tileKey}_${now}`;
    const upgradeData = {
      id: upgradeId,
      worldId,
      chunkKey,
      tileKey,
      structureId: structure.id || `structure_${tileKey}`,
      startedAt: now,
      completesAt: now + upgradeTime,
      startedBy: playerId,
      fromLevel: currentLevel,
      toLevel: currentLevel + 1,
      requirements,
      processed: false,
      failed: false,
      status: 'pending'
    };
    
    // Save the upgrade entry
    const upgradeRef = ref(db, `worlds/${worldId}/upgrades/${upgradeId}`);
    await set(upgradeRef, upgradeData);
    
    // Remove the required resources
    await consumeResources(worldId, chunkKey, tileKey, playerId, requirements);
    
    // Update structure with upgrade in progress
    await update(structureRef, {
      upgradeInProgress: true,
      upgradeId,
      upgradeCompletesAt: now + upgradeTime
    });
    
    // Add an upgrade event to the chat
    const chatRef = ref(db, `worlds/${worldId}/chat/upgrade_${upgradeId}`);
    await set(chatRef, {
      location: { x, y },
      text: `A structure upgrade has started at (${x}, ${y})`,
      timestamp: now,
      type: 'system'
    });
    
    // Give player "builder" achievement if first upgrade
    await checkAndAwardBuilderAchievement(worldId, playerId);
    
    return {
      success: true,
      upgradeId,
      completesAt: now + upgradeTime,
      timeToComplete: upgradeTime,
      structure: {
        ...structure,
        upgradeInProgress: true
      }
    };
    
  } catch (error) {
    console.error('Error starting structure upgrade:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if player has "builder" achievement and award if not
 */
async function checkAndAwardBuilderAchievement(worldId, playerId) {
  try {
    const achievementRef = ref(db, `players/${playerId}/worlds/${worldId}/achievements/builder`);
    const snapshot = await get(achievementRef);
    
    if (!snapshot.exists()) {
      const updates = {
        [`players/${playerId}/worlds/${worldId}/achievements/builder`]: true,
        [`players/${playerId}/worlds/${worldId}/achievements/builder_date`]: Date.now()
      };
      await update(ref(db), updates);
    }
  } catch (error) {
    console.error('Error awarding builder achievement:', error);
  }
}

/**
 * Calculate upgrade requirements based on structure type and level
 */
function getUpgradeRequirements(structure) {
  const currentLevel = structure.level || 1;
  const structureType = structure.type || 'generic';
  
  // Base requirements scaling with level
  const baseWood = currentLevel * 5;
  const baseStone = currentLevel * 3;
  
  // Different structure types have different requirements
  const requirements = [];
  
  if (structureType === 'outpost' || structureType === 'spawn') {
    requirements.push({ name: 'Wooden Sticks', quantity: baseWood });
    requirements.push({ name: 'Stone Pieces', quantity: baseStone });
  } else if (structureType === 'stronghold' || structureType === 'fortress') {
    requirements.push({ name: 'Wooden Sticks', quantity: Math.floor(baseWood * 1.5) });
    requirements.push({ name: 'Stone Pieces', quantity: Math.floor(baseStone * 1.5) });
    requirements.push({ name: 'Iron Ore', quantity: currentLevel * 2 });
  } else {
    // Default requirements
    requirements.push({ name: 'Wooden Sticks', quantity: baseWood });
    requirements.push({ name: 'Stone Pieces', quantity: baseStone });
  }
  
  // Higher level upgrades might require special materials
  if (currentLevel >= 3) {
    requirements.push({ name: 'Crystal Shard', quantity: 1 });
  }
  
  return requirements;
}

/**
 * Check if structure has enough resources for upgrade
 */
async function checkAvailableResources(worldId, chunkKey, tileKey, playerId, requirements) {
  try {
    // Get structure items (shared storage)
    const structureItemsRef = ref(db, `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/items`);
    const structureItemsSnapshot = await get(structureItemsRef);
    const sharedItems = structureItemsSnapshot.exists() ? structureItemsSnapshot.val() : [];
    
    // Get personal bank items if they exist
    const personalBankRef = ref(db, `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/banks/${playerId}`);
    const personalBankSnapshot = await get(personalBankRef);
    const personalItems = personalBankSnapshot.exists() ? personalBankSnapshot.val() : [];
    
    // Combine available resources
    const availableResources = {};
    
    // Count shared resources
    sharedItems.forEach(item => {
      if (!availableResources[item.name]) {
        availableResources[item.name] = 0;
      }
      availableResources[item.name] += item.quantity || 0;
    });
    
    // Count personal resources
    personalItems.forEach(item => {
      if (!availableResources[item.name]) {
        availableResources[item.name] = 0;
      }
      availableResources[item.name] += item.quantity || 0;
    });
    
    // Check if all requirements are met
    for (const req of requirements) {
      const available = availableResources[req.name] || 0;
      if (available < req.quantity) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error checking available resources:', error);
    return false;
  }
}

/**
 * Consume resources from structure storage and personal bank
 */
async function consumeResources(worldId, chunkKey, tileKey, playerId, requirements) {
  try {
    // Get structure items (shared storage)
    const structureItemsRef = ref(db, `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/items`);
    const structureItemsSnapshot = await get(structureItemsRef);
    let sharedItems = structureItemsSnapshot.exists() ? structureItemsSnapshot.val() : [];
    
    // Get personal bank items if they exist
    const personalBankRef = ref(db, `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/banks/${playerId}`);
    const personalBankSnapshot = await get(personalBankRef);
    let personalItems = personalBankSnapshot.exists() ? personalBankSnapshot.val() : [];
    
    // Copy of requirements to track what's left to consume
    const remainingReqs = [...requirements].map(req => ({ ...req }));
    
    // Try to consume from personal bank first
    personalItems = personalItems.map(item => {
      const reqIndex = remainingReqs.findIndex(req => req.name === item.name && req.quantity > 0);
      if (reqIndex >= 0) {
        const req = remainingReqs[reqIndex];
        const toConsume = Math.min(item.quantity, req.quantity);
        req.quantity -= toConsume;
        
        if (req.quantity <= 0) {
          remainingReqs.splice(reqIndex, 1);
        }
        
        return {
          ...item,
          quantity: item.quantity - toConsume
        };
      }
      return item;
    }).filter(item => item.quantity > 0);
    
    // Then consume from shared storage if needed
    sharedItems = sharedItems.map(item => {
      const reqIndex = remainingReqs.findIndex(req => req.name === item.name && req.quantity > 0);
      if (reqIndex >= 0) {
        const req = remainingReqs[reqIndex];
        const toConsume = Math.min(item.quantity, req.quantity);
        req.quantity -= toConsume;
        
        if (req.quantity <= 0) {
          remainingReqs.splice(reqIndex, 1);
        }
        
        return {
          ...item,
          quantity: item.quantity - toConsume
        };
      }
      return item;
    }).filter(item => item.quantity > 0);
    
    // Update the storages
    await set(structureItemsRef, sharedItems);
    await set(personalBankRef, personalItems);
    
    return true;
  } catch (error) {
    console.error('Error consuming resources:', error);
    return false;
  }
}

/**
 * Cancel an in-progress upgrade and refund resources
 */
export async function cancelStructureUpgrade(data, context) {
  try {
    // Basic validation
    if (!data.worldId || !data.upgradeId || !data.playerId) {
      throw new Error('Missing required parameters');
    }
    
    const { worldId, upgradeId, playerId } = data;
    
    // Get the upgrade data
    const upgradeRef = ref(db, `worlds/${worldId}/upgrades/${upgradeId}`);
    const upgradeSnapshot = await get(upgradeRef);
    
    if (!upgradeSnapshot.exists()) {
      throw new Error('Upgrade not found');
    }
    
    const upgrade = upgradeSnapshot.val();
    
    // Check if player started this upgrade or owns the structure
    const structureRef = ref(db, `worlds/${worldId}/chunks/${upgrade.chunkKey}/${upgrade.tileKey}/structure`);
    const structureSnapshot = await get(structureRef);
    
    if (!structureSnapshot.exists()) {
      throw new Error('Structure not found');
    }
    
    const structure = structureSnapshot.val();
    const isOwner = structure.owner === playerId;
    const isUpgradeStarter = upgrade.startedBy === playerId;
    
    if (!isOwner && !isUpgradeStarter) {
      throw new Error('You cannot cancel this upgrade');
    }
    
    // Check if upgrade is still in progress
    if (upgrade.processed || upgrade.failed || upgrade.status !== 'pending') {
      throw new Error('This upgrade cannot be canceled');
    }
    
    // Refund resources (give back 80% of resources used)
    const refundRequirements = upgrade.requirements.map(req => ({
      name: req.name,
      quantity: Math.floor(req.quantity * 0.8) // 80% refund
    }));
    
    // Add refunded resources to structure
    await refundResources(worldId, upgrade.chunkKey, upgrade.tileKey, playerId, refundRequirements);
    
    // Update structure to remove upgrade in progress
    await update(structureRef, {
      upgradeInProgress: false,
      upgradeId: null,
      upgradeCompletesAt: null
    });
    
    // Update upgrade status
    await update(upgradeRef, {
      status: 'canceled',
      canceledAt: Date.now(),
      canceledBy: playerId
    });
    
    // Add a cancellation event to the chat
    const chatRef = ref(db, `worlds/${worldId}/chat/cancel_${upgradeId}`);
    await set(chatRef, {
      location: { 
        x: parseInt(upgrade.tileKey.split(',')[0]),
        y: parseInt(upgrade.tileKey.split(',')[1])
      },
      text: `A structure upgrade has been canceled at (${upgrade.tileKey})`,
      timestamp: Date.now(),
      type: 'system'
    });
    
    return {
      success: true,
      refundedResources: refundRequirements
    };
    
  } catch (error) {
    console.error('Error canceling structure upgrade:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Add refunded resources to structure storage
 */
async function refundResources(worldId, chunkKey, tileKey, playerId, resources) {
  try {
    // First try to add to personal bank
    const personalBankRef = ref(db, `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/banks/${playerId}`);
    const personalBankSnapshot = await get(personalBankRef);
    let personalItems = personalBankSnapshot.exists() ? personalBankSnapshot.val() : [];
    
    // Add resources to personal items
    resources.forEach(resource => {
      const existingItem = personalItems.find(item => item.name === resource.name);
      if (existingItem) {
        existingItem.quantity += resource.quantity;
      } else {
        personalItems.push({
          name: resource.name,
          quantity: resource.quantity,
          type: 'resource'
        });
      }
    });
    
    // Update personal bank
    await set(personalBankRef, personalItems);
    
    return true;
  } catch (error) {
    console.error('Error refunding resources:', error);
    
    // If personal bank fails, try shared storage as fallback
    try {
      const structureItemsRef = ref(db, `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/items`);
      const structureItemsSnapshot = await get(structureItemsRef);
      let sharedItems = structureItemsSnapshot.exists() ? structureItemsSnapshot.val() : [];
      
      // Add resources to shared items
      resources.forEach(resource => {
        const existingItem = sharedItems.find(item => item.name === resource.name);
        if (existingItem) {
          existingItem.quantity += resource.quantity;
        } else {
          sharedItems.push({
            name: resource.name,
            quantity: resource.quantity,
            type: 'resource'
          });
        }
      });
      
      // Update shared storage
      await set(structureItemsRef, sharedItems);
      
      return true;
    } catch (fallbackError) {
      console.error('Error refunding to shared storage:', fallbackError);
      return false;
    }
  }
}
