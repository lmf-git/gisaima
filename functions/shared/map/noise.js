// Implementation of Simplex Noise - more efficient than Perlin or Worley
// Adapted for terrain generation with height and moisture maps

export class SimplexNoise {
  constructor(seed) {
    this.seed = seed || Math.random();
    
    // Initialize permutation table with seed - optimized to use single Uint8Array allocation
    const p = new Uint8Array(512);
    
    // Fill first half with values from 0 to 255
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    
    // Optimize the RNG creation - simplified and faster
    const rand = this.createRNG(this.seed);
    
    // Shuffle using Fisher-Yates algorithm - optimized to avoid extra array creation
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]]; // Swap elements
    }
    
    // Copy to second half for faster lookup (avoids modulo operations later)
    for (let i = 0; i < 256; i++) {
      p[i + 256] = p[i];
    }
    
    this.perm = p;
    
    // Pre-calculate permutation modulo 12 once - faster than calculating on each noise lookup
    this.perm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm12[i] = p[i] % 12;
    }
    
    // Define gradient vectors inline - optimized using typed array for better performance
    this.grad3 = [
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [1, 0], [-1, 0], [0, 1], [0, -1]
    ];
    
    // Cache for getFBM results - significantly reduces redundant calculations
    this.fbmCache = new Map();
    this.fbmCacheHits = 0;
    this.fbmCacheMisses = 0;
    this.fbmMaxCacheSize = 2048; // Limit cache size
    
    // Precomputed constants for better performance
    this.F2 = 0.5 * (Math.sqrt(3) - 1);
    this.G2 = (3 - Math.sqrt(3)) / 6;
  }
  
  // Optimized RNG function - simpler and faster
  createRNG(seed) {
    const s = Math.sin(seed) * 10000;
    return function() {
      const x = Math.sin(seed++) * s;
      return x - Math.floor(x);
    };
  }
  
  // Optimized 2D simplex noise with reduced branching and calculations
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
    
    // Determine which simplex we're in - reduced branching
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    
    // Calculate coords of other corners - combined calculations
    const x1 = x0 - i1 + this.G2;
    const y1 = y0 - j1 + this.G2;
    const x2 = x0 - 1 + 2 * this.G2;
    const y2 = y0 - 1 + 2 * this.G2;
    
    // Calculate corner contributions - optimized with combined calculations
    // Corner 1
    let n0 = 0;
    let t0 = 0.5 - x0*x0 - y0*y0;
    if (t0 > 0) {
      // Ensure index is within bounds and safe
      const ii = i & 255;
      const jj = j & 255;
      const gi0 = this.perm12[(ii + this.perm[jj]) & 255] % this.grad3.length;
      t0 *= t0;
      n0 = t0 * t0 * this.dot(this.grad3[gi0], x0, y0);
    }
    
    // Corner 2
    let n1 = 0;
    let t1 = 0.5 - x1*x1 - y1*y1;
    if (t1 > 0) {
      // Ensure index is within bounds and safe
      const ii = (i + i1) & 255;
      const jj = (j + j1) & 255;
      const gi1 = this.perm12[(ii + this.perm[jj]) & 255] % this.grad3.length;
      t1 *= t1;
      n1 = t1 * t1 * this.dot(this.grad3[gi1], x1, y1);
    }
    
    // Corner 3
    let n2 = 0;
    let t2 = 0.5 - x2*x2 - y2*y2;
    if (t2 > 0) {
      // Ensure index is within bounds and safe
      const ii = (i + 1) & 255;
      const jj = (j + 1) & 255;
      const gi2 = this.perm12[(ii + this.perm[jj]) & 255] % this.grad3.length;
      t2 *= t2;
      n2 = t2 * t2 * this.dot(this.grad3[gi2], x2, y2);
    }
    
    // Add contributions, scaled to return value in the range [-1,1]
    return 70.0 * (n0 + n1 + n2);
  }
  
  // Safer dot product - add null check and bounds checking
  dot(g, x, y) {
    // Safety check for undefined gradient vector
    if (!g) return 0;
    
    // Ensure we have the expected array elements
    const gx = Array.isArray(g) && g.length > 0 ? g[0] : 0;
    const gy = Array.isArray(g) && g.length > 1 ? g[1] : 0;
    
    return gx * x + gy * y;
  }
  
  // Optimized and cached fBM implementation for better terrain variation
  getFBM(x, y, options = {}) {
    // Round coordinates slightly to improve cache hits
    const rx = Math.round(x * 100) / 100;
    const ry = Math.round(y * 100) / 100;
    
    // Create cache key - include essential options that affect output
    const {
      scale = 0.005,
      octaves = 6,
      persistence = 0.5,
      lacunarity = 2,
      amplitude = 1,
      frequency = 1,
      ridged = false
    } = options;
    
    const cacheKey = `${rx},${ry},${scale},${octaves},${persistence},${lacunarity},${ridged ? 1 : 0}`;
    
    // Return from cache if available
    const cached = this.fbmCache.get(cacheKey);
    if (cached !== undefined) {
      this.fbmCacheHits++;
      return cached;
    }
    
    this.fbmCacheMisses++;
    
    // Calculate FBM using optimized accumulation approach
    let value = 0;
    let amp = amplitude;
    let freq = frequency;
    let maxValue = 0;
    
    // Optimize octave calculation with loop unrolling for common cases
    if (octaves <= 3 && !ridged) {
      // Fast path for 1-3 octaves (common case)
      let noiseVal, octaveValue;
      
      // Octave 1
      noiseVal = this.noise2D(rx * freq * scale, ry * freq * scale);
      octaveValue = (noiseVal * 0.5) + 0.5;
      value += amp * octaveValue;
      maxValue += amp;
      
      if (octaves >= 2) {
        // Octave 2
        amp *= persistence;
        freq *= lacunarity;
        noiseVal = this.noise2D(rx * freq * scale, ry * freq * scale);
        octaveValue = (noiseVal * 0.5) + 0.5;
        value += amp * octaveValue;
        maxValue += amp;
        
        if (octaves >= 3) {
          // Octave 3
          amp *= persistence;
          freq *= lacunarity;
          noiseVal = this.noise2D(rx * freq * scale, ry * freq * scale);
          octaveValue = (noiseVal * 0.5) + 0.5;
          value += amp * octaveValue;
          maxValue += amp;
        }
      }
    } else {
      // Standard path for more octaves or ridged noise
      for(let i = 0; i < octaves; i++) {
        const noiseVal = this.noise2D(rx * freq * scale, ry * freq * scale);
        
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
    }
    
    // Normalize and cache result
    const result = value / maxValue;
    
    // Manage cache size to prevent memory leaks
    if (this.fbmCache.size >= this.fbmMaxCacheSize) {
      // Clear 1/4 of the cache when it gets too large
      const deleteCount = Math.floor(this.fbmMaxCacheSize / 4);
      let i = 0;
      for (const key of this.fbmCache.keys()) {
        this.fbmCache.delete(key);
        i++;
        if (i >= deleteCount) break;
      }
    }
    
    this.fbmCache.set(cacheKey, result);
    return result;
  }
  
  // Simplified getNoise - directly uses getFBM for all noise generation
  getNoise(x, y, options = {}) {
    return this.getFBM(x, y, options);
  }

  // Enhanced river generation with better natural flowS AND IS NOT DUPLICATED
  getRiverValue(x, y, options = {}, heightMap = null) {
    if (!heightMap) return 0;

    const {
      scale = 0.003,
      riverDensity = 1.8,         // Updated from 1.6
      riverThreshold = 0.48,      // Updated from 0.5
      minContinentValue = 0.2,
      riverWidth = 1.0,
      flowDirectionality = 0.95,
      arterialRiverFactor = 0.75,
      waterLevel = 0.32,
      ridgeSharpness = 2.5,
      lakeInfluence = 0.7,        // Updated from 0.65
      branchingFactor = 0.8,      // Updated from 0.7
      streamFrequency = 0.75,     // Updated from 0.6
      flowConstraint = 0.75,
      mountainSourceFactor = 0.9, // Updated from 0.7
      tributaryFactor = 0.65,     // NEW parameter
      highlandSpringFactor = 0.7,  // NEW parameter
      networkConnectivity = 0.7  // NEW parameter
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
    
    // NEW: Generate additional noise for river tributaries and springs
    const tributaryNoise = this.getFBM(x * 2.2 + 10500, y * 2.2 + 10500, {
      scale: scale * 1.2,
      octaves: 2,
      persistence: 0.5,
      lacunarity: 2.0
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
    
    // ENHANCEMENT: Expanded mountain river sources - now includes highland springs
    // High elevation + sufficient gradient = potential river source (mountain streams)
    const isMountainSource = heightValue > 0.82 && gradMag > 0.025; 
    
    // NEW: Highland springs - add water sources in high plateaus even with less gradient
    const isHighlandSpring = !isMountainSource && 
                            heightValue > 0.65 && 
                            heightValue < 0.82 && 
                            tributaryNoise > (1 - highlandSpringFactor);
    
    // Calculate source bonus for both mountains and highlands
    const mountainSourceBonus = isMountainSource ? 
      (heightValue - 0.82) * 5 * mountainSourceFactor * Math.min(1.0, gradMag * 10) : 0;
      
    const highlandSpringBonus = isHighlandSpring ? 
      (heightValue - 0.65) * 2 * highlandSpringFactor * Math.min(0.8, gradMag * 12) : 0;
    
    // Only allow river formation if there's sufficient slope, a defined channel, or we're at a source
    if (gradMag < 0.015 && riverRidgeNoise > 0.55 && heightDrop < 0.01 && 
        !isMountainSource && !isHighlandSpring) {
      return 0;  // Not enough gradient for water flow
    }
    
    // Calculate flow factor - higher on steep slopes
    const flowFactor = Math.min(1.0, gradMag * 10);
    
    // IMPORTANT: Water must flow downhill unless it's a source
    // Exception: source points can create rivers
    if (heightDrop <= 0 && heightValue > waterLevel + 0.05 && 
        !isMountainSource && !isHighlandSpring && gradMag < 0.03) {
      return 0;  // Water doesn't flow uphill unless at a source
    }
    
    // Sample nearby water bodies with wider radius to detect ocean influence
    const sampleRadius = 5;  // Increased from 4 to detect water bodies better
    let nearWater = false;
    let waterDirection = { x: 0, y: 0 };
    let waterNetwork = 0;
    let nearOcean = false;
    let nearLake = false;
    let nearRiver = false;
    
    // NEW: Check for existing rivers in a smaller radius for tributaries
    const tributaryRadius = 3;
    let hasNearbyRiver = false;
    let nearbyRiverDirection = { x: 0, y: 0 };
    let nearbyRiverDist = tributaryRadius + 1;
    
    // Check surrounding points for water bodies and tributaries
    for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
      for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > sampleRadius) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        const neighborHeight = heightMap(nx, ny);
        
        // For tributaries - check neighboring tiles for rivers at close range
        if (dist <= tributaryRadius) {
          // This would need a broader river detection approach than just checking height
          // For simplicity, we use various factors later to estimate river presence
        }
        
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
    
    // NEW: Calculate tributary influence
    const tributaryInfluence = hasNearbyRiver ? 
      tributaryFactor * (1 - (nearbyRiverDist / tributaryRadius)) : 0;
    
    // NEW: Enhanced river formation with tributaries
    // Combine gradient with water influence for more natural channels
    let finalGradX = dx;
    let finalGradY = dy;
    
    if (nearWater) {
      // Blend with water direction but constrain influence
      const waterFactor = nearOcean ? lakeInfluence * 1.2 : lakeInfluence * 0.7;
      finalGradX = dx * (1 - waterFactor) + waterDirection.x * waterFactor;
      finalGradY = dy * (1 - waterFactor) + waterDirection.y * waterFactor;
    } 
    else if (hasNearbyRiver && tributaryNoise > 0.5 && heightValue > waterLevel + 0.1) {
      // Add tributary direction influence
      finalGradX = dx * 0.7 + nearbyRiverDirection.x * 0.3;
      finalGradY = dy * 0.7 + nearbyRiverDirection.y * 0.3;
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
    riverValue += heightDrop * flowDirectionality * 2.8; // Increased from 2.5
    
    // Add source bonuses - creates rivers starting from mountains and highlands
    riverValue += mountainSourceBonus;
    riverValue += highlandSpringBonus;
    
    // Generate branching streams with more constraint
    const branchingNoise = this.getFBM(x * 1.7 + 9000, y * 1.7 + 9000, {
      scale: scale * 1.2,
      octaves: 2,
      persistence: 0.6
    });
    
    // Add branching streams where terrain supports it - now includes highland support
    if (branchingNoise > (1 - branchingFactor) && 
        (heightDrop > 0.015 || isMountainSource || isHighlandSpring)) {
      riverValue += branchingNoise * branchingFactor * 0.7; // Increased from 0.6
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
      
      // NEW: Larger arterial rivers generate more tributaries
      if (tributaryNoise > (1 - tributaryFactor) && heightValue > waterLevel + 0.05) {
        riverValue += arterialRiverFactor * tributaryFactor * 0.3;
      }
    }
    
    // NEW: Add tributary bonus
    riverValue += tributaryInfluence * 0.4;
    
    // Apply constraint to prevent rivers from spreading too widely
    riverValue *= Math.min(1.0, flowFactor * flowConstraint + (1 - flowConstraint));
    
    // Apply density scaling with network factor from constants
    riverValue *= riverDensity * (TERRAIN_OPTIONS.constants.riverNetworkFactor || 0.7);
    
    // Threshold with variable ratio
    const effectiveThreshold = nearWater ? riverThreshold * 0.75 : // More likely near water
                               isMountainSource ? riverThreshold * 0.8 : 
                               isHighlandSpring ? riverThreshold * 0.85 :
                               riverThreshold;
    
    // Generate water network noise
    const waterNetworkNoise = this.getFBM(x * 0.75 + 12500, y * 0.75 + 12500, {
      scale: 0.003,
      octaves: 2,
      persistence: 0.6,
      lacunarity: 1.8
    });
    
    // Use water network to boost rivers in network areas
    const networkBoost = waterNetworkNoise > 0.6 ? 
      (waterNetworkNoise - 0.6) * networkConnectivity * 0.6 : 0;
    
    // Add water network boost for more interconnected waterways
    riverValue += networkBoost;
    
    // Final output with enhanced river mouth deltas - but narrower
    if (riverValue > effectiveThreshold) {
      // Special case for river mouths meeting ocean - create deltas but narrower
      let widthModifier = 0;
      
      if (nearOcean && heightValue > waterLevel - 0.05 && heightValue < waterLevel + 0.1) {
        // River delta/mouth is narrower where rivers meet ocean
        widthModifier = 0.8 - (gradMag * 4);  // Reduced from 1.0 to make deltas narrower
        widthModifier = Math.max(0.35, widthModifier);  // Reduced from 0.45
      }
      else {
        // Standard width scaling based on terrain - reduced
        widthModifier = isMountainSource ? 
                        (1.0 - heightValue) * 0.2 + 0.15 : // Reduced from 0.25 + 0.2
                        (1.0 - heightValue) * 0.25 + 0.2;  // Reduced from 0.3 + 0.3
                        
        // Add an extra modifier for small streams to make them even narrower
        if (riverValue <= effectiveThreshold + 0.10) {
          widthModifier *= 0.3; // Reduced from 0.4 to make streams significantly narrower
        }
        else if (riverValue <= effectiveThreshold + 0.18) {
          widthModifier *= 0.5; // Reduced from 0.6 to make medium streams narrower
        }
      }
      
      // Enhance width for network areas
      if (networkBoost > 0) {
        widthModifier *= (1 + networkBoost * 0.8);
      }
      
      const waterProximityBonus = nearWater ? 1.2 : 1.0;
      const arterialBonus = isArterial ? 1.4 : 1.0;
      const effectiveWidth = riverWidth * widthModifier * waterProximityBonus * arterialBonus;
      
      return Math.min(0.95, (riverValue - effectiveThreshold) * effectiveWidth);
    }
    
    return 0;
  }

  // Enhanced lake detection with better river connectivity
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
    
    // Check for nearby rivers or water - expanded for better river-lake connectivity
    const riverInfluence = riverMap ? riverMap(x, y) : 0;
    let nearbyRiverAmount = 0;
    
    // NEW: Enhanced check for river connectivity - check wider area
    if (riverMap && localHeight >= minHeight && localHeight <= maxHeight) {
      const riverCheckRadius = 3;  // Check for nearby rivers in a wider radius
      
      for (let dy = -riverCheckRadius; dy <= riverCheckRadius; dy++) {
        for (let dx = -riverCheckRadius; dx <= riverCheckRadius; dx++) {
          if (dx === 0 && dy === 0) continue;
          
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > riverCheckRadius) continue;
          
          // Get river value at this position
          const nx = x + dx;
          const ny = y + dy;
          const riverValue = riverMap(nx, ny);
          
          // Accumulate river influence with distance falloff
          if (riverValue > 0.15) {  // Only consider substantial rivers
            nearbyRiverAmount += riverValue * (1 - dist/riverCheckRadius) * 1.5;
          }
        }
      }
    }
    
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
    
    // Main lake formation - enhanced with better river-lake connections
    const lakeValue = 
      (lakeShape * lakeSmoothness + (1 - lakeSmoothness)) * 
      (isDepression ? 1.5 : 0.5) * 
      (flatnessFactor > 0 ? flatnessFactor : 0) * 
      // Modified river influence to create lakes along river paths
      (riverInfluence > minRiverInfluence || nearbyRiverAmount > 0.3 ? 1.4 : 0.8) * 
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
  
  // Add missing capillary stream generation method
  getCapillaryStreamValue(x, y, options = {}, heightMap = null) {
    if (!heightMap) return 0;

    const {
      scale = 0.006,
      density = 1.6,
      threshold = 0.75,
      minHeight = 0.33,
      maxHeight = 0.85,
      waterLevel = 0.31,
      connectivityFactor = 0.85,
      thinnessFactor = 0.12
    } = options;
    
    // Get height at this position
    const heightValue = heightMap(x, y);
    
    // Skip if outside valid height range or in water
    if (heightValue < minHeight || heightValue > maxHeight || heightValue < waterLevel) {
      return 0;
    }
    
    // Generate capillary noise with higher frequency for finer details
    const capillaryNoise = this.getFBM(x * 1.5 + 15000, y * 1.5 + 15000, {
      scale: scale * 1.3,
      octaves: 2,
      persistence: 0.5,
      lacunarity: 2.3,
      ridged: true
    });
    
    // Calculate neighborhood heights for gradient
    const heightN = heightMap(x, y - 1);
    const heightS = heightMap(x, y + 1);
    const heightE = heightMap(x + 1, y);
    const heightW = heightMap(x - 1, y);
    
    // Calculate basic gradient - simpler than river calculation
    const dx = heightW - heightE;
    const dy = heightN - heightS;
    const gradMag = Math.sqrt(dx * dx + dy * dy);
    
    // Find height drop to lowest neighbor
    const lowestHeight = Math.min(heightN, heightS, heightE, heightW);
    const heightDrop = heightValue - lowestHeight;
    
    // Early exit if no downhill flow possible
    if (heightDrop <= 0 && heightValue > waterLevel + 0.03) {
      return 0;
    }
    
    // Calculate connectivity factor based on noise coherence
    const connNoise = this.getFBM(x * 2.5 + 20000, y * 2.5 + 20000, {
      scale: scale * 2,
      octaves: 1,
      persistence: 0.5
    });
    
    // Calculate stream value - stronger where there's good gradient and connected noise
    let streamValue = (1.0 - capillaryNoise) * (1.0 + gradMag * 5) * connNoise;
    
    // Apply height drop bonus - more streams in areas with good drainage
    streamValue += heightDrop * 1.5;
    
    // Scale by density
    streamValue *= density;
    
    // Apply threshold with connectivity factor
    const effectiveThreshold = threshold * (1.0 - connectivityFactor * (connNoise - 0.5));
    
    // Return scaled value if above threshold - with reduced width
    if (streamValue > effectiveThreshold) {
      // Apply thinness factor - reduced for thinner streams
      const widthFactor = thinnessFactor * (0.8 + (heightValue - minHeight) * 0.4); // Reduced overall factor
      
      return Math.min(0.15, (streamValue - effectiveThreshold) * widthFactor); // Reduced cap from 0.2 to 0.15
    }
    
    return 0;
  }
  
  // Optimized getContinentValue - reduced calculations
  getContinentValue(x, y, options = {}) {
    const {
      scale = 0.001,
      threshold = 0.48,
      edgeScale = 0.003,
      edgeAmount = 0.25,
      sharpness = 1.8
    } = options;
    
    // Cache continent values since they're used repeatedly
    const cacheKey = `continent_${x},${y}`;
    const cached = this.fbmCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    
    // Combine calculations to reduce noise function calls
    const baseNoise = this.getNoise(x, y, {
      scale,
      octaves: 3,
      persistence: 0.5,
      lacunarity: 2.0
    });
    
    const edgeNoise = this.getNoise(x + 1000, y + 1000, {
      scale: edgeScale,
      octaves: 2,
      persistence: 0.6,
      lacunarity: 2.0
    });
    
    // Apply edge noise to base continents
    const combinedValue = baseNoise + (edgeNoise * edgeAmount) - edgeAmount/2;
    
    // Use optimized sigmoid function
    const result = 1 / (1 + Math.exp(-sharpness * (combinedValue - threshold)));
    
    // Cache result for future use
    this.fbmCache.set(cacheKey, result);
    return result;
  }

  // Water network generator to connect bodies of water
  getWaterNetworkValue(x, y, options = {}, heightMap = null) {
    if (!heightMap) return 0;
    
    const {
      scale = 0.002,
      octaves = 2,
      channelThreshold = 0.65,
      connectionWidth = 0.8,
      connectionFactor = 0.85,
      avoidMountainsStrength = 0.8
    } = options;
    
    // Get height at this position
    const heightValue = heightMap(x, y);
    const waterLevel = TERRAIN_OPTIONS.constants.waterLevel;
    
    // Early exit for water or very high terrain
    if (heightValue < waterLevel || heightValue > 0.85) return 0;
    
    // Generate noise for potential water network pathways 
    // Use a lower frequency and different seed to create longer coherent paths
    const networkNoise = this.getFBM(x * 0.6 + 30000, y * 0.6 + 30000, {
      scale: scale * 0.5,
      octaves: 2,
      persistence: 0.7,
      lacunarity: 2.0,
      ridged: true
    });
    
    // Generate directional flow fields to guide water
    const flowFieldX = this.getFBM(x * 0.7 + 40000, y * 0.7 + 40000, {
      scale: scale * 0.7,
      octaves: 1,
      persistence: 0.5
    }) * 2 - 1; // Range -1 to 1
    
    const flowFieldY = this.getFBM(x * 0.7 + 50000, y * 0.7 + 50000, {
      scale: scale * 0.7,
      octaves: 1,
      persistence: 0.5
    }) * 2 - 1; // Range -1 to 1
    
    // Calculate field strength
    const fieldStrength = Math.sqrt(flowFieldX * flowFieldX + flowFieldY * flowFieldY);
    
    // Calculate neighborhood heights for connectability assessment
    const heightN = heightMap(x, y - 1);
    const heightS = heightMap(x, y + 1);
    const heightE = heightMap(x + 1, y);
    const heightW = heightMap(x - 1, y);
    const nearWater = heightN < waterLevel || heightS < waterLevel || 
                      heightE < waterLevel || heightW < waterLevel;
    
    // Check for water bodies in a wider area
    let waterBodyDistance = 100;
    let foundWaterBody = false;
    const waterCheckRadius = 10;
    
    for (let dy = -waterCheckRadius; dy <= waterCheckRadius && !foundWaterBody; dy++) {
      for (let dx = -waterCheckRadius; dx <= waterCheckRadius && !foundWaterBody; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > waterCheckRadius) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        const neighborHeight = heightMap(nx, ny);
        
        if (neighborHeight < waterLevel) {
          foundWaterBody = true;
          if (dist < waterBodyDistance) {
            waterBodyDistance = dist;
          }
        }
      }
    }
    
    // Water proximity attraction factor - stronger near existing water bodies
    const waterProximityFactor = foundWaterBody ? 
      Math.max(0, (waterCheckRadius - waterBodyDistance) / waterCheckRadius) : 0;
    
    // Check uphill and downhill to detect valleys
    let valley = false;
    const valleyCheckDistance = 3;
    
    // Check for lower terrain in gradient direction
    let hasLowerTerrain = false;
    const gradientDir = { 
      x: flowFieldX / Math.max(0.01, fieldStrength),
      y: flowFieldY / Math.max(0.01, fieldStrength)
    };
    
    // Check terrain in gradient direction
    for (let d = 1; d <= 3; d++) {
      const checkX = Math.round(x + gradientDir.x * d);
      const checkY = Math.round(y + gradientDir.y * d);
      const checkHeight = heightMap(checkX, checkY);
      
      if (checkHeight < heightValue - 0.02) {
        hasLowerTerrain = true;
        break;
      }
    }
    
    // Terrain factor - avoid mountains and high terrain
    const terrainFactor = Math.max(0, 1 - (heightValue - waterLevel) * avoidMountainsStrength);
    
    // Channel factor - main determinant of water network formation
    let channelValue = (1.0 - networkNoise) * connectionFactor;
    
    // Apply water proximity bonus
    channelValue += waterProximityFactor * 0.3;
    
    // Add valley/gradient bonus
    if (hasLowerTerrain) {
      channelValue += 0.2;
    }
    
    // Apply terrain factor (avoid mountains)
    channelValue *= terrainFactor;
    
    // Final water network value with thresholding
    if (channelValue > channelThreshold) {
      return (channelValue - channelThreshold) * connectionWidth;
    }
    
    return 0;
  }
}

// Export terrain generation options with enhanced biome diversity
export const TERRAIN_OPTIONS = {
  // Continent generation options - reduce sea/ocean size
  continent: {
    scale: 0.0003,
    threshold: 0.66,       // Increased from 0.61 to reduce ocean size
    edgeScale: 0.0025,     // Increased from 0.002 for more detailed coastlines
    edgeAmount: 0.45,      // Increased from 0.40 for stronger coastal variation
    sharpness: 2.2         // Increased from 2.0 for more defined coastlines
  },
  
  // NEW: Add regional variation layer for large-scale patterns
  region: {
    scale: 0.0003,       // Very large scale for regional differences
    octaves: 2,          // Fewer octaves for smoother regional transitions
    influence: 0.30,      // Increased from 0.25 for stronger regional differences
    moistureInfluence: 0.4 // Stronger influence on moisture for distinct biome regions
  },
  
  // Height map options with adjusted parameters for more mountains
  height: {
    scale: 0.0038,          // Reduced from 0.0042 for larger formations
    octaves: 5,             // Increased from 4 for more detailed mountain ridges
    persistence: 0.68,      // Increased from 0.62 for more height variation
    lacunarity: 2.2         // Increased from 2.0 for sharper peaks
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
  
  // River generation options - enhanced for deeper penetration and branching
  river: {
    scale: 0.0022,
    riverDensity: 2.2,         // Increased from 1.8 for more extensive river networks
    riverThreshold: 0.52,      // Increased from 0.48 to create narrower rivers
    minContinentValue: 0.2,
    riverWidth: 0.75,          // Reduced from 1.0 to make rivers narrower
    flowDirectionality: 0.85,  // Reduced from 0.95 to allow more meandering
    arterialRiverFactor: 0.85, // Increased from 0.75 for more main rivers
    waterLevel: 0.31,
    ridgeSharpness: 2.5,
    lakeInfluence: 0.7,        // Increased from 0.65 for better river-lake connectivity
    branchingFactor: 0.9,      // Increased from 0.8 for more branches
    streamFrequency: 0.85,     // Increased from 0.75 for more stream coverage
    flowConstraint: 0.75,
    mountainSourceFactor: 0.9,  // Increased from 0.7 to add more mountain sources
    tributaryFactor: 0.85,     // Increased from 0.65 for more tributaries
    highlandSpringFactor: 0.75, // Increased from 0.7
    networkConnectivity: 0.7   // NEW: Controls water network connectivity
  },
  
  // Capillary streams (smallest water features) - more numerous, thinner
  capillary: {
    scale: 0.006,
    density: 1.6,              // Increased from 1.25 to create more capillaries
    threshold: 0.78,           // Increased from 0.75 to create fewer and thinner streams
    minHeight: 0.33,        
    maxHeight: 0.85,        
    waterLevel: 0.31,       
    connectivityFactor: 0.85,
    thinnessFactor: 0.08       // Reduced from 0.12 to make streams thinner
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
  
  // Constants adjusted for better water network
  constants: {
    continentInfluence: 0.70,  // Reduced from 0.75 to allow more terrain variation
    waterLevel: 0.31,        // Slightly reduced water level to expand landmass
    heightBias: 0.10,          // Increased from 0.095 for more elevation overall
    riverErosionFactor: 0.45,  // Increased to create deeper river valleys
    mountainBoost: 0.25,       // Significantly increased from 0.18 for more mountains
    mountainFrequency: 0.65,   // NEW: Controls how often mountains appear
    mountainRangeScale: 0.0015, // NEW: Scale for mountain range formations
    volcanicMountainBlend: 0.3,  // New parameter to control volcano-mountain blending
    // New constant for scorched frequency
    scorchedFrequency: 0.7,     // Reduced frequency from implied 1.0
    regionalVariance: 0.35,    // Increased from 0.3 for more varied regions
    moistureContrast: 1.2,     // New parameter to increase moisture contrast
    riverNetworkFactor: 0.9,    // Increased from 0.7 for more prominent river networks
    forestMountainTransition: 0.55, // NEW: Control elevation increase near forests
    waterNetworkFactor: 0.85,   // NEW: Controls influence of water network noise
    waterSourceDensity: 0.6     // NEW: Controls density of water sources
  },

  // NEW: Add coastal options - wider coastal zones
  coastal: {
    primaryZoneWidth: 0.03,    // Increased from 0.02 for wider beaches
    secondaryZoneWidth: 0.05,  // Increased from 0.03 for wider coastal vegetation
    tertiaryZoneWidth: 0.07,   // NEW: Add a third transition zone for smoother blending
    cliffThreshold: 0.10,      // Slope threshold for coastal cliffs
    variationScale: 0.007      // Increased from 0.005 for more varied shores
  },

  // NEW: Water network settings to connect water bodies
  waterNetwork: {
    scale: 0.002,
    octaves: 2,
    channelThreshold: 0.65,    // Threshold for forming channels
    connectionWidth: 0.8,      // Width of water connections
    connectionFactor: 0.85,    // How likely networks will connect
    avoidMountainsStrength: 0.8 // Avoid high terrain
  },

  // NEW: Anomalous feature settings
  anomaly: {
    threshold: 0.88, // Higher = fewer anomalies (0.88 = ~12% of terrain could have an anomaly)
    mountainHeightBoost: 0.25, // How much isolated mountains rise above surrounding terrain
    rockHeightBoost: 0.08,    // How much rock formations affect height
    mesaHeightBoost: 0.15,    // How much mesa formations affect height
    frequency: 0.012,         // Higher = more localized anomalies
    moistureInfluence: 0.5    // How much moisture affects anomalies
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
    
    // Add performance metrics for optimization tuning
    this.perfMetrics = {
      terrainDataCalls: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
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
  
  // Get terrain data with optimized caching mechanism
  getTerrainData(x, y) {
    // Store current coordinates for use in helper methods
    this.currentX = x;
    this.currentY = y;
    
    this.perfMetrics.terrainDataCalls++;
    
    // Cache key for this position
    const key = `${x},${y}`;
    
    // Check if we've already calculated this position
    const cached = this.heightCache.get(key);
    if (cached) {
      this.perfMetrics.cacheHits++;
      return cached;
    }
    
    this.perfMetrics.cacheMisses++;
    
    // Round debug points to reduce console spam
    const isDebugPoint = (x % 500 === 0) && (y % 500 === 0);
    
    // Calculate continent value first since it's used for early decisions
    const continent = this.continentNoise.getContinentValue(x, y, TERRAIN_OPTIONS.continent);
    
    // Use continent value for early exit if we're in deep ocean
    // This optimization skips a lot of calculation for ocean tiles
    if (continent < 0.08) {
      const deepOceanBiome = { name: "deep_ocean", color: "#0E3B59", rarity: "common" };
      const result = {
        height: 0.2,
        moisture: 1.0,
        continent,
        slope: 0,
        biome: deepOceanBiome,
        isCliff: false,
        isHighCliff: false,
        color: deepOceanBiome.color,
        riverValue: 0,
        lakeValue: 0,
        lavaValue: 0,
        scorchedValue: 0,
        waterNetworkValue: 0, // NEW: Include in result
        rarity: "common"
      };
      
      this.heightCache.set(key, result);
      return result;
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
    
    // NEW: Generate anomaly detection noise for special features
    const anomalyNoise = this.heightNoise.getFBM(x + 45000, y + 45000, {
      scale: 0.012, // Higher scale = more localized anomalies
      octaves: 2,
      persistence: 0.6,
      lacunarity: 2.0
    });
    
    // Determine if this location has an anomalous feature
    const anomalyThreshold = TERRAIN_OPTIONS.anomaly.threshold;
    const hasAnomaly = anomalyNoise > anomalyThreshold;
    
    // Determine specific anomaly type if threshold is exceeded
    let anomalyType = null;
    let anomalyStrength = 0;
    
    if (hasAnomaly) {
      // Calculate strength - how far above threshold
      anomalyStrength = (anomalyNoise - anomalyThreshold) / (1 - anomalyThreshold);
      
      // Use a different noise to determine anomaly type
      const anomalyTypeNoise = this.heightNoise.getFBM(x * 0.7 + 55000, y * 0.7 + 55000, {
        scale: 0.005,
        octaves: 1
      });
      
      // Assign anomaly type based on noise value
      if (anomalyTypeNoise < 0.3) {
        anomalyType = "rocky_outcrop";
      } else if (anomalyTypeNoise < 0.5) {
        anomalyType = "lone_mountain";
      } else if (anomalyTypeNoise < 0.7) {
        anomalyType = "rock_formation";
      } else {
        anomalyType = "mesa_formation";
      }
    }
    
    // Create optimized heightMap function with its own small cache
    const heightMapCache = new Map();
    const heightMap = (tx, ty) => {
      const mapKey = `${tx},${ty}`;
      const cachedHeight = heightMapCache.get(mapKey);
      if (cachedHeight !== undefined) return cachedHeight;
      
      const tContinent = this.continentNoise.getContinentValue(tx, ty, TERRAIN_OPTIONS.continent);
      const tBaseHeight = this.heightNoise.getNoise(tx, ty, TERRAIN_OPTIONS.height);
      
      const h = Math.min(1, Math.max(0, 
        tBaseHeight * (1 - TERRAIN_OPTIONS.constants.continentInfluence) + 
        tContinent * TERRAIN_OPTIONS.constants.continentInfluence +
        TERRAIN_OPTIONS.constants.heightBias
      ));
      
      // Only cache a limited number of nearby points to avoid memory issues
      if (Math.abs(tx - x) < 10 && Math.abs(ty - y) < 10) {
        heightMapCache.set(mapKey, h);
      }
      
      return h;
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

    // NEW: Add height anomaly if an isolated mountain/rock formation was detected
    if (hasAnomaly) {
      if (anomalyType === "lone_mountain" && height > 0.35 && height < 0.7) {
        // Isolated mountain peak - significant height boost, more common in higher elevations
        const baseBoost = TERRAIN_OPTIONS.anomaly.mountainHeightBoost;
        const elevationFactor = Math.min(1.0, height / 0.6); // More effective at higher elevations
        
        // Calculate peak profile with exponential falloff from anomaly center
        const peakBoost = baseBoost * anomalyStrength * elevationFactor;
        height = Math.min(0.95, height + peakBoost);
        
      } else if (anomalyType === "rock_formation") {
        // Rocky terrain - small height boost, affects appearance more than elevation
        const rockBoost = TERRAIN_OPTIONS.anomaly.rockHeightBoost;
        const randomFactor = 0.7 + 0.6 * anomalyStrength; // Add some variability
        height = Math.min(height + rockBoost * randomFactor, 0.9);
        
      } else if (anomalyType === "mesa_formation" && height > 0.4 && height < 0.7) {
        // Mesa formation - flat-topped elevated area
        const mesaBoost = TERRAIN_OPTIONS.anomaly.mesaHeightBoost;
        height = Math.min(0.85, height + mesaBoost * anomalyStrength);
      }
    }
    
    // Apply height bias and mountain boost with strengthened effect
    const mountainNoise = this.heightNoise.getFBM(x + 12000, y + 12000, {
      scale: 0.003,
      octaves: 3,
      persistence: 0.7,  // Increased from 0.65
      lacunarity: 2.3    // Increased from 2.1
    });
    
    // Apply mountain boost with more progressive effect for smoother transitions
    // But also make it significantly stronger overall
    if (mountainNoise > 0.58) {  // Reduced threshold from 0.62
      const mountainEffect = (mountainNoise - 0.58) * 3.2; // Increased multiplier from 2.8
      height = Math.min(1, height + TERRAIN_OPTIONS.constants.mountainBoost * mountainEffect);
    }
    
    // Generate mountain range noise for larger mountain formations
    const mountainRangeNoise = this.heightNoise.getFBM(x * TERRAIN_OPTIONS.constants.mountainRangeScale, 
                                                   y * TERRAIN_OPTIONS.constants.mountainRangeScale, {
      scale: 1.0,
      octaves: 2,
      persistence: 0.6,
      lacunarity: 1.8
    });
    
    // Apply mountain range effect where the noise is high
    const mountainRangeEffect = mountainRangeNoise > 0.65 ? 
      (mountainRangeNoise - 0.65) * 2.5 : 0;
    
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
    
    // NEW: Add forest-mountain transition logic after moisture is calculated
    // Enhance mountain generation above forest areas
    const isForestArea = moisture > 0.65 && height > 0.45 && height < 0.75;
    if (isForestArea) {
      // Generate forest-specific mountain noise
      const forestMountainNoise = this.heightNoise.getFBM(x * 1.5 + 25000, y * 1.5 + 25000, {
        scale: 0.004,
        octaves: 2,
        persistence: 0.6
      });
      
      // Add height to create mountains near forests when the noise is high
      if (forestMountainNoise > 0.7) {
        const forestMountainEffect = (forestMountainNoise - 0.7) * 
          TERRAIN_OPTIONS.constants.forestMountainTransition;
        height = Math.min(1.0, height + forestMountainEffect);
      }
    }
    
    // Optimize river and lake generation by skipping when in certain terrain types
    let riverValue = 0;
    let lakeValue = 0;
    let capillaryValue = 0;
    let waterNetworkValue = 0; // NEW: water network value
    
    // Only calculate water features for non-ocean, non-extremely high mountain regions
    const isWaterFeatureRegion = continent > 0.4 && height > 0.3 && height < 0.92;
    
    if (isWaterFeatureRegion) {
      // Generate river value
      riverValue = this.riverNoise.getRiverValue(x, y, TERRAIN_OPTIONS.river, heightMap);
      
      // Create optimized river map function that uses heightMap cache
      const riverMap = (tx, ty) => {
        // Only check nearby areas to save computation
        if (Math.abs(tx - x) > 10 || Math.abs(ty - y) > 10) return 0;
        return this.riverNoise.getRiverValue(tx, ty, TERRAIN_OPTIONS.river, heightMap);
      };
      
      // Only calculate lakes if not in a river
      if (riverValue < 0.1) {
        lakeValue = this.lakeNoise.getLakeValue(x, y, TERRAIN_OPTIONS.lake, heightMap, riverMap);
      }
      
      // Only calculate capillary streams if no significant water already
      if (riverValue < 0.05 && lakeValue < 0.05) {
        capillaryValue = this.riverNoise.getCapillaryStreamValue(
          x, y, TERRAIN_OPTIONS.capillary, heightMap);
      }
      
      // Add water network calculation if no significant water already
      if (riverValue < 0.15 && lakeValue < 0.15) {
        waterNetworkValue = this.continentNoise.getWaterNetworkValue(x, y, TERRAIN_OPTIONS.waterNetwork, heightMap);
      }
    }
    
    // Only calculate lava for high elevation areas
    let lavaValue = 0;
    if (height > 0.65) {
      lavaValue = this.lavaNoise.getLavaValue(x, y, TERRAIN_OPTIONS.lava, heightMap);
    }
    
    // Only calculate scorched value if relevant
    let scorchedValue = 0;
    if ((lavaValue > 0.05 || height > 0.65) && riverValue < 0.1) {
      scorchedValue = this.riverNoise.calculateScorchedValue(
        x, y, heightMap, lavaValue, riverValue || capillaryValue);
    }
    
    // Optimize slope calculation with fewer samples for non-cliff terrain
    let slope = 0;
    let isCliff = false;
    let isHighCliff = false;
    
    // More efficient slope sampling - only sample additional points if needed
    const heightE = heightMap(x + 1, y);
    const heightW = heightMap(x - 1, y);
    const heightN = heightMap(x, y - 1);
    const heightS = heightMap(x, y + 1);
    
    // Basic slope calculation
    const dx = heightE - heightW;
    const dy = heightN - heightS;
    slope = Math.sqrt(dx * dx + dy * dy);
    
    // Only do detailed cliff calculation if slope is high enough
    if (slope > TERRAIN_OPTIONS.cliffs.threshold * 0.8) {
      // Get additional samples for more accurate cliff detection
      const heightNE = heightMap(x + 1, y - 1);
      const heightNW = heightMap(x - 1, y - 1);
      const heightSE = heightMap(x + 1, y + 1);
      const heightSW = heightMap(x - 1, y + 1);
      
      // More accurate gradient with all 8 surrounding points
      const dxFull = (heightE - heightW) * 0.6 + (heightNE - heightNW + heightSE - heightSW) * 0.2;
      const dyFull = (heightN - heightS) * 0.6 + (heightNW - heightSW + heightNE - heightSE) * 0.2;
      slope = Math.sqrt(dxFull * dxFull + dyFull * dyFull);
      
      // Calculate cliff features
      isCliff = slope > TERRAIN_OPTIONS.cliffs.threshold;
      isHighCliff = isCliff && height > TERRAIN_OPTIONS.cliffs.highElevation;
    }
    
    // Get biome with enhanced parameters including rarity
    const biome = this.getBiome(
      height, moisture, continent, riverValue, lakeValue, lavaValue, 
      slope, scorchedValue, isCliff, isHighCliff, capillaryValue, waterNetworkValue,
      anomalyType, anomalyStrength // Pass anomaly data to getBiome
    );
    
    // Create result with added anomaly information
    const result = { 
      height, moisture, continent, slope, biome, isCliff, isHighCliff,
      color: biome.color, riverValue, lakeValue, lavaValue, scorchedValue,
      waterNetworkValue,
      anomalyType: hasAnomaly ? anomalyType : null, // Include anomaly information
      anomalyStrength: hasAnomaly ? anomalyStrength : 0,
      rarity: biome.rarity
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
  calculateRarity(height, moisture, slope, lavaValue, scorchedValue, isCliff, anomalyBonus = 0) {
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
    
    // Add bonus for anomalous features
    rarityScore += anomalyBonus;
    
    // Determine rarity level based on score
    if (rarityScore > 25) return 'mythic';      // Extremely rare, score > 25
    if (rarityScore > 18) return 'legendary';   // Very rare, score 18-25
    if (rarityScore > 13) return 'epic';        // Quite rare, score 13-18
    if (rarityScore > 8) return 'rare';         // Somewhat uncommon, score 8-13
    if (rarityScore > 4) return 'uncommon';     // Slightly uncommon, score 4-8
    return 'common';                           // Common, score 0-4
  }

  // Updated getBiome method that includes anomaly data
  getBiome(height, moisture, continentValue = 1.0, riverValue = 0, lakeValue = 0, 
           lavaValue = 0, slope = 0, scorchedValue = 0, isCliff = false, isHighCliff = false, 
           capillaryValue = 0, waterNetworkValue = 0, anomalyType = null, anomalyStrength = 0) {
    
    // Get base biome information - PASS ANOMALY DATA to getBaseBiomeInfo
    let baseBiome = this.getBaseBiomeInfo(
      this.currentX, this.currentY, height, moisture, continentValue, 
      riverValue, lakeValue, lavaValue, slope, scorchedValue, 
      isCliff, isHighCliff, capillaryValue, waterNetworkValue, 
      anomalyType, anomalyStrength
    );
    
    // Calculate rarity - boost rarity if this is an anomalous feature
    const anomalyRarityBonus = anomalyType ? 8 : 0; // Significant boost for anomalies
    const rarity = this.calculateRarity(
      height, moisture, slope, lavaValue, scorchedValue, 
      isCliff || isHighCliff, anomalyRarityBonus
    );
    
    // Add rarity to biome object
    return {
      ...baseBiome,
      rarity
    };
  }

  // Base biome classification logic - Updated to use anomaly data
  getBaseBiomeInfo(x, y, height, moisture, continentValue = 1.0, riverValue = 0, lakeValue = 0, 
                  lavaValue = 0, slope = 0, scorchedValue = 0, isCliff = false, 
                  isHighCliff = false, capillaryValue = 0, waterNetworkValue = 0,
                  anomalyType = null, anomalyStrength = 0) {
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
    if (continentValue < 0.08) return { name: "deep_ocean", color: "#0E3B59" }; // Reduced from 0.10
    if (continentValue < 0.19) return { name: "ocean", color: "#1A4F76" };      // Reduced from 0.23
    if (continentValue < 0.30) return { name: "sea", color: "#2D6693" };        // Reduced from 0.36
    
    // COASTAL WATERS
    const waterLevel = TERRAIN_OPTIONS.constants.waterLevel;
    if (height < waterLevel) return { name: "shallows", color: "#5d99b8" };

    // ENHANCED COASTAL TRANSITION ZONES - wider and more varied
    const coastalZoneWidth = TERRAIN_OPTIONS.coastal.primaryZoneWidth;
    // Fix: Use this.continentNoise.getNoise instead of this.getNoise
    const coastVariation = this.continentNoise.getNoise(x * 3 + 7000, y * 3 + 7000, {
      octaves: 2
    }) * 0.015; // Add some noise to the coastal boundary
    
    // Primary coastal zone (beaches, rocky shores) - with slight variation in width
    if (height < waterLevel + coastalZoneWidth + coastVariation) {
      // Check slope to determine if this is a cliff coast
      if (slope > TERRAIN_OPTIONS.coastal.cliffThreshold) {
        return { name: "sea_cliff", color: "#7A736B" };
      }
      
      // Different shore types based on moisture
      if (moisture < 0.4) {
        return { name: "sandy_beach", color: "#E8D7A7" };
      } else if (moisture < 0.7) {
        return { name: "rocky_shore", color: "#A8A095" };
      } else {
        return { name: "marshy_shore", color: "#607A63" };
      }
    }
    
    // Secondary coastal zone (dunes, coastal scrub)
    const secondaryWidth = TERRAIN_OPTIONS.coastal.secondaryZoneWidth;
    if (height < waterLevel + coastalZoneWidth + secondaryWidth + coastVariation) {
      if (moisture < 0.35) {
        return { name: "dunes", color: "#D8CBA0" };
      } else if (moisture < 0.65) {
        return { name: "littoral_scrub", color: "#A8AA80" }; // Renamed from shore_scrub
      } else {
        return { name: "salt_meadow", color: "#75A080" }; // Renamed from shore_meadow
      }
    }
    
    // NEW: Tertiary transition zone for gradual blending to inland biomes
    const tertiaryWidth = TERRAIN_OPTIONS.coastal.tertiaryZoneWidth;
    if (height < waterLevel + coastalZoneWidth + secondaryWidth + tertiaryWidth + coastVariation) {
      if (moisture < 0.3) {
        return { name: "flats", color: "#C0B990" }; // Renamed from strand_plains
      } else if (moisture < 0.6) {
        return { name: "thicket", color: "#94A078" }; // Renamed from strand_scrub
      } else {
        return { name: "grove", color: "#5B8A65" }; // Renamed from strand_woodland
      }
    }

    // RIVER SYSTEM - Adjusted thresholds for narrower features
    // Lakes (largest water bodies) - keep threshold the same but increase detection
    if (lakeValue > 0.25) {
      if (height > 0.7) return { name: "mountain_lake", color: "#3A7FA0" };
      return { name: "lake", color: "#4A91AA" };
    }
    
    // Rivers (medium water bodies) - make them narrower
    if (riverValue > 0.30 && continentValue > 0.2) {  // Increased from 0.25
      if (height > 0.75) return { name: "mountain_river", color: "#4A8FA0" }; 
      return { name: "river", color: "#55AAC5" };
    }
    
    // Streams (small water bodies) - make them narrower and less common
    if (riverValue > 0.20 && continentValue > 0.2) {  // Increased from 0.17
      return { name: "stream", color: "#65B2C0" };
    }
    
    // Make capillary streams even smaller
    if (capillaryValue > 0.04) {  // Increased from 0.03 to make them less common
      return { name: "rivulet", color: "#6AADB6" };
    }
    
    // WATER NETWORK - Add water network channels with priority between rivers and lakes
    if (waterNetworkValue > 0.2) {
      // Scale the color based on depth
      const blueIntensity = Math.min(0.9, 0.7 + waterNetworkValue * 0.3);
      const colorComponent = Math.floor(170 + waterNetworkValue * 40);
      return { 
        name: "water_channel", 
        color: `rgb(${Math.floor(colorComponent * 0.3)},${Math.floor(colorComponent * 0.6)},${colorComponent})` 
      };
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
      
      if (moisture > 0.85) return { name: "ancient_forest", color: "#29543A" }; // Ancient primal forest
      if (moisture > 0.75) return { name: "tropical_rainforest", color: "#306B44" }; // Dense rainforest
      if (moisture > 0.62) return { name: "temperate_forest", color: "#3D7A4D" }; // Temperate forest
      if (moisture > 0.58) return { name: "mountain_transition", color: "#5A7B59" }; // NEW transition biome
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
    
    // Also clear noise FBM caches
    if (this.continentNoise && this.continentNoise.fbmCache) {
      this.continentNoise.fbmCache.clear();
    }
    if (this.heightNoise && this.heightNoise.fbmCache) {
      this.heightNoise.fbmCache.clear();
    }
    if (this.moistureNoise && this.moistureNoise.fbmCache) {
      this.moistureNoise.fbmCache.clear();
    }
    if (this.detailNoise && this.detailNoise.fbmCache) {
      this.detailNoise.fbmCache.clear();
    }
    if (this.riverNoise && this.riverNoise.fbmCache) {
      this.riverNoise.fbmCache.clear();
    }
    if (this.lakeNoise && this.lakeNoise.fbmCache) {
      this.lakeNoise.fbmCache.clear();
    }
    if (this.lavaNoise && this.lavaNoise.fbmCache) {
      this.lavaNoise.fbmCache.clear();
    }
  }
}

// Add a utility function to clear terrain caches
export function clearTerrainCache() {
  if (typeof terrain !== 'undefined' && terrain) {
    terrain.clearCache();
  }
}

// Global variable for terrain access when needed
let terrain;
export { terrain };
