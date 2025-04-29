/**
 * Crafting functions for Gisaima
 * Handles crafting of items and equipment
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Calculate chunk key for database access
function getChunkKey(x, y) {
  const CHUNK_SIZE = 20;
  // Simple integer division works for both positive and negative coordinates
  const chunkX = Math.floor(x / CHUNK_SIZE);
  const chunkY = Math.floor(y / CHUNK_SIZE);
  return `${chunkX},${chunkY}`;
}

// Crafting recipes definitions
const CraftingRecipes = {
  // Basic tools
  'simple_axe': {
    name: 'Simple Axe',
    description: 'A basic tool for cutting wood more efficiently',
    category: 'tool',
    type: 'axe',
    materials: { 
      'wooden_sticks': 2, 
      'stone_pieces': 1 
    },
    timeToCraft: 180, // seconds
    level: 1,
    effects: {
      'woodGatheringSpeed': 1.2
    }
  },
  'simple_pickaxe': {
    name: 'Simple Pickaxe',
    description: 'A basic tool for mining stone and minerals',
    category: 'tool',
    type: 'pickaxe',
    materials: { 
      'wooden_sticks': 2, 
      'stone_pieces': 2 
    },
    timeToCraft: 240,
    level: 1,
    effects: {
      'stoneGatheringSpeed': 1.2
    }
  },
  
  // Weapons
  'wooden_sword': {
    name: 'Wooden Sword',
    description: 'A basic weapon for self-defense',
    category: 'weapon',
    type: 'sword',
    materials: { 
      'wooden_sticks': 3 
    },
    timeToCraft: 120,
    level: 1,
    effects: {
      'attackPower': 1.1
    }
  },
  'stone_sword': {
    name: 'Stone Sword',
    description: 'A sturdier weapon with better damage',
    category: 'weapon',
    type: 'sword',
    materials: { 
      'wooden_sticks': 1, 
      'stone_pieces': 3 
    },
    timeToCraft: 300,
    level: 2,
    effects: {
      'attackPower': 1.3
    }
  },
  
  // Armor
  'leather_armor': {
    name: 'Leather Armor',
    description: 'Basic armor providing some protection',
    category: 'armor',
    type: 'chest',
    materials: { 
      'leather': 5 
    },
    timeToCraft: 360,
    level: 1,
    effects: {
      'defense': 1.2
    }
  },
  
  // Race-specific items
  'elven_bow': {
    name: 'Elven Bow',
    description: 'A finely crafted bow with increased range',
    category: 'weapon',
    type: 'bow',
    materials: { 
      'wooden_sticks': 4, 
      'herbs': 2 
    },
    timeToCraft: 420,
    level: 2,
    raceRequired: 'elf',
    effects: {
      'attackPower': 1.4,
      'range': 1.2
    }
  },
  'dwarven_hammer': {
    name: 'Dwarven Hammer',
    description: 'Heavy hammer with excellent crafting properties',
    category: 'tool',
    type: 'hammer',
    materials: { 
      'wooden_sticks': 2, 
      'stone_pieces': 3,
      'iron': 1
    },
    timeToCraft: 480,
    level: 2,
    raceRequired: 'dwarf',
    effects: {
      'craftingSpeed': 1.3,
      'buildSpeed': 1.2
    }
  },
  
  // Consumables
  'healing_potion': {
    name: 'Healing Potion',
    description: 'Restores health during battle',
    category: 'consumable',
    type: 'potion',
    materials: { 
      'herbs': 3, 
      'water': 1 
    },
    timeToCraft: 150,
    level: 1,
    effects: {
      'healing': 20
    }
  }
};

// Function to start crafting an item
export const startCrafting = onCall({ maxInstances: 10 }, async (request) => {
  // Check authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const userId = request.auth.uid;
  const { 
    recipeId, 
    x, 
    y, 
    worldId,
    structureId 
  } = request.data;
  
  // Validate inputs
  if (!recipeId || x === undefined || y === undefined || !worldId) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  // Validate recipe
  const recipe = CraftingRecipes[recipeId];
  if (!recipe) {
    throw new HttpsError('invalid-argument', `Invalid recipe: ${recipeId}`);
  }
  
  // Get database reference
  const db = getDatabase();
  
  try {
    // Check if player exists
    const playerRef = db.ref(`players/${userId}/worlds/${worldId}`);
    const playerSnapshot = await playerRef.once('value');
    
    if (!playerSnapshot.exists()) {
      throw new HttpsError('not-found', 'Player not found in this world');
    }
    
    const playerData = playerSnapshot.val();
    
    // Check if player is already in a group
    if (playerData.inGroup) {
      throw new HttpsError('failed-precondition', 'You cannot craft while in a group');
    }
    
    // Check if player is already crafting something
    if (playerData.crafting) {
      throw new HttpsError('failed-precondition', 'You are already crafting an item');
    }
    
    // Check race requirement if applicable
    if (recipe.raceRequired && playerData.race !== recipe.raceRequired) {
      throw new HttpsError('permission-denied', 
        `This recipe requires a ${recipe.raceRequired} to craft`);
    }
    
    // Check crafting level requirement if applicable
    const playerCraftingLevel = playerData.skills?.crafting || 1;
    if (recipe.level > playerCraftingLevel) {
      throw new HttpsError('permission-denied', 
        `This recipe requires crafting level ${recipe.level}`);
    }
    
    // Check if player has the required materials
    const chunkKey = getChunkKey(x, y);
    const tileKey = `${x},${y}`;
    const tilePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}`;
    
    // First check if the player is at a structure (optional)
    if (structureId) {
      const structureRef = db.ref(`${tilePath}/structure`);
      const structureSnapshot = await structureRef.once('value');
      
      if (!structureSnapshot.exists()) {
        throw new HttpsError('not-found', 'Structure not found at this location');
      }
    }
    
    // Get player's inventory items - either from personal inventory or from structure bank
    let playerItems = [];
    
    // Check if we have a structure with player bank
    if (structureId) {
      const bankRef = db.ref(`${tilePath}/structure/banks/${userId}`);
      const bankSnapshot = await bankRef.once('value');
      
      if (bankSnapshot.exists()) {
        playerItems = bankSnapshot.val() || [];
      }
    }
    
    // If no items found in structure bank, check personal inventory
    if (playerItems.length === 0) {
      const inventoryRef = db.ref(`players/${userId}/worlds/${worldId}/inventory`);
      const inventorySnapshot = await inventoryRef.once('value');
      
      if (inventorySnapshot.exists()) {
        playerItems = inventorySnapshot.val() || [];
      }
    }
    
    // Check if player has enough materials
    const missingMaterials = [];
    
    for (const [material, requiredAmount] of Object.entries(recipe.materials)) {
      // Find matching items in inventory
      const normalizedMaterial = material.replace(/_/g, ' ').toLowerCase();
      let availableAmount = 0;
      
      playerItems.forEach(item => {
        if (item && item.name && item.name.toLowerCase() === normalizedMaterial) {
          availableAmount += item.quantity || 0;
        }
      });
      
      if (availableAmount < requiredAmount) {
        missingMaterials.push({
          name: material.replace(/_/g, ' '),
          required: requiredAmount,
          available: availableAmount
        });
      }
    }
    
    if (missingMaterials.length > 0) {
      throw new HttpsError('failed-precondition', 
        `Missing materials: ${missingMaterials.map(m => 
          `${m.name} (need ${m.required}, have ${m.available})`).join(', ')}`);
    }
    
    // Calculate craft completion time
    const now = Date.now();
    
    // Get world info for speed calculation
    const worldInfoRef = db.ref(`worlds/${worldId}/info`);
    const worldInfoSnapshot = await worldInfoRef.once('value');
    const worldInfo = worldInfoSnapshot.val() || {};
    
    const worldSpeed = worldInfo.speed || 1;
    const craftingTime = recipe.timeToCraft || 300; // Default 5 minutes
    const adjustedTime = craftingTime / worldSpeed;
    
    const completionTime = now + (adjustedTime * 1000);
    
    // Generate a unique craft ID
    const craftId = `craft_${now}_${Math.floor(Math.random() * 1000)}`;
    
    // Create crafting data
    const craftingData = {
      id: craftId,
      recipeId,
      recipeName: recipe.name,
      category: recipe.category,
      type: recipe.type,
      startedAt: now,
      completesAt: completionTime,
      materials: recipe.materials,
      location: { x, y },
      structureId: structureId || null,
      status: 'crafting'
    };
    
    // Process the database operations in a transaction to ensure atomicity
    await db.ref().transaction((data) => {
      if (!data) return null;
      
      // Ensure paths exist
      if (!data.players) data.players = {};
      if (!data.players[userId]) data.players[userId] = {};
      if (!data.players[userId].worlds) data.players[userId].worlds = {};
      if (!data.players[userId].worlds[worldId]) data.players[userId].worlds[worldId] = {};
      
      // Set player as crafting
      data.players[userId].worlds[worldId].crafting = craftingData;
      
      // Add player status
      data.players[userId].worlds[worldId].status = 'crafting';
      
      // Add player last message
      data.players[userId].worlds[worldId].lastMessage = {
        text: `Started crafting ${recipe.name}`,
        timestamp: now
      };
      
      // Remove materials from inventory
      const playerItems = data.players[userId].worlds[worldId].inventory || [];
      
      // Process each material in the recipe
      for (const [material, requiredAmount] of Object.entries(recipe.materials)) {
        let remainingToRemove = requiredAmount;
        const normalizedMaterial = material.replace(/_/g, ' ').toLowerCase();
        
        // Find items of this type and remove quantities
        for (let i = 0; i < playerItems.length && remainingToRemove > 0; i++) {
          const item = playerItems[i];
          if (item && item.name && item.name.toLowerCase() === normalizedMaterial) {
            if (item.quantity <= remainingToRemove) {
              // Use entire stack
              remainingToRemove -= item.quantity;
              playerItems[i] = null; // Mark for removal
            } else {
              // Use partial stack
              item.quantity -= remainingToRemove;
              remainingToRemove = 0;
            }
          }
        }
        
        // Clean up null items
        data.players[userId].worlds[worldId].inventory = playerItems.filter(Boolean);
      }
      
      // Add crafting achievement
      if (!data.players[userId].worlds[worldId].achievements) {
        data.players[userId].worlds[worldId].achievements = {};
      }
      data.players[userId].worlds[worldId].achievements.first_crafting = true;
      data.players[userId].worlds[worldId].achievements.first_crafting_date = now;
      
      return data;
    });
    
    // Add announcement to world chat
    const chatMessageId = `craft_${now}_${Math.floor(Math.random() * 1000)}`;
    await db.ref(`worlds/${worldId}/chat/${chatMessageId}`).set({
      text: `${playerData.displayName || 'Unknown player'} started crafting ${recipe.name} at (${x}, ${y})`,
      type: 'event',
      timestamp: now,
      location: { x, y }
    });
    
    return {
      success: true,
      craftId,
      completesAt: completionTime,
      recipe
    };
  } 
  catch (error) {
    logger.error('Error in startCrafting:', error);
    throw new HttpsError('internal', error.message || 'An unknown error occurred');
  }
});

// Function to cancel crafting
export const cancelCrafting = onCall({ maxInstances: 10 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be logged in');
  }

  const userId = request.auth.uid;
  const { worldId } = request.data;
  
  if (!worldId) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  try {
    const db = getDatabase();
    const playerRef = db.ref(`players/${userId}/worlds/${worldId}`);
    
    // Get the player data
    const playerSnapshot = await playerRef.once('value');
    if (!playerSnapshot.exists()) {
      throw new HttpsError('not-found', 'Player not found');
    }
    
    const playerData = playerSnapshot.val();
    
    // Check if player is actually crafting
    if (!playerData.crafting) {
      throw new HttpsError('failed-precondition', 'You are not currently crafting anything');
    }
    
    const craftingData = playerData.crafting;
    
    // Calculate refund amount (50% of materials)
    const refunds = {};
    for (const [material, amount] of Object.entries(craftingData.materials)) {
      refunds[material] = Math.floor(amount * 0.5); // 50% refund
    }
    
    // Process refund and remove crafting status
    await db.ref().transaction((data) => {
      if (!data) return null;
      
      // Remove crafting status
      if (data.players?.[userId]?.worlds?.[worldId]?.crafting) {
        data.players[userId].worlds[worldId].crafting = null;
      }
      
      // Reset player status
      data.players[userId].worlds[worldId].status = 'idle';
      
      // Add refunded materials back to inventory
      if (!data.players[userId].worlds[worldId].inventory) {
        data.players[userId].worlds[worldId].inventory = [];
      }
      
      for (const [material, amount] of Object.entries(refunds)) {
        if (amount <= 0) continue;
        
        const normalizedMaterial = material.replace(/_/g, ' ');
        
        // Try to find existing stack
        let addedToExisting = false;
        const inventory = data.players[userId].worlds[worldId].inventory;
        
        for (let i = 0; i < inventory.length; i++) {
          if (inventory[i] && inventory[i].name === normalizedMaterial) {
            inventory[i].quantity = (inventory[i].quantity || 0) + amount;
            addedToExisting = true;
            break;
          }
        }
        
        // If no existing stack, add new one
        if (!addedToExisting) {
          inventory.push({
            id: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: normalizedMaterial,
            quantity: amount,
            type: 'resource',
            rarity: 'common'
          });
        }
      }
      
      // Add message about cancellation
      data.players[userId].worlds[worldId].lastMessage = {
        text: `Cancelled crafting ${craftingData.recipeName} and received partial refund`,
        timestamp: Date.now()
      };
      
      return data;
    });
    
    // Add announcement to world chat
    const now = Date.now();
    const chatMessageId = `craft_${now}_${Math.floor(Math.random() * 1000)}`;
    await db.ref(`worlds/${worldId}/chat/${chatMessageId}`).set({
      text: `${playerData.displayName || 'Unknown player'} cancelled crafting ${craftingData.recipeName}`,
      type: 'event',
      timestamp: now,
      location: craftingData.location
    });
    
    return {
      success: true,
      refunds
    };
  }
  catch (error) {
    logger.error('Error in cancelCrafting:', error);
    throw new HttpsError('internal', error.message || 'An unknown error occurred');
  }
});

// Function to get available recipes for a player
export const getAvailableRecipes = onCall({ maxInstances: 20 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be logged in');
  }

  const userId = request.auth.uid;
  const { worldId, x, y, structureId } = request.data;
  
  if (!worldId) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  try {
    const db = getDatabase();
    const playerRef = db.ref(`players/${userId}/worlds/${worldId}`);
    
    // Get player data
    const playerSnapshot = await playerRef.once('value');
    if (!playerSnapshot.exists()) {
      throw new HttpsError('not-found', 'Player not found in this world');
    }
    
    const playerData = playerSnapshot.val();
    const playerRace = playerData.race;
    const playerCraftingLevel = playerData.skills?.crafting || 1;
    
    // If structure is provided, check for special recipes
    let structureType = null;
    let structureBonuses = {};
    
    if (structureId && x !== undefined && y !== undefined) {
      const chunkKey = getChunkKey(x, y);
      const tileKey = `${x},${y}`;
      const structureRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`);
      const structureSnapshot = await structureRef.once('value');
      
      if (structureSnapshot.exists()) {
        const structureData = structureSnapshot.val();
        structureType = structureData.type;
        
        // Check for crafting bonuses
        if (structureData.bonuses?.crafting) {
          structureBonuses = structureData.bonuses.crafting;
        }
      }
    }
    
    // Filter recipes based on player level, race, and structure
    const availableRecipes = Object.entries(CraftingRecipes).map(([id, recipe]) => {
      // Deep copy the recipe to avoid modifying the original
      const recipeCopy = JSON.parse(JSON.stringify(recipe));
      recipeCopy.id = id;
      
      // Check availability
      let available = true;
      let unavailableReason = '';
      
      // Check level requirement
      if (recipe.level > playerCraftingLevel) {
        available = false;
        unavailableReason = `Requires crafting level ${recipe.level}`;
      }
      
      // Check race requirement if applicable
      if (recipe.raceRequired && playerRace !== recipe.raceRequired) {
        available = false;
        unavailableReason = `Requires ${recipe.raceRequired} race`;
      }
      
      // Check structure requirements if applicable
      if (recipe.structureRequired) {
        if (!structureType) {
          available = false;
          unavailableReason = `Requires a ${recipe.structureRequired} structure`;
        } else if (Array.isArray(recipe.structureRequired) && !recipe.structureRequired.includes(structureType)) {
          available = false;
          unavailableReason = `Requires one of these structures: ${recipe.structureRequired.join(', ')}`;
        } else if (typeof recipe.structureRequired === 'string' && recipe.structureRequired !== structureType) {
          available = false;
          unavailableReason = `Requires a ${recipe.structureRequired} structure`;
        }
      }
      
      // Add availability info
      recipeCopy.available = available;
      recipeCopy.unavailableReason = unavailableReason;
      
      // Apply structure bonuses if available
      if (available && Object.keys(structureBonuses).length > 0) {
        recipeCopy.timeToCraft = Math.max(1, Math.floor(recipeCopy.timeToCraft * (structureBonuses.timeReduction || 1)));
        
        if (recipeCopy.effects) {
          for (const [effect, value] of Object.entries(recipeCopy.effects)) {
            if (structureBonuses[effect]) {
              recipeCopy.effects[effect] = value * structureBonuses[effect];
            }
          }
        }
        
        recipeCopy.bonusApplied = true;
      }
      
      return recipeCopy;
    });
    
    return {
      success: true,
      recipes: availableRecipes,
      playerCraftingLevel,
      structureBonuses
    };
  }
  catch (error) {
    logger.error('Error in getAvailableRecipes:', error);
    throw new HttpsError('internal', error.message || 'An unknown error occurred');
  }
});
