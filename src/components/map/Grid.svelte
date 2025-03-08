<script>
  import { onMount } from "svelte";
  import Legend from "./Legend.svelte";
  import Axes from "./Axes.svelte";
  import Details from "./Details.svelte";
  import { PerlinNoise, getBiome, getTerrainColor } from "../../lib/map/noise.js";

  // Initialize noise generators with fixed seeds
  const WORLD_SEED = 12345; // Fixed world seed
  
  // Create separate noise instances for each terrain aspect
  const continentNoise = new PerlinNoise(WORLD_SEED);
  const heightNoise = new PerlinNoise(WORLD_SEED + 10000);
  const moistureNoise = new PerlinNoise(WORLD_SEED + 20000);
  const detailNoise = new PerlinNoise(WORLD_SEED + 30000);
  const riverNoise = new PerlinNoise(WORLD_SEED + 40000); // New noise for rivers
  const lakeNoise = new PerlinNoise(WORLD_SEED + 50000); // New noise for lakes
  
  // Terrain generation options
  const continentOptions = {
    scale: 0.0008,
    threshold: 0.5,
    edgeScale: 0.003,
    edgeAmount: 0.25,
    sharpness: 3.0
  };
  
  const heightOptions = {
    scale: 0.01,     // Increased for more local variance
    octaves: 6,
    persistence: 0.5,
    lacunarity: 2.2  // Slightly increased for more variation
  };
  
  const moistureOptions = {
    scale: 0.015,    // Increased for more local variance
    octaves: 4,
    persistence: 0.6,
    lacunarity: 2
  };
  
  const detailOptions = {
    scale: 0.08,     // High frequency for small details
    octaves: 2,
    persistence: 0.4,
    lacunarity: 2
  };
  
  // New options for river generation
  const riverOptions = {
    scale: 0.005,
    riverDensity: 0.65,    // Higher values = more rivers
    riverThreshold: 0.78,  // Threshold for river formation
    minContinentValue: 0.4, // Min continent value for rivers (no rivers in ocean)
    riverWidth: 0.7,       // Base river width factor
    noiseFactor: 0.4,      // How much noise affects rivers
    branchFactor: 0.6      // How likely rivers are to branch
  };
  
  // New options for lake generation
  const lakeOptions = {
    scale: 0.003,
    lakeThreshold: 0.83,   // Threshold for lake formation
    minHeight: 0.32,       // Minimum height for lakes (avoid ocean)
    maxHeight: 0.7,        // Maximum height for lakes (avoid mountains)
    minRiverInfluence: 0.3, // Min river value to influence lake formation
    lakeSmoothness: 0.7    // Higher values make lakes more circular
  };
  
  // Position state
  let isDragging = false,
    startX,
    startY;

  // Track the target coordinate at the center of the view
  let targetCoord = { x: 0, y: 0 };

  // Modal state
  let showDetailsModal = false;

  // Add keyboard navigation state
  let keysPressed = new Set();
  let keyboardNavigationInterval = null;
  const KEYBOARD_MOVE_SPEED = 200; // ms between moves

  // Derived position values
  let offsetX = 0,
    offsetY = 0;

  // Map configuration
  let mapElement;
  let cols = 0,
    rows = 0;
  let isReady = false;
  let resizeObserver;

  // Single parameter for tile size (now in em units)
  const tileSize = 7.5; // Changed from 120px to 7.5em

  // Options for axis bars
  const showAxisBars = true;

  // Chunk tracking
  const CHUNK_SIZE = 20; // 20x20 tiles per chunk
  let visibleChunks = new Set(); // Currently visible chunks

  // Calculate grid dimensions and update on resize - now as arrow function
  const resize = () => {
    // Calculate dimensions based on the element's size
    // Convert em to px for calculations using current font size
    const baseFontSize = parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    const tileSizePx = tileSize * baseFontSize;
    const width = mapElement.clientWidth;
    const height = mapElement.clientHeight;

    // Apply the odd number logic inline instead of using a function
    cols = Math.ceil(width / tileSizePx);
    cols = cols % 2 === 0 ? cols - 1 : cols;

    rows = Math.ceil(height / tileSizePx);
    rows = rows % 2 === 0 ? rows - 1 : rows;

    // Update center values
    const centerX = Math.floor(cols / 2);
    const centerY = Math.floor(rows / 2);

    // Update offsets based on target coordinate
    offsetX = centerX + targetCoord.x;
    offsetY = centerY + targetCoord.y;

    // Mark as ready after first calculation
    if (!isReady) isReady = true;
  };

  // Add continuous movement state
  let continuousMoveInterval = null;
  let moveDirection = { x: 0, y: 0 };
  const EDGE_THRESHOLD = 100; // pixels from edge to trigger continuous movement
  const BASE_MOVE_SPEED = 5; // base tiles per second for continuous movement
  const MOVE_INTERVAL = 16; // ms between continuous movement updates (~60fps)
  const MIN_DISTANCE_THRESHOLD = 20; // Minimum pixels from center to trigger movement
  const MAX_SPEED_FACTOR = 2.5; // Maximum speed multiplier at max distance

  // Add a flag to track if mouse is actually down
  let isMouseActuallyDown = false;
  
  // Add a failsafe timer to check the drag state
  let dragStateCheckInterval = null;
  const DRAG_CHECK_INTERVAL = 500; // Check drag state every 500ms

  // Initialize when mounted
  onMount(() => {
    // Set up ResizeObserver for the map element
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mapElement);

    // Initial calculation
    resize();

    // Set up keyboard navigation
    setupKeyboardNavigation();

    // Setup drag state check interval
    dragStateCheckInterval = setInterval(checkDragState, DRAG_CHECK_INTERVAL);

    return () => {
      // Clean up observer on component destruction
      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      // Clean up keyboard navigation
      if (keyboardNavigationInterval) {
        clearInterval(keyboardNavigationInterval);
      }

      // Clean up continuous move interval
      if (continuousMoveInterval) {
        clearInterval(continuousMoveInterval);
      }

      // Clear drag state check interval
      if (dragStateCheckInterval) {
        clearInterval(dragStateCheckInterval);
      }
    };
  });

  // Setup keyboard navigation - converted to arrow function
  const setupKeyboardNavigation = () => {
    // Handle key down - add key to pressed keys
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowleft",
          "arrowdown",
          "arrowright",
        ].includes(key)
      ) {
        keysPressed.add(key);

        // Start interval if not already running
        if (!keyboardNavigationInterval) {
          moveMapByKeys(); // Move immediately on first press
          keyboardNavigationInterval = setInterval(
            moveMapByKeys,
            KEYBOARD_MOVE_SPEED,
          );
        }

        // Prevent default for arrow keys to avoid scrolling the page
        if (key.startsWith("arrow")) {
          event.preventDefault();
        }
      }
    });

    // Handle key up - remove key from pressed keys
    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowleft",
          "arrowdown",
          "arrowright",
        ].includes(key)
      ) {
        keysPressed.delete(key);

        // If no more navigation keys are pressed, stop the interval
        if (keysPressed.size === 0 && keyboardNavigationInterval) {
          clearInterval(keyboardNavigationInterval);
          keyboardNavigationInterval = null;
        }
      }
    });
  };

  // Move map based on current keys pressed - converted to arrow function
  const moveMapByKeys = () => {
    let xChange = 0;
    let yChange = 0;

    // Check for horizontal movement
    if (keysPressed.has("a") || keysPressed.has("arrowleft")) {
      xChange -= 1; // Move left (lower x value)
    }
    if (keysPressed.has("d") || keysPressed.has("arrowright")) {
      xChange += 1; // Move right (higher x value)
    }

    // Check for vertical movement
    if (keysPressed.has("w") || keysPressed.has("arrowup")) {
      yChange -= 1; // Move up (lower y value)
    }
    if (keysPressed.has("s") || keysPressed.has("arrowdown")) {
      yChange += 1; // Move down (higher y value)
    }

    // Apply movement if there is any
    if (xChange !== 0 || yChange !== 0) {
      targetCoord.x -= xChange;
      targetCoord.y -= yChange;

      // Update offsets
      offsetX = centerX + targetCoord.x;
      offsetY = centerY + targetCoord.y;

      // Trigger reactivity
      targetCoord = { ...targetCoord };
    }
  };

  // Helper function to get chunk key from tile coordinates - simplified to single line
  const getChunkKey = (x, y) =>
    `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;

  // Update visible chunks and log changes - simplified version without prevVisibleChunks
  const updateChunks = (gridArray) => {
    // Get chunk keys from all cells using map
    const newChunkKeys = gridArray.map((cell) => getChunkKey(cell.x, cell.y));
    const newVisibleChunks = new Set(newChunkKeys);

    // Find new chunks (in new but not in current)
    Array.from(newVisibleChunks)
      .filter((chunkKey) => !visibleChunks.has(chunkKey))
      .map((chunkKey) => console.log(`Chunk loaded: ${chunkKey}`));

    // Find removed chunks (in current but not in new)
    Array.from(visibleChunks)
      .filter((chunkKey) => !newVisibleChunks.has(chunkKey))
      .map((chunkKey) => console.log(`Chunk unloaded: ${chunkKey}`));

    // Update the visible chunks
    visibleChunks = newVisibleChunks;
  };

  // Enhanced terrain data generation
  const getTerrainData = (x, y) => {
    // Get continent value first (large scale land/water distribution)
    const continent = continentNoise.getContinentValue(x, y, continentOptions);
    
    // Generate base height influenced by continental structure
    const baseHeight = heightNoise.getNoise(x, y, heightOptions);
    
    // Apply continental influence to height
    const continentInfluence = 0.7; // How much continents affect final height
    let height = baseHeight * (1 - continentInfluence) + continent * continentInfluence;
    
    // Add small-scale detail noise
    const detail = detailNoise.getNoise(x, y, detailOptions) * 0.1;
    height = Math.min(1, Math.max(0, height + detail - 0.05));
    
    // Generate moisture independent of continents
    const moisture = moistureNoise.getNoise(x, y, moistureOptions);
    
    // Create a height map function for the river and lake generators to use
    const heightMap = (tx, ty) => {
      const tContinent = continentNoise.getContinentValue(tx, ty, continentOptions);
      const tBaseHeight = heightNoise.getNoise(tx, ty, heightOptions);
      return tBaseHeight * (1 - continentInfluence) + tContinent * continentInfluence;
    };
    
    // Generate river value using the height map for guidance
    const riverValue = riverNoise.getRiverValue(x, y, riverOptions, heightMap);
    
    // Create a river map function for the lake generator to use
    const riverMap = (tx, ty) => riverNoise.getRiverValue(tx, ty, riverOptions, heightMap);
    
    // Generate lake value using both height and river maps
    const lakeValue = lakeNoise.getLakeValue(x, y, lakeOptions, heightMap, riverMap);
    
    // Estimate local slope using neighboring height values
    const heightNE = heightNoise.getNoise(x + 1, y - 1, heightOptions);
    const heightNW = heightNoise.getNoise(x - 1, y - 1, heightOptions);
    const heightSE = heightNoise.getNoise(x + 1, y + 1, heightOptions);
    const heightSW = heightNoise.getNoise(x - 1, y + 1, heightOptions);
    
    const dx = ((heightNE - heightNW) + (heightSE - heightSW)) / 2;
    const dy = ((heightNW - heightSW) + (heightNE - heightSE)) / 2;
    const slope = Math.sqrt(dx * dx + dy * dy);
    
    // Get biome data based on height, moisture and water features
    const biome = getBiome(height, moisture, continent, riverValue, lakeValue);
    
    // Get enhanced terrain color with shading and water features
    const color = getTerrainColor(biome, height, slope, riverValue, lakeValue);
    
    return {
      height,
      moisture,
      continent,
      slope,
      biome,
      color,
      riverValue,
      lakeValue
    };
  };

  // Generate grid array using the x - offsetX, y - offsetY calculation
  $: centerX = Math.floor(cols / 2);
  $: centerY = Math.floor(rows / 2);
  $: gridArray = isReady
    ? Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x) => {
          const globalX = x - offsetX;
          const globalY = y - offsetY;
          const terrain = getTerrainData(globalX, globalY);
          
          return {
            x: globalX,
            y: globalY,
            isCenter: x === centerX && y === centerY,
            height: terrain.height,
            moisture: terrain.moisture,
            biome: terrain.biome,
            color: terrain.color,
            riverValue: terrain.riverValue,
            lakeValue: terrain.lakeValue
          };
        }),
      ).flat()
    : [];

  // React to changes in gridArray by updating chunks
  $: if (isReady && gridArray.length > 0) updateChunks(gridArray);

  // Generate axis coordinate arrays with center cell highlighted
  $: xAxisArray = isReady
    ? Array.from({ length: cols }, (_, x) => {
        const globalX = x - offsetX;
        return {
          value: globalX,
          isCenter: x === centerX,
        };
      })
    : [];

  $: yAxisArray = isReady
    ? Array.from({ length: rows }, (_, y) => {
        const globalY = y - offsetY;
        return {
          value: globalY,
          isCenter: y === centerY,
        };
      })
    : [];

  // Failsafe function to check if drag state is consistent
  const checkDragState = () => {
    // If mouse is no longer down but we think we're still dragging, stop the drag
    if (!isMouseActuallyDown && isDragging) {
      stopDrag();
    }
  };

  // Update event handlers to track dragging state in the DOM
  const startDrag = (event) => {
    // Set both drag state flags
    isDragging = true;
    isMouseActuallyDown = true;
    
    startX = event.clientX;
    startY = event.clientY;
    mapElement.style.cursor = "grabbing";
    
    // Add a class to the map container to disable hover effects
    if (mapElement) mapElement.classList.add("dragging");
    
    // Start continuous movement immediately
    updateContinuousMove(event);
    
    event.preventDefault();
  };

  const stopDrag = () => {
    // Reset both drag state flags
    isDragging = false;
    isMouseActuallyDown = false;
    
    if (mapElement) {
      mapElement.style.cursor = "grab";
      mapElement.classList.remove("dragging");
    }
    
    // Stop continuous movement
    stopContinuousMove();
  };

  const handleDrag = (event) => {
    if (!isDragging) return;

    // Update continuous movement direction based on new mouse position
    updateContinuousMove(event);
  };

  // Improved continuous movement functions for center-based auto-scrolling
  const updateContinuousMove = (event) => {
    if (!isDragging || !mapElement) return;
    
    // Get map element dimensions and position
    const rect = mapElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate distance from pointer to center
    const distanceX = event.clientX - centerX;
    const distanceY = event.clientY - centerY;
    
    // Calculate normalized direction vector (from center to pointer)
    const length = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
    
    // Initialize movement direction
    moveDirection = { x: 0, y: 0 };
    
    // Only trigger movement if there's a significant distance from center
    if (length > MIN_DISTANCE_THRESHOLD) {
      // Calculate normalized direction
      moveDirection.x = distanceX / length;
      moveDirection.y = distanceY / length;
      
      // Scale speed based on distance from center (farther = faster)
      const maxDistance = Math.min(rect.width, rect.height) / 2;
      const distanceFactor = Math.min(1.0, length / maxDistance);
      
      // Apply non-linear scaling to make control more intuitive
      const speedFactor = Math.pow(distanceFactor, 1.8) * MAX_SPEED_FACTOR;
      
      moveDirection.x *= speedFactor;
      moveDirection.y *= speedFactor;
      
      // Start continuous movement if not already started
      if (!continuousMoveInterval) {
        // Start immediately and then continue on interval
        moveContinuously();
        continuousMoveInterval = setInterval(moveContinuously, MOVE_INTERVAL);
      }
    } else {
      // Stop continuous movement if pointer is too close to center
      stopContinuousMove();
    }
  };
  
  const stopContinuousMove = () => {
    if (continuousMoveInterval) {
      clearInterval(continuousMoveInterval);
      continuousMoveInterval = null;
    }
    moveDirection = { x: 0, y: 0 };
  };
  
  const moveContinuously = () => {
    if (!isDragging) {
      stopContinuousMove();
      return;
    }
    
    // Calculate movement amount based on direction, speed and time
    const moveSpeed = BASE_MOVE_SPEED * (MOVE_INTERVAL / 1000);
    const deltaX = Math.round(moveDirection.x * moveSpeed);
    const deltaY = Math.round(moveDirection.y * moveSpeed);
    
    // Only update if there's actual movement
    if (deltaX !== 0 || deltaY !== 0) {
      // Update the target coordinate
      targetCoord.x += deltaX;
      targetCoord.y += deltaY;
      
      // Update offsets
      offsetX = centerX + targetCoord.x;
      offsetY = centerY + targetCoord.y;
      
      // Trigger reactivity
      targetCoord = { ...targetCoord };
    }
  };

  // Handle legend click event - single line
  const handleOpenDetails = () => (showDetailsModal = true);

  // Add global mouse event handlers for map dragging - single line functions
  const handleGlobalMouseDown = (event) => {
    // Keep track of mouse state globally
    isMouseActuallyDown = true;
  };

  const handleGlobalMouseUp = (event) => {
    // Keep track of mouse state globally
    isMouseActuallyDown = false;
    
    // If we were dragging, stop drag
    if (isDragging) {
      stopDrag();
    }
  };

  const handleGlobalMouseMove = (event) => {
    // Only process drag if mouse is actually down and dragging flag is set
    if (isMouseActuallyDown && isDragging) {
      handleDrag(event);
    } 
    // Failsafe: if mouse is not down but drag flag is still set, clean up
    else if (!isMouseActuallyDown && isDragging) {
      stopDrag();
    }
  };

  // Handle global mouse handler for leaving the window
  const handleGlobalMouseLeave = () => {
    stopContinuousMove();
  };

  // Handle mouse events when focus is lost
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && isDragging) {
      stopDrag();
    }
  };

  // Ensure .dragging class is removed when component updates
  $: if (!isDragging && mapElement && mapElement.classList.contains('dragging')) {
    mapElement.classList.remove('dragging');
  }

  // Add terrain data for the center tile (for Details component)
  let centerTileData = null;
  
  $: {
    // Update center tile data whenever target coordinates change
    if (isReady) {
      centerTileData = getTerrainData(targetCoord.x, targetCoord.y);
    }
  }
</script>

<svelte:window
  on:mousedown={handleGlobalMouseDown}
  on:mouseup={handleGlobalMouseUp}
  on:mousemove={handleGlobalMouseMove}
  on:mouseleave={handleGlobalMouseLeave}
  on:blur={() => stopDrag()}
  on:visibilitychange={handleVisibilityChange}
/>

<div
  class="map-container"
  style="--tile-size: {tileSize}em;"
  class:modal-open={showDetailsModal}>
  <!-- Map takes full space -->
  <div
    class="map"
    bind:this={mapElement}
    on:mousedown={startDrag}
    on:mouseup={stopDrag}
    on:mousemove={handleDrag}
    on:mouseleave={stopDrag}
    role="grid"
    tabindex="0"
    aria-label="Interactive coordinate map. Use WASD or arrow keys to navigate."
  >
    {#if isReady}
      <div
        class="grid main-grid"
        style="--cols: {cols}; --rows: {rows};"
        role="presentation"
      >
        {#each gridArray as cell}
          <div
            class="tile"
            class:center={cell.isCenter}
            role="gridcell"
            aria-label="Coordinates {cell.x},{cell.y}, biome: {cell.biome.name}"
            aria-current={cell.isCenter ? "location" : undefined}
            style="background-color: {cell.color};"
            title="{cell.biome.name} ({cell.x},{cell.y})"
          >
            <span class="coords">{cell.x},{cell.y}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Use Legend component with renamed prop -->
  <Legend x={targetCoord.x} y={targetCoord.y} openDetails={handleOpenDetails} />

  <!-- Use Axes component -->
  {#if showAxisBars && isReady}
    <Axes {xAxisArray} {yAxisArray} {cols} {rows} />
  {/if}

  <!-- Details modal component with enhanced terrain data -->
  <Details 
    x={targetCoord.x} 
    y={targetCoord.y} 
    bind:show={showDetailsModal}
    biome={centerTileData?.biome || { name: "unknown", color: "#808080" }}
    height={centerTileData?.height || 0}
    moisture={centerTileData?.moisture || 0}
    continent={centerTileData?.continent || 0}
    slope={centerTileData?.slope || 0}
    riverValue={centerTileData?.riverValue || 0}
    lakeValue={centerTileData?.lakeValue || 0}
    displayColor={centerTileData?.color || "#808080"}
  />
</div>

<style>
  .map-container {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--color-dark-blue);
    user-select: none;
  }

  /* Map takes full container space */
  .map {
    width: 100%;
    height: 100%;
    cursor: grab;
    overflow: hidden;
    box-sizing: border-box;
    background: linear-gradient(
      135deg,
      var(--color-dark-navy),
      var(--color-dark-blue)
    );
  }

  .grid {
    display: grid;
    box-sizing: border-box;
  }

  .main-grid {
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-template-rows: repeat(var(--rows), 1fr);
    width: 100%;
    height: 100%;
  }

  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0.05em solid rgba(0, 0, 0, 0.1);
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 1.2em;
    color: rgba(255, 255, 255, 0.7);
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    transition: filter 0.1s ease-in-out, transform 0.1s ease-in-out;
  }

  /* Hover effect only applies when NOT dragging */
  .map:not(.dragging) .tile:hover {
    z-index: 2;
    filter: brightness(1.2);
  }

  /* Enhanced center tile styling */
  .center {
    z-index: 3;
    position: relative;
    filter: brightness(1.1);
    border: 0.12em solid rgba(255, 255, 255, 0.5) !important;
    box-shadow: 
      inset 0 0 0.5em rgba(255, 255, 255, 0.3),
      0 0 1em rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }

  /* Create a subtle pulsing animation for the center tile */
  @keyframes pulse {
    0% { box-shadow: inset 0 0 0.5em rgba(255, 255, 255, 0.3), 0 0 1em rgba(255, 255, 255, 0.2); }
    50% { box-shadow: inset 0 0 0.8em rgba(255, 255, 255, 0.4), 0 0 1.5em rgba(255, 255, 255, 0.3); }
    100% { box-shadow: inset 0 0 0.5em rgba(255, 255, 255, 0.3), 0 0 1em rgba(255, 255, 255, 0.2); }
  }

  .center {
    animation: pulse 2s infinite ease-in-out;
  }

  .coords {
    font-size: 0.7em;
    opacity: 0.6;
  }

  .map-container.modal-open {
    cursor: grab;
  }

  .map-container.modal-open .map {
    pointer-events: all; /* Ensure map still receives pointer events when modal is open */
  }
</style>
