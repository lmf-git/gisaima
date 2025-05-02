/**
 * Gathering tick processing for Gisaima
 * Handles resource gathering during tick cycles
 */

import { logger } from "firebase-functions";
import { merge } from "gisaima-shared/economy/items.js";
import { ITEMS, getBiomeItems } from "gisaima-shared/definitions/ITEMS.js";

/**
 * Process gathering for a group
 * 
 * @param {string} worldId World ID
 * @param {Object} updates Reference to the updates object to modify
 * @param {Object} group Group data
 * @param {string} chunkKey Current chunk key
 * @param {string} tileKey Current tile key
 * @param {string} groupId Group ID
 * @param {Object} tile Tile data
 * @param {number} now Current timestamp
 * @returns {boolean} Whether gathering was processed
 */
export function processGathering(worldId, updates, group, chunkKey, tileKey, groupId, tile, now) {
  // Skip if not in gathering state
  if (group.status !== 'gathering') {
    return false;
  }
  
  // Full database path to this group
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  
  // Check if we need to decrement ticks remaining
  if (group.gatheringTicksRemaining && group.gatheringTicksRemaining > 1) {
    // Decrement the counter and continue waiting
    updates[`${groupPath}/gatheringTicksRemaining`] = group.gatheringTicksRemaining - 1;
    return false; // Gathering not completed yet
  }
  
  // Generate gathered items based on group and biome
  const biome = group.gatheringBiome || tile.biome?.name || 'plains';
  const gatheredItems = generateGatheredItems(group, biome);
  
  // Add items to group, using merge to combine identical items
  if (!group.items) {
    updates[`${groupPath}/items`] = gatheredItems;
  } else {
    // Use merge utility to combine identical items
    const existingItems = Array.isArray(group.items) ? group.items : [];
    updates[`${groupPath}/items`] = merge(existingItems, gatheredItems);
  }
  
  // Reset group status to idle
  updates[`${groupPath}/status`] = 'idle';
  updates[`${groupPath}/gatheringUntil`] = null;
  updates[`${groupPath}/gatheringStarted`] = null;
  updates[`${groupPath}/gatheringBiome`] = null;
  
  // Add a message about the gathering
  const itemCount = gatheredItems.length;
  updates[`${groupPath}/lastMessage`] = {
    text: `Gathered ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
    timestamp: now
  };
  
  // Create detailed chat message about gathering
  const groupName = group.name || "Unnamed group";
  const locationStr = tileKey.replace(',', ', ');
  
  // Format the gathered items for chat display
  let itemsText = '';
  if (gatheredItems.length > 0) {
    const itemSummary = gatheredItems.map(item => 
      `${item.quantity} ${item.name}${item.rarity === 'rare' ? ' (Rare)' : ''}`
    ).join(', ');
    
    itemsText = `: ${itemSummary}`;
  }
  
  // Create chat message
  const chatMessageId = `gather_${now}_${groupId}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `${groupName} gathered resources in ${biome} biome at (${locationStr})${itemsText}`,
    type: 'event',
    timestamp: now,
    location: {
      x: parseInt(tileKey.split(',')[0]),
      y: parseInt(tileKey.split(',')[1])
    }
  };
  
  // Add special announcement for rare or better items
  const specialItems = gatheredItems.filter(item => 
    ['rare', 'epic', 'legendary', 'mythic'].includes(item.rarity?.toLowerCase())
  );
  
  if (specialItems.length > 0) {
    const itemDescriptions = specialItems.map(item => {
      const rarity = item.rarity.toLowerCase();
      const stars = {
        'rare': '★★★',
        'epic': '★★★★',
        'legendary': '★★★★★',
        'mythic': '✦✦✦✦✦'
      }[rarity] || '★★★';
      
      return `${stars} ${item.name} ${stars}`;
    }).join('\n');
    
    const rareChatMessageId = `rare_${now}_${groupId}`;
    updates[`worlds/${worldId}/chat/${rareChatMessageId}`] = {
      text: `${groupName} has discovered something extraordinary!\n${itemDescriptions}`,
      type: 'event',
      timestamp: now + 1, // Add 1ms to ensure correct ordering
      location: {
        x: parseInt(tileKey.split(',')[0]),
        y: parseInt(tileKey.split(',')[1])
      }
    };
  }
  
  logger.info(`Group ${groupId} completed gathering and found ${itemCount} items at ${tileKey} in chunk ${chunkKey}`);
  return true;
}

/**
 * Generate random items based on group and biome
 * 
 * @param {Object} group Group data
 * @param {string} biome Biome name
 * @returns {Array} Array of generated items
 */
function generateGatheredItems(group, biome = 'plains') {
  const items = [];
  
  // Base number of items is determined by group size
  const numGatherers = (group.units ? 
    (Array.isArray(group.units) ? group.units.length : Object.keys(group.units).length) : 1);
  
  // Calculate the base number of items to generate
  const baseItems = Math.floor(Math.random() * 2) + Math.ceil(numGatherers / 2);
  
  // Generate biome-specific items
  const biomeItems = getBiomeItems(biome);
  
  // Add common items every group finds
  const commonItems = [
    { 
      id: `item_${Date.now()}_1`, 
      ...ITEMS.WOODEN_STICKS, 
      quantity: Math.floor(Math.random() * 5) + 1 
    },
    { 
      id: `item_${Date.now()}_2`, 
      ...ITEMS.STONE_PIECES, 
      quantity: Math.floor(Math.random() * 3) + 1 
    }
  ];
  
  // Combine items based on the number determined
  const itemCount = baseItems;
  
  // Add common items first
  for (let i = 0; i < Math.min(itemCount, commonItems.length); i++) {
    items.push(commonItems[i]);
  }
  
  // Add biome-specific items
  for (let i = items.length; i < itemCount; i++) {
    if (biomeItems.length > 0) {
      const randomIndex = Math.floor(Math.random() * biomeItems.length);
      const item = { ...biomeItems[randomIndex] };
      
      // Generate unique ID
      item.id = `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      items.push(item);
    }
  }
  
  // Rare chance (5%) for a special item
  if (Math.random() < 0.05) {
    items.push({
      id: `item_${Date.now()}_special`,
      ...ITEMS.MYSTERIOUS_ARTIFACT,
      quantity: 1
    });
  }
  
  return items;
}
