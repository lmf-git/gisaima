/**
 * Standardized biome configuration for the game map
 * Contains data on all biome types including colors, resources, and characteristics
 */

// Define biome categories for better organization
export const BIOME_CATEGORIES = {
  WATER_DEEP: 'water_deep',
  WATER_SHALLOW: 'water_shallow',
  WATER_FRESH: 'water_fresh',
  COASTAL: 'coastal',
  LOWLANDS: 'lowlands',
  MIDLANDS: 'midlands',
  HIGHLANDS: 'highlands',
  MOUNTAINS: 'mountains'
};

// Master biomes configuration
export const BIOMES = {
  // Deep water biomes
  abyssal_ocean: {
    name: "abyssal_ocean",
    displayName: "Abyssal Ocean",
    color: "#000033",
    category: BIOME_CATEGORIES.WATER_DEEP,
    resources: ["Deep Sea Fish", "Rare Minerals"],
    description: "The deepest parts of the ocean, shrouded in darkness"
  },
  ocean_trench: {
    name: "ocean_trench",
    displayName: "Ocean Trench",
    color: "#00004d",
    category: BIOME_CATEGORIES.WATER_DEEP,
    resources: ["Rare Minerals", "Deep Sea Creatures"],
    description: "Deep underwater canyons"
  },
  deep_ocean: {
    name: "deep_ocean",
    displayName: "Deep Ocean",
    color: "#000080",
    category: BIOME_CATEGORIES.WATER_DEEP,
    resources: ["Fish", "Salt"],
    description: "Deep waters far from land"
  },
  
  // Shallow water biomes
  ocean: {
    name: "ocean",
    displayName: "Ocean",
    color: "#0066cc",
    category: BIOME_CATEGORIES.WATER_SHALLOW,
    resources: ["Fish", "Salt", "Seaweed"],
    description: "Open waters"
  },
  
  // Fresh water biomes
  river: {
    name: "river",
    displayName: "River",
    color: "#4a91d6",
    category: BIOME_CATEGORIES.WATER_FRESH,
    resources: ["Fresh Water", "Clay", "River Fish"],
    description: "Flowing water cutting through the landscape"
  },
  stream: {
    name: "stream",
    displayName: "Stream",
    color: "#a3c7e8",
    category: BIOME_CATEGORIES.WATER_FRESH,
    resources: ["Fresh Water", "Small Fish", "Pebbles"],
    description: "Small flowing water"
  },
  lake: {
    name: "lake",
    displayName: "Lake",
    color: "#4a91d6",
    category: BIOME_CATEGORIES.WATER_FRESH,
    resources: ["Fresh Water", "Lake Fish", "Clay"],
    description: "A body of still fresh water"
  },
  
  // River-related biomes
  riverbank: {
    name: "riverbank",
    displayName: "Riverbank",
    color: "#82a67d",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Fertile Soil", "Clay", "Reeds"],
    description: "Land adjacent to a river"
  },
  riverine_forest: {
    name: "riverine_forest",
    displayName: "Riverine Forest",
    color: "#2e593f",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Hardwood", "Medicinal Plants", "Game"],
    description: "Forest growing along a river"
  },
  flood_plain: {
    name: "flood_plain",
    displayName: "Flood Plain",
    color: "#789f6a",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Fertile Soil", "Rice", "Flax"],
    description: "Flat land near rivers that periodically floods"
  },
  lakeshore: {
    name: "lakeshore",
    displayName: "Lakeshore",
    color: "#6a9b5e",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Clay", "Reeds", "Waterfowl"],
    description: "Land surrounding a lake"
  },
  
  // Coastal biomes
  sandy_beach: {
    name: "sandy_beach",
    displayName: "Sandy Beach",
    color: "#f5e6c9",
    category: BIOME_CATEGORIES.COASTAL,
    resources: ["Sand", "Shells", "Coconuts"],
    description: "Sandy shoreline"
  },
  pebble_beach: {
    name: "pebble_beach",
    displayName: "Pebble Beach",
    color: "#d9c8a5",
    category: BIOME_CATEGORIES.COASTAL,
    resources: ["Stones", "Clay"],
    description: "Shore covered in small stones"
  },
  rocky_shore: {
    name: "rocky_shore",
    displayName: "Rocky Shore",
    color: "#9e9e83",
    category: BIOME_CATEGORIES.COASTAL,
    resources: ["Rocks", "Shellfish"],
    description: "Rough, rocky coastline"
  },
  
  // Mountain biomes
  snow_cap: {
    name: "snow_cap",
    displayName: "Snow Cap",
    color: "#ffffff",
    category: BIOME_CATEGORIES.MOUNTAINS,
    resources: ["Snow", "Crystal"],
    description: "Snow-covered mountain peaks"
  },
  alpine: {
    name: "alpine",
    displayName: "Alpine",
    color: "#e0e0e0",
    category: BIOME_CATEGORIES.MOUNTAINS,
    resources: ["Ice", "Rare Herbs"],
    description: "High mountain terrain above the tree line"
  },
  mountain: {
    name: "mountain",
    displayName: "Mountain",
    color: "#7d7d7d",
    category: BIOME_CATEGORIES.MOUNTAINS,
    resources: ["Stone", "Iron", "Gems"],
    description: "Elevated rocky terrain"
  },
  dry_mountain: {
    name: "dry_mountain",
    displayName: "Dry Mountain",
    color: "#8b6b4c",
    category: BIOME_CATEGORIES.MOUNTAINS,
    resources: ["Stone", "Copper", "Gold"],
    description: "Arid mountain landscape"
  },
  desert_mountains: {
    name: "desert_mountains",
    displayName: "Desert Mountains",
    color: "#9c6b4f",
    category: BIOME_CATEGORIES.MOUNTAINS,
    resources: ["Stone", "Gold", "Minerals"],
    description: "Mountains in desert regions"
  },
  
  // Highland biomes
  glacier: {
    name: "glacier",
    displayName: "Glacier",
    color: "#c9eeff",
    category: BIOME_CATEGORIES.HIGHLANDS,
    resources: ["Ice", "Pure Water"],
    description: "Large body of slow-moving ice"
  },
  highland_forest: {
    name: "highland_forest",
    displayName: "Highland Forest",
    color: "#1d6d53",
    category: BIOME_CATEGORIES.HIGHLANDS,
    resources: ["Wood", "Game", "Herbs"],
    description: "Forest at high elevation"
  },
  highland: {
    name: "highland",
    displayName: "Highland",
    color: "#5d784c",
    category: BIOME_CATEGORIES.HIGHLANDS,
    resources: ["Stone", "Berries", "Game"],
    description: "High elevation terrain"
  },
  rocky_highland: {
    name: "rocky_highland",
    displayName: "Rocky Highland",
    color: "#787c60",
    category: BIOME_CATEGORIES.HIGHLANDS,
    resources: ["Stone", "Ore"],
    description: "Rocky terrain at high elevation"
  },
  mesa: {
    name: "mesa",
    displayName: "Mesa",
    color: "#9e6b54",
    category: BIOME_CATEGORIES.HIGHLANDS,
    resources: ["Red Clay", "Minerals"],
    description: "Elevated area with a flat top and steep sides"
  },
  
  // Mid-elevation terrain
  tropical_rainforest: {
    name: "tropical_rainforest",
    displayName: "Tropical Rainforest",
    color: "#0e6e1e",
    category: BIOME_CATEGORIES.MIDLANDS,
    resources: ["Exotic Wood", "Fruits", "Medicinal Plants"],
    description: "Dense, moist forest in tropical regions"
  },
  temperate_forest: {
    name: "temperate_forest",
    displayName: "Temperate Forest",
    color: "#147235",
    category: BIOME_CATEGORIES.MIDLANDS,
    resources: ["Wood", "Game", "Berries"],
    description: "Forest in temperate climate zones"
  },
  woodland: {
    name: "woodland",
    displayName: "Woodland",
    color: "#448d37",
    category: BIOME_CATEGORIES.MIDLANDS,
    resources: ["Wood", "Game"],
    description: "Land covered with trees"
  },
  shrubland: {
    name: "shrubland",
    displayName: "Shrubland",
    color: "#8d9c4c",
    category: BIOME_CATEGORIES.MIDLANDS,
    resources: ["Herbs", "Berries", "Small Game"],
    description: "Land covered with shrubs"
  },
  badlands: {
    name: "badlands",
    displayName: "Badlands",
    color: "#9c7450",
    category: BIOME_CATEGORIES.MIDLANDS,
    resources: ["Clay", "Minerals"],
    description: "Dry terrain with soft sedimentary rocks and clay-rich soils"
  },
  
  // Lower elevation terrain
  swamp: {
    name: "swamp",
    displayName: "Swamp",
    color: "#2f4d2a",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Reed", "Herbs", "Mushrooms"],
    description: "Forested wetland"
  },
  marsh: {
    name: "marsh",
    displayName: "Marsh",
    color: "#3d6d38",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Reed", "Clay", "Herbs"],
    description: "Wetland dominated by herbaceous plants"
  },
  grassland: {
    name: "grassland",
    displayName: "Grassland",
    color: "#68a246",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Hay", "Game", "Herbs"],
    description: "Land covered with grass"
  },
  savanna: {
    name: "savanna",
    displayName: "Savanna",
    color: "#c4b257",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Fibers", "Game"],
    description: "Grassy plains with scattered trees"
  },
  desert_scrub: {
    name: "desert_scrub",
    displayName: "Desert Scrub",
    color: "#d1ba70",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Cactus", "Minerals"],
    description: "Arid land with sparse vegetation"
  },
  
  // Low land biomes
  bog: {
    name: "bog",
    displayName: "Bog",
    color: "#4f5d40",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Peat", "Special Plants"],
    description: "Wet, spongy ground with decaying vegetation"
  },
  wetland: {
    name: "wetland",
    displayName: "Wetland",
    color: "#517d46",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Reed", "Herbs", "Fish"],
    description: "Land saturated with water"
  },
  plains: {
    name: "plains",
    displayName: "Plains",
    color: "#7db356",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Crops", "Game"],
    description: "Flat terrain with grasses"
  },
  dry_plains: {
    name: "dry_plains",
    displayName: "Dry Plains",
    color: "#c3be6a",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Grains", "Game"],
    description: "Flat terrain with sparse vegetation"
  },
  desert: {
    name: "desert",
    displayName: "Desert",
    color: "#e3d59e",
    category: BIOME_CATEGORIES.LOWLANDS,
    resources: ["Sand", "Rare Herbs"],
    description: "Dry, barren area with little vegetation"
  },
  
  // Fallback biome
  unknown: {
    name: "unknown",
    displayName: "Unknown",
    color: "#808080",
    category: "unknown",
    resources: ["Unknown"],
    description: "Unexplored territory"
  }
};

/**
 * Get biome by name
 * @param {string} biomeName - The name of the biome
 * @returns {object} The biome object
 */
export function getBiomeByName(biomeName) {
  return BIOMES[biomeName] || BIOMES.unknown;
}

/**
 * Get biome resources
 * @param {string} biomeName - The name of the biome
 * @returns {string[]} Array of resource strings
 */
export function getBiomeResources(biomeName) {
  const biome = getBiomeByName(biomeName);
  return biome.resources;
}

/**
 * Determine biome based on terrain parameters
 * @param {number} height - The height value (0-1)
 * @param {number} moisture - The moisture value (0-1)
 * @param {number} continentValue - The continent value (0-1)
 * @param {number} riverValue - The river value (0-1)
 * @param {number} lakeValue - The lake value (0-1)
 * @returns {object} The biome object
 */
export function determineBiome(height, moisture, continentValue = 1.0, riverValue = 0, lakeValue = 0) {
  // Higher thresholds for rivers
  if (riverValue > 0.22 && continentValue > 0.3) {
    if (height > 0.6) return BIOMES.stream;
    return BIOMES.river;
  }
  
  // Lakes with much higher threshold
  if (lakeValue > 0.6) {
    return BIOMES.lake;
  }
  
  // Ocean biomes - less ocean coverage
  if (continentValue < 0.12) {
    return BIOMES.abyssal_ocean;
  }
  
  // Reduced ocean coverage
  if (continentValue < 0.42) {
    return BIOMES.deep_ocean;
  }

  // Water biomes based on height
  if (height < 0.30 - (continentValue * 0.05)) {
    if (height < 0.12) return BIOMES.ocean_trench;
    if (height < 0.22) return BIOMES.deep_ocean;
    return BIOMES.ocean;
  }
  
  // Reduce riverbank areas even further
  if (riverValue > 0.15 && riverValue <= 0.22 && continentValue > 0.35) {
    return BIOMES.riverbank;
  }
  
  // Reduce lake influence zones dramatically
  if (lakeValue > 0.45 && lakeValue <= 0.6) {
    return BIOMES.lakeshore;
  }
  
  // Coastal and beach areas
  if (height < 0.35) {
    if (moisture < 0.3) return BIOMES.sandy_beach;
    if (moisture < 0.6) return BIOMES.pebble_beach;
    return BIOMES.rocky_shore;
  }
  
  // Mountains and high elevation
  if (height > 0.8) {
    if (moisture > 0.8) return BIOMES.snow_cap;
    if (moisture > 0.6) return BIOMES.alpine;
    if (moisture > 0.3) return BIOMES.mountain;
    if (moisture > 0.2) return BIOMES.dry_mountain;
    return BIOMES.desert_mountains;
  }
  
  if (height > 0.7) {
    if (moisture > 0.8) return BIOMES.glacier;
    if (moisture > 0.6) return BIOMES.highland_forest;
    if (moisture > 0.4) return BIOMES.highland;
    if (moisture > 0.2) return BIOMES.rocky_highland;
    return BIOMES.mesa;
  }
  
  // Mid-elevation terrain
  if (height > 0.5) {
    if (moisture > 0.8) return BIOMES.tropical_rainforest;
    if (moisture > 0.6) return BIOMES.temperate_forest;
    if (moisture > 0.4) return BIOMES.woodland;
    if (moisture > 0.2) return BIOMES.shrubland;
    return BIOMES.badlands;
  }
  
  // Lower elevation terrain
  if (height > 0.4) {
    if (moisture > 0.8) return BIOMES.swamp;
    if (moisture > 0.6) return BIOMES.marsh;
    if (moisture > 0.4) return BIOMES.grassland;
    if (moisture > 0.2) return BIOMES.savanna;
    return BIOMES.desert_scrub;
  }
  
  // Low lands
  if (moisture > 0.8) return BIOMES.bog;
  if (moisture > 0.6) return BIOMES.wetland;
  if (moisture > 0.4) return BIOMES.plains;
  if (moisture > 0.2) return BIOMES.dry_plains;
  return BIOMES.desert;
}
