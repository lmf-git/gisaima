// Implementation of Perlin Noise based on the algorithm by Ken Perlin
// Adapted for terrain generation with height and moisture maps

export class PerlinNoise {
  constructor(seed = Math.random()) {
    this.permutation = new Array(512);
    this.gradP = new Array(512);
    this.grad3 = [
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [1, 0], [-1, 0], [1, 0], [-1, 0],
      [0, 1], [0, -1], [0, 1], [0, -1]
    ];
    
    // Initialize with provided seed
    this.seed(seed);
  }
  
  seed(seed) {
    if(seed > 0 && seed < 1) {
      // Scale the seed out
      seed *= 65536;
    }

    seed = Math.floor(seed);
    if(seed < 256) {
      seed |= seed << 8;
    }

    for(let i = 0; i < 256; i++) {
      let v;
      if (i & 1) {
        v = i ^ (seed & 255);
      } else {
        v = i ^ ((seed>>8) & 255);
      }
      this.permutation[i] = this.permutation[i + 256] = v;
      this.gradP[i] = this.gradP[i + 256] = this.grad3[v % 12];
    }
  }

  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  lerp(a, b, t) {
    return (1 - t) * a + t * b;
  }
  
  dot2(g, x, y) {
    return g[0] * x + g[1] * y;
  }

  perlin2(x, y) {
    // Find unit grid cell containing point
    let X = Math.floor(x) & 255;
    let Y = Math.floor(y) & 255;
    
    // Get relative xy coordinates of point within that cell
    x -= Math.floor(x);
    y -= Math.floor(y);
    
    // Compute fade curves for each coordinate
    let u = this.fade(x);
    let v = this.fade(y);
    
    // Hash coordinates of the 4 square corners
    let A = this.permutation[X] + Y;
    let AA = this.permutation[A];
    let AB = this.permutation[A + 1];
    let B = this.permutation[X + 1] + Y;
    let BA = this.permutation[B];
    let BB = this.permutation[B + 1];
    
    // And add blended results from 4 corners of the square
    return this.lerp(
      this.lerp(
        this.dot2(this.gradP[AA], x, y),
        this.dot2(this.gradP[BA], x - 1, y),
        u
      ),
      this.lerp(
        this.dot2(this.gradP[AB], x, y - 1),
        this.dot2(this.gradP[BB], x - 1, y - 1),
        u
      ),
      v
    );
  }

  // Get noise value at coordinate (normalized between 0-1)
  getNoise(x, y, options = {}) {
    const {
      scale = 0.005,
      octaves = 6,
      persistence = 0.5,
      lacunarity = 2,
      amplitude = 1,
      frequency = 1
    } = options;
    
    let value = 0;
    let maxValue = 0;
    let amp = amplitude;
    let freq = frequency;
    
    // Sum multiple octaves of noise
    for(let i = 0; i < octaves; i++) {
      value += amp * (this.perlin2(x * freq * scale, y * freq * scale) * 0.5 + 0.5);
      maxValue += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    
    // Normalize
    return value / maxValue;
  }

  // Add a method for continent mask generation
  getContinentValue(x, y, options = {}) {
    const {
      scale = 0.001, // Much larger scale for continents
      threshold = 0.5, // Threshold for land vs ocean
      edgeScale = 0.003, // Scale for edge noise
      edgeAmount = 0.2, // How much edge noise affects the continents
      sharpness = 2.5 // Higher values make continent edges sharper
    } = options;
    
    // Base continental noise - large, smooth shapes
    let baseNoise = this.getNoise(x, y, {
      scale,
      octaves: 2,
      persistence: 0.5,
      lacunarity: 2
    });
    
    // Edge noise for coastline details
    let edgeNoise = this.getNoise(x + 1000, y + 1000, {
      scale: edgeScale,
      octaves: 3,
      persistence: 0.6
    });
    
    // Apply edge noise to base continents
    let combinedValue = baseNoise + (edgeNoise * edgeAmount) - edgeAmount/2;
    
    // Apply sharpness to create more defined continent edges
    return 1 / (1 + Math.exp(-sharpness * (combinedValue - threshold)));
  }
  
  // Add method to detect river paths based on height map
  getRiverValue(x, y, options = {}, heightMap = null) {
    const {
      scale = 0.005,
      riverDensity = 0.5,   // Higher values = more rivers
      riverThreshold = 0.75, // Threshold for river formation
      minContinentValue = 0.4, // Minimum continent value for rivers
      riverWidth = 0.6,     // Base river width factor
      noiseFactor = 0.3,    // How much additional noise affects rivers
      branchFactor = 0.7    // How likely rivers are to branch
    } = options;
    
    // If no height map function provided, return 0 (no river)
    if (!heightMap) return 0;
    
    // Generate a noise value specifically for river networks
    // Use different offsets to make it independent of height/moisture
    const baseRiverNoise = this.getNoise(x + 5000, y + 5000, {
      scale,
      octaves: 4,
      persistence: 0.5,
      lacunarity: 2
    });
    
    // Check if river density threshold is met
    if (baseRiverNoise < 1 - riverDensity) return 0;
    
    // Calculate river channel pattern
    const riverPattern = this.getNoise(x * 3 + 7000, y * 3 + 7000, {
      scale: scale * 3,
      octaves: 2,
      persistence: 0.5
    });
    
    // Calculate meandering factor based on height and position
    const meander = this.getNoise(x * 0.5 + 9000, y * 0.5 + 9000, {
      scale: scale * 0.5,
      octaves: 2
    });
    
    // Get height and gradient at this position
    const heightValue = heightMap(x, y);
    const heightUphill = heightMap(x, y - 1);
    const heightDownhill = heightMap(x, y + 1);
    
    // Rivers are more likely in valleys (where current height is lower than surroundings)
    const valleyFactor = Math.max(0, (heightUphill + heightDownhill) / 2 - heightValue);
    
    // Combine factors to determine river strength
    let riverValue = 
      (baseRiverNoise > riverThreshold ? 1 : 0) * // River network threshold
      (1 + valleyFactor * 5) * // Valley bonus
      (riverPattern * noiseFactor + (1 - noiseFactor)); // Apply noise variation
      
    // Calculate final river value (0 = no river, higher values = wider river)
    if (riverValue > 0.1) {
      return Math.min(1, riverValue * riverWidth);
    }
    
    return 0;
  }
  
  // Add method to detect lakes based on height map and river network
  getLakeValue(x, y, options = {}, heightMap = null, riverMap = null) {
    const {
      scale = 0.003,
      lakeThreshold = 0.82,  // Threshold for lake formation
      minHeight = 0.3,       // Minimum height for lakes (avoid ocean)
      maxHeight = 0.6,       // Maximum height for lakes (avoid mountains)
      minRiverInfluence = 0.3, // Minimum river value for lake formation
      lakeSmoothness = 0.7   // Higher values make lakes more circular
    } = options;
    
    // If no height map function provided, return 0 (no lake)
    if (!heightMap) return 0;
    
    // Lakes form in depressions
    const localHeight = heightMap(x, y);
    
    // No lakes in water or mountains
    if (localHeight < minHeight || localHeight > maxHeight) return 0;
    
    // Generate specific noise for lake distribution
    const lakeNoise = this.getNoise(x + 3000, y + 3000, {
      scale,
      octaves: 2,
      persistence: 0.5
    });
    
    // Generate smoother noise for lake shapes
    const lakeShape = this.getNoise(x + 4000, y + 4000, {
      scale: scale * 2,
      octaves: 1,
      persistence: 0.3
    });
    
    // Lakes are more common in flat areas
    const heightNorth = heightMap(x, y - 1);
    const heightSouth = heightMap(x, y + 1);
    const heightEast = heightMap(x + 1, y);
    const heightWest = heightMap(x - 1, y);
    
    // Calculate average slope around the point
    const slopes = [
      Math.abs(heightNorth - localHeight),
      Math.abs(heightSouth - localHeight),
      Math.abs(heightEast - localHeight),
      Math.abs(heightWest - localHeight)
    ];
    
    const averageSlope = slopes.reduce((sum, s) => sum + s, 0) / slopes.length;
    const flatnessFactor = 1 - (averageSlope * 10); // Higher for flat areas
    
    // Check for depression (lower than surroundings)
    const isDepression = localHeight < Math.min(heightNorth, heightSouth, heightEast, heightWest);
    
    // Lakes are more likely near rivers
    const riverInfluence = riverMap ? riverMap(x, y) : 0;
    
    // Combine factors to determine lake likelihood
    const lakeValue = 
      (lakeShape * lakeSmoothness + (1 - lakeSmoothness)) * // Shape factor
      (isDepression ? 1.5 : 0.5) * // Depression bonus
      (flatnessFactor > 0 ? flatnessFactor : 0) * // Flatness bonus
      (riverInfluence > minRiverInfluence ? 1.2 : 0.8) * // River proximity bonus
      lakeNoise; // Base distribution
    
    // Return lake intensity if above threshold
    return lakeValue > lakeThreshold ? Math.min(1, (lakeValue - lakeThreshold) * 5) : 0;
  }
  
  // Add method to detect volcanic activity based on height and other factors
  getLavaValue(x, y, options = {}, heightMap = null) {
    const {
      scale = 0.004,
      lavaThreshold = 0.92,  // High threshold ensures rarity
      minHeight = 0.7,      // Only appear in high elevations
      lavaConcentration = 0.6 // How concentrated lava pools are
    } = options;
    
    // If no height map function provided, return 0 (no lava)
    if (!heightMap) return 0;
    
    // Only generate lava in high terrain
    const localHeight = heightMap(x, y);
    if (localHeight < minHeight) return 0;
    
    // Generate specific noise for volcanic distribution
    const baseVolcanicNoise = this.getNoise(x * 2 + 7000, y * 2 + 7000, {
      scale,
      octaves: 3,
      persistence: 0.7,
      lacunarity: 2.2
    });
    
    // More detailed noise for lava flow patterns
    const lavaPatternNoise = this.getNoise(x * 4 + 8000, y * 4 + 8000, {
      scale: scale * 3,
      octaves: 2,
      persistence: 0.5
    });
    
    // Calculate if this should be volcanic
    if (baseVolcanicNoise > lavaThreshold) {
      // Determine intensity based on pattern noise
      const lavaIntensity = Math.pow(lavaPatternNoise, lavaConcentration);
      return Math.min(1, lavaIntensity * 2);
    }
    
    return 0;
  }
}

// Export terrain generation options as a single configuration object
export const TERRAIN_OPTIONS = {
  // Continent generation options
  continent: {
    scale: 0.0008,
    threshold: 0.6,       // Increased from 0.55 to reduce ocean size
    edgeScale: 0.003,
    edgeAmount: 0.25,
    sharpness: 2.7        
  },
  
  // Height map options - create more middle-range elevations with less variation
  height: {
    scale: 0.01,    
    octaves: 4,          // Reduced from 5 for more uniform terrain
    persistence: 0.45,   // Reduced from 0.5 for smoother, flatter terrain
    lacunarity: 1.8      // Reduced from 2.0 for less extreme height changes
  },
  
  // Moisture map options - slightly less dry in mid-elevations
  moisture: {
    scale: 0.016,
    octaves: 3,          // Reduced from 4 for larger cohesive dry regions
    persistence: 0.38,   // Increased from 0.35 for slightly less extreme dryness
    lacunarity: 2.5      // Reduced from 2.7 for smoother transitions
  },
  
  // Small-scale detail noise - enhance peaks and valleys
  detail: {
    scale: 0.1,          // Increased from 0.09 for more detailed terrain
    octaves: 3,
    persistence: 0.6,    // Increased from 0.5 for stronger terrain features
    lacunarity: 2.4      // Increased from 2.2 for sharper terrain details
  },
  
  // River generation options
  river: {
    scale: 0.005,
    riverDensity: 0.95,    // Increased from 0.85 for many more rivers
    riverThreshold: 0.58,  // Lowered from 0.68 for easier river formation
    minContinentValue: 0.25, // Lowered to allow rivers closer to coast
    riverWidth: 1.2,       // Increased from 1.0 for wider rivers
    noiseFactor: 0.25,     // Slightly reduced for smoother rivers
    branchFactor: 0.9      // Increased to encourage more branching
  },
  
  // Lake generation options
  lake: {
    scale: 0.003,
    lakeThreshold: 0.78,
    minHeight: 0.25,
    maxHeight: 0.7,
    minRiverInfluence: 0.3,
    lakeSmoothness: 0.7
  },
  
  // Add volcanic/lava options
  lava: {
    scale: 0.004,
    lavaThreshold: 0.92,
    minHeight: 0.7,
    lavaConcentration: 0.6
  },
  
  // Constants related to terrain generation
  constants: {
    continentInfluence: 0.8,    // Increased from 0.75 for much flatter terrain
    waterLevel: 0.32,      // Lowered from 0.35 to reduce ocean coverage
    heightBias: 0.08            // Reduced from 0.12 for less overall elevation
  }
};

// TerrainGenerator class to handle all terrain generation
export class TerrainGenerator {
  constructor(worldSeed = 12345) {
    this.WORLD_SEED = worldSeed;
    
    // Create separate noise instances for each terrain aspect
    this.continentNoise = new PerlinNoise(this.WORLD_SEED);
    this.heightNoise = new PerlinNoise(this.WORLD_SEED + 10000);
    this.moistureNoise = new PerlinNoise(this.WORLD_SEED + 20000);
    this.detailNoise = new PerlinNoise(this.WORLD_SEED + 30000);
    this.riverNoise = new PerlinNoise(this.WORLD_SEED + 40000);
    this.lakeNoise = new PerlinNoise(this.WORLD_SEED + 50000);
    this.lavaNoise = new PerlinNoise(this.WORLD_SEED + 60000);  // New noise generator for lava
  }
  
  // Get terrain data for a specific coordinate
  getTerrainData(x, y) {
    // Get continent value first
    const continent = this.continentNoise.getContinentValue(x, y, TERRAIN_OPTIONS.continent);
    
    // Generate base height influenced by continental structure
    const baseHeight = this.heightNoise.getNoise(x, y, TERRAIN_OPTIONS.height);
    
    // Apply continental influence to height with bias toward higher elevations
    let height = baseHeight * (1 - TERRAIN_OPTIONS.constants.continentInfluence) + 
                 continent * TERRAIN_OPTIONS.constants.continentInfluence;
    
    // Apply height bias to shift distribution upward with even less extreme values
    height = Math.min(1, height + TERRAIN_OPTIONS.constants.heightBias);
    
    // Apply a more aggressive bell curve transformation to concentrate heights in lower-mid range
    // This will push more terrain toward the middle-low values rather than extremes
    height = Math.pow(Math.sin((height * Math.PI) - (Math.PI/2)) * 0.5 + 0.5, 1.2);
    
    // Reduce detail noise influence
    const detail = this.detailNoise.getNoise(x, y, TERRAIN_OPTIONS.detail) * 0.1; // Reduced from 0.15
    height = Math.min(1, Math.max(0, height + detail - 0.05));
    
    // Generate moisture independent of continents
    let moisture = this.moistureNoise.getNoise(x, y, TERRAIN_OPTIONS.moisture);
    
    // Apply stronger non-linear transformation to moisture to create more extreme desert areas
    moisture = Math.pow(moisture, 1.7);  // Increased from 1.5 for even more desert
    
    // Create height map function
    const heightMap = (tx, ty) => {
      const tContinent = this.continentNoise.getContinentValue(tx, ty, TERRAIN_OPTIONS.continent);
      const tBaseHeight = this.heightNoise.getNoise(tx, ty, TERRAIN_OPTIONS.height);
      return tBaseHeight * (1 - TERRAIN_OPTIONS.constants.continentInfluence) + 
             tContinent * TERRAIN_OPTIONS.constants.continentInfluence;
    };
    
    // Generate river value
    const riverValue = this.riverNoise.getRiverValue(x, y, TERRAIN_OPTIONS.river, heightMap);
    
    // Create river map function
    const riverMap = (tx, ty) => this.riverNoise.getRiverValue(tx, ty, TERRAIN_OPTIONS.river, heightMap);
    
    // Generate lake value
    const lakeValue = this.lakeNoise.getLakeValue(x, y, TERRAIN_OPTIONS.lake, heightMap, riverMap);
    
    // Generate lava/volcanic value
    // FIX: Use the lavaNoise instance instead of calling method directly on this
    const lavaValue = this.lavaNoise.getLavaValue(x, y, TERRAIN_OPTIONS.lava, heightMap);
    
    // Calculate slope
    const heightNE = this.heightNoise.getNoise(x + 1, y - 1, TERRAIN_OPTIONS.height);
    const heightNW = this.heightNoise.getNoise(x - 1, y - 1, TERRAIN_OPTIONS.height);
    const heightSE = this.heightNoise.getNoise(x + 1, y + 1, TERRAIN_OPTIONS.height);
    const heightSW = this.heightNoise.getNoise(x - 1, y + 1, TERRAIN_OPTIONS.height);
    
    const dx = ((heightNE - heightNW) + (heightSE - heightSW)) / 2;
    const dy = ((heightNW - heightSW) + (heightNE - heightSE)) / 2;
    const slope = Math.sqrt(dx * dx + dy * dy);
    
    // Get biome with updated parameters including lava
    const biome = this.getBiome(height, moisture, continent, riverValue, lakeValue, lavaValue);
    
    return { 
      height, moisture, continent, slope, biome, 
      color: biome.color, riverValue, lakeValue, lavaValue 
    };
  }
  
  // Determine biome based on terrain characteristics
  getBiome(height, moisture, continentValue = 1.0, riverValue = 0, lakeValue = 0, lavaValue = 0) {
    // Volcanic biomes take highest precedence
    if (lavaValue > 0) {
      if (lavaValue > 0.8) return { name: "active_volcano", color: "var(--color-biome-active-volcano)" };
      if (lavaValue > 0.6) return { name: "lava_flow", color: "var(--color-biome-lava-flow)" };
      if (lavaValue > 0.4) return { name: "volcanic_rock", color: "var(--color-biome-volcanic-rock)" };
      return { name: "volcanic_soil", color: "var(--color-biome-volcanic-soil)" };
    }

    // Special case for rivers (overrides other biomes when strong enough)
    if (riverValue > 0.35 && continentValue > 0.3) {
      if (height > 0.75) return { name: "mountain_stream", color: "var(--color-biome-mountain-stream)" };
      if (height > 0.6) return { name: "rocky_river", color: "var(--color-biome-rocky-river)" };
      if (height > 0.5) return { name: "river", color: "var(--color-biome-river)" };
      return { name: "wide_river", color: "var(--color-biome-wide-river)" };
    }
    
    // Make smaller streams more common
    if (riverValue > 0.2 && riverValue <= 0.35 && continentValue > 0.3) {
      if (height > 0.7) return { name: "highland_stream", color: "var(--color-biome-highland-stream)" };
      if (height > 0.6) return { name: "stream", color: "var(--color-biome-stream)" };
      return { name: "tributary", color: "var(--color-biome-tributary)" };
    }
    
    // Add even smaller streams/creeks for more water variety
    if (riverValue > 0.15 && riverValue <= 0.2 && continentValue > 0.3) {
      return { name: "creek", color: "var(--color-biome-creek)" };
    }
    
    // Ocean biomes - deep ocean is far from continents
    if (continentValue < 0.12) {
      return { name: "abyssal_ocean", color: "var(--color-biome-abyssal-ocean)" }; 
    }
    
    // Ocean depth based on continental value
    if (continentValue < 0.42) {
      return { name: "deep_ocean", color: "var(--color-biome-deep-ocean)" };
    }
  
    // Water biomes based on height, affected by continent value
    const waterLevel = TERRAIN_OPTIONS.constants.waterLevel - (continentValue * 0.05);
    if (height < waterLevel) {
      if (height < 0.15) return { name: "ocean_trench", color: "var(--color-biome-ocean-trench)" };
      if (height < 0.25) return { name: "deep_ocean", color: "var(--color-biome-deep-ocean)" };
      return { name: "ocean", color: "var(--color-biome-ocean)" };
    }
    
    // River influence zones (marshy areas near rivers)
    if (riverValue > 0.2 && riverValue <= 0.6) {
      if (height < 0.4) return { name: "riverbank", color: "#82a67d" };
      if (moisture > 0.7) return { name: "riverine_forest", color: "#2e593f" };
      return { name: "flood_plain", color: "#789f6a" };
    }
    
    // Lake influence zones (shoreline)
    if (lakeValue > 0.2 && lakeValue <= 0.5) {
      if (moisture > 0.6) return { name: "wetland", color: "#517d46" };
      return { name: "lakeshore", color: "#6a9b5e" };
    }
    
    // Normal biomes when no water features are present
    // Coastal and beach areas
    if (height < 0.35) {
      if (moisture < 0.3) return { name: "sandy_beach", color: "#f5e6c9" };
      if (moisture < 0.6) return { name: "pebble_beach", color: "#d9c8a5" };
      return { name: "rocky_shore", color: "#9e9e83" };
    }
    
    // Mountains and high elevation - make even rarer
    if (height > 0.92) {          // Increased from 0.88 for far fewer mountains
      if (moisture > 0.8) return { name: "snow_cap", color: "var(--color-biome-snow-cap)" };     // Increased from 0.75
      if (moisture > 0.65) return { name: "alpine", color: "var(--color-biome-alpine)" };        // Increased from 0.6
      if (moisture > 0.5) return { name: "mountain", color: "var(--color-biome-mountain)" };      // Increased from 0.45
      if (moisture > 0.35) return { name: "dry_mountain", color: "var(--color-biome-dry-mountain)" }; // Increased from 0.3
      return { name: "desert_mountains", color: "var(--color-biome-desert-mountains)" };
    }
    
    if (height > 0.78) {         // Increased from 0.75 for far fewer highlands
      if (moisture > 0.8) return { name: "glacier", color: "var(--color-biome-glacier)" };      // Increased from 0.75
      if (moisture > 0.65) return { name: "highland_forest", color: "var(--color-biome-highland-forest)" }; // Increased from 0.6
      if (moisture > 0.5) return { name: "highland", color: "var(--color-biome-highland)" };     // Increased from 0.45
      if (moisture > 0.35) return { name: "rocky_highland", color: "var(--color-biome-rocky-highland)" }; // Increased from 0.3
      return { name: "mesa", color: "var(--color-biome-mesa)" };
    }
    
    // More balanced mid-elevation terrain with reduced badlands
    if (height > 0.5) {
      if (moisture > 0.75) return { name: "tropical_rainforest", color: "var(--color-biome-tropical-rainforest)" }; // Further reduced
      if (moisture > 0.62) return { name: "temperate_forest", color: "var(--color-biome-temperate-forest)" }; // Further reduced
      if (moisture > 0.48) return { name: "woodland", color: "var(--color-biome-woodland)" }; // Further reduced
      if (moisture > 0.35) return { name: "shrubland", color: "var(--color-biome-shrubland)" }; // Further reduced
      if (moisture > 0.22) return { name: "dry_shrubland", color: "#a8a76c" }; // Keep as is
      if (moisture > 0.12) return { name: "scrubland", color: "#b9a77c" }; // NEW biome between dry shrubland and badlands
      return { name: "badlands", color: "var(--color-biome-badlands)" }; // Now requires truly dry conditions
    }
    
    // Expand lower elevation terrain - more variety and coverage
    if (height > 0.34) {        // Slightly reduced from 0.35 for even more mid-to-low terrain
      if (moisture > 0.75) return { name: "swamp", color: "var(--color-biome-swamp)" };
      if (moisture > 0.60) return { name: "marsh", color: "var(--color-biome-marsh)" };
      if (moisture > 0.45) return { name: "grassland", color: "var(--color-biome-grassland)" };
      if (moisture > 0.32) return { name: "savanna", color: "var(--color-biome-savanna)" };
      if (moisture > 0.20) return { name: "desert_scrub", color: "var(--color-biome-desert-scrub)" };
      if (moisture > 0.12) return { name: "rocky_desert", color: "#bfa678" };
      return { name: "stony_desert", color: "#c79b68" }; // NEW biome for very dry low-mid terrain
    }
    
    // Low lands - expand desert types even more
    if (moisture > 0.75) return { name: "bog", color: "var(--color-biome-bog)" };
    if (moisture > 0.60) return { name: "wetland", color: "var(--color-biome-wetland)" };
    if (moisture > 0.45) return { name: "plains", color: "var(--color-biome-plains)" };
    if (moisture > 0.30) return { name: "dry_plains", color: "var(--color-biome-dry-plains)" };
    if (moisture > 0.18) return { name: "sandy_desert", color: "#e8dec6" };
    if (moisture > 0.08) return { name: "desert", color: "var(--color-biome-desert)" };
    return { name: "barren_desert", color: "#eeddbb" }; // NEW biome for extremely dry terrain
  }
};

// Add the getLavaValue method to the PerlinNoise prototype if not already there
if (!PerlinNoise.prototype.getLavaValue) {
  // This ensures we don't overwrite it if it exists
  PerlinNoise.prototype.getLavaValue = function(x, y, options = {}, heightMap = null) {
    const {
      scale = 0.004,
      lavaThreshold = 0.92,
      minHeight = 0.7,
      lavaConcentration = 0.6
    } = options;
    
    if (!heightMap) return 0;
    
    const localHeight = heightMap(x, y);
    if (localHeight < minHeight) return 0;
    
    const baseVolcanicNoise = this.getNoise(x * 2 + 7000, y * 2 + 7000, {
      scale,
      octaves: 3,
      persistence: 0.7,
      lacunarity: 2.2
    });
    
    const lavaPatternNoise = this.getNoise(x * 4 + 8000, y * 4 + 8000, {
      scale: scale * 3,
      octaves: 2,
      persistence: 0.5
    });
    
    if (baseVolcanicNoise > lavaThreshold) {
      const lavaIntensity = Math.pow(lavaPatternNoise, lavaConcentration);
      return Math.min(1, lavaIntensity * 2);
    }
    
    return 0;
  };
}
