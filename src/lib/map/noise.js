// Implementation of Simplex Noise - more efficient than Perlin or Worley
// Adapted for terrain generation with height and moisture maps

export class SimplexNoise {
  constructor(seed) {
    this.seed = seed || Math.random();
    
    // Initialize permutation table with seed
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    
    // Define gradient vectors inline instead of static property to avoid issues
    this.grad3 = [
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [1, 0], [-1, 0], [0, 1], [0, -1]
    ];
    
    const p = new Uint8Array(256);
    
    // Fill p with values from 0 to 255
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    
    // Shuffle array based on seed
    let n = 256;
    let q;
    
    const rand = this.createRNG(this.seed);
    
    while (n > 1) {
      n--;
      q = Math.floor(rand() * (n + 1));
      [p[n], p[q]] = [p[q], p[n]]; // Swap elements
    }
    
    // Copy to perm and permMod12
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }
  
  // Create a seeded random number generator
  createRNG(seed) {
    const mask = 0xffffffff;
    let m_z = Math.floor(seed * 362436069) & mask;
    let m_w = Math.floor(seed * 521288629) & mask;
    
    return function() {
      m_z = (36969 * (m_z & 65535) + (m_z >>> 16)) & mask;
      m_w = (18000 * (m_w & 65535) + (m_w >>> 16)) & mask;
      
      let result = ((m_z << 16) + m_w) & mask;
      result /= 4294967296;
      return result + 0.5;
    };
  }
  
  // Constants for 2D simplex noise
  F2 = 0.5 * (Math.sqrt(3) - 1);
  G2 = (3 - Math.sqrt(3)) / 6;
  
  // 2D simplex noise
  noise2D(x, y) {
    // Skew input space to determine simplex cell
    const s = (x + y) * this.F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    
    // Unskew back to get simplex cell origin
    const t = (i + j) * this.G2;
    const X0 = i - t;
    const Y0 = j - t;
    
    // Calculate relative x,y coords within cell
    const x0 = x - X0;
    const y0 = y - Y0;
    
    // Determine which simplex we're in
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    
    // Calculate coords of other two corners
    const x1 = x0 - i1 + this.G2;
    const y1 = y0 - j1 + this.G2;
    const x2 = x0 - 1 + 2 * this.G2;
    const y2 = y0 - 1 + 2 * this.G2;
    
    // Calculate contribution from three corners
    let n0 = 0, n1 = 0, n2 = 0;
    
    // For first corner
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      // Fix potential out of bounds issue with perm and grad lookup
      const gi0 = this.permMod12[(i & 255) + this.perm[(j & 255)]] % 8;
      t0 *= t0;
      // Ensure gi0 is in grad3 range
      n0 = t0 * t0 * this.dot(this.grad3[gi0], x0, y0);
    }
    
    // For second corner
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      // Fix potential out of bounds issue with perm and grad lookup
      const gi1 = this.permMod12[((i + i1) & 255) + this.perm[((j + j1) & 255)]] % 8;
      t1 *= t1;
      // Ensure gi1 is in grad3 range
      n1 = t1 * t1 * this.dot(this.grad3[gi1], x1, y1);
    }
    
    // For third corner
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      // Fix potential out of bounds issue with perm and grad lookup
      const gi2 = this.permMod12[((i + 1) & 255) + this.perm[((j + 1) & 255)]] % 8;
      t2 *= t2;
      // Ensure gi2 is in grad3 range
      n2 = t2 * t2 * this.dot(this.grad3[gi2], x2, y2);
    }
    
    // Add contributions, scaled to return value in the range [-1,1]
    return 70.0 * (n0 + n1 + n2);
  }
  
  // Dot product helper function with safety check
  dot(g, x, y) {
    // Add safety check for undefined gradient
    if (!g) return 0;
    return g[0] * x + g[1] * y;
  }
  
  // Enhanced fBM implementation for better terrain variation
  getFBM(x, y, options = {}) {
    const {
      scale = 0.005,
      octaves = 6,
      persistence = 0.5,
      lacunarity = 2,
      amplitude = 1,
      frequency = 1,
      ridged = false  // Parameter to enable ridged noise for river channels
    } = options;
    
    let value = 0;
    let maxValue = 0;
    let amp = amplitude;
    let freq = frequency;
    
    // Sum multiple octaves of noise using Fractal Brownian Motion
    for(let i = 0; i < octaves; i++) {
      // Get raw noise value
      const noiseVal = this.noise2D(x * freq * scale, y * freq * scale);
      
      // Apply ridge function for sharper terrain features
      let octaveValue;
      if (ridged) {
        // Ridge noise: 1 - |noise|, creating sharp ridges at the zero crossings
        octaveValue = 1.0 - Math.abs(noiseVal);
        // Square the result for sharper ridges
        octaveValue *= octaveValue;
      } else {
        // Regular noise: normalize from [-1,1] to [0,1]
        octaveValue = (noiseVal * 0.5) + 0.5;
      }
      
      value += amp * octaveValue;
      maxValue += amp;
      
      amp *= persistence;
      freq *= lacunarity;
    }
    
    // Normalize
    return value / maxValue;
  }
  
  // Update getNoise to use the new fBM implementation
  getNoise(x, y, options = {}) {
    // Use the new fBM function for all noise generation
    return this.getFBM(x, y, options);
  }

  // Completely redesigned river system using ridge noise for better channels
  getRiverValue(x, y, options = {}, heightMap = null) {
    if (!heightMap) return 0;

    const {
      scale = 0.003,
      riverDensity = 1.3,
      riverThreshold = 0.5,
      minContinentValue = 0.2,
      riverWidth = 1.1,
      flowDirectionality = 0.8,
      arterialRiverFactor = 0.6,
      waterLevel = 0.32,
      ridgeSharpness = 2.0  // Controls how sharp river valleys are
    } = options;
    
    // Get height at this position
    const heightValue = heightMap(x, y);
    
    // Early exit for high terrain to save computation
    if (heightValue > 0.85) return 0;
    
    // Generate ridge noise specifically for river channels
    // Ridge noise creates sharp valleys where rivers can form
    const riverRidgeNoise = this.getFBM(x + 5000, y + 5000, {
      scale,
      octaves: 3,
      persistence: 0.5,
      lacunarity: 2.2,
      ridged: true  // Enable ridge noise
    });
    
    // Generate flow direction field using gradient of height map
    const heightN = heightMap(x, y - 1);
    const heightS = heightMap(x, y + 1);
    const heightE = heightMap(x + 1, y);
    const heightW = heightMap(x - 1, y);
    
    // Calculate gradient vector (points from high to low)
    const gradX = (heightW - heightE) * 0.5;
    const gradY = (heightN - heightS) * 0.5;
    
    // Magnitude of gradient (steepness)
    const gradMag = Math.sqrt(gradX * gradX + gradY * gradY);
    
    // Flow factor - higher when on steep slopes
    const flowFactor = Math.min(1.0, gradMag * 10);
    
    // Only continue if we have sufficient ridge or flow
    if (riverRidgeNoise < 0.3 && flowFactor < 0.2) return 0;
    
    // Generate arterial rivers - major channels that traverse the map
    const arterialNoise = this.getFBM(x * 0.4 + 8000, y * 0.4 + 8000, {
      scale: scale * 0.4,
      octaves: 2,
      persistence: 0.6,
      lacunarity: 1.6
    });
    
    // Use height difference to detect natural channels
    const lowestNeighbor = Math.min(heightN, heightS, heightE, heightW);
    const heightDrop = heightValue - lowestNeighbor;
    
    // Combine ridge noise with height drop for better flow
    let riverValue = (1.0 - riverRidgeNoise) * ridgeSharpness; // Higher in valleys
    
    // Add flow contribution - rivers flow downhill
    riverValue += heightDrop * flowDirectionality * 2;
    
    // Add arterial river bonus
    const isArterial = arterialNoise > (1 - arterialRiverFactor);
    if (isArterial) {
      riverValue += arterialRiverFactor;
    }
    
    // Apply density scaling - higher density means more rivers
    riverValue *= riverDensity;
    
    // Apply threshold to determine if this is a river cell
    if (riverValue > riverThreshold) {
      // Scale width by steepness and position - rivers widen downstream
      const widthModifier = (1.0 - heightValue) * 0.5 + 0.5;
      const effectiveWidth = riverWidth * widthModifier * (isArterial ? 1.5 : 1.0);
      
      return Math.min(1.0, (riverValue - riverThreshold) * effectiveWidth);
    }
    
    return 0;
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
      // Simplex noise returns results in [-1, 1], so we normalize to [0, 1]
      value += amp * ((this.noise2D(x * freq * scale, y * freq * scale) * 0.5) + 0.5);
      maxValue += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    
    // Normalize
    return value / maxValue;
  }
  
  // Generate continent mask
  getContinentValue(x, y, options = {}) {
    const {
      scale = 0.001,
      threshold = 0.48,
      edgeScale = 0.003,
      edgeAmount = 0.25,
      sharpness = 1.8
    } = options;
    
    // Base continental shape using simplex noise
    let baseNoise = this.getNoise(x, y, {
      scale,
      octaves: 3,
      persistence: 0.5,
      lacunarity: 2.0
    });
    
    // Create edge detail using different noise settings
    let edgeNoise = this.getNoise(x + 1000, y + 1000, {
      scale: edgeScale,
      octaves: 2,
      persistence: 0.6,
      lacunarity: 2.0
    });
    
    // Apply edge noise to base continents
    let combinedValue = baseNoise + (edgeNoise * edgeAmount) - edgeAmount/2;
    
    // Apply sharpness to create more defined continent edges
    return 1 / (1 + Math.exp(-sharpness * (combinedValue - threshold)));
  }

  // Performance optimized river generation
  getRiverValue(x, y, options = {}, heightMap = null) {
    if (!heightMap) return 0;

    const {
      scale = 0.003,
      riverDensity = 1.3,
      riverThreshold = 0.5,
      minContinentValue = 0.2,
      riverWidth = 1.1,
      flowDirectionality = 0.8,
      arterialRiverFactor = 0.6,
      waterLevel = 0.32
    } = options;
    
    // Get height at this position
    const heightValue = heightMap(x, y);
    
    // Early exit for high terrain
    if (heightValue > 0.85) return 0;
    
    // Generate base river network with fewer octaves for performance
    const baseRiverNoise = this.getNoise(x + 5000, y + 5000, {
      scale,
      octaves: 2,
      persistence: 0.5,
      lacunarity: 2.2
    });
    
    // Check against threshold early
    if (baseRiverNoise < riverThreshold) return 0;
    
    // Only calculate arterial noise for potential rivers
    const arterialNoise = this.getNoise(x * 0.4 + 8000, y * 0.4 + 8000, {
      scale: scale * 0.4,
      octaves: 1, // Reduced octaves
      persistence: 0.6,
      lacunarity: 1.6
    });
    
    // Simple flow calculation (only sample 4 neighbors instead of 8)
    const heightN = heightMap(x, y - 1);
    const heightS = heightMap(x, y + 1);
    const heightE = heightMap(x + 1, y);
    const heightW = heightMap(x - 1, y);
    
    // Find lowest neighboring point
    const lowestHeight = Math.min(heightN, heightS, heightE, heightW);
    const heightDrop = heightValue - lowestHeight;
    
    // Check if this is a flow point
    const isFlowPoint = heightDrop > 0.01;
    const flowAttraction = isFlowPoint ? Math.min(1.0, heightDrop * 10) : 0;
    
    // Check for arterial rivers (major waterways)
    const isArterial = arterialNoise > (1 - arterialRiverFactor);
    const arterialBonus = isArterial ? arterialRiverFactor : 0;
    
    // Fast delta detection
    const isNearWaterLevel = heightValue < waterLevel + 0.1 && heightValue > waterLevel - 0.05;
    const deltaBonus = isNearWaterLevel ? 0.3 : 0;
    
    // Simplified river value calculation
    const riverValue = baseRiverNoise * 
      (1 + flowAttraction * flowDirectionality * 0.5) *
      (1 + arterialBonus * 0.8) *
      (1 + deltaBonus);
    
    // Threshold and scale for final river value
    if (riverValue > riverThreshold) {
      const width = (isArterial ? riverWidth * 1.3 : riverWidth) * 
                     (1 + (1 - heightValue) * 0.7);
      
      return Math.min(1, (riverValue - riverThreshold) * width * 1.2);
    }
    
    return 0;
  }
  
  // Optimized lake detection
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
  
  // Optimized lava detection
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

// Export terrain generation options optimized for Simplex noise
export const TERRAIN_OPTIONS = {
  // Continent generation options
  continent: {
    scale: 0.0006, // Adjusted for Simplex noise
    threshold: 0.45,
    edgeScale: 0.002,
    edgeAmount: 0.3,
    sharpness: 1.7
  },
  
  // Height map options
  height: {
    scale: 0.004,
    octaves: 4,
    persistence: 0.55,
    lacunarity: 2.0
  },
  
  // Moisture map options
  moisture: {
    scale: 0.006,
    octaves: 3,
    persistence: 0.5,
    lacunarity: 2.0
  },
  
  // Detail noise - fewer octaves for performance
  detail: {
    scale: 0.04,
    octaves: 2,
    persistence: 0.5,
    lacunarity: 2.0
  },
  
  // River generation options - updated for ridge noise
  river: {
    scale: 0.0025,          // Slightly smaller scale for more defined rivers
    riverDensity: 1.4,      // Higher density for more rivers
    riverThreshold: 0.45,   // Lower threshold to create more rivers
    minContinentValue: 0.2,
    riverWidth: 1.2,        // Wider rivers for better visibility
    flowDirectionality: 0.85,
    arterialRiverFactor: 0.7,
    waterLevel: 0.32,
    ridgeSharpness: 2.2     // New parameter for ridge noise sharpness
  },
  
  // Lake and lava options with performance adjustments
  lake: {
    scale: 0.0015,
    lakeThreshold: 0.85,
    minHeight: 0.35,
    maxHeight: 0.65,
    minRiverInfluence: 0.25,
    lakeSmoothness: 0.7
  },
  
  lava: {
    scale: 0.002,
    lavaThreshold: 0.92,
    minHeight: 0.75,
    lavaConcentration: 0.7
  },
  
  // Constants adjusted for Simplex noise
  constants: {
    continentInfluence: 0.85,
    waterLevel: 0.32,
    heightBias: 0.08,
    riverErosionFactor: 0.35
  }
};

// TerrainGenerator class - updated to use SimplexNoise
export class TerrainGenerator {
  constructor(worldSeed = 12345) {
    this.WORLD_SEED = worldSeed;
    
    // Create separate noise instances for each terrain aspect
    this.continentNoise = new SimplexNoise(this.WORLD_SEED);
    this.heightNoise = new SimplexNoise(this.WORLD_SEED + 10000);
    this.moistureNoise = new SimplexNoise(this.WORLD_SEED + 20000);
    this.detailNoise = new SimplexNoise(this.WORLD_SEED + 30000);
    this.riverNoise = new SimplexNoise(this.WORLD_SEED + 40000);
    this.lakeNoise = new SimplexNoise(this.WORLD_SEED + 50000);
    this.lavaNoise = new SimplexNoise(this.WORLD_SEED + 60000);
    
    // Cache with reduced size as requested
    this.heightCache = new Map();
    this.maxCacheSize = 1500; // Reduced from 5000 to 1500 as requested
  }
  
  // Get terrain data with fixed caching mechanism
  getTerrainData(x, y) {
    // Cache key for this position
    const key = `${x},${y}`;
    
    // Check if we've already calculated this position
    const cached = this.heightCache.get(key);
    if (cached) return cached;
    
    // Get continent value first
    const continent = this.continentNoise.getContinentValue(x, y, TERRAIN_OPTIONS.continent);
    
    // Create separate heightMap function to avoid circular dependencies in caching
    const heightMap = (tx, ty) => {
      const tContinent = this.continentNoise.getContinentValue(tx, ty, TERRAIN_OPTIONS.continent);
      const tBaseHeight = this.heightNoise.getNoise(tx, ty, TERRAIN_OPTIONS.height);
      return Math.min(1, Math.max(0, 
        tBaseHeight * (1 - TERRAIN_OPTIONS.constants.continentInfluence) + 
        tContinent * TERRAIN_OPTIONS.constants.continentInfluence +
        TERRAIN_OPTIONS.constants.heightBias
      ));
    };
    
    // Generate base height influenced by continental structure
    const baseHeight = this.heightNoise.getNoise(x, y, TERRAIN_OPTIONS.height);
    
    // Apply continental influence to height with bias toward higher elevations
    let height = baseHeight * (1 - TERRAIN_OPTIONS.constants.continentInfluence) + 
                 continent * TERRAIN_OPTIONS.constants.continentInfluence;
    
    // Apply height bias
    height = Math.min(1, height + TERRAIN_OPTIONS.constants.heightBias);
    
    // Simplified height curve
    height = Math.pow(height, 1.2);
    
    // Add detail with less processing
    const detail = this.detailNoise.getNoise(x, y, TERRAIN_OPTIONS.detail) * 0.08;
    height = Math.min(1, Math.max(0, height + detail - 0.04));
    
    // Generate moisture with fewer octaves
    let moisture = this.moistureNoise.getNoise(x, y, TERRAIN_OPTIONS.moisture);
    moisture = Math.pow(moisture, 1.5);
    
    // Generate river value
    const riverValue = this.riverNoise.getRiverValue(x, y, TERRAIN_OPTIONS.river, heightMap);
    
    // Create river map function
    const riverMap = (tx, ty) => this.riverNoise.getRiverValue(tx, ty, TERRAIN_OPTIONS.river, heightMap);
    
    // Generate lake and lava values
    const lakeValue = this.lakeNoise.getLakeValue(x, y, TERRAIN_OPTIONS.lake, heightMap, riverMap);
    const lavaValue = this.lavaNoise.getLavaValue(x, y, TERRAIN_OPTIONS.lava, heightMap);
    
    // Calculate slope with fewer samples
    const heightE = heightMap(x + 1, y);
    const heightW = heightMap(x - 1, y);
    const heightN = heightMap(x, y - 1);
    const heightS = heightMap(x, y + 1);
    
    const dx = heightE - heightW;
    const dy = heightN - heightS;
    const slope = Math.sqrt(dx * dx + dy * dy) * 0.5;
    
    // Get biome
    const biome = this.getBiome(height, moisture, continent, riverValue, lakeValue, lavaValue);
    
    // Create result
    const result = { 
      height, moisture, continent, slope, biome, 
      color: biome.color, riverValue, lakeValue, lavaValue 
    };
    
    // Store in cache with improved management
    this.heightCache.set(key, result);
    
    // Clear cache if it gets too large
    if (this.heightCache.size > this.maxCacheSize) {
      const keysToDelete = Array.from(this.heightCache.keys()).slice(0, this.heightCache.size - this.maxCacheSize / 2);
      keysToDelete.forEach(k => this.heightCache.delete(k));
    }
    
    return result;
  }
  
  // Simplified getBiome method remains the same
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
    
    // OCEAN DEPTH TRANSITIONS - adjusted for less ocean coverage
    if (continentValue < 0.12) { // Reduced from 0.15
      return { name: "deep_ocean", color: "var(--color-biome-deep-ocean)" };
    }
    
    if (continentValue < 0.30) { // Reduced from 0.38
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
    
    // Mountains and high elevation
    if (height > 0.92) {
      if (moisture > 0.8) return { name: "snow_cap", color: "var(--color-biome-snow-cap)" };
      if (moisture > 0.65) return { name: "alpine", color: "var(--color-biome-alpine)" };
      if (moisture > 0.5) return { name: "mountain", color: "var(--color-biome-mountain)" };
      if (moisture > 0.35) return { name: "dry_mountain", color: "var(--color-biome-dry-mountain)" };
      return { name: "desert_mountains", color: "var(--color-biome-desert-mountains)" };
    }
    
    if (height > 0.78) {
      if (moisture > 0.8) return { name: "glacier", color: "var(--color-biome-glacier)" };
      if (moisture > 0.65) return { name: "highland_forest", color: "var(--color-biome-highland-forest)" };
      if (moisture > 0.5) return { name: "highland", color: "var(--color-biome-highland)" };
      if (moisture > 0.35) return { name: "rocky_highland", color: "var(--color-biome-rocky-highland)" };
      return { name: "mesa", color: "var(--color-biome-mesa)" };
    }
    
    // Mid-elevation terrain
    if (height > 0.5) {
      if (moisture > 0.75) return { name: "tropical_rainforest", color: "var(--color-biome-tropical-rainforest)" };
      if (moisture > 0.62) return { name: "temperate_forest", color: "var(--color-biome-temperate-forest)" };
      if (moisture > 0.48) return { name: "woodland", color: "var(--color-biome-woodland)" };
      if (moisture > 0.35) return { name: "shrubland", color: "var(--color-biome-shrubland)" };
      if (moisture > 0.22) return { name: "dry_shrubland", color: "#a8a76c" };
      if (moisture > 0.12) return { name: "scrubland", color: "#b9a77c" };
      return { name: "badlands", color: "var(--color-biome-badlands)" };
    }
    
    // Lower elevation terrain
    if (height > 0.34) {
      if (moisture > 0.75) return { name: "swamp", color: "var(--color-biome-swamp)" };
      if (moisture > 0.60) return { name: "marsh", color: "var(--color-biome-marsh)" };
      if (moisture > 0.45) return { name: "grassland", color: "var(--color-biome-grassland)" };
      if (moisture > 0.32) return { name: "savanna", color: "var(--color-biome-savanna)" };
      if (moisture > 0.20) return { name: "desert_scrub", color: "var(--color-biome-desert-scrub)" };
      if (moisture > 0.12) return { name: "rocky_desert", color: "#bfa678" };
      return { name: "stony_desert", color: "#c79b68" };
    }
    
    // Lowest lands
    if (moisture > 0.75) return { name: "bog", color: "var(--color-biome-bog)" };
    if (moisture > 0.60) return { name: "wetland", color: "var(--color-biome-wetland)" };
    if (moisture > 0.45) return { name: "plains", color: "var(--color-biome-plains)" };
    if (moisture > 0.30) return { name: "dry_plains", color: "var(--color-biome-dry-plains)" };
    if (moisture > 0.18) return { name: "sandy_desert", color: "#e8dec6" };
    if (moisture > 0.08) return { name: "desert", color: "var(--color-biome-desert)" };
    return { name: "barren_desert", color: "#eeddbb" };
  }

  // Add a method to clear the cache
  clearCache() {
    if (this.heightCache) {
      this.heightCache.clear();
    }
  }
}

// Add a utility function to clear terrain caches
export function clearTerrainCache() {
  if (terrain) {
    terrain.clearCache();
  }
}
