/**
 * Monster building strategy functions for Gisaima
 * Handles monster construction and upgrading of structures and buildings
 */

import { STRUCTURES } from 'gisaima-shared/definitions/STRUCTURES.js';
import { BUILDINGS } from 'gisaima-shared/definitions/BUILDINGS.js';
import { 
  isMonsterStructure,
  canStructureBeUpgraded,
  hasSufficientResources,
  consumeResourcesFromItems,
  createMonsterConstructionMessage,
  createGroupPath,
  createStructurePath,
  createChatMessagePath,
  generateMonsterId,
  isSuitableForMonsterBuilding
} from '../_monsters.mjs';


const MIN_UNITS_FOR_BUILDING = 3;
const MAX_MONSTER_STRUCTURES_NEARBY = 3; // Maximum number of monster structures allowed in nearby area
const NEARBY_DISTANCE = 10; // Distance considered "nearby" for structure density check

/**
 * Check if a location is suitable for building
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} location - Location to check
 * @param {object} worldScan - World scan data
 * @returns {Promise<boolean>} True if the location is suitable
 */
async function isLocationSuitableForBuilding(db, worldId, location, worldScan) {
  // Get the chunk and tile keys
  const chunkX = Math.floor(location.x / 20);
  const chunkY = Math.floor(location.y / 20);
  const chunkKey = `${chunkX},${chunkY}`;
  const tileKey = `${location.x},${location.y}`;
  
  try {
    // Check if the tile already has a structure
    const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}`);
    const tileSnapshot = await tileRef.once('value');
    const tileData = tileSnapshot.val();
    
    // Use the comprehensive isSuitableForMonsterBuilding check
    if (!tileData || !isSuitableForMonsterBuilding(tileData)) {
      return false;
    }
    
    // Double-check the tile doesn't have a structure (defensive programming)
    if (tileData.structure) {
      console.log(`Location ${location.x},${location.y} already has a structure, cannot build`);
      return false;
    }
    
    // Check if there are too many monster structures nearby
    let nearbyMonsterStructures = 0;
    
    if (worldScan && worldScan.monsterStructures) {
      worldScan.monsterStructures.forEach(structure => {
        const distance = Math.sqrt(
          Math.pow(structure.x - location.x, 2) + 
          Math.pow(structure.y - location.y, 2)
        );
        
        if (distance <= NEARBY_DISTANCE) {
          nearbyMonsterStructures++;
        }
      });
    }
    
    if (nearbyMonsterStructures >= MAX_MONSTER_STRUCTURES_NEARBY) {
      return false; // Too many monster structures nearby
    }
    
    // Check if we're too close to player structures (increased minimum distance)
    const playerStructures = worldScan.playerSpawns || [];
    const MIN_DISTANCE_FROM_SPAWN = 5; // Increased minimum distance
    
    for (const playerStructure of playerStructures) {
      const distance = Math.sqrt(
        Math.pow(playerStructure.x - location.x, 2) + 
        Math.pow(playerStructure.y - location.y, 2)
      );
      
      if (distance < MIN_DISTANCE_FROM_SPAWN) {
        return false; // Too close to player spawn
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error checking location for building: ${error}`);
    return false;
  }
}

/**
 * Build a monster structure
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - Monster group data
 * @param {object} location - Current location
 * @param {object} updates - Database updates object
 * @param {number} now - Current timestamp
 * @param {object} worldScan - World scan data with strategic locations
 * @returns {object} Action result
 */
export async function buildMonsterStructure(db, worldId, monsterGroup, location, updates, now, worldScan = null) {
  // Get personality for decision making
  const personality = monsterGroup.personality || { id: 'BALANCED' };
  
  // Check if the monster group has enough units to build
  const unitCount = monsterGroup.units ? Object.keys(monsterGroup.units).length : 0;
  if (unitCount < MIN_UNITS_FOR_BUILDING) {
    return { action: null, reason: 'not_enough_units' };
  }
  
  // Use provided worldScan or create an empty one if none provided
  const scanData = worldScan || { monsterStructures: [], playerSpawns: [], resourceHotspots: [] };
  
  // Determine where to build
  const buildLocation = determineBuildLocation(location, scanData, personality);
  
  // Check if location is suitable
  const isSuitable = await isLocationSuitableForBuilding(db, worldId, buildLocation, scanData);
  if (!isSuitable) {
    return { action: null, reason: 'unsuitable_location' };
  }
  
  // Determine what to build
  const structureType = chooseStructureType(monsterGroup, personality);
  
  // Check if monster has resources to build
  if (!hasResourcesToBuild(monsterGroup, structureType)) {
    return { action: null, reason: 'insufficient_resources' };
  }
  
  // Generate structure ID
  const structureId = generateMonsterId('monster_structure', now);
  
  // Set up location references
  const chunkX = Math.floor(buildLocation.x / 20);
  const chunkY = Math.floor(buildLocation.y / 20);
  const chunkKey = `${chunkX},${chunkY}`;
  const tileKey = `${buildLocation.x},${buildLocation.y}`;
  
  // Get the structure definition from the shared STRUCTURES object
  const structureData = STRUCTURES[structureType];
  if (!structureData) {
    return { action: null, reason: 'invalid_structure_type' };
  }
  
  // Calculate completion time - same format as player buildings
  const buildTime = structureData.buildTime || 1; // Time in ticks
  const completionTime = now + (buildTime * 60000); // Convert to milliseconds
  
  // Consume resources from the monster group
  const groupPath = createGroupPath(worldId, monsterGroup);
  if (!consumeResources(monsterGroup, structureType, updates, groupPath)) {
    return { action: null, reason: 'resource_consumption_failed' };
  }
  
  // Add the structure to the tile - using same format as player structures
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`] = {
    id: structureId,
    name: `${monsterGroup.name || "Monster"} ${structureData.name}`,
    type: structureType,
    status: 'building',
    buildProgress: 0,
    buildTotalTime: buildTime,
    buildStartTime: now,
    buildCompletionTime: completionTime,
    owner: 'monster', // Explicitly set owner to 'monster'
    ownerName: monsterGroup.name || "Monster",
    ownerGroupId: monsterGroup.id,
    monster: true,
    createdAt: now,
    level: 1,
    items: [],
    features: structureData.features || [],
    capacity: structureData.capacity || 10
  };
  
  // Set monster group as building - match player group format for UI consistency
  updates[`${groupPath}/status`] = 'building';
  updates[`${groupPath}/buildingStart`] = now;
  updates[`${groupPath}/buildingTime`] = buildTime;
  updates[`${groupPath}/buildingUntil`] = completionTime; // Format matches player groups
  updates[`${groupPath}/buildingLocation`] = { x: buildLocation.x, y: buildLocation.y };
  updates[`${groupPath}/buildingType`] = structureType;
  
  // Add a message about the building
  const chatMessageId = generateMonsterId('monster_building', now);
  updates[createChatMessagePath(worldId, chatMessageId)] = {
    text: createMonsterConstructionMessage(monsterGroup, 'build', structureData.name, buildLocation),
    type: 'event',
    timestamp: now,
    location: {
      x: location.x,
      y: location.y
    }
  };
  
  // Add this structure as the preferred structure for this group
  updates[`${groupPath}/preferredStructureId`] = structureId;
  
  return {
    action: 'build',
    structureId: structureId,
    structureType: structureType,
    location: buildLocation,
    completesAt: completionTime
  };
}

/**
 * Calculate required resources for a monster structure
 * @param {string} structureType - Type of structure to build
 * @returns {Array} Array of required resources
 */
function getRequiredResourcesForStructure(structureType) {
  // Use the shared STRUCTURES definitions with standardized format
  if (STRUCTURES[structureType] && STRUCTURES[structureType].requiredResources) {
    return STRUCTURES[structureType].requiredResources;
  }
  
  // Fallback for backward compatibility
  if (STRUCTURES[structureType] && STRUCTURES[structureType].buildCost) {
    const structure = STRUCTURES[structureType];
    return Object.entries(structure.buildCost).map(([name, quantity]) => ({ 
      name, 
      quantity 
    }));
  }
  
  // Default simple requirements if structure type not found
  return [
    { name: 'Wooden Sticks', quantity: 8 },
    { name: 'Stone Pieces', quantity: 6 }
  ];
}

/**
 * Check if monster group has resources for building
 * @param {object} monsterGroup - Monster group data
 * @param {string} structureType - Structure type to build
 * @returns {boolean} True if group has required resources
 */
function hasResourcesToBuild(monsterGroup, structureType) {
  const requiredResources = getRequiredResourcesForStructure(structureType);
  return hasSufficientResources(monsterGroup.items || [], requiredResources);
}

/**
 * Consume resources required for building
 * @param {object} monsterGroup - Monster group data
 * @param {string} structureType - Structure type being built
 * @param {object} updates - Database updates object
 * @param {string} groupPath - Path to the group in database
 * @returns {boolean} True if resources were successfully consumed
 */
function consumeResources(monsterGroup, structureType, updates, groupPath) {
  // Get required resources
  const requiredResources = getRequiredResourcesForStructure(structureType);
  
  // Use the helper function to consume resources
  const remainingItems = consumeResourcesFromItems(monsterGroup.items || [], requiredResources);
  
  // If resources couldn't be consumed, return false
  if (remainingItems === null) {
    return false;
  }
  
  // Update the monster group with the remaining items
  updates[`${groupPath}/items`] = remainingItems;
  return true;
}

/**
 * Check if monster group has resources to upgrade a building
 * @param {object} monsterGroup - Monster group data
 * @param {object} building - Building to upgrade
 * @returns {boolean} True if group has required resources
 */
function hasResourcesToUpgrade(monsterGroup, structure) {
  if (!monsterGroup.items || monsterGroup.items.length === 0) {
    return false;
  }
  
  // Determine current level
  const currentLevel = structure.level || 1;
  
  // Simple resource requirements for upgrades based on level
  const requiredResources = [
    { name: 'Wooden Sticks', quantity: 5 * currentLevel },
    { name: 'Stone Pieces', quantity: 3 * currentLevel }
  ];
  
  // Add special resources for higher levels
  if (currentLevel >= 2) {
    requiredResources.push({ name: 'Iron Ore', quantity: currentLevel });
  }
  
  if (currentLevel >= 3) {
    requiredResources.push({ name: 'Crystal Shard', quantity: 1 });
  }
  
  return hasSufficientResources(monsterGroup.items, requiredResources);
}

/**
 * Choose which structure type to build based on available resources
 * @param {object} monsterGroup - Monster group data
 * @param {object} personality - Personality data
 * @returns {string} Chosen structure type
 */
function chooseStructureType(monsterGroup, personality) {
  // Default structure types
  const structureTypes = [
    'monster_lair',
    'monster_hive',
    'monster_fortress'
  ];
  
  // Calculate weights based on personality
  const weights = {};
  
  for (const type of structureTypes) {
    weights[type] = 1.0; // Default weight
    
    // Adjust weights based on personality
    if (personality?.id === 'BUILDER') {
      // Builder personality prefers all structures
      weights[type] *= 1.5;
    } else if (personality?.id === 'TERRITORIAL') {
      // Territorial monsters prefer defensive structures
      if (type === 'monster_fortress') weights[type] *= 1.8;
    } else if (personality?.id === 'GREEDY') {
      // Greedy monsters prefer resource-storing structures
      if (type === 'monster_lair') weights[type] *= 1.3;
    } else if (personality?.id === 'AGGRESSIVE') {
      // Aggressive monsters prefer offensive structures
      if (type === 'monster_hive') weights[type] *= 1.4;
    }
    
    // If we don't have resources for this structure, set weight to 0
    if (!hasResourcesToBuild(monsterGroup, type)) {
      weights[type] = 0;
    }
  }
  
  // Find the structure type with the highest weight
  const validTypes = Object.entries(weights)
    .filter(([_, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1]);
  
  if (validTypes.length === 0) {
    return 'monster_lair'; // Default if no valid types
  }
  
  return validTypes[0][0];
}

/**
 * Find the best location for building
 * @param {object} location - Current location
 * @param {object} worldScan - World scan data
 * @param {object} personality - Monster personality
 * @returns {object} Target location for building
 */
function determineBuildLocation(location, worldScan, personality) {
  // Territorial monsters prefer building close to their current position
  if (personality?.id === 'TERRITORIAL') {
    return { x: location.x, y: location.y };
  }
  
  // Other personalities have different preferences
  // Builders might prefer locations near resources
  if (personality?.id === 'BUILDER' && worldScan.resourceHotspots?.length > 0) {
    // Find a resource hotspot that's not too far away
    const nearbyHotspots = worldScan.resourceHotspots.filter(hotspot => {
      const distance = Math.sqrt(
        Math.pow(hotspot.x - location.x, 2) + 
        Math.pow(hotspot.y - location.y, 2)
      );
      return distance < 10;
    });
    
    if (nearbyHotspots.length > 0) {
      const randomSpot = nearbyHotspots[Math.floor(Math.random() * nearbyHotspots.length)];
      return { x: randomSpot.x, y: randomSpot.y };
    }
  }
  
  // Aggressive monsters might prefer locations near player structures
  if (personality?.id === 'AGGRESSIVE' && worldScan.playerSpawns?.length > 0) {
    // Find a player structure that's not too close or too far
    const validSpawns = worldScan.playerSpawns.filter(spawn => {
      const distance = Math.sqrt(
        Math.pow(spawn.x - location.x, 2) + 
        Math.pow(spawn.y - location.y, 2)
      );
      return distance >= 5 && distance <= 15; // Not too close, not too far
    });
    
    if (validSpawns.length > 0) {
      const randomSpawn = validSpawns[Math.floor(Math.random() * validSpawns.length)];
      // Don't build directly on the spawn, but nearby
      const offsetX = Math.floor(Math.random() * 5) - 2;
      const offsetY = Math.floor(Math.random() * 5) - 2;
      return { x: randomSpawn.x + offsetX, y: randomSpawn.y + offsetY };
    }
  }
  
  // Default: build relatively close to current position
  const offsetX = Math.floor(Math.random() * 5) - 2;
  const offsetY = Math.floor(Math.random() * 5) - 2;
  return {
    x: location.x + offsetX,
    y: location.y + offsetY
  };
}

/**
 * Upgrade an existing monster structure
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - Monster group data
 * @param {object} structure - Structure to upgrade
 * @param {object} updates - Database updates object
 * @param {number} now - Current timestamp
 * @returns {object} Action result
 */
export async function upgradeMonsterStructure(db, worldId, monsterGroup, structure, updates, now) {
  // Only upgrade monster structures
  if (!isMonsterStructure(structure)) {
    return { action: null, reason: 'not_monster_structure' };
  }
  
  // Check if the structure can be upgraded
  if (!canStructureBeUpgraded(structure)) {
    return { action: null, reason: 'max_level_reached' };
  }
  
  // Check if monster group has resources to upgrade
  if (!hasResourcesToUpgrade(monsterGroup, structure)) {
    return { action: null, reason: 'insufficient_resources' };
  }
  
  // Get current location info
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = monsterGroup.tileKey;
  
  // Consume resources for upgrade (simplified version)
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}`;
  
  // Generate a simple resource requirement for upgrade
  const requiredResources = [
    { name: 'Wooden Sticks', quantity: 5 * currentLevel },
    { name: 'Stone Pieces', quantity: 3 * currentLevel }
  ];
  
  // Add special resources for higher levels
  if (currentLevel >= 2) {
    requiredResources.push({ name: 'Iron Ore', quantity: currentLevel });
  }
  
  // Create a copy of the monster's items
  const remainingItems = [...(monsterGroup.items || [])];
  let resourcesConsumed = false;
  
  // Consume each required resource
  for (const required of requiredResources) {
    let remainingQuantity = required.quantity;
    
    // Find items that match this resource
    for (let i = 0; i < remainingItems.length; i++) {
      if (remainingItems[i].name === required.name) {
        const available = remainingItems[i].quantity || 1;
        
        if (available <= remainingQuantity) {
          // Use the entire item
          remainingQuantity -= available;
          remainingItems.splice(i, 1);
          i--; // Adjust index after removal
        } else {
          // Use part of the item
          remainingItems[i].quantity -= remainingQuantity;
          remainingQuantity = 0;
        }
        
        if (remainingQuantity === 0) {
          resourcesConsumed = true;
          break;
        }
      }
    }
  }
  
  if (!resourcesConsumed) {
    return { action: null, reason: 'resource_consumption_failed' };
  }
  
  // Update the monster group with the remaining items
  updates[`${groupPath}/items`] = remainingItems;
  
  // Update the structure
  const structurePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`;
  updates[`${structurePath}/level`] = currentLevel + 1;
  updates[`${structurePath}/upgradeTime`] = now;
  
  // Set new features based on level
  let newFeatures = [...(structure.features || [])];
  
  if (currentLevel + 1 === 2) {
    newFeatures.push('improved_defense');
  } else if (currentLevel + 1 === 3) {
    newFeatures.push('monster_recruitment');
  }
  
  updates[`${structurePath}/features`] = newFeatures;
  
  // Add a message about the upgrade
  const chatMessageId = `monster_upgrade_${now}_${monsterGroup.id}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `${monsterGroup.name || "Monsters"} have upgraded their ${structure.name || "structure"} to level ${currentLevel + 1}!`,
    type: 'event',
    timestamp: now,
    location: {
      x: parseInt(tileKey.split(',')[0]),
      y: parseInt(tileKey.split(',')[1])
    }
  };
  
  return {
    action: 'upgrade',
    structureId: structure.id,
    newLevel: currentLevel + 1
  };
}

/**
 * Demobilize at a monster structure to deposit resources
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - Monster group data
 * @param {object} structure - Target structure
 * @param {object} updates - Database updates object
 * @param {number} now - Current timestamp
 * @returns {object} Action result
 */
export async function demobilizeAtMonsterStructure(db, worldId, monsterGroup, structure, updates, now) {
  // Only allow demobilizing at monster structures
  if (!isMonsterStructure(structure)) {
    return { action: null, reason: 'not_monster_structure' };
  }
  
  // Get paths
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = monsterGroup.tileKey;
  const groupPath = createGroupPath(worldId, monsterGroup);
  const structurePath = createStructurePath(worldId, chunkKey, tileKey);
  
  // Check if the monster group has items to deposit
  if (!monsterGroup.items || monsterGroup.items.length === 0) {
    return { action: null, reason: 'no_items_to_deposit' };
  }
  
  // Add the monster group's items to the structure
  const structureItems = [...(structure.items || [])];
  const groupItems = [...monsterGroup.items];
  
  // Combine items, merging similar ones
  for (const item of groupItems) {
    const existingIndex = structureItems.findIndex(i => i.name === item.name && i.type === item.type);
    
    if (existingIndex >= 0) {
      // Add to existing item quantity
      structureItems[existingIndex].quantity = (structureItems[existingIndex].quantity || 1) + 
                                              (item.quantity || 1);
    } else {
      // Add as new item
      structureItems.push({ ...item });
    }
  }
  
  // Update structure with items
  updates[`${structurePath}/items`] = structureItems;
  
  // Set group as demobilizing - this will be processed in the next tick
  updates[`${groupPath}/status`] = 'demobilising';
  updates[`${groupPath}/demobiliseStart`] = now;
  updates[`${groupPath}/targetStructureId`] = structure.id;
  
  // Add a message about the resource deposit
  const chatMessageId = generateMonsterId('monster_demobilize', now);
  const location = { 
    x: parseInt(tileKey.split(',')[0]), 
    y: parseInt(tileKey.split(',')[1]) 
  };
  
  updates[createChatMessagePath(worldId, chatMessageId)] = {
    text: `${monsterGroup.name || "Monster group"} is demobilizing at ${structure.name || 'their structure'} at (${location.x}, ${location.y}).`,
    type: 'event',
    timestamp: now,
    location
  };
  
  return {
    action: 'demobilize',
    depositedItems: groupItems.length,
    structureId: structure.id
  };
}

/**
 * Add or upgrade a building within a monster structure
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - Monster group data
 * @param {object} structure - Parent structure
 * @param {string} buildingType - Type of building to add/upgrade 
 * @param {object} updates - Database updates object
 * @param {number} now - Current timestamp
 * @returns {object} Action result
 */
export async function addOrUpgradeMonsterBuilding(db, worldId, monsterGroup, structure, buildingType, updates, now) {
  // Verify this is a monster structure
  if (!isMonsterStructure(structure)) {
    return { action: null, reason: 'not_monster_structure' };
  }
  
  // Get the building definition
  const buildingDef = BUILDINGS.types[buildingType];
  if (!buildingDef) {
    return { action: null, reason: 'unknown_building_type' };
  }
  
  // Check if the structure already has this building
  const existingBuilding = structure.buildings && structure.buildings[buildingType];
  const currentLevel = existingBuilding ? (existingBuilding.level || 1) : 0;
  const maxLevel = 3; // Max level for monster buildings
  
  // Check if max level reached
  if (currentLevel >= maxLevel) {
    return { action: null, reason: 'max_level_reached' };
  }
  
  // Determine if we're adding new or upgrading
  const isUpgrade = currentLevel > 0;
  
  // Calculate resource requirements
  const levelMultiplier = currentLevel + 1;
  const resources = [];
  
  // Base requirements
  if (buildingDef.baseRequirements) {
    for (const req of buildingDef.baseRequirements) {
      resources.push({
        name: req.name,
        quantity: Math.floor(req.quantity * (isUpgrade ? levelMultiplier * 0.7 : 1))
      });
    }
  } else {
    // Default requirements if none specified
    resources.push({ name: 'Wooden Sticks', quantity: Math.floor(5 * levelMultiplier) });
    resources.push({ name: 'Stone Pieces', quantity: Math.floor(3 * levelMultiplier) });
  }
  
  // Check if monster group has the required resources
  const groupItems = monsterGroup.items || [];
  const availableResources = {};
  
  for (const item of groupItems) {
    availableResources[item.name] = (availableResources[item.name] || 0) + (item.quantity || 1);
  }
  
  for (const required of resources) {
    if (!availableResources[required.name] || availableResources[required.name] < required.quantity) {
      return { action: null, reason: 'insufficient_resources' };
    }
  }
  
  // Consume resources
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = monsterGroup.tileKey;
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}`;
  
  // Create a copy of the monster's items
  const remainingItems = [...groupItems];
  
  // Consume each required resource
  for (const required of resources) {
    let remainingQuantity = required.quantity;
    
    // Find items that match this resource
    for (let i = 0; i < remainingItems.length; i++) {
      if (remainingItems[i].name === required.name) {
        const available = remainingItems[i].quantity || 1;
        
        if (available <= remainingQuantity) {
          // Use the entire item
          remainingQuantity -= available;
          remainingItems.splice(i, 1);
          i--; // Adjust index after removal
        } else {
          // Use part of the item
          remainingItems[i].quantity -= remainingQuantity;
          remainingQuantity = 0;
        }
        
        if (remainingQuantity === 0) break;
      }
    }
  }
  
  // Update the monster group with the remaining items
  updates[`${groupPath}/items`] = remainingItems;
  
  // Create or update the building
  const structurePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`;
  const newLevel = currentLevel + 1;
  
  // Get benefits for this level
  const benefits = BUILDINGS.benefits[buildingType] && BUILDINGS.benefits[buildingType][newLevel] ? 
    BUILDINGS.benefits[buildingType][newLevel] : 
    [{ name: 'Basic Improvement', description: 'Improved functionality' }];
  
  // Create the building object
  const building = {
    type: buildingType,
    name: buildingDef.name,
    level: newLevel,
    icon: buildingDef.icon || "🏠",
    benefits: benefits,
    addedAt: isUpgrade ? (existingBuilding.addedAt || now) : now,
    upgradedAt: isUpgrade ? now : null
  };
  
  // Update the structure with the new/upgraded building
  updates[`${structurePath}/buildings/${buildingType}`] = building;
  
  // Add a message about the building
  const actionText = isUpgrade ? "upgraded" : "added";
  const chatMessageId = `monster_building_${actionText}_${now}_${monsterGroup.id}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `${monsterGroup.name || "Monsters"} have ${actionText} a ${building.name} (level ${newLevel}) in their structure!`,
    type: 'event',
    timestamp: now,
    location: {
      x: parseInt(tileKey.split(',')[0]),
      y: parseInt(tileKey.split(',')[1])
    }
  };
  
  return {
    action: isUpgrade ? 'upgrade_building' : 'add_building',
    buildingType: buildingType,
    level: newLevel,
    structureId: structure.id
  };
}

/**
 * Start building a monster structure at the given location
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {string} monsterId - Monster ID
 * @param {string} structureType - Type of structure to build
 * @param {number} x - X coordinate for building location
 * @param {number} y - Y coordinate for building location
 * @returns {boolean} True if building started successfully
 */
export async function startMonsterBuilding(db, worldId, monsterId, structureType, x, y) {
  const structureDef = STRUCTURES[structureType];
  if (!structureDef) return false;
  
  // Get world's current tick
  const worldRef = db.collection('worlds').doc(worldId);
  const worldDoc = await worldRef.get();
  const worldData = worldDoc.data();
  const currentTick = worldData.info.lastTick;
  
  // Use tick-based building time
  const buildTicks = structureDef.buildTime;
  
  // Create structure record with tick-based timing
  const structureData = {
    id: `monster_structure_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    type: structureType,
    name: `${monsterId.includes('_') ? monsterId.split('_')[0].charAt(0).toUpperCase() + monsterId.split('_')[0].slice(1) : 'Monster'} ${structureDef.name}`,
    owner: 'monster',
    ownerGroupId: monsterId,
    status: 'building',
    builder: monsterId,
    monster: true,
    createdAt: Date.now(),
    buildStartTick: currentTick,
    buildTotalTicks: buildTicks,
    buildCompletionTick: currentTick + buildTicks,
    buildProgress: 0,
    features: structureDef.features || [],
    capacity: structureDef.capacity || 10
  };
  
  // Update monster group to reflect building status
  await db.collection('worlds').doc(worldId).collection('groups').doc(monsterId).update({
    status: 'building',
    buildingType: structureType,
    buildingLocation: { x, y },
    buildingStart: currentTick, // Store tick instead of timestamp
    buildingTime: buildTicks,
    buildingUntil: currentTick + buildTicks // Store completion tick
  });
  
  // Add the structure to the tile
  const chunkX = Math.floor(x / 20);
  const chunkY = Math.floor(y / 20);
  const chunkKey = `${chunkX},${chunkY}`;
  const tileKey = `${x},${y}`;
  
  await db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure`).set(structureData);
  
  return true;
}

// Export all necessary functions
export {
  hasResourcesToBuild,
  hasResourcesToUpgrade
};
