/**
 * Gathering tick processing for Gisaima
 * Handles resource gathering during tick cycles
 */

import { logger } from "firebase-functions";
import { merge } from "gisaima-shared/economy/items.js";
import { getBiomeItems, ITEMS, MONSTER_DROPS } from "gisaima-shared/definitions/ITEMS.js";

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
 * @param {Object} terrainGenerator TerrainGenerator instance to use (optional)
 * @returns {boolean} Whether gathering was processed
 */
export function processGathering(worldId, updates, group, chunkKey, tileKey, groupId, tile, now, terrainGenerator = null) {
  // Skip if group is in cancellingGather state - user is currently cancelling gathering
  if (group.status === 'cancellingGather') {
    logger.info(`Skipping gathering for group ${groupId} as it's being cancelled`);
    return false;
  }
  
  // Skip if not in gathering state
  if (group.status !== 'gathering') {
    return false;
  }
  
  // Full database path to this group
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  
  // Validate required gathering properties
  if (group.gatheringTicksRemaining === undefined) {
    // Invalid gathering state, reset to idle
    logger.warn(`Invalid gathering state for group ${groupId} in world ${worldId}`);
    updates[`${groupPath}/status`] = 'idle';
    updates[`${groupPath}/gatheringBiome`] = null;
    updates[`${groupPath}/gatheringTicksRemaining`] = null;
    return false;
  }
  
  // Check if we need to decrement ticks remaining
  if (group.gatheringTicksRemaining && group.gatheringTicksRemaining > 1) {
    // Decrement the counter and continue waiting
    updates[`${groupPath}/gatheringTicksRemaining`] = group.gatheringTicksRemaining - 1;
    return false; // Gathering not completed yet
  }
  
  // Get coordinates from the tile key for terrain generator
  const coordinates = tileKey.split(',').map(Number);
  const x = coordinates[0];
  const y = coordinates[1];
  
  // Use the terrain data if available, otherwise fall back to stored biome
  let terrainData = null;
  let biome = group.gatheringBiome || tile.biome?.name || 'plains';
  let rarity = 'common';
  
  try {
    // Use the provided terrainGenerator if available
    if (terrainGenerator) {
      terrainData = terrainGenerator.getTerrainData(x, y);
      
      // Use the more accurate biome and rarity from terrain data
      biome = terrainData.biome.name;
      rarity = terrainData.rarity || 'common';
      
      logger.debug(`Using provided TerrainGenerator for group ${groupId}: biome=${biome}, rarity=${rarity}`);
    } else {
      logger.debug(`No TerrainGenerator available for group ${groupId}, using stored biome: ${biome}`);
    }
  } catch (error) {
    logger.warn(`Error using TerrainGenerator for group ${groupId}: ${error.message}`);
    // Fall back to stored biome in case of error
  }
  
  // Generate gathered items based on group, biome, and terrain rarity
  const gatheredItems = generateGatheredItems(group, biome, rarity, terrainData);
  
  // Add items to group, using merge to combine identical items
  if (!group.items) {
    updates[`${groupPath}/items`] = gatheredItems;
  } else {
    // Use merge utility to combine identical items - handles both old and new format
    updates[`${groupPath}/items`] = merge(group.items, gatheredItems);
  }
  
  // Reset group status to idle
  updates[`${groupPath}/status`] = 'idle';
  updates[`${groupPath}/gatheringBiome`] = null;
  updates[`${groupPath}/gatheringTicksRemaining`] = null;
  
  // Format the gathered items for chat display - convert codes to readable names
  const itemsList = [];
  Object.entries(gatheredItems).forEach(([itemCode, quantity]) => {
    const itemDef = ITEMS[itemCode];
    if (itemDef) {
      const rarity = itemDef.rarity && itemDef.rarity !== 'common' ? ` (${itemDef.rarity})` : '';
      itemsList.push(`${quantity} ${itemDef.name}${rarity}`);
    } else {
      itemsList.push(`${quantity} ${itemCode}`);
    }
  });
  
  // Create detailed chat message about gathering
  const groupName = group.name || "Unnamed group";
  const locationStr = tileKey.replace(',', ', ');
  
  let itemsText = '';
  if (itemsList.length > 0) {
    itemsText = `: ${itemsList.join(', ')}`;
  }
  
  // Create chat message
  const chatMessageId = `gather_${now}_${groupId}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `${groupName} gathered resources in ${biome} biome at (${locationStr})${itemsText}`,
    type: 'event',
    timestamp: now,
    location: {
      x: x,
      y: y
    }
  };
  
  // Add special announcement for rare or better items
  const specialItems = [];
  Object.entries(gatheredItems).forEach(([itemCode, quantity]) => {
    const itemDef = ITEMS[itemCode];
    if (itemDef && ['rare', 'epic', 'legendary', 'mythic'].includes(itemDef.rarity?.toLowerCase())) {
      specialItems.push({code: itemCode, name: itemDef.name, rarity: itemDef.rarity});
    }
  });
  
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
        x: x,
        y: y
      }
    };
  }
  
  logger.info(`Group ${groupId} completed gathering and found ${Object.keys(gatheredItems).length} item types at ${tileKey} in chunk ${chunkKey} (biome: ${biome}, rarity: ${rarity})`);
  return true;
}

/**
 * Generate random items based on group, biome, and terrain rarity
 * 
 * @param {Object} group Group data
 * @param {string} biome Biome name
 * @param {string} terrainRarity Rarity of the terrain (common, uncommon, rare, etc.)
 * @param {Object} terrainData Additional terrain data if available
 * @returns {Object} Generated items in {item_code: quantity} format
 */
function generateGatheredItems(group, biome = 'plains', terrainRarity = 'common', terrainData = null) {
  const items = {};
  
  // Base number of items is determined by group size
  const numGatherers = (group.units ? 
    (Array.isArray(group.units) ? group.units.length : Object.keys(group.units).length) : 1);
  
  // Calculate the base number of items to generate
  const baseItems = Math.floor(Math.random() * 2) + Math.ceil(numGatherers / 2);
  
  // Adjust item quantity based on terrain rarity
  const rarityMultipliers = {
    'common': 1,
    'uncommon': 1.25,
    'rare': 1.5,
    'epic': 1.75,
    'legendary': 2,
    'mythic': 2.5
  };
  const rarityMultiplier = rarityMultipliers[terrainRarity] || 1;
  
  // Helper function to add items to the result
  function addItem(itemCode, quantity) {
    if (!itemCode) return;
    const code = itemCode.toUpperCase();
    items[code] = (items[code] || 0) + Math.ceil(quantity * rarityMultiplier);
  }
  
  // Add common items every group finds
  addItem("WOODEN_STICKS", Math.floor(Math.random() * 5) + 1);
  addItem("STONE_PIECES", Math.floor(Math.random() * 3) + 1);
  
  // Generate biome-specific items
  const biomeItems = getBiomeItems(biome);
  
  // Calculate actual item count with rarity bonus
  let itemCount = Math.ceil(baseItems * rarityMultiplier);
  
  // Add biome-specific items
  for (let i = 0; i < itemCount && biomeItems.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * biomeItems.length);
    const biomeItem = biomeItems[randomIndex];
    if (biomeItem && biomeItem.id) {
      addItem(biomeItem.id, biomeItem.quantity || 1);
    }
  }
  
  // Add biome-specific special items based on terrain properties
  if (terrainData) {
    // Handle special cases based on terrain features
    if (terrainData.lavaValue > 0.3) {
      addItem("VOLCANIC_GLASS", Math.ceil(Math.random() * 2));
    }
    
    if (terrainData.riverValue > 0.2 || terrainData.lakeValue > 0.2) {
      addItem("FRESH_WATER", Math.ceil(Math.random() * 3));
    }
    
    if (terrainData.height > 0.8) {
      addItem("MOUNTAIN_CRYSTAL", 1);
    }
  }
  
  // Determine if additional special items should be generated based on terrain rarity
  let bonusItemChance = 0;
  let bonusItemCount = 0;
  
  switch (terrainRarity) {
    case 'common':
      bonusItemChance = 0.05;
      break;
    case 'uncommon':
      bonusItemChance = 0.15;
      break;
    case 'rare':
      bonusItemChance = 0.35;
      bonusItemCount = 1;
      break;
    case 'epic':
      bonusItemChance = 0.6;
      bonusItemCount = 1;
      break;
    case 'legendary':
      bonusItemChance = 0.85;
      bonusItemCount = 2;
      break;
    case 'mythic':
      bonusItemChance = 1.0;
      bonusItemCount = 3;
      break;
  }
  
  // Add special/rare items based on rarity chance
  if (Math.random() < bonusItemChance) {
    // Add special item(s) based on the biome and rarity
    const specialItems = getSpecialItemsByBiome(biome, terrainRarity);
    for (let i = 0; i < bonusItemCount && i < specialItems.length; i++) {
      if (specialItems[i] && specialItems[i].id) {
        addItem(specialItems[i].id, specialItems[i].quantity || 1);
      }
    }
  }
  
  return items;
}

/**
 * Get special items based on biome and rarity
 * 
 * @param {string} biome Biome name
 * @param {string} rarity Rarity level
 * @returns {Array} Array of item code and quantity pairs
 */
function getSpecialItemsByBiome(biome, rarity) {
  const result = [];
  
  // Convert biome name to identify biome category
  const biomeLower = biome.toLowerCase();
  
  // Check for various biome types and add appropriate special items
  if (biomeLower.includes('forest') || biomeLower.includes('woods') || biomeLower.includes('grove')) {
    result.push({
      id: "MEDICINAL_HERBS",
      quantity: Math.floor(Math.random() * 2) + 1
    });
  }
  else if (biomeLower.includes('mountain') || biomeLower.includes('peak') || biomeLower.includes('hill')) {
    result.push({
      id: "MOUNTAIN_CRYSTAL",
      quantity: 1
    });
    
    if (Math.random() < 0.4) {
      result.push({
        id: "IRON_ORE",
        quantity: Math.floor(Math.random() * 2) + 1
      });
    }
  }
  else if (biomeLower.includes('desert') || biomeLower.includes('sand') || biomeLower.includes('dune')) {
    result.push({
      id: "SAND_CRYSTAL",
      quantity: 1
    });
    
    if (Math.random() < 0.3) {
      result.push({
        id: "CACTUS_FRUIT",
        quantity: Math.floor(Math.random() * 3) + 1
      });
    }
  }
  else if (biomeLower.includes('lava') || biomeLower.includes('volcanic') || biomeLower.includes('magma')) {
    result.push({
      id: "VOLCANIC_GLASS",
      quantity: Math.floor(Math.random() * 2) + 1
    });
  }
  else if (biomeLower.includes('lake') || biomeLower.includes('river') || biomeLower.includes('stream') || 
          biomeLower.includes('ocean') || biomeLower.includes('water')) {
    result.push({
      id: "FRESH_WATER",
      quantity: Math.floor(Math.random() * 3) + 2
    });
    
    if (Math.random() < 0.4) {
      result.push({
        id: "FISH",
        quantity: Math.floor(Math.random() * 2) + 1
      });
    }
  }
  else if (biomeLower.includes('swamp') || biomeLower.includes('marsh') || biomeLower.includes('bog')) {
    result.push({
      id: "MEDICINAL_HERBS",
      quantity: Math.floor(Math.random() * 2) + 1
    });
  }
  else if (biomeLower.includes('plains') || biomeLower.includes('grassland') || biomeLower.includes('meadow')) {
    result.push({
      id: "WHEAT",
      quantity: Math.floor(Math.random() * 3) + 2
    });
  }
  
  // Add a "catch-all" rare artifact for other biomes or very rare findings
  if (rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic' || Math.random() < 0.1) {
    result.push({
      id: "MYSTERIOUS_ARTIFACT",
      quantity: 1
    });
  }
  
  return result;
}
