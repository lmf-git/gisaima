import { getDatabase } from 'firebase-admin/database';
import { ref, get, update, set, query, orderByChild, equalTo } from "firebase/database";

/**
 * Process pending structure upgrades
 * @param {Object} data - The context data
 * @param {string} data.worldId - The world ID to process upgrades for
 * @returns {Promise<Object>} Processing results
 */
export async function processUpgrades(data = {}) {
  try {
    const db = getDatabase();
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
    // Handle building upgrades differently from structure upgrades
    if (upgrade.type === 'building' && upgrade.buildingId) {
      return await applyBuildingUpgrade(worldId, upgrade);
    }
    
    // Existing structure upgrade logic
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
    const buildingRef = ref(db, buildingPath);
    const buildingSnapshot = await get(buildingRef);
    
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
    
    // Add new level-specific benefits
    const newBenefits = getNewBenefitsForBuilding(building.type, toLevel);
    if (newBenefits && newBenefits.length) {
      updatedBuilding.benefits = [...updatedBuilding.benefits.filter(b => 
        !newBenefits.some(nb => nb.name === b.name)), // Remove any existing benefits with same name
        ...newBenefits];
    }
    
    // Update the building in database
    await set(buildingRef, updatedBuilding);
    
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
    const chatRef = ref(db, `worlds/${worldId}/chat/building_upgrade_complete_${upgrade.id}`);
    await set(chatRef, {
      location: { x, y },
      text: `A ${building.name || building.type} at (${x}, ${y}) has been upgraded to level ${toLevel}!`,
      timestamp: now,
      type: 'system'
    });
    
    // Notify the player who started the upgrade
    if (upgrade.startedBy) {
      const notificationRef = ref(db, `players/${upgrade.startedBy}/notifications/building_upgrade_${now}`);
      await set(notificationRef, {
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
    const upgradeRef = ref(db, `worlds/${worldId}/upgrades/${upgrade.id}`);
    await update(upgradeRef, {
      processed: true,
      failed: true,
      error: error.message,
      processedAt: now,
      status: 'failed'
    });
    
    // Update the building to remove upgrade in progress
    try {
      const buildingRef = ref(db, `worlds/${worldId}/chunks/${upgrade.chunkKey}/${upgrade.tileKey}/structure/buildings/${upgrade.buildingId}`);
      await update(buildingRef, {
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
  
  // Race-specific features based on structure race
  // (These could be expanded later)
  
  return features;
}

/**
 * Get new benefits to add for this building type at a specific level
 */
function getNewBenefitsForBuilding(buildingType, level) {
  const benefits = [];
  
  switch (buildingType) {
    case 'smithy':
      if (level === 2) {
        benefits.push({
          name: 'Basic Smithing',
          description: 'Allows crafting metal tools',
          bonus: { craftingSpeed: 0.1 }
        });
      } else if (level === 3) {
        benefits.push({
          name: 'Advanced Smithing',
          description: 'Allows crafting advanced weapons',
          unlocks: ['iron_sword', 'iron_pickaxe']
        });
      } else if (level === 4) {
        benefits.push({
          name: 'Expert Smithing',
          description: 'Allows crafting expert-level equipment',
          unlocks: ['steel_sword', 'steel_armor']
        });
      } else if (level === 5) {
        benefits.push({
          name: 'Master Smithing',
          description: 'Allows crafting legendary items',
          unlocks: ['legendary_weapon']
        });
      }
      break;
    
    case 'barracks':
      if (level === 2) {
        benefits.push({
          name: 'Basic Training',
          description: 'Allows training of basic soldiers',
          unlocks: ['recruit_soldier']
        });
      } else if (level === 3) {
        benefits.push({
          name: 'Advanced Training',
          description: 'Allows training of skilled units',
          unlocks: ['skilled_soldier', 'archer']
        });
      } else if (level === 4) {
        benefits.push({
          name: 'Elite Training',
          description: 'Allows training of elite units',
          unlocks: ['elite_soldier', 'cavalry']
        });
      } else if (level === 5) {
        benefits.push({
          name: 'Legendary Training',
          description: 'Allows training of legendary units',
          unlocks: ['champion', 'royal_guard']
        });
      }
      break;
    
    case 'mine':
      if (level === 2) {
        benefits.push({
          name: 'Efficient Mining',
          description: 'Improves mining yields by 10%',
          bonus: { miningYield: 0.1 }
        });
      } else if (level === 3) {
        benefits.push({
          name: 'Deep Mining',
          description: 'Allows mining of rare resources',
          unlocks: ['gold_ore', 'silver_ore']
        });
      } else if (level === 4) {
        benefits.push({
          name: 'Advanced Mining',
          description: 'Further improves mining yields',
          bonus: { miningYield: 0.2 }
        });
      } else if (level === 5) {
        benefits.push({
          name: 'Master Mining',
          description: 'Allows mining of legendary materials',
          unlocks: ['mithril_ore', 'adamantite']
        });
      }
      break;
    
    case 'academy':
      if (level === 2) {
        benefits.push({
          name: 'Basic Research',
          description: 'Allows researching basic technologies',
          unlocks: ['basic_research']
        });
      } else if (level === 3) {
        benefits.push({
          name: 'Advanced Research',
          description: 'Allows researching advanced technologies',
          unlocks: ['advanced_research']
        });
      } else if (level === 4) {
        benefits.push({
          name: 'Expert Research',
          description: 'Allows researching expert technologies',
          unlocks: ['expert_research']
        });
      } else if (level === 5) {
        benefits.push({
          name: 'Magical Research',
          description: 'Allows researching magical technologies',
          unlocks: ['magical_research']
        });
      }
      break;
      
    case 'farm':
      if (level >= 2) {
        benefits.push({
          name: 'Improved Farming',
          description: `Increases crop yield by ${(level-1) * 10}%`,
          bonus: { farmingYield: (level-1) * 0.1 }
        });
      }
      
      if (level === 3) {
        benefits.push({
          name: 'Special Crops',
          description: 'Allows growing special crops',
          unlocks: ['rare_herbs', 'magical_seeds']
        });
      } else if (level === 5) {
        benefits.push({
          name: 'Magical Farming',
          description: 'Allows growing magical plants',
          unlocks: ['dragon_fruit', 'golden_apple']
        });
      }
      break;
  }
  
  return benefits;
}

/**
 * Complete crafting (called by scheduled function)
 * @param {string} craftingId - ID of the crafting to complete
 * @param {string} worldId - World ID
 * @returns {Promise<Object>} Result of completion
 */
export async function completeCrafting(craftingId, worldId) {
  try {
    const db = getDatabase();
    // Get crafting data
    const craftingRef = ref(db, `worlds/${worldId}/crafting/${craftingId}`);
    const craftingSnapshot = await get(craftingRef);
    
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
    const playerInventoryRef = ref(db, `players/${crafting.playerId}/worlds/${worldId}/inventory`);
    const playerInventorySnapshot = await get(playerInventoryRef);
    
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
    await set(playerInventoryRef, playerInventory);
    
    // Update player's crafting status
    const playerRef = ref(db, `players/${crafting.playerId}/worlds/${worldId}`);
    await update(playerRef, {
      'crafting/current': null,
      'crafting/completesAt': null,
      'crafting/lastCompleted': Date.now()
    });
    
    // Increase player's crafting XP if they have a skills object
    const playerSkillsRef = ref(db, `players/${crafting.playerId}/worlds/${worldId}/skills`);
    const playerSkillsSnapshot = await get(playerSkillsRef);
    
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
      let leveledUp = false;
      
      if (newXP >= requiredXP) {
        newLevel = currentLevel + 1;
        leveledUp = true;
      }
      
      // Update skills
      await update(playerSkillsRef, {
        'crafting/xp': newXP,
        'crafting/level': newLevel,
        'crafting/lastGain': Date.now()
      });
      
      // If player leveled up, announce it
      if (leveledUp) {
        const chatRef = ref(db, `worlds/${worldId}/chat/crafting_levelup_${crafting.playerId}_${Date.now()}`);
        await set(chatRef, {
          location: crafting.structureLocation,
          text: `${crafting.playerName} reached crafting level ${newLevel}!`,
          timestamp: Date.now(),
          type: 'event'
        });
      }
    }
    
    // Mark crafting as completed
    await update(craftingRef, {
      status: 'completed',
      completedAt: Date.now(),
      processed: true
    });
    
    // Add completion event to chat
    const chatRef = ref(db, `worlds/${worldId}/chat/crafting_complete_${craftingId}`);
    await set(chatRef, {
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
