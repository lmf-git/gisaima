// Implementation of Perlin Noise based on the algorithm by Ken Perlin
// Adapted for terrain generation with height and moisture maps

export class PerlinNoise {
  constructor(seed) {
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
  
  // Completely redesigned river system for better interconnected networks
  getRiverValue(x, y, options = {}, heightMap = null) {
    const {
      scale = 0.004,
      riverDensity = 1.4,     // Increased for more coverage
      riverThreshold = 0.45,  // Lowered significantly for more river formation
      minContinentValue = 0.2, // Lowered to allow rivers closer to coasts
      riverWidth = 1.1,       // Increased for more prominent rivers
      noiseFactor = 0.4,      // Increased for more variance
      flowDirectionality = 0.8, // Increased to make rivers follow terrain more strictly
      arterialRiverFactor = 0.6 // How much to emphasize major river "arteries"
    } = options;
    
    // If no height map function provided, return 0 (no river)
    if (!heightMap) return 0;
    
    // Generate a base river network using multiple noise layers
    const baseRiverNoise = this.getNoise(x + 5000, y + 5000, {
      scale,
      octaves: 4,
      persistence: 0.6, // Increased for more variation
      lacunarity: 2.2
    });
    
    // Generate a separate noise for arterial rivers (major waterways)
    const arterialNoise = this.getNoise(x * 0.5 + 8000, y * 0.5 + 8000, {
      scale: scale * 0.4, // Much larger scale for bigger patterns
      octaves: 2,
      persistence: 0.7,
      lacunarity: 1.6
    });
    
    // Get height at this position
    const heightValue = heightMap(x, y);
    
    // Sample points in all 8 directions to get accurate flow
    const heightN = heightMap(x, y - 1);
    const heightS = heightMap(x, y + 1);
    const heightE = heightMap(x + 1, y);
    const heightW = heightMap(x - 1, y);
    const heightNE = heightMap(x + 1, y - 1);
    const heightNW = heightMap(x - 1, y - 1);
    const heightSE = heightMap(x + 1, y + 1);
    const heightSW = heightMap(x - 1, y + 1);
    
    // Find lowest neighboring point (water flows downhill)
    const neighbors = [
      { dx: 0, dy: -1, h: heightN },
      { dx: 0, dy: 1, h: heightS },
      { dx: 1, dy: 0, h: heightE },
      { dx: -1, dy: 0, h: heightW },
      { dx: 1, dy: -1, h: heightNE },
      { dx: -1, dy: -1, h: heightNW },
      { dx: 1, dy: 1, h: heightSE },
      { dx: -1, dy: 1, h: heightSW }
    ];
    
    // Sort neighbors by height (ascending)
    neighbors.sort((a, b) => a.h - b.h);
    
    // Get the lowest neighboring point
    const lowestNeighbor = neighbors[0];
    
    // Calculate how much lower the lowest point is
    const heightDrop = heightValue - lowestNeighbor.h;
    
    // Check if this is a "flow point" where water would naturally flow
    const isFlowPoint = heightDrop > 0.01; // Minimum height drop for flow
    
    // Calculate how much this point "attracts" water flow
    const flowAttraction = isFlowPoint ? Math.min(1.0, heightDrop * 10) : 0;
    
    // Check if this location is part of an "arterial" river pattern
    // These are major river highways that flow through continents
    const isArterial = arterialNoise > (1 - arterialRiverFactor);
    const arterialBonus = isArterial ? arterialRiverFactor * 1.8 : 0;
    
    // Calculate valley factor - river is stronger in valleys
    const avgSurroundingHeight = neighbors.reduce((sum, n) => sum + n.h, 0) / 8;
    const valleyFactor = Math.max(0, avgSurroundingHeight - heightValue) * 3;
    
    // Calculate effective river threshold based on height and flow
    // Rivers are more likely at lower elevations and where water flows
    const effectiveThreshold = riverThreshold * 
      (1 - (flowAttraction * flowDirectionality * 0.4)) * // Lower threshold where flow is strong
      (1 - (arterialBonus * 0.5)) * // Lower threshold on arterial paths
      (1 + (heightValue * 0.5)); // Higher threshold at higher elevations
    
    // Calculate flow direction consistency
    // Check if this point continues a flow from a higher neighbor
    let flowContinuity = 0;
    const highNeighbors = neighbors.filter(n => n.h > heightValue);
    if (highNeighbors.length > 0) {
      // At least one higher neighbor - check if we're continuing a flow
      flowContinuity = 0.3;
    }
    
    // Check if we're close to water level for delta formation
    const waterLevel = options.waterLevel || 0.35;
    const isNearWaterLevel = heightValue < waterLevel + 0.12 && heightValue > waterLevel - 0.05;
    const deltaBonus = isNearWaterLevel ? 0.4 : 0;
    
    // Rivers are more likely at lower elevations
    const elevationFactor = 1 - Math.min(1, heightValue * 0.8);
    
    // Combined river presence calculation
    const riverPresence = 
      baseRiverNoise > effectiveThreshold || // Base river pattern
      (isArterial && baseRiverNoise > effectiveThreshold * 0.8) || // Arterial rivers are more permissive
      (isNearWaterLevel && baseRiverNoise > effectiveThreshold * 0.9); // Near water level = river deltas
    
    if (!riverPresence) return 0;
    
    // Calculate final river value for rendering
    let riverValue = 
      (1 + valleyFactor) * // Valley bonus
      (1 + flowAttraction * flowDirectionality) * // Flow direction bonus
      (1 + arterialBonus) * // Arterial river bonus
      (1 + deltaBonus) * // Delta bonus
      (1 + flowContinuity) * // Flow continuity bonus
      (1 + elevationFactor * 0.5); // Elevation factor
    
    // Scale river width based on elevation and arterial status
    const baseWidth = isArterial ? riverWidth * 1.5 : riverWidth;
    const widthByElevation = baseWidth * (1 + (1 - heightValue) * 0.8);
    
    // Rivers are wider at lower elevations
    return Math.min(1, riverValue * widthByElevation * 0.35);
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
  // Continent generation options - adjusted for 10000x10000 scale
  continent: {
    scale: 0.00025, // Reduced to create larger landmasses on 10000x10000 grid
    threshold: 0.55, // Adjusted for more land area
    edgeScale: 0.0015, // Finer edge detail
    edgeAmount: 0.35, // Increased for more varied coastlines
    sharpness: 2.0 // Reduced for more gradual continent edges
  },
  
  // Height map options - for more diverse elevations
  height: {
    scale: 0.008, // Slightly finer detail
    octaves: 5, // One more octave for more varied terrain
    persistence: 0.5,
    lacunarity: 2.0
  },
  
  // Moisture map options
  moisture: {
    scale: 0.012, // Reduced for larger moisture regions
    octaves: 4,
    persistence: 0.4,
    lacunarity: 2.2
  },
  
  // Small-scale detail noise
  detail: {
    scale: 0.08, // Slightly reduced for smoother variations
    octaves: 3,
    persistence: 0.5,
    lacunarity: 2.2
  },
  
  // Completely revised river generation options for better networks
  river: {
    scale: 0.0035, // Slightly reduced scale for more coherent patterns
    riverDensity: 1.5,  // Significantly increased for more river coverage
    riverThreshold: 0.42, // Substantially lowered threshold for more rivers
    minContinentValue: 0.2, // Allow rivers closer to coasts
    riverWidth: 1.3, // Wider rivers for better visibility
    noiseFactor: 0.4, // More natural variance
    flowDirectionality: 0.85, // Much higher - rivers follow terrain more strictly
    arterialRiverFactor: 0.7, // Control how pronounced major river "highways" are
    waterLevel: 0.35 // Reference water level for delta formation
  },
  
  // Lake generation options - slightly reduced frequency
  lake: {
    scale: 0.002, // Reduced for larger lakes on big scale
    lakeThreshold: 0.8,
    minHeight: 0.3,
    maxHeight: 0.7,
    minRiverInfluence: 0.3,
    lakeSmoothness: 0.7
  },
  
  // Volcanic/lava options - made rarer
  lava: {
    scale: 0.003,
    lavaThreshold: 0.94, // Increased for rarity
    minHeight: 0.75, // Higher elevation requirement
    lavaConcentration: 0.65
  },
  
  // Constants related to terrain generation
  constants: {
    continentInfluence: 0.75, // Slightly reduced for more height variation
    waterLevel: 0.35, // Slightly increased for more ocean coverage
    heightBias: 0.07, // Reduced for lower average elevation
    riverErosionFactor: 0.4 // New setting to control how much rivers carve terrain
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
    this.lavaNoise = new PerlinNoise(this.WORLD_SEED + 60000);
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
    
    // Generate river value with enhanced network connectivity
    const riverValue = this.riverNoise.getRiverValue(x, y, TERRAIN_OPTIONS.river, heightMap);
    
    // Create river map function
    const riverMap = (tx, ty) => this.riverNoise.getRiverValue(tx, ty, TERRAIN_OPTIONS.river, heightMap);
    
    // Generate lake value
    const lakeValue = this.lakeNoise.getLakeValue(x, y, TERRAIN_OPTIONS.lake, heightMap, riverMap);
    
    // Generate lava/volcanic value
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
  
  // Simplified getBiome method with fewer water types for better clarity
  getBiome(height, moisture, continentValue = 1.0, riverValue = 0, lakeValue = 0, lavaValue = 0) {
    // Volcanic biomes take highest precedence
    if (lavaValue > 0) {
      if (lavaValue > 0.8) return { name: "active_volcano", color: "var(--color-biome-active-volcano)" };
      if (lavaValue > 0.6) return { name: "lava_flow", color: "var(--color-biome-lava-flow)" };
      if (lavaValue > 0.4) return { name: "volcanic_rock", color: "var(--color-biome-volcanic-rock)" };
      return { name: "volcanic_soil", color: "var(--color-biome-volcanic-soil)" };
    }

    // SIMPLIFIED RIVER SYSTEM: just main rivers and small streams
    if (riverValue > 0.4 && continentValue > 0.2) {
      // Main rivers - wider, navigable waterways
      if (height > 0.7) return { name: "mountain_river", color: "var(--color-biome-mountain-stream)" };
      return { name: "river", color: "var(--color-biome-river)" };
    }
    
    if (riverValue > 0.15 && continentValue > 0.2) {
      // Smaller streams - still part of the network
      return { name: "stream", color: "var(--color-biome-stream)" };
    }
    
    // OCEAN DEPTH TRANSITIONS
    if (continentValue < 0.15) {
      return { name: "deep_ocean", color: "var(--color-biome-deep-ocean)" };
    }
    
    if (continentValue < 0.38) {
      return { name: "ocean", color: "var(--color-biome-ocean)" };
    }
    
    // Water biomes based on height
    const waterLevel = TERRAIN_OPTIONS.constants.waterLevel;
    
    // Coastal waters - simplified to just one type
    if (height < waterLevel) {
      return { name: "shallows", color: "#5d99b8" };
    }
    
    // Coastal and beach areas
    if (height < waterLevel + 0.05) {
      if (moisture < 0.5) return { name: "sandy_beach", color: "#f5e6c9" };
      return { name: "rocky_shore", color: "#9e9e83" };
    }
    
    // Rest of the biomes remain unchanged
    // ...existing mountain, highland, mid-elevation terrain, etc...
    if (height > 0.92) {
      if (moisture > 0.8) return { name: "snow_cap", color: "var(--color-biome-snow-cap)" };
      if (moisture > 0.65) return { name: "alpine", color: "var(--color-biome-alpine)" };
      if (moisture > 0.5) return { name: "mountain", color: "var(--color-biome-mountain)" };
      if (moisture > 0.35) return { name: "dry_mountain", color: "var(--color-biome-dry-mountain)" };
      return { name: "desert_mountains", color: "var(--color-biome-desert-mountains)" };
    }
    
    // ...rest of existing biomes...
  }
}
