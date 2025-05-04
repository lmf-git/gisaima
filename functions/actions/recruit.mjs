/**
 * Recruitment function for Gisaima
 * Handles starting recruitment of new units at structures
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";
import { Units } from 'gisaima-shared/units/units.js';
import { getChunkKey } from 'gisaima-shared/map/cartography.js';
import { ITEMS } from 'gisaima-shared/definitions/ITEMS.js';

// Function to recruit units
export const recruitUnits = onCall({ maxInstances: 10 }, async (request) => {
  // Check authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const userId = request.auth.uid;
  const { 
    structureId, 
    x, 
    y, 
    worldId, 
    unitType, // This is actually unitId
    quantity,
    cost
  } = request.data;
  
  // Validate inputs
  if (!structureId || x === undefined || y === undefined || !worldId || !unitType || !quantity) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  if (quantity <= 0 || quantity > 100) {
    throw new HttpsError('invalid-argument', 'Quantity must be between 1 and 100');
  }
  
  // Validate the unit type using shared Units class with unified getUnit method
  const unitTypeData = Units.getUnit(unitType, 'player');
  if (!unitTypeData) {
    throw new HttpsError('invalid-argument', `Invalid unit type: ${unitType}`);
  }
  
  // Get database reference
  const db = getDatabase();
  const chunkKey = getChunkKey(x, y);
  const tileKey = `${x},${y}`;
  const structurePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`;
  
  try {
    // Load the structure data
    const structureSnapshot = await db.ref(structurePath).once('value');
    if (!structureSnapshot.exists()) {
      throw new HttpsError('not-found', 'Structure not found at this location');
    }
    
    const structureData = structureSnapshot.val();
    
    // Check if structure allows recruitment
    if (structureData.type === 'ruins' || structureData.status === 'building') {
      throw new HttpsError('failed-precondition', 'This structure cannot recruit units');
    }
    
    // Check if structure race matches unit race requirement
    if (unitTypeData.race && structureData.race !== unitTypeData.race) {
      throw new HttpsError('failed-precondition', 
        `This structure cannot recruit ${unitTypeData.race} units`);
    }
    
    // Check if structure is owned by the user or is a spawn point
    const isOwned = structureData.owner === userId;
    const isSpawn = structureData.type === 'spawn';
    
    if (!isOwned && !isSpawn) {
      throw new HttpsError('permission-denied', 'You do not own this structure');
    }
    
    // Check if recruitment queue exists and has capacity
    const maxQueueSize = structureData.capacity || 10;
    const currentQueue = structureData.recruitmentQueue || {};
    const queueItems = Object.values(currentQueue).filter(item => item && typeof item === 'object');
    
    if (queueItems.length >= maxQueueSize) {
      throw new HttpsError('failed-precondition', 'Recruitment queue is full');
    }
    
    // NEW: Check player resources in personal bank first
    const playerBankPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/banks/${userId}`;
    const playerBankSnapshot = await db.ref(playerBankPath).once('value');
    const playerBank = playerBankSnapshot.val() || [];
    
    // Create resource map from player's bank items
    const bankResources = {};
    if (Array.isArray(playerBank)) {
      playerBank.forEach(item => {
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
    
    // Validate resource requirements against personal bank
    const insufficientResources = [];
    for (const [resourceKey, amountNeeded] of Object.entries(cost)) {
      const upperResourceKey = resourceKey.toUpperCase();
      const availableAmount = bankResources[upperResourceKey] || 0;
      
      if (availableAmount < amountNeeded) {
        insufficientResources.push({
          resource: resourceKey,
          needed: amountNeeded,
          available: availableAmount
        });
      }
    }
    
    if (insufficientResources.length > 0) {
      throw new HttpsError('failed-precondition', 
        `Insufficient resources in your personal bank: ${insufficientResources.map(r => 
          `${r.resource} (need ${r.needed}, have ${r.available})`).join(', ')}`);
    }
    
    // Calculate completion time - simplified to work directly with ticks
    const now = Date.now();
    const ticksPerUnit = unitTypeData.timePerUnit || 1; // Default 1 tick per unit
    const totalTicks = ticksPerUnit * quantity;
    
    // Get world info for tick calculation
    const worldInfoRef = db.ref(`worlds/${worldId}/info`);
    const worldInfoSnapshot = await worldInfoRef.once('value');
    const worldInfo = worldInfoSnapshot.val() || {};
    
    // Apply world speed adjustment to ticks
    const worldSpeed = worldInfo.speed || 1;
    const adjustedTicks = totalTicks / worldSpeed;
    
    // Only convert to timestamp at the end - 1 tick = 60 seconds (60000ms)
    const TICK_DURATION = 60 * 1000; 
    const completesAt = now + (adjustedTicks * TICK_DURATION);
    
    // Generate a unique recruitment ID
    const recruitmentId = `recruitment_${now}_${Math.floor(Math.random() * 1000)}`;
    
    // Create recruitment entry
    const recruitmentData = {
      id: recruitmentId,
      unitId: unitType,
      unitName: unitTypeData.name,
      type: unitTypeData.type,
      race: unitTypeData.race || structureData.race,
      icon: unitTypeData.icon,
      quantity,
      startedAt: now,
      completesAt,
      ticksRequired: Math.ceil(adjustedTicks), // Store raw tick count for tick-based processing
      owner: userId,
      cost
    };
    
    // Perform the database operations in a transaction
    await db.ref().transaction((data) => {
      if (!data) return null;
      
      // Update structure recruitment queue
      if (!data.worlds) data.worlds = {};
      if (!data.worlds[worldId]) data.worlds[worldId] = {};
      if (!data.worlds[worldId].chunks) data.worlds[worldId].chunks = {};
      if (!data.worlds[worldId].chunks[chunkKey]) data.worlds[worldId].chunks[chunkKey] = {};
      if (!data.worlds[worldId].chunks[chunkKey][tileKey]) data.worlds[worldId].chunks[chunkKey][tileKey] = {};
      if (!data.worlds[worldId].chunks[chunkKey][tileKey].structure) {
        data.worlds[worldId].chunks[chunkKey][tileKey].structure = {};
      }
      
      const structure = data.worlds[worldId].chunks[chunkKey][tileKey].structure;
      if (!structure.recruitmentQueue) structure.recruitmentQueue = {};
      
      // Add recruitment to queue
      structure.recruitmentQueue[recruitmentId] = recruitmentData;
      
      // NEW: Deduct resources from player's personal bank
      if (!structure.banks) structure.banks = {};
      if (!structure.banks[userId]) structure.banks[userId] = [];
      
      // Create updated bank with resources deducted
      const updatedBank = [];
      const resourcesNeeded = {...cost}; // Clone to track what still needs to be deducted
      
      // Process each item in the bank
      if (Array.isArray(structure.banks[userId])) {
        for (const item of structure.banks[userId]) {
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
              if (resourceKey.toUpperCase() === upperItemId && amountNeeded > 0) {
                deductFromThisItem = Math.min(item.quantity, amountNeeded);
                resourcesNeeded[resourceKey] -= deductFromThisItem;
                break;
              }
            }
          }
          
          // If no match by ID, try matching by normalized name
          if (deductFromThisItem === 0 && item.name) {
            const normalizedName = item.name.toUpperCase().replace(/ /g, '_');
            for (const [resourceKey, amountNeeded] of Object.entries(resourcesNeeded)) {
              if (resourceKey.toUpperCase() === normalizedName && amountNeeded > 0) {
                deductFromThisItem = Math.min(item.quantity, amountNeeded);
                resourcesNeeded[resourceKey] -= deductFromThisItem;
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
      
      // Update the bank with our modified items
      structure.banks[userId] = updatedBank;
      
      // Add recruitment achievement
      if (!data.players) data.players = {};
      if (!data.players[userId]) data.players[userId] = {};
      if (!data.players[userId].worlds) data.players[userId].worlds = {};
      if (!data.players[userId].worlds[worldId]) data.players[userId].worlds[worldId] = {};
      
      const playerData = data.players[userId].worlds[worldId];
      if (!playerData.achievements) playerData.achievements = {};
      playerData.achievements.first_recruit = true;
      playerData.achievements.first_recruit_date = now;
      
      return data;
    });
    
    // Get updated queue to return to client
    const updatedQueueRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/recruitmentQueue`);
    const updatedQueueSnapshot = await updatedQueueRef.once('value');
    
    // Create a world chat message about recruitment
    const chatMessageId = `recruit_${now}_${Math.floor(Math.random() * 1000)}`;
    await db.ref(`worlds/${worldId}/chat/${chatMessageId}`).set({
      text: `${quantity} ${unitTypeData.name} units being recruited at (${x}, ${y})`,
      type: 'event',
      timestamp: now,
      location: { x, y }
    });
    
    return {
      success: true,
      recruitmentId,
      completesAt,
      queue: updatedQueueSnapshot.val() || {}
    };
  } 
  catch (error) {
    logger.error('Error in recruitUnits:', error);
    throw new HttpsError('internal', error.message || 'An unknown error occurred');
  }
});

// Function to cancel recruitment
export const cancelRecruitment = onCall({ maxInstances: 10 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be logged in');
  }

  const userId = request.auth.uid;
  const { recruitmentId, structureId, x, y, worldId } = request.data;
  
  if (!recruitmentId || !structureId || x === undefined || y === undefined || !worldId) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  try {
    const db = getDatabase();
    const chunkKey = getChunkKey(x, y);
    const tileKey = `${x},${y}`;
    
    const recruitmentRef = db.ref(
      `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/recruitmentQueue/${recruitmentId}`
    );
    
    // Get the recruitment data
    const recruitmentSnapshot = await recruitmentRef.once('value');
    if (!recruitmentSnapshot.exists()) {
      throw new HttpsError('not-found', 'Recruitment not found');
    }
    
    const recruitmentData = recruitmentSnapshot.val();
    
    // Check ownership
    if (recruitmentData.owner !== userId) {
      throw new HttpsError('permission-denied', 'You can only cancel your own recruitments');
    }
    
    // Refund resources (partial refund based on progress)
    const now = Date.now();
    const totalTime = recruitmentData.completesAt - recruitmentData.startedAt;
    const elapsedTime = now - recruitmentData.startedAt;
    
    // Calculate how much to refund (50% base + up to 50% based on remaining time)
    const progressPercent = Math.min(100, Math.floor((elapsedTime / totalTime) * 100));
    const refundPercent = Math.max(50, 100 - progressPercent);
    
    const refunds = {};
    for (const [resource, amount] of Object.entries(recruitmentData.cost)) {
      refunds[resource] = Math.floor(amount * refundPercent / 100);
    }
    
    // Process refund and remove recruitment
    await db.ref().transaction((data) => {
      if (!data) return null;
      
      // Remove recruitment from queue
      if (data.worlds?.[worldId]?.chunks?.[chunkKey]?.[tileKey]?.structure?.recruitmentQueue?.[recruitmentId]) {
        data.worlds[worldId].chunks[chunkKey][tileKey].structure.recruitmentQueue[recruitmentId] = null;
      }
      
      // Update to add resources to personal bank instead of global resources
      const structure = data.worlds?.[worldId]?.chunks?.[chunkKey]?.[tileKey]?.structure;
      if (structure) {
        // Initialize banks if needed
        if (!structure.banks) structure.banks = {};
        if (!structure.banks[userId]) structure.banks[userId] = [];
        
        // Add refunds to personal bank
        for (const [resourceId, amount] of Object.entries(refunds)) {
          if (amount <= 0) continue;
          
          // Get proper item name from ITEMS if available
          const upperResourceId = resourceId.toUpperCase();
          const itemName = ITEMS[upperResourceId]?.name || resourceId;
          
          // Find existing item in bank or add new one
          let found = false;
          if (Array.isArray(structure.banks[userId])) {
            for (let i = 0; i < structure.banks[userId].length; i++) {
              const item = structure.banks[userId][i];
              if (item && item.type === 'resource' && 
                  (item.id === resourceId || item.id === upperResourceId)) {
                // Update existing item
                structure.banks[userId][i].quantity = (item.quantity || 0) + amount;
                found = true;
                break;
              }
            }
          }
          
          // Add new item if not found
          if (!found) {
            structure.banks[userId].push({
              id: upperResourceId,
              name: itemName,
              type: 'resource',
              quantity: amount,
              rarity: ITEMS[upperResourceId]?.rarity || 'common'
            });
          }
        }
      }
      
      return data;
    });
    
    return {
      success: true,
      refunds,
      refundPercent
    };
  }
  catch (error) {
    logger.error('Error in cancelRecruitment:', error);
    throw new HttpsError('internal', error.message || 'An unknown error occurred');
  }
});
