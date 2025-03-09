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
  
  // Add new mountain biomes
  snow_capped_peaks: {
    name: "snow_capped_peaks",
    displayName: "Snow-Capped Peaks",
    color: "#ffffff",
    category: BIOME_CATEGORIES.MOUNTAINS,
    resources: ["Ice", "Crystal", "Pure Water"],
    description: "The highest mountain peaks, permanently covered in snow"
  },
  jagged_peaks: {
    name: "jagged_peaks",
    displayName: "Jagged Peaks",
    color: "#a8a8a8",
    category: BIOME_CATEGORIES.MOUNTAINS,
    resources: ["Stone", "Rare Minerals", "Crystals"],
    description: "Sharp, rugged mountain peaks with steep cliffs"
  },
  volcanic_mountain: {
    name: "volcanic_mountain",
    displayName: "Volcanic Mountain",
    color: "#5a4a45",
    category: BIOME_CATEGORIES.MOUNTAINS,
    resources: ["Obsidian", "Sulfur", "Volcanic Glass"],
    description: "Mountains formed by volcanic activity, rich in rare minerals"
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
  
  // Add new snow biomes
  tundra: {
    name: "tundra",
    displayName: "Tundra",
    color: "#e0e8eb",
    category: BIOME_CATEGORIES.HIGHLANDS,
    resources: ["Lichens", "Arctic Herbs", "Furs"],
    description: "Cold plains with permafrost and minimal vegetation"
  },
  ice_sheet: {
    name: "ice_sheet",
    displayName: "Ice Sheet",
    color: "#dce9ef",
    category: BIOME_CATEGORIES.HIGHLANDS,
    resources: ["Ice", "Ancient Artifacts", "Frozen Specimens"],
    description: "Vast expanses of permanent ice"
  },
  frozen_forest: {
    name: "frozen_forest",
    displayName: "Frozen Forest",
    color: "#a4c4d4",
    category: BIOME_CATEGORIES.HIGHLANDS,
    resources: ["Frost Wood", "Winter Berries", "Fur"],
    description: "Forest in perpetually frozen conditions"
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
 * Determine biome based on terrain parameters with environment-integrated water features
 * @param {number} height - The height value (0-1)
 * @param {number} moisture - The moisture value (0-1)
 * @param {number} continentValue - The continent value (0-1)
 * @param {number} riverValue - The river value (0-1)
 * @param {number} lakeValue - The lake value (0-1)
 * @returns {object} The biome object
 */
export function determineBiome(height, moisture, continentValue = 1.0, riverValue = 0, lakeValue = 0) {
  // WATER FEATURES WITH BETTER ENVIRONMENTAL INTEGRATION:
  
  // Rivers - size varies by elevation and moisture
  if (riverValue > 0.22) {
    if (height < 0.4) {
      // Major river in lowlands
      return BIOMES.river;
    } else if (height < 0.65) {
      // Mid-elevation river (slightly smaller)
      if (moisture > 0.6) {
        return BIOMES.river; // Still a river in wet areas
      } else {
        return BIOMES.stream; // Stream in drier mid-elevations
      }
    } else {
      // High elevation - always a stream
      return BIOMES.stream;
    }
  }
  
  // Smaller streams with elevation and moisture context
  if (riverValue > 0.17 && riverValue <= 0.22) {
    // In wet areas at high elevations, we get mountain streams
    if (height > 0.6 && moisture > 0.5) {
      return BIOMES.stream;
    }
    // In wet lowlands, small rivers still form
    else if (height < 0.4 && moisture > 0.7) {
      return BIOMES.stream;
    }
    // Otherwise, only moderate threshold streams in mid-elevation wet areas
    else if (moisture > 0.5 && continentValue > 0.4) { // More restrictive (was 0.45 and 0.35)
      return BIOMES.stream;
    }
  }
  
  // Lakes with moisture context
  if (lakeValue > 0.5) {
    return BIOMES.lake;
  }
  
  // DRASTICALLY REDUCED RIVERBANK DETECTION - much more restrictive conditions
  if (riverValue > 0.1 && riverValue <= 0.13) { // Very narrow range (was 0.09-0.16)
    // Riverbanks ONLY in fertile lowland areas - all criteria must be met
    if (height < 0.45 && moisture > 0.6 && continentValue > 0.5) { // All thresholds increased
      return BIOMES.riverbank;
    }
    // OR very close to major rivers with high moisture
    else if (riverValue > 0.12 && moisture > 0.7 && height < 0.4 && continentValue > 0.5) {
      return BIOMES.riverbank;
    }
    // In very wet areas, create wetlands/marshes near water features instead of riverbanks
    else if (moisture > 0.8 && riverValue > 0.11 && height < 0.42) {
      return BIOMES.wetland;
    }
  }
  
  // EXPANDED OCEAN HIERARCHY
  
  // Deep ocean - very far from continents
  if (continentValue < 0.15) { // Increased coverage (was 0.12)
    return BIOMES.abyssal_ocean;
  }
  
  // Deep seas - moderately far from continents
  if (continentValue < 0.40) { // Increased coverage (was 0.35)
    return BIOMES.deep_ocean;
  }

  // Coastal waters - shallow seas near land
  if (height < 0.35 - (continentValue * 0.06)) { // More sea area (was 0.32 and 0.05)
    if (height < 0.15) return BIOMES.ocean_trench; // Slightly increased (was 0.12)
    if (height < 0.25) return BIOMES.deep_ocean; // Slightly increased (was 0.22)
    return BIOMES.ocean;
  }
  
  // Expanded mountain and snow detection with more variety
  if (height > 0.9) {
    // Highest peaks - various types of snow-capped mountains
    if (moisture > 0.7) return BIOMES.snow_capped_peaks;
    if (moisture > 0.4) return BIOMES.snow_cap;
    return BIOMES.jagged_peaks;
  }
  
  if (height > 0.85) {
    // Very high elevation - alpine and volcanic
    if (moisture > 0.7) return BIOMES.alpine;
    if (moisture < 0.3 && Math.random() < 0.3) return BIOMES.volcanic_mountain; // Some randomness for volcanoes
    return BIOMES.mountain;
  }
  
  if (height > 0.75) {
    // High mountains with variation
    if (moisture > 0.8) return BIOMES.glacier;
    if (moisture > 0.6) return BIOMES.alpine;
    if (moisture > 0.4) return BIOMES.mountain;
    if (moisture > 0.2) return BIOMES.dry_mountain;
    return BIOMES.desert_mountains;
  }
  
  // Cold high-elevation regions
  if (height > 0.65 && moisture > 0.7) {
    // Snow and ice biomes at high elevation
    if (moisture > 0.9) return BIOMES.ice_sheet;
    if (moisture > 0.8) return BIOMES.frozen_forest;
    return BIOMES.tundra;
  }
  
  // Regular highland biomes
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
