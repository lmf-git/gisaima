/**
 * Gathering tick processing for Gisaima
 * Handles resource gathering during tick cycles
 */

import { logger } from "firebase-functions";

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
  // Skip if not in gathering state or not time to complete gathering yet
  if (group.status !== 'gathering' || !group.gatheringUntil || group.gatheringUntil > now) {
    return false;
  }
  
  // Full database path to this group
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  
  // Generate gathered items based on group and biome
  const biome = group.gatheringBiome || tile.biome?.name || 'plains';
  const gatheredItems = generateGatheredItems(group, biome);
  
  // Add items to group
  if (!group.items) {
    updates[`${groupPath}/items`] = gatheredItems;
  } else {
    // Combine existing items with new gathered items
    const updatedItems = [
      ...(Array.isArray(group.items) ? group.items : []), 
      ...gatheredItems
    ];
    updates[`${groupPath}/items`] = updatedItems;
  }
  
  // Reset group status to idle
  updates[`${groupPath}/status`] = 'idle';
  updates[`${groupPath}/lastUpdated`] = now;
  updates[`${groupPath}/gatheringUntil`] = null;
  updates[`${groupPath}/gatheringStarted`] = null;
  updates[`${groupPath}/gatheringBiome`] = null;
  
  // Add a message about the gathering
  const itemCount = gatheredItems.length;
  updates[`${groupPath}/lastMessage`] = {
    text: `Gathered ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
    timestamp: now
  };
  
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
  const unitCount = group.unitCount || (group.units ? 
    (Array.isArray(group.units) ? group.units.length : Object.keys(group.units).length) : 1);
  
  // Calculate the base number of items to generate
  const baseItems = Math.floor(Math.random() * 2) + Math.ceil(unitCount / 2);
  
  // Generate biome-specific items
  const biomeItems = getBiomeItems(biome);
  
  // Add common items every group finds
  const commonItems = [
    { id: `item_${Date.now()}_1`, name: 'Wooden Sticks', quantity: Math.floor(Math.random() * 5) + 1, type: 'resource', rarity: 'common' },
    { id: `item_${Date.now()}_2`, name: 'Stone Pieces', quantity: Math.floor(Math.random() * 3) + 1, type: 'resource', rarity: 'common' }
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
      name: 'Mysterious Artifact',
      description: 'A strange object of unknown origin',
      quantity: 1,
      type: 'artifact',
      rarity: 'rare'
    });
  }
  
  return items;
}

/**
 * Get biome-specific items
 * 
 * @param {string} biome Biome name
 * @returns {Array} Array of biome items
 */
function getBiomeItems(biome) {
  const biomeItemMap = {
    'plains': [
      { name: 'Wheat', quantity: Math.floor(Math.random() * 3) + 1, type: 'resource', rarity: 'common' },
      { name: 'Wild Berries', quantity: Math.floor(Math.random() * 2) + 1, type: 'resource', rarity: 'common' }
    ],
    'forest': [
      { name: 'Oak Wood', quantity: Math.floor(Math.random() * 3) + 1, type: 'resource', rarity: 'common' },
      { name: 'Medicinal Herbs', quantity: Math.floor(Math.random() * 2) + 1, type: 'resource', rarity: 'uncommon' }
    ],
    'mountains': [
      { name: 'Iron Ore', quantity: Math.floor(Math.random() * 2) + 1, type: 'resource', rarity: 'uncommon' },
      { name: 'Mountain Crystal', quantity: 1, type: 'gem', rarity: 'rare' }
    ],
    'desert': [
      { name: 'Sand Crystal', quantity: Math.floor(Math.random() * 2) + 1, type: 'gem', rarity: 'uncommon' },
      { name: 'Cactus Fruit', quantity: Math.floor(Math.random() * 3) + 1, type: 'resource', rarity: 'common' }
    ],
    'rivers': [
      { name: 'Fresh Water', quantity: Math.floor(Math.random() * 3) + 1, type: 'resource', rarity: 'common' },
      { name: 'Fish', quantity: Math.floor(Math.random() * 2) + 1, type: 'resource', rarity: 'common' }
    ],
    'oasis': [
      { name: 'Pure Water', quantity: Math.floor(Math.random() * 2) + 1, type: 'resource', rarity: 'uncommon' },
      { name: 'Exotic Fruit', quantity: Math.floor(Math.random() * 2) + 1, type: 'resource', rarity: 'uncommon' }
    ],
    'ruins': [
      { name: 'Ancient Fragment', quantity: 1, type: 'artifact', rarity: 'rare' },
      { name: 'Broken Tool', quantity: Math.floor(Math.random() * 2) + 1, type: 'junk', rarity: 'common' }
    ],
    'wastes': [
      { name: 'Scrap Metal', quantity: Math.floor(Math.random() * 3) + 1, type: 'resource', rarity: 'common' },
      { name: 'Strange Device', quantity: 1, type: 'artifact', rarity: 'uncommon' }
    ]
  };
  
  // Return items for the specific biome, or default to plains
  return biomeItemMap[biome] || biomeItemMap['plains'];
}
