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
  
  // Update getNoise to use the new fBM implementation should use this
  getNoise(x, y, options = {}) {
    // Use the new fBM function for all noise generation
    return this.getFBM(x, y, options);
  }
  
  // Enhanced river generation with better natural flowS AND IS NOT DUPLICATED
  getRiverValue(x, y, options = {}, heightMap = null) {
    if (!heightMap) return 0;

    const {
      scale = 0.003,
      riverDensity = 1.6,     // Updated to match the TERRAIN_OPTIONS value
      riverThreshold = 0.5,   // Updated to match the TERRAIN_OPTIONS value
      minContinentValue = 0.2,
      riverWidth = 1.0,      // Updated to match the TERRAIN_OPTIONS value
      flowDirectionality = 0.95,
      arterialRiverFactor = 0.75,
      waterLevel = 0.32,
      ridgeSharpness = 2.5,
      lakeInfluence = 0.75,
      branchingFactor = 0.7,  // Updated to match the TERRAIN_OPTIONS value
      streamFrequency = 0.6,  // Updated to match the TERRAIN_OPTIONS value
      flowConstraint = 0.75,
      mountainSourceFactor = 0.7
    } = options;
    
    // Get height at this position
    const heightValue = heightMap(x, y);
    
    // Early exit for extremely high terrain (above snowline)
    if (heightValue > 0.95) return 0;

    // Generate ridge noise for river channels
    const riverRidgeNoise = this.getFBM(x + 5000, y + 5000, {
      scale,
      octaves: 3,
      persistence: 0.5,
      lacunarity: 2.2,
      ridged: true
    });
    
    // Calculate neighborhood heights with wider sampling for better gradient detection
    const heightN = heightMap(x, y - 1);
    const heightS = heightMap(x, y + 1);
    const heightE = heightMap(x + 1, y);
    const heightW = heightMap(x - 1, y);
    const heightNE = heightMap(x + 1, y - 1);
    const heightNW = heightMap(x - 1, y - 1);
    const heightSE = heightMap(x + 1, y + 1);
    const heightSW = heightMap(x - 1, y + 1);
    
    // Calculate more accurate gradient for flow direction
    const dx = (heightW - heightE) * 0.6 + (heightNW - heightNE + heightSW - heightSE) * 0.2;
    const dy = (heightN - heightS) * 0.6 + (heightNW - heightSW + heightNE - heightSE) * 0.2;
    const gradMag = Math.sqrt(dx * dx + dy * dy);
    
    // Find the lowest point in neighborhood (rivers flow to lowest point)
    const neighborHeights = [heightN, heightS, heightE, heightW, heightNE, heightNW, heightSE, heightSW];
    const lowestHeight = Math.min(...neighborHeights);
    const heightDrop = heightValue - lowestHeight;
    
    // ENHANCEMENT: Special handling for mountain river sources
    // High elevation + sufficient gradient = potential river source (mountain streams)
    const isMountainSource = heightValue > 0.82 && gradMag > 0.025;
    const mountainSourceBonus = isMountainSource ? 
      (heightValue - 0.82) * 5 * mountainSourceFactor * Math.min(1.0, gradMag * 10) : 0;
    
    // Only allow river formation if there's sufficient slope or we're in a defined channel
    // Modified to allow mountain sources even with less defined channels
    if (gradMag < 0.02 && riverRidgeNoise > 0.5 && heightDrop < 0.01 && !isMountainSource) {
      return 0;  // Not enough gradient for water flow
    }
    
    // Calculate flow factor - higher on steep slopes
    const flowFactor = Math.min(1.0, gradMag * 10);
    
    // IMPORTANT: Water cannot flow uphill - ensure we have a downward gradient
    // Exception: mountain sources can create rivers
    if (heightDrop <= 0 && heightValue > waterLevel + 0.05 && !isMountainSource) {
      return 0;  // Water doesn't flow uphill unless near existing water or is a mountain source
    }
    
    // Sample nearby water bodies with wider radius to detect ocean influence
    const sampleRadius = 4;  // Increased from 3 to detect oceans better
    let nearWater = false;
    let waterDirection = { x: 0, y: 0 };
    let waterNetwork = 0;
    let nearOcean = false; // New flag to detect proximity to oceans
    
    // Check surrounding points for water bodies
    for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
      for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > sampleRadius) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        const neighborHeight = heightMap(nx, ny);
        
        // Check if this is a water body
        if (neighborHeight < waterLevel) {
          nearWater = true;
          
          // Stronger influence for very low heights (oceans)
          const isOcean = neighborHeight < waterLevel - 0.1;
          if (isOcean) nearOcean = true;
          
          // Calculate direction from water to current point with exponential falloff
          const oceanFactor = isOcean ? 1.5 : 1.0; // Ocean has stronger pull
          const weight = Math.pow(1 / Math.max(0.7, dist), 1.5) * oceanFactor;
          waterDirection.x += -dx * weight;
          waterDirection.y += -dy * weight;
          
          // Increase water network value
          waterNetwork += (1 / (dist * 1.2)) * 0.2 * oceanFactor;
        }
      }
    }
    
    // Normalize water direction
    if (nearWater) {
      const dirLength = Math.sqrt(waterDirection.x * waterDirection.x + waterDirection.y * waterDirection.y);
      if (dirLength > 0) {
        waterDirection.x /= dirLength;
        waterDirection.y /= dirLength;
      }
    }
    
    // Combine gradient with water influence, but constrain flow to more natural channels
    let finalGradX = dx;
    let finalGradY = dy;
    
    if (nearWater) {
      // Blend with water direction but constrain influence
      const waterFactor = nearOcean ? lakeInfluence * 1.2 : lakeInfluence * 0.7;
      finalGradX = dx * (1 - waterFactor) + waterDirection.x * waterFactor;
      finalGradY = dy * (1 - waterFactor) + waterDirection.y * waterFactor;
    }
    
    // Calculate base river value from ridge noise - higher values for well-defined channels
    let riverValue = (1.0 - riverRidgeNoise) * ridgeSharpness;
    
    // Add water proximity bonus with constraint
    if (nearWater) {
      // Ocean gives extra bonus
      const oceanBonus = nearOcean ? 1.3 : 1.0;
      riverValue += lakeInfluence * Math.min(0.3, waterNetwork) * oceanBonus;
    }
    
    // Add downhill flow contribution - critical for realistic rivers
    riverValue += heightDrop * flowDirectionality * 2.5;
    
    // Add mountain source bonus - creates rivers starting from mountains
    riverValue += mountainSourceBonus;
    
    // Generate branching streams with more constraint
    const branchingNoise = this.getFBM(x * 1.7 + 9000, y * 1.7 + 9000, {
      scale: scale * 1.2,
      octaves: 2,
      persistence: 0.6
    });
    
    // Add branching streams only where terrain supports it
    if (branchingNoise > (1 - branchingFactor) && (heightDrop > 0.015 || isMountainSource)) {
      riverValue += branchingNoise * branchingFactor * 0.6;
    }
    
    // Generate arterial rivers - major channels
    const arterialNoise = this.getFBM(x * 0.4 + 8000, y * 0.4 + 8000, {
      scale: scale * 0.4,
      octaves: 2,
      persistence: 0.6,
      lacunarity: 1.6
    });
    
    // Add arterial river bonus
    const isArterial = arterialNoise > (1 - arterialRiverFactor);
    if (isArterial) {
      riverValue += arterialRiverFactor * 0.8;
    }
    
    // Apply constraint to prevent rivers from spreading too widely
    riverValue *= Math.min(1.0, flowFactor * flowConstraint + (1 - flowConstraint));
    
    // Apply density scaling
    riverValue *= riverDensity;
    
    // Threshold with variable ratio
    const effectiveThreshold = nearWater ? riverThreshold * 0.8 : 
                               isMountainSource ? riverThreshold * 0.9 : 
                               riverThreshold;
    
    // Final output - proper width scaling based on river type
    if (riverValue > effectiveThreshold) {
      // Scale width by terrain - narrower for mountain rivers
      let widthModifier = isMountainSource ? 
                          (1.0 - heightValue) * 0.25 + 0.2 : // Narrower mountain rivers 
                          (1.0 - heightValue) * 0.3 + 0.3;   // Standard width scaling
      
      // Add an extra modifier for small streams to make them significantly narrower
      if (riverValue <= effectiveThreshold + 0.10) {
        widthModifier *= 0.4; // Make streams significantly narrower (60% reduction) for proper hierarchy
      }
      else if (riverValue <= effectiveThreshold + 0.18) {
        widthModifier *= 0.6; // Make medium streams somewhat narrower (40% reduction)
      }
      // Larger rivers use the full width
      
      const waterProximityBonus = nearWater ? 1.2 : 1.0;
      const arterialBonus = isArterial ? 1.4 : 1.0;
      const effectiveWidth = riverWidth * widthModifier * waterProximityBonus * arterialBonus;
      
      return Math.min(0.95, (riverValue - effectiveThreshold) * effectiveWidth);
    }
    
    return 0;
  }

  // Enhanced lake detection with smaller lakes and ponds at higher elevations
  getLakeValue(x, y, options = {}, heightMap = null, riverMap = null) {
    const {
      scale = 0.003,
      lakeThreshold = 0.82,
      minHeight = 0.3,
      maxHeight = 0.65,
      minRiverInfluence = 0.25,
      lakeSmoothness = 0.7,
      smallPondFrequency = 0.9, // Increased from original value for more ponds
      pondSize = 0.25,           // Reduced from original value for smaller ponds
      // New parameters for pond placement
      pondMinHeight = 0.42,    // Higher min height for ponds
      pondMaxHeight = 0.7,     // Max height for ponds
      avoidWaterDistance = 4   // Distance to avoid other water for ponds
    } = options;
    
    if (!heightMap) return 0;
    
    const localHeight = heightMap(x, y);
    
    // No lakes in oceans or mountains
    if (localHeight < minHeight || localHeight > maxHeight) return 0;
    
    // Generate lake noise
    const lakeNoise = this.getNoise(x + 3000, y + 3000, {
      scale,
      octaves: 2,
      persistence: 0.5
    });
    
    // Additional noise layer for small ponds with higher frequency
    const pondNoise = this.getNoise(x * 2.2 + 7500, y * 2.2 + 7500, {
      scale: scale * 2.2,
      octaves: 1,
      persistence: 0.4
    });
    
    // Generate lake shapes
    const lakeShape = this.getNoise(x + 4000, y + 4000, {
      scale: scale * 2,
      octaves: 1,
      persistence: 0.3
    });
    
    // Calculate flatness
    const heightNorth = heightMap(x, y - 1);
    const heightSouth = heightMap(x, y + 1);
    const heightEast = heightMap(x + 1, y);
    const heightWest = heightMap(x - 1, y);
    
    const slopes = [
      Math.abs(heightNorth - localHeight),
      Math.abs(heightSouth - localHeight),
      Math.abs(heightEast - localHeight),
      Math.abs(heightWest - localHeight)
    ];
    
    const averageSlope = slopes.reduce((sum, s) => sum + s, 0) / slopes.length;
    const flatnessFactor = 1 - (averageSlope * 10);
    
    // Check for depression
    const isDepression = localHeight < Math.min(heightNorth, heightSouth, heightEast, heightWest);
    
    // Check for nearby rivers or water
    const riverInfluence = riverMap ? riverMap(x, y) : 0;
    
    // Check for nearby water bodies (for ponds) - we don't want ponds near rivers/lakes
    let hasNearbyWater = false;
    if (localHeight >= pondMinHeight && localHeight <= pondMaxHeight) {
      // Check surrounding area for water bodies
      for (let dy = -avoidWaterDistance; dy <= avoidWaterDistance && !hasNearbyWater; dy++) {
        for (let dx = -avoidWaterDistance; dx <= avoidWaterDistance && !hasNearbyWater; dx++) {
          if (dx === 0 && dy === 0) continue;
          
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > avoidWaterDistance) continue;
          
          const nx = x + dx;
          const ny = y + dy;
          
          // Check if river or other water body exists here
          if (riverMap && riverMap(nx, ny) > 0.05) {
            hasNearbyWater = true;
            break;
          }
        }
      }
    }
    
    // Small pond formation - now restricted to higher elevations and away from rivers
    let pondValue = 0;
    if (pondNoise > 0.8 && localHeight >= pondMinHeight && localHeight <= pondMaxHeight && !hasNearbyWater) {
      // Increased threshold from 0.75 to 0.8 and reduced multiplier from 2.5 to 1.5
      pondValue = (pondNoise - 0.8) * 1.5 * smallPondFrequency * pondSize;
    }
    
    // Main lake formation
    const lakeValue = 
      (lakeShape * lakeSmoothness + (1 - lakeSmoothness)) * 
      (isDepression ? 1.5 : 0.5) * 
      (flatnessFactor > 0 ? flatnessFactor : 0) * 
      (riverInfluence > minRiverInfluence ? 1.2 : 0.8) * 
      lakeNoise;
    
    // Combine pond and lake values but keep small ponds small
    const combinedValue = Math.max(
      lakeValue > lakeThreshold ? (lakeValue - lakeThreshold) * 6 : 0,
      pondValue
    );
    
    return Math.min(1, combinedValue);
  }

  // Optimized lava detection - reduced frequency
  getLavaValue(x, y, options = {}, heightMap = null) {
    const {
      scale = 0.002,
      lavaThreshold = 0.89,    // Increased from 0.85 to create less lava
      minHeight = 0.67,        // Increased from 0.65 to restrict to higher elevations
      lavaConcentration = 0.95, // Increased from 0.9 for more vibrant colors
      flowIntensity = 1.8,      // Slightly increased from 1.7
      volcanicTransitionWidth = 0.15  // New parameter controlling transition sharpness
    } = options;
    
    if (!heightMap) return 0;
    
    const heightValue = heightMap(x, y);
    
    // No lava below minimum height
    if (heightValue < minHeight) return 0;
    
    // Generate lava noise
    const lavaNoise = this.getNoise(x + 2000, y + 2000, {
      scale,
      octaves: 3,
      persistence: 0.5
    });
    
    // Apply threshold and concentration
    if (lavaNoise > lavaThreshold) {
      return (lavaNoise - lavaThreshold) * lavaConcentration * flowIntensity;
    }
    
    return 0;
  }
  
  // Enhanced scorched land detection that avoids rivers and water
  calculateScorchedValue(x, y, heightMap, lavaValue, riverValue) {
    // Skip scorched calculation for water tiles
    if (riverValue > 0.1) {
      return 0;
    }
    
    const heightValue = heightMap(x, y);
    
    // Reduce frequency of scorched land
    const scorchedFrequency = TERRAIN_OPTIONS.constants.scorchedFrequency || 0.7;
    
    // Only calculate scorched land if we're not in water or near lava
    if (lavaValue > 0.05 || (heightValue > 0.65 && this.getNoise(x * 2.5, y * 2.5, {
      scale: 0.008,
      octaves: 2,
      persistence: 0.5
    }) > 0.75)) { // Increased threshold from 0.7 to reduce frequency
      const scorchedNoise = this.getNoise(x * 3 + 15000, y * 3 + 15000, {
        scale: 0.006,
        octaves: 2,
        persistence: 0.6
      });
      
      // Apply frequency reduction factor
      return Math.max(0, scorchedNoise - 0.45) * 1.65 * scorchedFrequency; // Increased threshold from 0.4
    }
    
    return 0;
  }
  
  // Fixed and properly defined getContinentValue method
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

  // Add new capillary stream system - drastically reduced size
  getCapillaryStreamValue(x, y, options = {}, heightMap = null) {
    if (!heightMap) return 0;
    
    const {
      scale = 0.006,           
      density = 1.6,           // Updated to match the TERRAIN_OPTIONS value
      threshold = 0.75,        // Updated to match the TERRAIN_OPTIONS value
      minHeight = 0.33,        
      maxHeight = 0.85,        
      waterLevel = 0.31,       
      connectivityFactor = 0.85,
      thinnessFactor = 0.12    // Updated to match the TERRAIN_OPTIONS value
    } = options;
    
    // Get height at this position
    const heightValue = heightMap(x, y);
    
    // Skip if outside valid height range
    if (heightValue < minHeight || heightValue > maxHeight) return 0;
    
    // High-frequency noise for detailed stream patterns
    const capillaryNoise = this.getFBM(x * 1.8 + 25000, y * 1.8 + 25000, {
      scale,
      octaves: 3,
      persistence: 0.5,
      lacunarity: 2.4,
      ridged: true  // Use ridge noise for channel-like features
    });
    
    // Network noise with lower frequency for connectivity patterns
    const networkNoise = this.getFBM(x * 0.7 + 32000, y * 0.7 + 32000, {
      scale: scale * 0.7,
      octaves: 2,
      persistence: 0.6,
      lacunarity: 1.8
    });
    
    // Sample nearby for water bodies (rivers, lakes, ponds, ocean)
    const sampleRadius = 5; // Larger radius to detect nearby water
    let waterProximity = 0;
    let nearestWaterDist = sampleRadius + 1;
    let waterGradientX = 0;
    let waterGradientY = 0;
    
    for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
      for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > sampleRadius) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        const neighborHeight = heightMap(nx, ny);
        
        // Check if this is water
        if (neighborHeight < waterLevel) {
          // Calculate water influence with exponential falloff
          const influence = Math.pow(1 - dist / sampleRadius, 2.5) * 1.2;
          waterProximity += influence;
          
          // Track nearest water and direction
          if (dist < nearestWaterDist) {
            nearestWaterDist = dist;
            waterGradientX = -dx / dist; // Direction to water
            waterGradientY = -dy / dist;
          }
        }
      }
    }
    
    // Calculate local height gradient for water flow direction
    const heightE = heightMap(x + 1, y);
    const heightW = heightMap(x - 1, y);
    const heightN = heightMap(x, y - 1);
    const heightS = heightMap(x, y + 1);
    
    const gradX = heightW - heightE;
    const gradY = heightN - heightS;
    const gradMag = Math.sqrt(gradX * gradX + gradY * gradY);
    
    // Get normalized flow direction
    let flowDirX = 0;
    let flowDirY = 0;
    
    if (gradMag > 0.001) {
      flowDirX = gradX / gradMag;
      flowDirY = gradY / gradMag;
    }
    
    // Combine water gradient with height gradient
    let combinedDirX = flowDirX;
    let combinedDirY = flowDirY;
    
    if (nearestWaterDist < sampleRadius) {
      // Blend height-based flow with attraction to nearest water body
      combinedDirX = flowDirX * 0.7 + waterGradientX * 0.3;
      combinedDirY = flowDirY * 0.7 + waterGradientY * 0.3;
    }
    
    // Use the combined direction to adjust base noise
    // This creates a "flow" effect toward water and downhill
    const flowAlignment = 0.5 + (
      (combinedDirX * (x % 1)) + 
      (combinedDirY * (y % 1))
    ) * 0.3;
    
    // Calculate stream value using multiple factors
    let streamValue = (1.0 - capillaryNoise) * // Ridge noise creates channel paths
                     (0.7 + networkNoise * 0.6) * // Network noise adds variation
                     (1.0 + flowAlignment) * // Flow effect adds directional bias
                     (1.0 + waterProximity * connectivityFactor); // Water proximity increases likelihood
    
    // Apply height-based modifiers
    const heightMod = 1.0 - Math.abs(2.0 * ((heightValue - minHeight) / (maxHeight - minHeight)) - 1.0);
    streamValue *= (0.5 + heightMod * 0.8); // More likely in middle elevations
    
    // Enhanced stream density depending on height
    const densityMod = 0.8 + heightMod * 0.7;
    streamValue *= density * densityMod;
    
    // Apply threshold with stronger cutoff for ultrathin streams
    const effectiveThreshold = threshold - (waterProximity * 0.1); // Increased from 0.08 for more water proximity influence
    
    // Return a smaller value for extremely thin streams
    if (streamValue > effectiveThreshold) {
      // Width factor reduced significantly to create much thinner streams
      const widthFactor = (0.03 - (heightValue - minHeight) * 0.02) * thinnessFactor;  // Reduced from 0.045 to 0.03
      
      // Also reduced the max cap from 0.03 to 0.02 for much thinner streams
      return Math.min(0.02, (streamValue - effectiveThreshold) * widthFactor);
    }
    
    return 0;
  }
}

// Export terrain generation options with enhanced biome diversity
export const TERRAIN_OPTIONS = {
  // Continent generation options - dramatically adjusted for ocean generation
  continent: {
    scale: 0.0003,  // Reduced from 0.0006 to create larger continuous ocean areas
    threshold: 0.58,  // Dramatically increased from 0.42 to ensure ocean generation
    edgeScale: 0.002,
    edgeAmount: 0.35,    
    sharpness: 2.0       // Increased from 1.8 for sharper coastlines
  },
  
  // NEW: Add regional variation layer for large-scale patterns
  region: {
    scale: 0.0003,       // Very large scale for regional differences
    octaves: 2,          // Fewer octaves for smoother regional transitions
    influence: 0.25,      // How much regional noise affects other parameters
    moistureInfluence: 0.4 // Stronger influence on moisture for distinct biome regions
  },
  
  // Height map options with adjusted parameters for more mountains
  height: {
    scale: 0.0042,
    octaves: 4,
    persistence: 0.62,   // Increased from 0.58 for more height variation
    lacunarity: 2.0
  },
  
  // Enhanced moisture map options for more dramatic moisture gradients
  moisture: {
    scale: 0.0048,       // Changed from 0.0055 to create larger moisture regions
    octaves: 4,
    persistence: 0.7,    // Increased from 0.6 for more defined moisture regions
    lacunarity: 2.4,     // Increased from 2.2 for more variation
    varianceFactor: 0.3  // New parameter to add moisture variance
  },

  // Detail noise - fewer octaves for performance
  detail: {
    scale: 0.04,
    octaves: 2,
    persistence: 0.5,
    lacunarity: 2.0
  },
  
  // River generation options - fixed width hierarchy for proper appearance
  river: {
    scale: 0.0022,
    riverDensity: 1.6,
    riverThreshold: 0.50,
    minContinentValue: 0.2,
    riverWidth: 1.0,          // Increased from 0.75 to ensure rivers are wider than streams
    flowDirectionality: 0.95,
    arterialRiverFactor: 0.75,
    waterLevel: 0.31,
    ridgeSharpness: 2.5,
    lakeInfluence: 0.65,
    branchingFactor: 0.7,
    streamFrequency: 0.6,
    flowConstraint: 0.8,
    mountainSourceFactor: 0.7
  },
  
  // Capillary streams (smallest water features) - more numerous, thinner
  capillary: {
    scale: 0.006,
    density: 1.6,              // Increased from 1.25 to create more capillaries
    threshold: 0.75,           // Decreased from 0.80 to create more streams
    minHeight: 0.33,        
    maxHeight: 0.85,        
    waterLevel: 0.31,       
    connectivityFactor: 0.85,
    thinnessFactor: 0.12       // Reduced from 0.15 to make streams thinner
  },
  
  // Lake options - adjusted with much smaller ponds
  lake: {
    scale: 0.0015,
    lakeThreshold: 0.85,
    minHeight: 0.35,
    maxHeight: 0.65, 
    minRiverInfluence: 0.25,
    lakeSmoothness: 0.7,
    smallPondFrequency: 0.95,
    pondSize: 0.1,             // Reduced from 0.2 to make ponds much smaller
    pondMinHeight: 0.42,
    pondMaxHeight: 0.7,
    avoidWaterDistance: 4
  },
  
  // Lava options - reduced frequency
  lava: {
    scale: 0.002,
    lavaThreshold: 0.89,     // Increased from 0.85 to make lava rarer
    minHeight: 0.67,         // Increased from 0.65 to restrict to higher elevations
    lavaConcentration: 0.95,
    flowIntensity: 1.8,
    volcanicTransitionWidth: 0.15
  },
  
  // Enhanced snow/ice formation - significantly increased visibility
  snow: {
    elevationThreshold: 0.78,  // Lowered from 0.82 to create much more snow
    highMoistureThreshold: 0.5, // Lowered from 0.55 for more snow at high elevations
    midMoistureThreshold: 0.6,  // Lowered from 0.65 for more snow at mid elevations
    lowMoistureThreshold: 0.75, // Lowered from 0.8 for more snow across all elevations
    snowIntensity: 2.0          // Increased from 1.5 for even more prominent snow features
  },
  
  // New terrain features
  cliffs: {
    threshold: 0.18,      // Slope threshold for cliff detection
    highElevation: 0.7,    // Minimum elevation for high cliffs
    varianceFactor: 0.2  // New parameter to add cliff formation variance
  },
  
  // Constants adjusted for better ocean representation
  constants: {
    continentInfluence: 0.75,  // Reduced from 0.82 to allow more water features 
    waterLevel: 0.31,        // Slightly reduced water level to expand landmass
    heightBias: 0.095,          // Slightly reduced to allow more depressions for water
    riverErosionFactor: 0.38,  // Increased to create deeper river valleys
    mountainBoost: 0.18,       // Increased from 0.15 to generate more mountains
    volcanicMountainBlend: 0.3,  // New parameter to control volcano-mountain blending
    // New constant for scorched frequency
    scorchedFrequency: 0.7,     // Reduced frequency from implied 1.0
    regionalVariance: 0.3,    // New parameter to control overall regional variability
    moistureContrast: 1.2     // New parameter to increase moisture contrast
  }
};

// TerrainGenerator class - updated to use SimplexNoise
export class TerrainGenerator {
  constructor(worldSeed, initialCacheSize) {
    // Require explicit seed - no default
    if (worldSeed === undefined || worldSeed === null) {
      throw new Error('TerrainGenerator requires a valid seed');
    }
    
    this.WORLD_SEED = worldSeed;
    
    // Create separate noise instances for each terrain aspect
    this.continentNoise = new SimplexNoise(this.WORLD_SEED);
    this.heightNoise = new SimplexNoise(this.WORLD_SEED + 10000);
    this.moistureNoise = new SimplexNoise(this.WORLD_SEED + 20000);
    this.detailNoise = new SimplexNoise(this.WORLD_SEED + 30000);
    this.riverNoise = new SimplexNoise(this.WORLD_SEED + 40000);
    this.lakeNoise = new SimplexNoise(this.WORLD_SEED + 50000);
    this.lavaNoise = new SimplexNoise(this.WORLD_SEED + 60000);
    
    // Cache with explicit size - no default
    this.heightCache = new Map();
    this.maxCacheSize = initialCacheSize || 0; // Initially small until properly sized
  }
  
  // Set cache size based on visible grid dimensions
  updateCacheSize(visibleCols, visibleRows, chunkSize = 20) {
    // Calculate a reasonable cache size based on visible area plus buffer
    // We multiply by a factor to account for panning and zooming
    const visibleTiles = visibleCols * visibleRows;
    const bufferFactor = 1.5; // Extra buffer for smooth scrolling
    this.maxCacheSize = Math.ceil(visibleTiles * bufferFactor);
    
    // Ensure a minimum reasonable cache size based on at least one chunk
    const minCacheSize = chunkSize * chunkSize * 4;
    this.maxCacheSize = Math.max(this.maxCacheSize, minCacheSize);
    
    // If current cache exceeds the new max size, trim it
    this.trimCache();
  }
  
  // Trim cache to stay within size limits
  trimCache() {
    if (this.heightCache.size > this.maxCacheSize) {
      const keysToDelete = Array.from(this.heightCache.keys())
        .slice(0, this.heightCache.size - this.maxCacheSize / 2);
      keysToDelete.forEach(k => this.heightCache.delete(k));
    }
  }
  
  // Clear cache entries for coordinates within a specific chunk
  clearChunkFromCache(chunkX, chunkY, chunkSize = 20) {
    // Calculate chunk boundaries
    const startX = chunkX * chunkSize;
    const startY = chunkY * chunkSize;
    const endX = startX + chunkSize - 1;
    const endY = startY + chunkSize - 1;
    
    // Find and remove all cached entries within this chunk
    this.heightCache.forEach((_, key) => {
      const [x, y] = key.split(',').map(Number);
      if (x >= startX && x <= endX && y >= startY && y <= endY) {
        this.heightCache.delete(key);
      }
    });
  }
  
  // Get terrain data with fixed caching mechanism
  getTerrainData(x, y) {
    // Cache key for this position
    const key = `${x},${y}`;
    
    // Check if we've already calculated this position
    const cached = this.heightCache.get(key);
    if (cached) return cached;
    
    // Debug ocean generation on a sparse grid
    const isDebugPoint = (x % 100 === 0) && (y % 100 === 0);
    
    // Get continent value first
    const continent = this.continentNoise.getContinentValue(x, y, TERRAIN_OPTIONS.continent);
    
    if (isDebugPoint) {
      console.log(`Debug at ${x},${y}: continent=${continent.toFixed(3)}`);
    }
    
    // NEW: Generate regional variation noise
    const regionNoise = this.heightNoise.getNoise(
      x * TERRAIN_OPTIONS.region.scale,
      y * TERRAIN_OPTIONS.region.scale, 
      { 
        octaves: TERRAIN_OPTIONS.region.octaves,
        persistence: 0.5,
        lacunarity: 2.5
      }
    );
    
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
                 
    // Apply regional influence to height
    const regionInfluence = TERRAIN_OPTIONS.region.influence;
    height = height * (1 - regionInfluence) + 
             ((regionNoise * regionNoise) * regionInfluence) + 
             (regionNoise * regionInfluence * 0.2); // Add some asymmetry
    
    // Apply height bias and mountain boost with strengthened effect
    const mountainNoise = this.heightNoise.getFBM(x + 12000, y + 12000, {
      scale: 0.003,
      octaves: 3,
      persistence: 0.65,
      lacunarity: 2.1
    });
    
    // Apply mountain boost with more progressive effect for smoother transitions
    if (mountainNoise > 0.62) {
      const mountainEffect = (mountainNoise - 0.62) * 2.8;
      height = Math.min(1, height + TERRAIN_OPTIONS.constants.mountainBoost * mountainEffect);
    }
    
    // Apply general height bias
    height = Math.min(1, height + TERRAIN_OPTIONS.constants.heightBias);
    
    // Sharpen height curve for more dramatic mountains
    height = Math.pow(height, 1.15);
    
    // Add detail with less processing
    const detail = this.detailNoise.getNoise(x, y, TERRAIN_OPTIONS.detail) * 0.08;
    height = Math.min(1, Math.max(0, height + detail - 0.04));
    
    // Generate initial moisture value
    let moisture = this.moistureNoise.getNoise(x, y, TERRAIN_OPTIONS.moisture);
    
    // NEW: Apply moisture variance based on region
    const moistureRegionalEffect = (regionNoise - 0.5) * TERRAIN_OPTIONS.region.moistureInfluence;
    moisture = Math.max(0, Math.min(1, moisture + moistureRegionalEffect));
    
    // NEW: TERRAIN-MOISTURE INTERACTION
    // 1. Check for nearby water bodies to increase moisture
    const waterProximityMoisture = this.calculateWaterProximityMoisture(x, y, heightMap, TERRAIN_OPTIONS);
    
    // 2. Check for rain shadow effect from mountains
    const rainShadowFactor = this.calculateRainShadowEffect(x, y, heightMap, TERRAIN_OPTIONS);
    
    // 3. Apply elevation-based moisture adjustment
    const elevationMoistureFactor = this.calculateElevationMoistureFactor(height, TERRAIN_OPTIONS);
    
    // Combine all moisture effects (proximity, rain shadow, elevation)
    moisture = Math.min(1.0, Math.max(0.0, 
      moisture * (1.0 + waterProximityMoisture * 0.5) * // Increase from proximity to water
      rainShadowFactor * // Decrease from rain shadow
      elevationMoistureFactor // Adjust based on elevation
    ));
    
    // Apply contrast curve to moisture for more dramatic regions
    moisture = Math.pow(moisture, TERRAIN_OPTIONS.constants.moistureContrast);
    
    // Generate river value first (important for proper priority)
    const riverValue = this.riverNoise.getRiverValue(x, y, TERRAIN_OPTIONS.river, heightMap);
    
    // Create river map function
    const riverMap = (tx, ty) => this.riverNoise.getRiverValue(tx, ty, TERRAIN_OPTIONS.river, heightMap);
    
    // Generate lake value
    const lakeValue = this.lakeNoise.getLakeValue(x, y, TERRAIN_OPTIONS.lake, heightMap, riverMap);
    
    // Generate capillary stream value - only if no river or lake already exists
    const capillaryValue = (riverValue < 0.05 && lakeValue < 0.05) ? 
      this.riverNoise.getCapillaryStreamValue(x, y, TERRAIN_OPTIONS.capillary, heightMap) : 0;
    
    // Generate lava value
    const lavaValue = this.lavaNoise.getLavaValue(x, y, TERRAIN_OPTIONS.lava, heightMap);
    
    // Generate scorched value AFTER river value to prevent overlap
    const scorchedValue = this.riverNoise.calculateScorchedValue(x, y, heightMap, lavaValue, riverValue || capillaryValue);
    
    // Enhanced slope calculation with additional samples for cliff detection
    const heightE = heightMap(x + 1, y);
    const heightW = heightMap(x - 1, y);
    const heightN = heightMap(x, y - 1);
    const heightS = heightMap(x, y + 1);
    const heightNE = heightMap(x + 1, y - 1);
    const heightNW = heightMap(x - 1, y - 1);
    const heightSE = heightMap(x + 1, y + 1);
    const heightSW = heightMap(x - 1, y + 1);
    
    // Calculate gradient with more precision
    const dx = (heightE - heightW) * 0.6 + (heightNE - heightNW + heightSE - heightSW) * 0.2;
    const dy = (heightN - heightS) * 0.6 + (heightNW - heightSW + heightNE - heightSE) * 0.2;
    const slope = Math.sqrt(dx * dx + dy * dy);
    
    // Check for cliff features
    const isCliff = slope > TERRAIN_OPTIONS.cliffs.threshold;
    const isHighCliff = isCliff && height > TERRAIN_OPTIONS.cliffs.highElevation;
    
    // Get biome with enhanced parameters including rarity
    const biome = this.getBiome(height, moisture, continent, riverValue, lakeValue, lavaValue, slope, scorchedValue, isCliff, isHighCliff, capillaryValue);
    
    // Create result with added rarity information
    const result = { 
      height, moisture, continent, slope, biome, isCliff, isHighCliff,
      color: biome.color, riverValue, lakeValue, lavaValue, scorchedValue,
      rarity: biome.rarity // Include rarity in the terrain data result
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

  // NEW: Calculate moisture increase based on proximity to water bodies
  calculateWaterProximityMoisture(x, y, heightMap, options) {
    const waterLevel = options.constants.waterLevel;
    let moistureBoost = 0;
    
    // Check a larger area for water bodies
    const checkRadius = 7;
    
    for (let dy = -checkRadius; dy <= checkRadius; dy++) {
      for (let dx = -checkRadius; dx <= checkRadius; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > checkRadius) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        const neighborHeight = heightMap(nx, ny);
        
        // If this is water, add moisture based on proximity
        if (neighborHeight < waterLevel) {
          // Stronger influence for closer water bodies
          const proximityFactor = (checkRadius - dist) / checkRadius;
          
          // Large bodies of water (oceans) have stronger influence
          const isLargeWater = (neighborHeight < waterLevel - 0.05);
          const waterSizeFactor = isLargeWater ? 1.5 : 1.0;
          
          moistureBoost += proximityFactor * proximityFactor * waterSizeFactor * 0.2;
        }
      }
    }
    
    // Cap the moisture boost
    return Math.min(1.0, moistureBoost);
  }
  
  // NEW: Calculate rain shadow effect from mountains
  calculateRainShadowEffect(x, y, heightMap, options) {
    // We'll use a directional check to simulate prevailing winds
    // The rain shadow effect reduces moisture on the leeward side of mountains
    
    // Determine prevailing wind direction - for simplicity using fixed direction
    // In a more complex model, this could vary by region
    const windDirX = 1.0; // East to West wind
    const windDirY = 0.2; // Slight North to South component
    
    // Normalize wind vector
    const windDirMag = Math.sqrt(windDirX * windDirX + windDirY * windDirY);
    const normWindX = windDirX / windDirMag;
    const normWindY = windDirY / windDirMag;
    
    let maxHeightDiff = 0;
    const checkDistance = 5; // How far to check for mountains
    
    // Check upwind for mountains
    for (let d = 1; d <= checkDistance; d++) {
      const upwindX = x - Math.round(normWindX * d);
      const upwindY = y - Math.round(normWindY * d);
      
      // Get height at current position and upwind position
      const currentHeight = heightMap(x, y);
      const upwindHeight = heightMap(upwindX, upwindY);
      
      // If upwind terrain is higher, we're in a rain shadow
      const heightDiff = upwindHeight - currentHeight;
      if (heightDiff > maxHeightDiff) {
        maxHeightDiff = heightDiff;
      }
    }
    
    // Calculate rain shadow factor (lower means more shadow)
    // Use exponential falloff for more realistic effect
    const rainShadowFactor = Math.min(1.0, Math.max(0.4, 1.0 - maxHeightDiff * 1.5));
    
    return rainShadowFactor;
  }
  
  // NEW: Calculate moisture adjustment based on elevation
  calculateElevationMoistureFactor(height, options) {
    // Higher elevations generally have less moisture (with some exceptions)
    const waterLevel = options.constants.waterLevel;
    
    // Start with neutral factor
    let factor = 1.0;
    
    // Very high elevations have less moisture
    if (height > 0.8) {
      factor *= 0.8;
    }
    // But mid elevations often collect moisture
    else if (height > 0.5 && height < 0.7) {
      factor *= 1.1;
    }
    // Areas just above water level are often humid
    else if (height > waterLevel && height < waterLevel + 0.15) {
      factor *= 1.2;
    }
    
    return factor;
  }

  // Calculate biome rarity based on how extreme the parameters are
  calculateRarity(height, moisture, slope, lavaValue, scorchedValue, isCliff) {
    // Start with a score of 0 (common)
    let rarityScore = 0;
    
    // Add points for extreme height values (very high or very low)
    rarityScore += Math.pow(Math.abs(height - 0.5) * 2, 1.5) * 10;
    
    // Add points for extreme moisture values
    rarityScore += Math.pow(Math.abs(moisture - 0.5) * 2, 1.5) * 8;
    
    // Add points for steep slopes
    if (slope > 0.08) {
      rarityScore += (slope - 0.08) * 40;
    }
    
    // Add significant points for lava and scorched areas
    if (lavaValue > 0) {
      rarityScore += lavaValue * 20;
    }
    
    if (scorchedValue > 0) {
      rarityScore += scorchedValue * 15;
    }
    
    // Add points for cliff features
    if (isCliff) {
      rarityScore += 8;
    }
    
    // Determine rarity level based on score
    if (rarityScore > 25) return 'mythic';      // Extremely rare, score > 25
    if (rarityScore > 18) return 'legendary';   // Very rare, score 18-25
    if (rarityScore > 13) return 'epic';        // Quite rare, score 13-18
    if (rarityScore > 8) return 'rare';         // Somewhat uncommon, score 8-13
    if (rarityScore > 4) return 'uncommon';     // Slightly uncommon, score 4-8
    return 'common';                           // Common, score 0-4
  }

  // Updated getBiome method that includes rarity calculation
  getBiome(height, moisture, continentValue = 1.0, riverValue = 0, lakeValue = 0, lavaValue = 0, slope = 0, scorchedValue = 0, isCliff = false, isHighCliff = false, capillaryValue = 0) {
    
    // Get base biome information
    let baseBiome = this.getBaseBiomeInfo(height, moisture, continentValue, riverValue, lakeValue, lavaValue, slope, scorchedValue, isCliff, isHighCliff, capillaryValue);
    
    // Calculate rarity
    const rarity = this.calculateRarity(height, moisture, slope, lavaValue, scorchedValue, isCliff || isHighCliff);
    
    // Add rarity to biome object
    return {
      ...baseBiome,
      rarity
    };
  }

  // Base biome classification logic moved to a separate method
  getBaseBiomeInfo(height, moisture, continentValue = 1.0, riverValue = 0, lakeValue = 0, lavaValue = 0, slope = 0, scorchedValue = 0, isCliff = false, isHighCliff = false, capillaryValue = 0) {
    // STRICT PRIORITY SYSTEM - The order here determines which feature "wins"
    
    // 1. LAVA/MAGMA - Highest priority with enhanced bright colors
    if (lavaValue > 0.1) {
      if (lavaValue > 0.85) return { name: "magma_flow", color: "#FF2200" };  // Even brighter red-orange
      if (lavaValue > 0.65) return { name: "lava_flow", color: "#FF5000" };   // More vibrant orange
      if (lavaValue > 0.4) return { name: "volcanic_rock", color: "#6A3A28" };
      return { name: "volcanic_soil", color: "#7D4B3A" };
    }
    
    // 2. WATER FEATURES - Second highest priority with unified colors
    // OCEAN FEATURES - Enhanced with more distinction between water types
    if (continentValue < 0.12) return { name: "deep_ocean", color: "#0E3B59" }; // Increased from 0.08
    if (continentValue < 0.26) return { name: "ocean", color: "#1A4F76" };      // Increased from 0.18
    if (continentValue < 0.40) return { name: "sea", color: "#2D6693" };        // Increased from 0.33
    
    // COASTAL WATERS
    const waterLevel = TERRAIN_OPTIONS.constants.waterLevel;
    if (height < waterLevel) return { name: "shallows", color: "#5d99b8" };

    // RIVER SYSTEM - Fixed size hierarchy
    // Lakes (largest water bodies) - keep threshold the same but increase detection
    if (lakeValue > 0.25) {
      if (height > 0.7) return { name: "mountain_lake", color: "#3A7FA0" };
      return { name: "lake", color: "#4A91AA" };
    }
    
    // Rivers (medium water bodies) - ensure they are visibly wider than streams
    if (riverValue > 0.25 && continentValue > 0.2) {
      if (height > 0.75) return { name: "mountain_river", color: "#4A8FA0" }; 
      return { name: "river", color: "#55AAC5" };
    }
    
    // Streams (small water bodies) - ensure they are visibly thinner than rivers
    if (riverValue > 0.17 && continentValue > 0.2) {  // Increased from 0.15 to make fewer streams
      return { name: "stream", color: "#65B2C0" };
    }
    
    // Make capillary streams even smaller but more numerous
    if (capillaryValue > 0.03) {  // Reduced from 0.035 to create more capillary streams
      return { name: "rivulet", color: "#6AADB6" };
    }
    
    // 3. SCORCHED LANDS - Replaced with more volcanic-themed biomes
    if (scorchedValue > 0.2) {
      // Sharp transition to volcanic terrain
      if (scorchedValue > 0.7) return { name: "active_volcano", color: "#9A2A20" }; // Darker red for better contrast
      if (scorchedValue > 0.55) return { name: "volcanic_caldera", color: "#B54A30" }; // Slightly adjusted threshold
      if (scorchedValue > 0.4) return { name: "volcanic_ash", color: "#706055" }; // Slightly adjusted threshold
      return { name: "lava_fields", color: "#9D5A40" };
    }
    
    // 4. CLIFF FEATURES
    if (isHighCliff) {
      if (height > 0.9) return { name: "sheer_cliff", color: "#706860" }; // Dramatic sheer cliff
      if (moisture > 0.6) return { name: "moss_cliff", color: "#5A6855" }; // Mossy cliff
      return { name: "rocky_cliff", color: "#7A736B" }; // Standard cliff face
    }
    
    if (isCliff && height > 0.5) {
      if (height > 0.75) return { name: "steep_slope", color: "#7D7468" };
      return { name: "rugged_slope", color: "#82796D" };
    }
    
    // MOUNTAIN AND HIGH ELEVATION - enhanced snow features with more vibrant colors
    if (height > 0.92) {
      // High elevation, lower moisture threshold for snow
      if (moisture > TERRAIN_OPTIONS.snow.highMoistureThreshold) {
        if (moisture > 0.8) return { name: "snow_cap", color: "#FFFFFF" };  // Pure white for snow caps
        if (moisture > 0.7) return { name: "glacial_peak", color: "#F0FFFF" }; // New glacial peak biome
        return { name: "alpine_snow", color: "#E8F0FF" }; // Bluer alpine snow
      }
      
      // NEW: Add more mountain variation for high peaks
      if (moisture > 0.5) return { name: "snowy_peaks", color: "#D8E0EA" };
      if (moisture > 0.4) return { name: "rocky_peaks", color: "#C0C0C8" }; // New variation
      
      // High elevation, low moisture = volcanic or barren
      if (moisture < 0.15) return { name: "volcanic_peak", color: "#A03A25" }; // More restrictive for volcanoes
      if (moisture < 0.25) return { name: "obsidian_ridge", color: "#55352F" }; // More restrictive
      if (moisture < 0.35) return { name: "craggy_peaks", color: "#83756A" }; // New variation
      
      return { name: "rugged_peaks", color: "#AAA0B5" };
    }
    
    // High elevation (85%+) - more snow and ice with brighter colors
    if (height > 0.85) {
      // High elevation snow at lower moisture thresholds
      if (moisture > TERRAIN_OPTIONS.snow.midMoistureThreshold) {
        if (moisture > 0.85) return { name: "glacier", color: "#CCEEFF" }; // Brighter glacier
        if (moisture > 0.75) return { name: "snow_field", color: "#E0F0FF" }; // Brighter snow field
        return { name: "snowy_forest", color: "#A5B5C5" }; // Lighter snowy forest
      }
      
      // Medium moisture = mountain forest
      if (moisture > 0.5) return { name: "mountain_forest", color: "#607D55" };
      if (moisture > 0.45) return { name: "rocky_forest", color: "#6D7A60" }; // New variation
      if (moisture > 0.4) return { name: "alpine_shrubs", color: "#747C63" }; // New variation
      
      // Low moisture = volcanic or barren
      if (moisture < 0.2) return { name: "volcanic_slopes", color: "#8A4B3C" }; // More restrictive
      if (moisture < 0.3) return { name: "barren_slopes", color: "#8E7F6E" }; // New variation
      if (moisture < 0.4) return { name: "mountain_scrub", color: "#7D8766" };
      
      return { name: "bare_mountain", color: "#A09085" };
    }
    
    // Upper mid-elevation (78%+) - added more snow at this level too
    if (height > 0.78) {
      // Upper mid-elevation snow and ice - increased visibility
      if (moisture > TERRAIN_OPTIONS.snow.lowMoistureThreshold) {
        return { name: "snow_patched_hills", color: "#D5E5F5" }; // Brighter snow patches
      }
      
      // Add new category for high moisture but not quite snow
      if (moisture > 0.7) return { name: "foggy_peaks", color: "#B0C0D0" }; // New foggy mountains biome
      
      // ...existing code for mid-elevation biomes...
      if (moisture < 0.25) return { name: "rocky_slopes", color: "#A58775" }; // Made lighter
      if (moisture > 0.8) return { name: "alpine_meadow", color: "#8DAD70" }; // Made brighter
      if (moisture > 0.65) return { name: "highland_forest", color: "#5D7B4A" }; // Made brighter
      if (moisture > 0.5) return { name: "highland", color: "#7B8F5D" }; // Made brighter
      if (moisture > 0.35) return { name: "rocky_highland", color: "#8D9075" }; // Made lighter
      
      return { name: "mesa", color: "#B09579" }; // Made lighter for better visibility
    }
    
    // MID-ELEVATION TERRAIN (58-78%) - More visible distinctions
    if (height > 0.58) {
      // Also add snow for extremely wet mid-elevation areas
      if (moisture > 0.92) return { name: "mountain_frost", color: "#C5D5E5" }; // New frost biome
      
      // ...existing code for mid-elevation biomes...
    }
    
    // ...rest of the biome selection code...
    // MID-ELEVATION TERRAIN - expanded with fantasy biomes
    if (height > 0.58) {
      if (moisture > 0.85) return { name: "ancient_forest", color: "#29543A" }; // Ancient primal forest
      if (moisture > 0.75) return { name: "tropical_rainforest", color: "#306B44" }; // Dense rainforest
      if (moisture > 0.62) return { name: "temperate_forest", color: "#3D7A4D" }; // Temperate forest
      if (moisture > 0.5) return { name: "enchanted_grove", color: "#4E8956" }; // Magical/enchanted grove
      if (moisture > 0.4) return { name: "woodland", color: "#5D9555" }; // Woodland
      if (moisture > 0.3) return { name: "shrubland", color: "#8BA662" }; // Shrubland
      if (moisture > 0.2) return { name: "dry_shrubland", color: "#A8A76C" }; // Dry shrubland
      if (moisture > 0.12) return { name: "scrubland", color: "#B9A77C" }; // Scrubland
      return { name: "badlands", color: "#BC9668" }; // Badlands
    }
    
    if (height > 0.5) {
      if (moisture > 0.85) return { name: "fey_forest", color: "#2E5D40" }; // Magical/fey forest
      if (moisture > 0.75) return { name: "deep_forest", color: "#356848" }; // Deep mysterious forest
      if (moisture > 0.65) return { name: "dense_forest", color: "#3A7446" }; // Dense forest
      if (moisture > 0.55) return { name: "forest", color: "#407B4C" }; // Regular forest
      if (moisture > 0.45) return { name: "light_forest", color: "#558759" }; // Light forest
      if (moisture > 0.35) return { name: "scattered_trees", color: "#6A9861" }; // Scattered trees
      if (moisture > 0.25) return { name: "prairie", color: "#91A86E" }; // Prairie
      if (moisture > 0.15) return { name: "savanna", color: "#B4A878" }; // Savanna
      return { name: "dry_savanna", color: "#C2AA71" }; // Dry savanna
    }
    
    // LOWER ELEVATION TERRAIN - expanded variety
    if (height > 0.4) {
      if (moisture > 0.8) return { name: "swamp", color: "#4E6855" }; // Swamp
      if (moisture > 0.7) return { name: "marsh", color: "#5E7959" }; // Marsh
      if (moisture > 0.6) return { name: "wet_grassland", color: "#5F864A" }; // Wet grassland
      if (moisture > 0.5) return { name: "grassland", color: "#6B9850" }; // Grassland
      if (moisture > 0.4) return { name: "meadow", color: "#7BA758" }; // Meadow
      if (moisture > 0.3) return { name: "plains", color: "#9CB568" }; // Plains
      if (moisture > 0.2) return { name: "dry_grassland", color: "#B1B173" }; // Dry grassland
      if (moisture > 0.12) return { name: "arid_plains", color: "#C0A97A" }; // Arid plains
      return { name: "desert_scrub", color: "#CCAD6E" }; // Desert scrub
    }
    
    // LOWEST LANDS - expanded desert types
    if (height > 0.32) {
      if (moisture > 0.8) return { name: "bog", color: "#4D5E50" }; // Bog
      if (moisture > 0.7) return { name: "wetland", color: "#5A6A55" }; // Wetland
      if (moisture > 0.6) return { name: "moor", color: "#657355" }; // Moor
      if (moisture > 0.5) return { name: "lowland", color: "#768355" }; // Lowland
      if (moisture > 0.4) return { name: "dry_plains", color: "#8D9565" }; // Dry plains
      if (moisture > 0.3) return { name: "steppe", color: "#A6A072" }; // Steppe
      if (moisture > 0.2) return { name: "chalky_plains", color: "#C8BC90" }; // Chalky/dusty plains
      if (moisture > 0.1) return { name: "desert", color: "#E8D7A7" }; // Desert
      return { name: "barren_desert", color: "#F0E3B2" }; // Barren desert
    }
    
    // SPECIAL BOTTOM LANDS
    if (moisture > 0.7) return { name: "mudflats", color: "#5F6855" }; // Mudflats
    if (moisture > 0.5) return { name: "delta", color: "#6A7355" }; // Delta
    if (moisture > 0.3) return { name: "salt_flat", color: "#D0C9AA" }; // Salt flat
    return { name: "dry_basin", color: "#E5D6A9" }; // Dry basin
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
