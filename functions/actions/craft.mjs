import { db } from '../config.mjs';
import { ref, get, set, update } from "firebase/database";

/**
 * Get crafting recipes
 * @param {Object} data - Request data
 * @param {string} data.worldId - The world ID
 * @param {string} data.playerId - The player requesting recipes
 * @param {number} data.x - Structure X coordinate (optional)
 * @param {number} data.y - Structure Y coordinate (optional)
 * @returns {Promise<Object>} Available recipes
 */
export async function getAvailableRecipes(data, context) {
  try {
    // Basic validation
    if (!data.worldId || !data.playerId) {
      throw new Error('Missing required parameters');
    }
    
    const { worldId, playerId, x, y } = data;
    
    // Get player data for crafting level
    const playerRef = ref(db, `players/${playerId}/worlds/${worldId}`);
    const playerSnapshot = await get(playerRef);
    
    if (!playerSnapshot.exists()) {
      throw new Error('Player data not found');
    }
    
    const player = playerSnapshot.val();
    const craftingLevel = player.skills?.crafting?.level || 1;
    
    // Get structure data if coordinates provided
    let structure = null;
    
    if (x !== undefined && y !== undefined) {
      const chunkSize = 20;
      const chunkX = Math.floor(x / chunkSize);
      const chunkY = Math.floor(y / chunkSize);
      const chunkKey = `${chunkX},${chunkY}`;
      const tileKey = `${x},${y}`;
      
      const structureRef = ref(db, `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`);
      const structureSnapshot = await get(structureRef);
      
      if (structureSnapshot.exists()) {
        structure = structureSnapshot.val();
      }
    }
    
    // Get all recipes
    let recipes = getAllCraftingRecipes();
    
    // Filter recipes based on player level and available buildings
    recipes = recipes.map(recipe => {
      // Check player level requirement
      const hasLevel = !recipe.requiredLevel || recipe.requiredLevel <= craftingLevel;
      
      // Check building requirement if structure provided
      let hasBuilding = true;
      if (recipe.requiredBuilding && structure) {
        hasBuilding = false;
        
        if (structure.buildings) {
          for (const buildingId in structure.buildings) {
            const building = structure.buildings[buildingId];
            if (building.type === recipe.requiredBuilding.type && 
                (building.level || 1) >= recipe.requiredBuilding.level) {
              hasBuilding = true;
              break;
            }
          }
        }
      }
      
      return {
        ...recipe,
        available: hasLevel && hasBuilding,
        hasLevelRequirement: hasLevel,
        hasBuildingRequirement: hasBuilding
      };
    });
    
    return {
      success: true,
      recipes,
      craftingLevel
    };
    
  } catch (error) {
    console.error('Error getting available recipes:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get all crafting recipes (hard-coded)
 * These recipes include building requirements
 */
function getAllCraftingRecipes() {
  return [
    // WEAPONS - SMITHY RELATED ITEMS
    {
      id: 'wooden_sword',
      name: 'Wooden Sword',
      category: 'weapon',
      materials: {
        'Wooden Sticks': 5
      },
      result: {
        name: 'Wooden Sword',
        type: 'weapon',
        rarity: 'common',
        quantity: 1,
        description: 'A basic wooden sword. Not very durable but better than nothing.'
      },
      craftingTime: 60, // 1 minute
      requiredLevel: 1
    },
    {
      id: 'stone_sword',
      name: 'Stone Sword',
      category: 'weapon',
      materials: {
        'Wooden Sticks': 2,
        'Stone Pieces': 5
      },
      result: {
        name: 'Stone Sword',
        type: 'weapon',
        rarity: 'common',
        quantity: 1,
        description: 'A stone-bladed sword. More durable than wood.'
      },
      craftingTime: 120, // 2 minutes
      requiredLevel: 2
    },
    {
      id: 'iron_sword',
      name: 'Iron Sword',
      category: 'weapon',
      materials: {
        'Wooden Sticks': 2,
        'Iron Ingot': 3
      },
      result: {
        name: 'Iron Sword',
        type: 'weapon',
        rarity: 'uncommon',
        quantity: 1,
        description: 'A well-crafted iron sword. Standard issue for many fighters.'
      },
      craftingTime: 180, // 3 minutes
      requiredLevel: 3,
      requiredBuilding: {
        type: 'smithy',
        level: 2
      }
    },
    
    // FARM RELATED ITEMS
    {
      id: 'herbal_tea',
      name: 'Herbal Tea',
      category: 'consumable',
      materials: {
        'Medicinal Herb': 2,
        'Water Vial': 1
      },
      result: {
        name: 'Herbal Tea',
        type: 'consumable',
        rarity: 'common',
        quantity: 2,
        description: 'A soothing tea that provides minor healing and stamina recovery.'
      },
      craftingTime: 45, // 45 seconds
      requiredLevel: 1,
      requiredBuilding: {
        type: 'farm',
        level: 1
      }
    },
    {
      id: 'hearty_stew',
      name: 'Hearty Stew',
      category: 'consumable',
      materials: {
        'Vegetables': 3,
        'Meat': 2,
        'Water Vial': 1
      },
      result: {
        name: 'Hearty Stew',
        type: 'consumable',
        rarity: 'uncommon',
        quantity: 2,
        description: 'A filling meal that provides substantial stamina recovery and temporary health boost.'
      },
      craftingTime: 90, // 1.5 minutes
      requiredLevel: 2,
      requiredBuilding: {
        type: 'farm',
        level: 2
      }
    },
    {
      id: 'growth_fertilizer',
      name: 'Growth Fertilizer',
      category: 'consumable',
      materials: {
        'Plant Residue': 5,
        'Bone Meal': 2
      },
      result: {
        name: 'Growth Fertilizer',
        type: 'consumable',
        rarity: 'uncommon',
        quantity: 3,
        description: 'Accelerates plant growth when applied to farmland. Used in advanced farming.'
      },
      craftingTime: 120, // 2 minutes
      requiredLevel: 3,
      requiredBuilding: {
        type: 'farm',
        level: 3
      }
    },
    {
      id: 'golden_apple',
      name: 'Golden Apple',
      category: 'consumable',
      materials: {
        'Apple': 1,
        'Gold Dust': 5,
        'Magical Essence': 1
      },
      result: {
        name: 'Golden Apple',
        type: 'consumable',
        rarity: 'rare',
        quantity: 1,
        description: 'A mystical fruit imbued with healing energy. Greatly restores health and provides temporary regeneration.'
      },
      craftingTime: 240, // 4 minutes
      requiredLevel: 5,
      requiredBuilding: {
        type: 'farm',
        level: 4
      }
    },
    
    // ACADEMY RELATED ITEMS
    {
      id: 'minor_mana_potion',
      name: 'Minor Mana Potion',
      category: 'consumable',
      materials: {
        'Blue Herb': 3,
        'Crystal Water': 1
      },
      result: {
        name: 'Minor Mana Potion',
        type: 'consumable',
        rarity: 'common',
        quantity: 2,
        description: 'A simple potion that restores a small amount of magical energy.'
      },
      craftingTime: 60, // 1 minute
      requiredLevel: 2,
      requiredBuilding: {
        type: 'academy',
        level: 1
      }
    },
    {
      id: 'scroll_of_identify',
      name: 'Scroll of Identify',
      category: 'scroll',
      materials: {
        'Parchment': 1,
        'Magic Ink': 1,
        'Crystal Dust': 2
      },
      result: {
        name: 'Scroll of Identify',
        type: 'scroll',
        rarity: 'uncommon',
        quantity: 1,
        description: 'A magical scroll that reveals the true nature and properties of an item when read.'
      },
      craftingTime: 120, // 2 minutes
      requiredLevel: 3,
      requiredBuilding: {
        type: 'academy',
        level: 2
      }
    },
    {
      id: 'enchanted_quill',
      name: 'Enchanted Quill',
      category: 'tool',
      materials: {
        'Feather': 1,
        'Iron Ingot': 1,
        'Crystal Shard': 1
      },
      result: {
        name: 'Enchanted Quill',
        type: 'tool',
        rarity: 'rare',
        quantity: 1,
        description: 'A magical writing tool used for enchanting and creating magical scrolls.'
      },
      craftingTime: 180, // 3 minutes
      requiredLevel: 4,
      requiredBuilding: {
        type: 'academy',
        level: 3
      }
    },
    {
      id: 'tome_of_wisdom',
      name: 'Tome of Wisdom',
      category: 'artifact',
      materials: {
        'Leather': 5,
        'Parchment': 10,
        'Magic Ink': 5,
        'Crystal Shard': 2
      },
      result: {
        name: 'Tome of Wisdom',
        type: 'artifact',
        rarity: 'epic',
        quantity: 1,
        description: 'An ancient book containing powerful knowledge. Grants temporary intelligence boost when read.'
      },
      craftingTime: 360, // 6 minutes
      requiredLevel: 6,
      requiredBuilding: {
        type: 'academy',
        level: 4
      }
    },
    
    // MARKET RELATED ITEMS
    {
      id: 'trading_contract',
      name: 'Trading Contract',
      category: 'document',
      materials: {
        'Parchment': 2,
        'Ink': 1
      },
      result: {
        name: 'Trading Contract',
        type: 'document',
        rarity: 'common',
        quantity: 3,
        description: 'A basic document used to formalize trading agreements.'
      },
      craftingTime: 60, // 1 minute
      requiredLevel: 1,
      requiredBuilding: {
        type: 'market',
        level: 1
      }
    },
    {
      id: 'merchant_pack',
      name: 'Merchant Pack',
      category: 'tool',
      materials: {
        'Leather': 6,
        'Wooden Sticks': 4,
        'Cloth': 3
      },
      result: {
        name: 'Merchant Pack',
        type: 'tool',
        rarity: 'uncommon',
        quantity: 1,
        description: 'A specially designed pack that increases carrying capacity for trade goods.'
      },
      craftingTime: 120, // 2 minutes
      requiredLevel: 3,
      requiredBuilding: {
        type: 'market',
        level: 2
      }
    },
    {
      id: 'exotic_spices',
      name: 'Exotic Spices',
      category: 'trade_good',
      materials: {
        'Rare Seeds': 3,
        'Mountain Herbs': 2,
        'Desert Salt': 2
      },
      result: {
        name: 'Exotic Spices',
        type: 'trade_good',
        rarity: 'rare',
        quantity: 5,
        description: 'Valuable spices from distant lands. Highly sought after by collectors and merchants.'
      },
      craftingTime: 240, // 4 minutes
      requiredLevel: 4,
      requiredBuilding: {
        type: 'market',
        level: 3
      }
    },
    {
      id: 'trade_permit',
      name: 'Royal Trade Permit',
      category: 'document',
      materials: {
        'Fine Parchment': 1,
        'Gold Ink': 1,
        'Royal Seal': 1
      },
      result: {
        name: 'Royal Trade Permit',
        type: 'document',
        rarity: 'epic',
        quantity: 1,
        description: 'An official document allowing trade with royal establishments. Opens up exclusive trading opportunities.'
      },
      craftingTime: 300, // 5 minutes
      requiredLevel: 5,
      requiredBuilding: {
        type: 'market',
        level: 4
      }
    },
    
    // MINE RELATED ITEMS
    {
      id: 'miners_lamp',
      name: 'Miner\'s Lamp',
      category: 'tool',
      materials: {
        'Iron Ingot': 1,
        'Oil': 2,
        'Glass': 1
      },
      result: {
        name: 'Miner\'s Lamp',
        type: 'tool',
        rarity: 'common',
        quantity: 1,
        description: 'A sturdy lamp designed for mining in dark places. Improves resource gathering in caves.'
      },
      craftingTime: 90, // 1.5 minutes
      requiredLevel: 2,
      requiredBuilding: {
        type: 'mine',
        level: 1
      }
    },
    {
      id: 'prospectors_pick',
      name: 'Prospector\'s Pick',
      category: 'tool',
      materials: {
        'Iron Ingot': 3,
        'Hardwood': 2,
        'Leather Strips': 1
      },
      result: {
        name: 'Prospector\'s Pick',
        type: 'tool',
        rarity: 'uncommon',
        quantity: 1,
        description: 'A specialized pickaxe designed to detect valuable minerals. Increases chance of finding rare ores.'
      },
      craftingTime: 180, // 3 minutes
      requiredLevel: 3,
      requiredBuilding: {
        type: 'mine',
        level: 2
      }
    },
    {
      id: 'gemcutting_kit',
      name: 'Gemcutting Kit',
      category: 'tool',
      materials: {
        'Steel Ingot': 2,
        'Fine Wood': 3,
        'Crystal Shard': 1
      },
      result: {
        name: 'Gemcutting Kit',
        type: 'tool',
        rarity: 'rare',
        quantity: 1,
        description: 'A set of specialized tools for cutting and processing raw gems. Required for advanced gem crafting.'
      },
      craftingTime: 240, // 4 minutes
      requiredLevel: 4,
      requiredBuilding: {
        type: 'mine',
        level: 3
      }
    },
    {
      id: 'earth_crystal',
      name: 'Earth Crystal',
      category: 'material',
      materials: {
        'Crystal Shard': 5,
        'Iron Dust': 10,
        'Stone Essence': 3
      },
      result: {
        name: 'Earth Crystal',
        type: 'material',
        rarity: 'epic',
        quantity: 1,
        description: 'A powerful crystal imbued with earth elemental energy. Used in high-level crafting and enchanting.'
      },
      craftingTime: 360, // 6 minutes
      requiredLevel: 5,
      requiredBuilding: {
        type: 'mine',
        level: 4
      }
    }
  ];
}

/**
 * Start crafting an item
 * @param {Object} data - Crafting data
 * @param {string} data.worldId - The world ID
 * @param {string} data.playerId - The player ID
 * @param {number} data.x - Structure X coordinate
 * @param {number} data.y - Structure Y coordinate
 * @param {string} data.recipeId - The recipe ID to craft
 * @returns {Promise<Object>} Result of the crafting attempt
 */
export async function startCrafting(data, context) {
  try {
    // Basic validation
    if (!data.worldId || !data.playerId || data.x === undefined || 
        data.y === undefined || !data.recipeId) {
      throw new Error('Missing required parameters');
    }
    
    const { worldId, playerId, x, y, recipeId } = data;
    
    // Get recipe data
    const recipe = getAllCraftingRecipes().find(r => r.id === recipeId);
    if (!recipe) {
      throw new Error('Recipe not found');
    }
    
    // Calculate chunk coordinates
    const chunkSize = 20;
    const chunkX = Math.floor(x / chunkSize);
    const chunkY = Math.floor(y / chunkSize);
    const chunkKey = `${chunkX},${chunkY}`;
    const tileKey = `${x},${y}`;
    
    // Get the structure
    const structureRef = ref(db, `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`);
    const structureSnapshot = await get(structureRef);
    
    if (!structureSnapshot.exists()) {
      throw new Error('Structure not found');
    }
    
    const structure = structureSnapshot.val();
    
    // Get player data for crafting level
    const playerRef = ref(db, `players/${playerId}/worlds/${worldId}`);
    const playerSnapshot = await get(playerRef);
    
    if (!playerSnapshot.exists()) {
      throw new Error('Player data not found');
    }
    
    const player = playerSnapshot.val();
    const craftingLevel = player.skills?.crafting?.level || 1;
    
    // Check if player has required crafting level
    if (recipe.requiredLevel && recipe.requiredLevel > craftingLevel) {
      throw new Error(`This recipe requires crafting level ${recipe.requiredLevel}`);
    }
    
    // Check building requirements
    if (recipe.requiredBuilding) {
      const { type, level } = recipe.requiredBuilding;
      
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
    
    // Get player inventory
    const playerInventoryRef = ref(db, `players/${playerId}/worlds/${worldId}/inventory`);
    const playerInventorySnapshot = await get(playerInventoryRef);
    
    const playerInventory = playerInventorySnapshot.exists() ? playerInventorySnapshot.val() : [];
    
    // Check for required materials
    for (const [materialName, amount] of Object.entries(recipe.materials)) {
      let availableAmount = 0;
      
      // Check player inventory
      for (const item of playerInventory) {
        if (item.name === materialName) {
          availableAmount += item.quantity || 0;
        }
      }
      
      if (availableAmount < amount) {
        throw new Error(`Not enough ${materialName}. Need ${amount}, have ${availableAmount}.`);
      }
    }
    
    // Calculate crafting time
    const baseCraftingTime = recipe.craftingTime || 60; // Default 60 seconds
    
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
        if (building.type === recipe.requiredBuilding?.type && building.benefits) {
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
      recipeId,
      playerId,
      playerName: player.displayName,
      worldId,
      structureId: structure.id,
      structureLocation: { x, y },
      startedAt: now,
      completesAt: now + craftingTimeMs,
      materials: recipe.materials,
      result: {
        name: recipe.result.name,
        type: recipe.result.type,
        quantity: recipe.result.quantity || 1,
        rarity: recipe.result.rarity || 'common',
        description: recipe.result.description
      },
      status: 'in_progress',
      processed: false
    };
    
    // Save the crafting entry
    const craftingRef = ref(db, `worlds/${worldId}/crafting/${craftingId}`);
    await set(craftingRef, craftingData);
    
    // Update player's crafting status
    await update(playerRef, {
      'crafting/current': craftingId,
      'crafting/completesAt': now + craftingTimeMs
    });
    
    // Consume materials from inventory
    const updatedInventory = [];
    const materialsCopy = {...recipe.materials}; // Clone to track remaining quantities
    
    for (const item of playerInventory) {
      const requiredAmount = materialsCopy[item.name] || 0;
      
      if (requiredAmount > 0) {
        // This item is required for crafting
        const amountToUse = Math.min(requiredAmount, item.quantity);
        materialsCopy[item.name] -= amountToUse;
        
        if (item.quantity > amountToUse) {
          // We still have some left
          updatedInventory.push({
            ...item,
            quantity: item.quantity - amountToUse
          });
        }
        // Otherwise, the item is completely consumed
      } else {
        // This item is not needed for crafting
        updatedInventory.push(item);
      }
    }
    
    // Update player inventory
    await set(playerInventoryRef, updatedInventory);
    
    // Add crafting event to chat
    const chatRef = ref(db, `worlds/${worldId}/chat/crafting_${craftingId}`);
    await set(chatRef, {
      location: { x, y },
      text: `${player.displayName} started crafting ${recipe.result.name}.`,
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
    console.error('Error starting crafting:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Cancel an in-progress crafting
 */
export async function cancelCrafting(data, context) {
  try {
    // Basic validation
    if (!data.worldId || !data.craftingId || !data.playerId) {
      throw new Error('Missing required parameters');
    }
    
    const { worldId, craftingId, playerId } = data;
    
    // Get the crafting data
    const craftingRef = ref(db, `worlds/${worldId}/crafting/${craftingId}`);
    const craftingSnapshot = await get(craftingRef);
    
    if (!craftingSnapshot.exists()) {
      throw new Error('Crafting not found');
    }
    
    const crafting = craftingSnapshot.val();
    
    // Verify this player owns this crafting
    if (crafting.playerId !== playerId) {
      throw new Error('You cannot cancel this crafting');
    }
    
    // Check if crafting is still in progress
    if (crafting.processed || crafting.status !== 'in_progress') {
      throw new Error('This crafting cannot be canceled');
    }
    
    // Update crafting status
    await update(craftingRef, {
      status: 'canceled',
      canceledAt: Date.now(),
      processed: true
    });
    
    // Clear player's current crafting
    const playerRef = ref(db, `players/${playerId}/worlds/${worldId}/crafting`);
    await update(playerRef, {
      current: null,
      completesAt: null
    });
    
    // Refund materials (90% of materials)
    const refundMaterials = {};
    for (const [material, amount] of Object.entries(crafting.materials)) {
      refundMaterials[material] = Math.floor(amount * 0.9); // 90% refund
    }
    
    // Add refunded materials to player inventory
    const playerInventoryRef = ref(db, `players/${playerId}/worlds/${worldId}/inventory`);
    const playerInventorySnapshot = await get(playerInventoryRef);
    
    let playerInventory = playerInventorySnapshot.exists() ? playerInventorySnapshot.val() : [];
    
    // Add refunded materials
    for (const [materialName, amount] of Object.entries(refundMaterials)) {
      if (amount <= 0) continue;
      
      // Find existing item in inventory
      const existingItemIndex = playerInventory.findIndex(item => item.name === materialName);
      
      if (existingItemIndex >= 0) {
        // Add to existing stack
        playerInventory[existingItemIndex].quantity += amount;
      } else {
        // Add as new item
        playerInventory.push({
          name: materialName,
          quantity: amount,
          type: 'resource' // Assume resources
        });
      }
    }
    
    // Update player inventory
    await set(playerInventoryRef, playerInventory);
    
    // Add cancellation event to the chat
    const chatRef = ref(db, `worlds/${worldId}/chat/cancel_crafting_${craftingId}`);
    await set(chatRef, {
      location: crafting.structureLocation,
      text: `${crafting.playerName} canceled crafting ${crafting.result.name}.`,
      timestamp: Date.now(),
      type: 'event'
    });
    
    return {
      success: true,
      refundedMaterials
    };
    
  } catch (error) {
    console.error('Error canceling crafting:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Complete crafting (called by scheduled function)
 */
export async function completeCrafting(craftingId, worldId) {
  try {
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
