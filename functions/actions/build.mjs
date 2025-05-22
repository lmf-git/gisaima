/**
 * Building function for Gisaima
 * Handles creating new structures
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getDatabase } from 'firebase-admin/database';
import { STRUCTURES } from 'gisaima-shared/definitions/STRUCTURES.js';
import { ITEMS } from 'gisaima-shared/definitions/ITEMS.js';

/**
 * Starts construction of a new structure at a specific location using a group.
 * Requires authentication.
 */
export const buildStructure = onCall({ maxInstances: 10 }, async (request) => {
  // Check authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const uid = request.auth.uid;
  const { worldId, groupId, tileX, tileY, structureType, structureName } = request.data;

  // Validation
  if (!worldId || !groupId || typeof tileX !== 'number' || typeof tileY !== 'number' || !structureType || !structureName) {
    throw new HttpsError('invalid-argument', 'Required parameters are missing or invalid.');
  }

  console.log(`Building request by ${uid} for world ${worldId} at ${tileX},${tileY}`);
  
  const db = getDatabase();
  const tileKey = `${tileX},${tileY}`; 

  // Calculate chunk coordinates
  const CHUNK_SIZE = 20;
  const chunkX = Math.floor(tileX / CHUNK_SIZE);
  const chunkY = Math.floor(tileY / CHUNK_SIZE);
  const chunkKey = `${chunkX},${chunkY}`;

  console.log(`Calculated chunk coordinates: ${chunkKey} for tile ${tileKey}`);
  
  try {
    // Get current tile data
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
    const tileSnapshot = await tileRef.once('value');
    const tileData = tileSnapshot.val() || {};

    // Check if there's already a structure
    if (tileData.structure) {
      throw new HttpsError('failed-precondition', 'There is already a structure at this location.');
    }

    // Get the group data
    const groupRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`);
    const groupSnapshot = await groupRef.once('value');
    const groupData = groupSnapshot.val();

    if (!groupData) {
      throw new HttpsError('not-found', 'Group not found at this location.');
    }

    // Verify group ownership
    if (groupData.owner !== uid) {
      throw new HttpsError('permission-denied', 'You do not own this group.');
    }

    // Check if group is idle
    if (groupData.status !== 'idle') {
      throw new HttpsError('failed-precondition', 'Group must be idle to start building.');
    }

    // Validate structure type
    const structureDefinition = STRUCTURES[structureType];
    if (!structureDefinition) {
      throw new HttpsError('invalid-argument', `Unknown structure type: ${structureType}`);
    }
    
    // Check if group has the required resources
    const availableResources = {};
    
    // Process group items to check available resources
    if (groupData.items) {
      // Handle items as object (new format)
      if (!Array.isArray(groupData.items) && typeof groupData.items === 'object') {
        Object.entries(groupData.items).forEach(([itemCode, quantity]) => {
          if (!availableResources[itemCode]) {
            availableResources[itemCode] = 0;
          }
          availableResources[itemCode] += quantity;
        });
      } 
      // Handle items as array (legacy format)
      else if (Array.isArray(groupData.items)) {
        groupData.items.forEach(item => {
          const itemId = item.id || item.name;
          if (!availableResources[itemId]) {
            availableResources[itemId] = 0;
          }
          availableResources[itemId] += item.quantity || 1;
        });
      }
    }
    
    // Check if all required resources are available
    const missingResources = [];
    if (structureDefinition.requiredResources && structureDefinition.requiredResources.length > 0) {
      for (const resource of structureDefinition.requiredResources) {
        const resourceId = resource.id || resource.name;
        const available = availableResources[resourceId] || 0;
        if (available < resource.quantity) {
          const displayName = ITEMS[resourceId]?.name || resourceId;
          missingResources.push({
            name: displayName,
            required: resource.quantity,
            available: available
          });
        }
      }
    }
    
    if (missingResources.length > 0) {
      throw new HttpsError('failed-precondition', 
        `Missing resources: ${missingResources.map(r => `${r.name} (${r.available}/${r.required})`).join(', ')}`
      );
    }
    
    // Use a transaction to ensure data consistency
    await db.ref().transaction(currentData => {
      if (!currentData) return null;
      
      // Get the current tile
      if (!currentData.worlds[worldId].chunks[chunkKey][tileKey]) {
        currentData.worlds[worldId].chunks[chunkKey][tileKey] = {};
      }
      
      // Get the current group
      const currentGroup = currentData.worlds[worldId].chunks[chunkKey][tileKey].groups[groupId];
      
      if (!currentGroup) {
        // Group no longer exists
        return currentData;
      }
      
      if (currentGroup.owner !== uid || currentGroup.status !== 'idle') {
        // Group state has changed
        return currentData;
      }
      
      // Start building: create structure in 'building' state
      currentData.worlds[worldId].chunks[chunkKey][tileKey].structure = {
        id: `structure_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        name: structureName,
        type: structureType,
        status: 'building',
        buildProgress: 0,
        owner: uid,
        ownerName: currentData.players[uid]?.worlds[worldId]?.displayName || 'Unknown',
        race: currentGroup.race || null,
        builder: groupId  // Add the groupId as the builder property
      };
      
      // Update group status
      currentGroup.status = 'building';
      
      // Remove the required resources from the group
      if (currentGroup.items) {
        // Create a map of required resources from the structure definition
        const requiredResources = new Map();
        if (structureDefinition.requiredResources) {
          for (const resource of structureDefinition.requiredResources) {
            const resourceId = resource.id || resource.name;
            requiredResources.set(resourceId, resource.quantity);
          }
        }
        
        // Handle items as object (new format)
        if (!Array.isArray(currentGroup.items) && typeof currentGroup.items === 'object') {
          const updatedItems = {...currentGroup.items};
          
          for (const [resourceId, requiredAmount] of requiredResources.entries()) {
            if (updatedItems[resourceId]) {
              // If we have this resource, reduce its quantity
              const remaining = updatedItems[resourceId] - requiredAmount;
              if (remaining > 0) {
                updatedItems[resourceId] = remaining;
              } else {
                // Remove the resource if none remains
                delete updatedItems[resourceId];
              }
            }
          }
          
          currentGroup.items = updatedItems;
        } 
        // Handle items as array (legacy format)
        else if (Array.isArray(currentGroup.items)) {
          const remainingItems = [];
          
          // First pass to identify resources to keep
          for (const item of currentGroup.items) {
            const itemId = item.id || item.name;
            const resourceRequired = requiredResources.get(itemId);
            
            if (resourceRequired) {
              // This is a required resource
              const toUse = Math.min(item.quantity || 1, resourceRequired);
              requiredResources.set(itemId, resourceRequired - toUse);
              
              // If there are leftover quantities, keep them
              const remaining = (item.quantity || 1) - toUse;
              if (remaining > 0) {
                remainingItems.push({...item, quantity: remaining});
              }
            } else {
              // Not a required resource, keep it
              remainingItems.push(item);
            }
          }
          
          currentGroup.items = remainingItems;
        }
      }
      
      // Add chat message for building
      if (!currentData.worlds[worldId].chat) {
        currentData.worlds[worldId].chat = {};
      }
      
      const chatMessageId = `chat_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      currentData.worlds[worldId].chat[chatMessageId] = {
        type: 'system',
        text: `${structureName} construction has begun at (${tileX},${tileY})`,
        timestamp: Date.now(),
        location: { x: tileX, y: tileY }
      };
      
      return currentData;
    });
    
    console.log(`Building started for user ${uid}, group ${groupId} at ${tileX},${tileY}`);
    return { 
      success: true, 
      structure: structureType
    };
  } catch (error) {
    console.error('Building failed:', error);
    throw new HttpsError(
      error.code || 'internal',
      error.message || 'Failed to start building.',
      error
    );
  }
});
