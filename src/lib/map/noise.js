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
}

// Export terrain generation options as a single configuration object
export const TERRAIN_OPTIONS = {
  // Continent generation options
  continent: {
    scale: 0.0008,
    threshold: 0.55,       // Increased threshold to generate more water
    edgeScale: 0.003,
    edgeAmount: 0.25,
    sharpness: 2.7         // Slightly reduced to soften coastlines
  },
  
  // Height map options
  height: {
    scale: 0.01,     // Increased for more local variance
    octaves: 6,
    persistence: 0.5,
    lacunarity: 2.2  // Slightly increased for more variation
  },
  
  // Moisture map options
  moisture: {
    scale: 0.015,    // Increased for more local variance
    octaves: 4,
    persistence: 0.6,
    lacunarity: 2
  },
  
  // Small-scale detail noise options
  detail: {
    scale: 0.08,     // High frequency for small details
    octaves: 2,
    persistence: 0.4,
    lacunarity: 2
  },
  
  // River generation options
  river: {
    scale: 0.005,
    riverDensity: 0.85,    // Increased for many more rivers (was 0.75)
    riverThreshold: 0.68,  // Lowered threshold for easier river formation (was 0.72)
    minContinentValue: 0.28, // Reduced to allow rivers in more coastal areas
    riverWidth: 1.0,       // Increased river width for more visibility (was 0.8)
    noiseFactor: 0.3,      // Slightly reduced for smoother rivers
    branchFactor: 0.8      // Increased to encourage more branching
  },
  
  // Lake generation options
  lake: {
    scale: 0.003,
    lakeThreshold: 0.78,   // Lowered to create more lakes
    minHeight: 0.25,       // Lowered to allow lakes in more areas
    maxHeight: 0.7,        // Maximum height for lakes (avoid mountains)
    minRiverInfluence: 0.3, // Min river value to influence lake formation
    lakeSmoothness: 0.7    // Higher values make lakes more circular
  },
  
  // Constants related to terrain generation
  constants: {
    continentInfluence: 0.75, // Increased to make continental borders more pronounced
    waterLevel: 0.35        // Added explicit water level control
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
  }
  
  // Get terrain data for a specific coordinate
  getTerrainData(x, y) {
    // Get continent value first
    const continent = this.continentNoise.getContinentValue(x, y, TERRAIN_OPTIONS.continent);
    
    // Generate base height influenced by continental structure
    const baseHeight = this.heightNoise.getNoise(x, y, TERRAIN_OPTIONS.height);
    
    // Apply continental influence to height
    let height = baseHeight * (1 - TERRAIN_OPTIONS.constants.continentInfluence) + 
                 continent * TERRAIN_OPTIONS.constants.continentInfluence;
    
    // Add small-scale detail noise
    const detail = this.detailNoise.getNoise(x, y, TERRAIN_OPTIONS.detail) * 0.1;
    height = Math.min(1, Math.max(0, height + detail - 0.05));
    
    // Generate moisture independent of continents
    const moisture = this.moistureNoise.getNoise(x, y, TERRAIN_OPTIONS.moisture);
    
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
    
    // Calculate slope
    const heightNE = this.heightNoise.getNoise(x + 1, y - 1, TERRAIN_OPTIONS.height);
    const heightNW = this.heightNoise.getNoise(x - 1, y - 1, TERRAIN_OPTIONS.height);
    const heightSE = this.heightNoise.getNoise(x + 1, y + 1, TERRAIN_OPTIONS.height);
    const heightSW = this.heightNoise.getNoise(x - 1, y + 1, TERRAIN_OPTIONS.height);
    
    const dx = ((heightNE - heightNW) + (heightSE - heightSW)) / 2;
    const dy = ((heightNW - heightSW) + (heightNE - heightSE)) / 2;
    const slope = Math.sqrt(dx * dx + dy * dy);
    
    // Get biome without color processing
    const biome = this.getBiome(height, moisture, continent, riverValue, lakeValue);
    
    return { height, moisture, continent, slope, biome, color: biome.color, riverValue, lakeValue };
  }
  
  // Determine biome based on terrain characteristics
  getBiome(height, moisture, continentValue = 1.0, riverValue = 0, lakeValue = 0) {
    // Special case for rivers (overrides other biomes when strong enough)
    if (riverValue > 0.4 && continentValue > 0.3) {
      if (height > 0.7) return { name: "mountain_stream", color: "#8fbbde" };
      if (height > 0.5) return { name: "river", color: "#689ad3" };
      return { name: "wide_river", color: "#4a91d6" };
    }
    
    // Special case for smaller streams and tributaries
    if (riverValue > 0.25 && riverValue <= 0.4 && continentValue > 0.3) {
      if (height > 0.6) return { name: "stream", color: "#a3c7e8" };
      return { name: "tributary", color: "#8bb5dd" };
    }
    
    // Ocean biomes - deep ocean is far from continents
    if (continentValue < 0.15) {
      return { name: "abyssal_ocean", color: "#000033" }; 
    }
    
    // Ocean depth based on continental value
    if (continentValue < 0.45) {
      return { name: "deep_ocean", color: "#000080" };
    }
  
    // Water biomes based on height, affected by continent value
    const waterLevel = TERRAIN_OPTIONS.constants.waterLevel - (continentValue * 0.05);
    if (height < waterLevel) {
      if (height < 0.15) return { name: "ocean_trench", color: "#00004d" };
      if (height < 0.25) return { name: "deep_ocean", color: "#000080" };
      return { name: "ocean", color: "#0066cc" };
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
    
    // Mountains and high elevation
    if (height > 0.8) {
      if (moisture > 0.8) return { name: "snow_cap", color: "#ffffff" };
      if (moisture > 0.6) return { name: "alpine", color: "#e0e0e0" };
      if (moisture > 0.3) return { name: "mountain", color: "#7d7d7d" };
      if (moisture > 0.2) return { name: "dry_mountain", color: "#8b6b4c" }; // Fixed value from 2 to 0.2
      return { name: "desert_mountains", color: "#9c6b4f" };
    }
    
    if (height > 0.7) {
      if (moisture > 0.8) return { name: "glacier", color: "#c9eeff" };
      if (moisture > 0.6) return { name: "highland_forest", color: "#1d6d53" };
      if (moisture > 0.4) return { name: "highland", color: "#5d784c" };
      if (moisture > 0.2) return { name: "rocky_highland", color: "#787c60" };
      return { name: "mesa", color: "#9e6b54" };
    }
    
    // Mid-elevation terrain
    if (height > 0.5) {
      if (moisture > 0.8) return { name: "tropical_rainforest", color: "#0e6e1e" };
      if (moisture > 0.6) return { name: "temperate_forest", color: "#147235" };
      if (moisture > 0.4) return { name: "woodland", color: "#448d37" };
      if (moisture > 0.2) return { name: "shrubland", color: "#8d9c4c" };
      return { name: "badlands", color: "#9c7450" };
    }
    
    // Lower elevation terrain
    if (height > 0.4) {
      if (moisture > 0.8) return { name: "swamp", color: "#2f4d2a" };
      if (moisture > 0.6) return { name: "marsh", color: "#3d6d38" };
      if (moisture > 0.4) return { name: "grassland", color: "#68a246" };
      if (moisture > 0.2) return { name: "savanna", color: "#c4b257" };
      return { name: "desert_scrub", color: "#d1ba70" };
    }
    
    // Low lands
    if (moisture > 0.8) return { name: "bog", color: "#4f5d40" };
    if (moisture > 0.6) return { name: "wetland", color: "#517d46" };
    if (moisture > 0.4) return { name: "plains", color: "#7db356" };
    if (moisture > 0.2) return { name: "dry_plains", color: "#c3be6a" };
    return { name: "desert", color: "#e3d59e" };
  }
};
