/**
 * Recruitment function for Gisaima
 * Handles starting recruitment of new units at structures
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

// Unit definitions with their properties
const UnitTypes = {
  // Basic units
  'basic_warrior': {
    name: 'Basic Warrior',
    type: 'warrior',
    power: 1,
    timePerUnit: 60, // seconds
    icon: 'sword'
  },
  'scout': {
    name: 'Scout',
    type: 'scout',
    power: 0.5,
    timePerUnit: 45,
    icon: 'bow'
  },
  
  // Race-specific units
  'human_knight': {
    name: 'Knight',
    type: 'knight',
    power: 2,
    timePerUnit: 90,
    icon: 'shield',
    race: 'human'
  },
  'elf_archer': {
    name: 'Elven Archer',
    type: 'archer',
    power: 1.5,
    timePerUnit: 75,
    icon: 'bow',
    race: 'elf'
  },
  'dwarf_defender': {
    name: 'Dwarven Defender',
    type: 'defender',
    power: 2,
    timePerUnit: 90,
    icon: 'shield',
    race: 'dwarf'
  },
  'goblin_raider': {
    name: 'Goblin Raider',
    type: 'raider',
    power: 0.75,
    timePerUnit: 30,
    icon: 'sword',
    race: 'goblin'
  },
  'fairy_enchanter': {
    name: 'Fairy Enchanter',
    type: 'enchanter',
    power: 1.5,
    timePerUnit: 60,
    icon: 'staff',
    race: 'fairy'
  },
  
  // Elite units
  'elite_guard': {
    name: 'Elite Guard',
    type: 'elite',
    power: 3,
    timePerUnit: 120,
    icon: 'shield'
  }
};

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
    unitType, 
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
  
  // Validate the unit type
  const unitTypeData = UnitTypes[unitType];
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
    
    // Check player resources
    const playerResourcesRef = db.ref(`players/${userId}/worlds/${worldId}/resources`);
    const playerResourcesSnapshot = await playerResourcesRef.once('value');
    const playerResources = playerResourcesSnapshot.val() || {};
    
    // Validate cost structure
    if (!cost || typeof cost !== 'object') {
      throw new HttpsError('invalid-argument', 'Invalid cost structure');
    }
    
    // Check if player has enough resources
    for (const [resource, amount] of Object.entries(cost)) {
      const playerAmount = playerResources[resource] || 0;
      if (playerAmount < amount) {
        throw new HttpsError('failed-precondition', 
          `Not enough ${resource}. Needed: ${amount}, Have: ${playerAmount}`);
      }
    }
    
    // Calculate completion time
    const now = Date.now();
    const timePerUnit = unitTypeData.timePerUnit || 60; // Default 60 seconds per unit
    const totalSeconds = timePerUnit * quantity;
    
    // Get world info for tick calculation
    const worldInfoRef = db.ref(`worlds/${worldId}/info`);
    const worldInfoSnapshot = await worldInfoRef.once('value');
    const worldInfo = worldInfoSnapshot.val() || {};
    
    const worldSpeed = worldInfo.speed || 1;
    const adjustedSeconds = totalSeconds / worldSpeed;
    
    const completesAt = now + (adjustedSeconds * 1000);
    
    // Generate a unique recruitment ID
    const recruitmentId = `recruitment_${now}_${Math.floor(Math.random() * 1000)}`;
    
    // Create recruitment entry
    const recruitmentData = {
      id: recruitmentId,
      unitType,
      unitName: unitTypeData.name,
      type: unitTypeData.type,
      race: unitTypeData.race || structureData.race,
      icon: unitTypeData.icon,
      power: unitTypeData.power,
      quantity,
      startedAt: now,
      completesAt,
      ticksRequired: Math.ceil(adjustedSeconds / 60), // Assuming 1 tick = 60 seconds
      owner: userId,
      cost
    };
    
    // Perform the database operations in a transaction
    await db.ref().transaction((data) => {
      if (!data) return null;
      
      // Update player resources
      if (!data.players) data.players = {};
      if (!data.players[userId]) data.players[userId] = {};
      if (!data.players[userId].worlds) data.players[userId].worlds = {};
      if (!data.players[userId].worlds[worldId]) data.players[userId].worlds[worldId] = {};
      if (!data.players[userId].worlds[worldId].resources) data.players[userId].worlds[worldId].resources = {};
      
      // Deduct resources
      const playerData = data.players[userId].worlds[worldId];
      for (const [resource, amount] of Object.entries(cost)) {
        if (!playerData.resources[resource]) playerData.resources[resource] = 0;
        playerData.resources[resource] -= amount;
        // Ensure we don't go negative
        if (playerData.resources[resource] < 0) playerData.resources[resource] = 0;
      }
      
      // Add message about recruitment
      playerData.lastMessage = {
        text: `Started recruiting ${quantity} ${unitTypeData.name} units`,
        timestamp: now
      };
      
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
      
      // Add recruitment achievement
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
      
      // Refund resources
      if (!data.players?.[userId]?.worlds?.[worldId]?.resources) {
        data.players[userId].worlds[worldId].resources = {};
      }
      
      for (const [resource, amount] of Object.entries(refunds)) {
        if (!data.players[userId].worlds[worldId].resources[resource]) {
          data.players[userId].worlds[worldId].resources[resource] = 0;
        }
        data.players[userId].worlds[worldId].resources[resource] += amount;
      }
      
      // Add message about cancellation
      data.players[userId].worlds[worldId].lastMessage = {
        text: `Cancelled recruitment and received ${refundPercent}% refund`,
        timestamp: now
      };
      
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
