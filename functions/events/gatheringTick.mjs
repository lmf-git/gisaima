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
    // Use merge utility to combine identical items
    const existingItems = Array.isArray(group.items) ? group.items : [];
    updates[`${groupPath}/items`] = merge(existingItems, gatheredItems);
  }
  
  // Reset group status to idle
  updates[`${groupPath}/status`] = 'idle';
  updates[`${groupPath}/gatheringBiome`] = null;
  updates[`${groupPath}/gatheringTicksRemaining`] = null;
  
  // Add a message about the gathering
  const itemCount = gatheredItems.length;

  // Create detailed chat message about gathering
  const groupName = group.name || "Unnamed group";
  const locationStr = tileKey.replace(',', ', ');
  
  // Format the gathered items for chat display
  let itemsText = '';
  if (gatheredItems.length > 0) {
    const itemSummary = gatheredItems.map(item => 
      `${item.quantity} ${item.name}${item.rarity && item.rarity !== 'common' ? ` (${item.rarity})` : ''}`
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
      x: x,
      y: y
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
        x: x,
        y: y
      }
    };
  }
  
  logger.info(`Group ${groupId} completed gathering and found ${itemCount} items at ${tileKey} in chunk ${chunkKey} (biome: ${biome}, rarity: ${rarity})`);
  return true;
}

/**
 * Generate random items based on group, biome, and terrain rarity
 * 
 * @param {Object} group Group data
 * @param {string} biome Biome name
 * @param {string} terrainRarity Rarity of the terrain (common, uncommon, rare, etc.)
 * @param {Object} terrainData Additional terrain data if available
 * @returns {Array} Array of generated items
 */
function generateGatheredItems(group, biome = 'plains', terrainRarity = 'common', terrainData = null) {
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
      id: "WOODEN_STICKS",
      ...ITEMS.WOODEN_STICKS, 
      quantity: Math.floor(Math.random() * 5) + 1 
    },
    { 
      id: "STONE_PIECES",
      ...ITEMS.STONE_PIECES, 
      quantity: Math.floor(Math.random() * 3) + 1 
    }
  ];
  
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
  
  // Calculate actual item count with rarity bonus
  let itemCount = Math.ceil(baseItems * rarityMultiplier);
  
  // Add common items first
  for (let i = 0; i < Math.min(itemCount, commonItems.length); i++) {
    const item = {...commonItems[i]};
    // Apply quantity bonus based on rarity
    item.quantity = Math.ceil(item.quantity * rarityMultiplier);
    items.push(item);
  }
  
  // Add biome-specific items
  for (let i = items.length; i < itemCount; i++) {
    if (biomeItems.length > 0) {
      const randomIndex = Math.floor(Math.random() * biomeItems.length);
      const item = { ...biomeItems[randomIndex] };
      // Apply quantity bonus based on rarity
      item.quantity = Math.ceil(item.quantity * rarityMultiplier);
      items.push(item);
    }
  }
  
  // Add biome-specific special items based on terrain properties
  if (terrainData) {
    // Handle special cases based on terrain features
    if (terrainData.lavaValue > 0.3) {
      // Volcanic terrain yields special volcanic items
      items.push({
        id: "VOLCANIC_GLASS",
        ...ITEMS.VOLCANIC_GLASS,
        quantity: Math.ceil(Math.random() * 2 * rarityMultiplier)
      });
    }
    
    if (terrainData.riverValue > 0.2 || terrainData.lakeValue > 0.2) {
      // Water-related features yield water-related items
      items.push({
        id: "FRESH_WATER",
        ...ITEMS.FRESH_WATER,
        quantity: Math.ceil(Math.random() * 3 * rarityMultiplier)
      });
    }
    
    if (terrainData.height > 0.8) {
      // High elevation yields mountain-specific items
      items.push({
        id: "MOUNTAIN_CRYSTAL",
        ...ITEMS.MOUNTAIN_CRYSTAL,
        quantity: 1
      });
    }
  }
  
  // Add special/rare items based on rarity chance
  if (Math.random() < bonusItemChance) {
    // Add special item(s) based on the biome and rarity
    const specialItems = getSpecialItemsByBiome(biome, terrainRarity);
    for (let i = 0; i < bonusItemCount && i < specialItems.length; i++) {
      items.push(specialItems[i]);
    }
  }
  
  return items;
}

/**
 * Get special items based on biome and rarity
 * 
 * @param {string} biome Biome name
 * @param {string} rarity Rarity level
 * @returns {Array} Array of special items
 */
function getSpecialItemsByBiome(biome, rarity) {
  const result = [];
  
  // Convert biome name to identify biome category
  const biomeLower = biome.toLowerCase();
  
  // Check for various biome types and add appropriate special items
  if (biomeLower.includes('forest') || biomeLower.includes('woods') || biomeLower.includes('grove')) {
    // Forest-related special items
    result.push({
      id: "MEDICINAL_HERBS",
      ...ITEMS.MEDICINAL_HERBS,
      quantity: Math.floor(Math.random() * 2) + 1
    });
  }
  else if (biomeLower.includes('mountain') || biomeLower.includes('peak') || biomeLower.includes('hill')) {
    // Mountain-related special items
    result.push({
      id: "MOUNTAIN_CRYSTAL",
      ...ITEMS.MOUNTAIN_CRYSTAL,
      quantity: 1
    });
    
    // Higher chance for iron in mountains
    if (Math.random() < 0.4) {
      result.push({
        id: "IRON_ORE",
        ...ITEMS.IRON_ORE,
        quantity: Math.floor(Math.random() * 2) + 1
      });
    }
  }
  else if (biomeLower.includes('desert') || biomeLower.includes('sand') || biomeLower.includes('dune')) {
    // Desert-related special items
    result.push({
      id: "SAND_CRYSTAL",
      ...ITEMS.SAND_CRYSTAL,
      quantity: 1
    });
    
    if (Math.random() < 0.3) {
      result.push({
        id: "CACTUS_FRUIT",
        ...ITEMS.CACTUS_FRUIT,
        quantity: Math.floor(Math.random() * 3) + 1
      });
    }
  }
  else if (biomeLower.includes('lava') || biomeLower.includes('volcanic') || biomeLower.includes('magma')) {
    // Volcanic-related special items
    result.push({
      id: "VOLCANIC_GLASS",
      ...ITEMS.VOLCANIC_GLASS,
      quantity: Math.floor(Math.random() * 2) + 1
    });
  }
  else if (biomeLower.includes('lake') || biomeLower.includes('river') || biomeLower.includes('stream') || 
          biomeLower.includes('ocean') || biomeLower.includes('water')) {
    // Water-related special items
    result.push({
      id: "FRESH_WATER",
      ...ITEMS.FRESH_WATER,
      quantity: Math.floor(Math.random() * 3) + 2
    });
    
    if (Math.random() < 0.4) {
      result.push({
        id: "FISH",
        ...ITEMS.FISH,
        quantity: Math.floor(Math.random() * 2) + 1
      });
    }
  }
  else if (biomeLower.includes('swamp') || biomeLower.includes('marsh') || biomeLower.includes('bog')) {
    // Swamp-related special items
    result.push({
      id: "MEDICINAL_HERBS",
      ...ITEMS.MEDICINAL_HERBS,
      quantity: Math.floor(Math.random() * 2) + 1
    });
  }
  else if (biomeLower.includes('plains') || biomeLower.includes('grassland') || biomeLower.includes('meadow')) {
    // Plains/grassland-related special items
    result.push({
      id: "WHEAT",
      ...ITEMS.WHEAT,
      quantity: Math.floor(Math.random() * 3) + 2
    });
  }
  
  // Add a "catch-all" rare artifact for other biomes or very rare findings
  if (rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic' || Math.random() < 0.1) {
    result.push({
      id: "MYSTERIOUS_ARTIFACT",
      ...ITEMS.MYSTERIOUS_ARTIFACT,
      quantity: 1
    });
  }
  
  return result;
}
