/**
 * Start the monster group gathering resources
 * @param {object} db - Firebase database reference
 * @param {string} worldId - The world ID
 * @param {object} monsterGroup - The monster group data
 * @param {object} updates - Updates object to modify
 * @param {number} now - Current timestamp
 * @returns {object} Action result
 */
export async function startMonsterGathering(db, worldId, monsterGroup, updates, now) {
  const groupPath = `worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}/groups/${monsterGroup.id}`;
  
  // Get tile data to determine biome
  const tileRef = db.ref(`worlds/${worldId}/chunks/${monsterGroup.chunkKey}/${monsterGroup.tileKey}`);
  const tileSnapshot = await tileRef.once('value');
  const tileData = tileSnapshot.val() || {};
  
  // Get the biome or default to plains
  const biome = tileData.biome?.name || 'plains';
  
  // Set gathering status with tick counting
  updates[`${groupPath}/status`] = 'gathering';
  updates[`${groupPath}/gatheringStarted`] = now;
  updates[`${groupPath}/gatheringBiome`] = biome;
  updates[`${groupPath}/gatheringTicksRemaining`] = 2; // Set to wait for 2 ticks
  
  // Add a chat message
  const chatMessageId = `monster_gather_${now}_${monsterGroup.id}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `${monsterGroup.name || "Monster group"} is gathering resources in the ${biome}.`,
    type: 'event',
    timestamp: now,
    location: {
      x: parseInt(monsterGroup.tileKey.split(',')[0]),
      y: parseInt(monsterGroup.tileKey.split(',')[1])
    }
  };
  
  return {
    action: 'gather',
    biome
  };
}

/**
 * Count total resources in a monster group's items
 * @param {Array} items - Array of items that the monster group has
 * @returns {number} Total count of resources (sum of all quantities)
 */
export function countTotalResources(items) {
  // If no items or items array is empty, return 0
  if (!items || !items.length) {
    return 0;
  }
  
  // Sum up quantities of all items
  return items.reduce((total, item) => {
    // Add the quantity of this item (default to 1 if quantity is not specified)
    return total + (item.quantity || 1);
  }, 0);
}

