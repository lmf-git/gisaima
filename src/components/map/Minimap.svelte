<script>
  import { onMount, createEventDispatcher } from "svelte";
  import { browser } from "$app/environment";
  import Close from "../icons/Close.svelte";

  // Create a dispatcher for events to parent component
  const dispatch = createEventDispatcher();
  
  // Props
  export let terrain; // TerrainGenerator instance
  export let targetCoord = { x: 0, y: 0 }; // Current center coordinates
  export let mainViewportSize = { cols: 0, rows: 0 }; // Size of main viewport
  export let position = "bottom-right"; // Position on screen
  export let size = "20%"; // Size of minimap

  // Minimap settings
  const tileSize = 0.8; // Tiny tiles
  const scaleFactor = 5; // How many more tiles to show than the main view
  
  // State variables
  let minimapElement;
  let cols = 0, rows = 0;
  let isReady = false;
  let centerX = 0, centerY = 0;
  
  // Local terrain cache - will be shared via globalThis in onMount
  let terrainCache = new Map();
  
  // Get terrain data with improved caching to ensure color stability
  function getCachedTerrainData(x, y) {
    // FIXED: Use consistent integer coordinates - crucial for deterministic terrain
    const intX = Math.floor(x);
    const intY = Math.floor(y);
    
    // Create a key for the cache
    const key = `${intX},${intY}`;
    
    // Return cached value if available
    if (terrainCache.has(key)) {
      return terrainCache.get(key);
    }
    
    // Generate terrain data and cache it with exact same parameters
    const terrainData = terrain.getTerrainData(intX, intY);
    
    // Create a stable copy of the data to ensure consistent rendering
    const stableData = {
      biome: terrainData.biome,
      color: terrainData.color,
      height: terrainData.height,
      moisture: terrainData.moisture,
      continent: terrainData.continent,
      riverValue: terrainData.riverValue,
      lakeValue: terrainData.lakeValue,
      slope: terrainData.slope
    };
    
    // Cache the stable data
    terrainCache.set(key, stableData);
    
    return stableData;
  }
  
  // Calculate minimap dimensions - ENHANCED for better precision
  const resize = () => {
    if (!browser || !minimapElement) return;
    
    const width = minimapElement.clientWidth;
    const height = minimapElement.clientHeight;
    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const tileSizePx = tileSize * baseFontSize;

    cols = Math.ceil(width / tileSizePx);
    cols = cols % 2 === 0 ? cols - 1 : cols;

    rows = Math.ceil(height / tileSizePx);
    rows = rows % 2 === 0 ? rows - 1 : rows;

    centerX = Math.floor(cols / 2);
    centerY = Math.floor(rows / 2);

    if (!isReady) isReady = true;
  };

  // Initialize when mounted
  onMount(() => {
    // Share terrain cache with the main Grid component
    if (globalThis.globalTerrainCache) {
      terrainCache = globalThis.globalTerrainCache;
    } else {
      globalThis.globalTerrainCache = terrainCache;
    }
    
    const resizeObserver = new ResizeObserver(resize);
    if (minimapElement) {
      resizeObserver.observe(minimapElement);
      resize();
    }

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
    };
  });

  // FIXED: Calculate the minimap grid to represent exactly what would be shown on the main map
  // but zoomed out by the scale factor - with improved center alignment
  $: minimapGridArray = isReady
    ? Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x) => {
          // Calculate global position based on minimap position and scale factor
          // This ensures the minimap shows a wider view of the world centered on targetCoord
          const viewX = x - centerX; // Distance from center in minimap tiles
          const viewY = y - centerY;
          
          // Convert to world coordinates using the scale factor
          // CRITICAL FIX: Ensure the center tile EXACTLY matches targetCoord
          const globalX = Math.floor(targetCoord.x) + Math.floor(viewX * scaleFactor);
          const globalY = Math.floor(targetCoord.y) + Math.floor(viewY * scaleFactor);
          
          // Determine if this is the center tile - exactly matches targetCoord
          const isCenter = x === centerX && y === centerY;
          
          // Get cached terrain data for identical coordinates
          const terrainData = getCachedTerrainData(globalX, globalY);
          
          return {
            x: globalX,
            y: globalY,
            gridX: x,
            gridY: y,
            isCenter,
            ...terrainData
          };
        })
      ).flat()
    : [];

  // FIXED: Calculate viewport dimensions first, then use them for the indicator
  $: viewportWidth = isReady ? 
    Math.min(Math.max(mainViewportSize.cols / scaleFactor, 3), cols) : 0;
  
  $: viewportHeight = isReady ? 
    Math.min(Math.max(mainViewportSize.rows / scaleFactor, 3), rows) : 0;

  // Handle individual mini-tile click - FIXED with correct coordinate handling
  function handleTileClick(cell) {
    // Use the exact global coordinates from the cell
    const newCoords = { 
      x: cell.x, 
      y: cell.y 
    };
    
    console.log("Minimap tile clicked at:", newCoords);
    
    // Dispatch event first to ensure parent knows about the change
    dispatch('positionchange', newCoords);
    
    // Then update local state - force a new object to ensure reactivity
    targetCoord = { ...newCoords };
  }
  
  // Improved minimap background click handler with precise coordinate calculation
  const handleMinimapClick = (event) => {
    // For clicks on the minimap container (not directly on tiles)
    if (event.target === minimapElement || !event.target.classList.contains('mini-tile')) {
      const rect = minimapElement.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      
      // Calculate the tile indices
      const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const tileSizePx = tileSize * baseFontSize;
      
      const tileX = Math.floor(clickX / tileSizePx);
      const tileY = Math.floor(clickY / tileSizePx);
      
      // FIXED: Calculate the global coordinates using the same formula as in minimapGridArray
      const viewX = tileX - centerX;
      const viewY = tileY - centerY;
      const globalX = Math.floor(targetCoord.x) + Math.floor(viewX * scaleFactor);
      const globalY = Math.floor(targetCoord.y) + Math.floor(viewY * scaleFactor);
      
      const newCoords = { x: globalX, y: globalY };
      console.log("Minimap background clicked, calculated coordinates:", newCoords);
      
      dispatch('positionchange', newCoords);
      targetCoord = { ...newCoords };
    }
  };
  
  // Handle close button click
  function handleCloseClick(event) {
    // Prevent the click from propagating to the minimap
    event.stopPropagation();
    // Notify parent component to close the minimap
    dispatch('close');
  }
</script>

<div 
  class="minimap-container" 
  class:top-left={position === "top-left"}
  class:top-right={position === "top-right"}
  class:bottom-left={position === "bottom-left"}
  class:bottom-right={position === "bottom-right"}
  style="--minimap-size: {size};"
>
  <!-- Close button -->
  <button 
    class="minimap-close-button" 
    aria-label="Close minimap"
    on:click={handleCloseClick}
  >
    <Close 
      size="0.8em" 
      color="white" 
      class="minimap-close-icon"
    />
  </button>
  
  <div 
    class="minimap"
    bind:this={minimapElement}
    style="--tile-size: {tileSize}em; --cols: {cols}; --rows: {rows};"
    on:click={handleMinimapClick}
  >
    {#if isReady}
      <div class="grid" role="presentation">
        {#each minimapGridArray as cell}
          <div
            class="mini-tile"
            class:center={cell.isCenter}
            style="background-color: {cell.color};"
            on:click|stopPropagation={() => handleTileClick(cell)}
            title="{cell.biome.name} ({cell.x},{cell.y})"
            data-x={cell.x}
            data-y={cell.y}
          ></div>
        {/each}
      </div>
      
      <!-- FIXED: Enhanced viewport indicator with more precise positioning -->
      <div 
        class="viewport-indicator"
        style="
          width: {viewportWidth * tileSize}em;
          height: {viewportHeight * tileSize}em;
          left: {(centerX - viewportWidth/2) * tileSize}em;
          top: {(centerY - viewportHeight/2) * tileSize}em;
        "
        title="Current view area"
      ></div>
    {/if}
  </div>
</div>

<style>
  .minimap-container {
    position: absolute;
    width: var(--minimap-size);
    height: var(--minimap-size);
    background: rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    z-index: 100;
    overflow: hidden;
  }
  
  /* Close button styling */
  .minimap-close-button {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    z-index: 101;
    opacity: 0.7;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  
  .minimap-close-button:hover {
    opacity: 1;
    transform: scale(1.1);
  }
  
  /* Icon-specific styling moved from Close component to here */
  .minimap-close-icon {
    display: inline-block;
    vertical-align: middle;
    transition: transform 0.15s ease;
  }
  
  .minimap-close-button:hover .minimap-close-icon {
    transform: scale(1.1);
  }
  
  /* Positioning classes */
  .top-left {
    top: 10px;
    left: 10px;
  }
  
  .top-right {
    top: 10px;
    right: 10px;
  }
  
  .bottom-left {
    bottom: 10px;
    left: 10px;
  }
  
  .bottom-right {
    bottom: 10px;
    right: 10px;
  }
  
  .minimap {
    width: 100%;
    height: 100%;
    position: relative;
    cursor: pointer;
  }
  
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-template-rows: repeat(var(--rows), 1fr);
    width: 100%;
    height: 100%;
  }
  
  .mini-tile {
    border: 0.01em solid rgba(0, 0, 0, 0.1);
    transition: transform 0.1s ease-in-out, filter 0.1s ease-in-out, border 0.1s ease-in-out;
    cursor: pointer;
    will-change: transform; /* Optimization for smoother rendering */
  }
  
  /* Add hover effect for mini-tiles */
  .mini-tile:hover {
    filter: brightness(1.3);
    border: 0.05em solid rgba(255, 255, 255, 0.7);
    z-index: 1;
  }
  
  /* Style for center tile */
  .mini-tile.center {
    border: 0.12em solid white;
    box-shadow: 0 0 0.4em white, inset 0 0 0.2em white;
    z-index: 4;
    position: relative;
    filter: brightness(1.2);
    transform: scale(1.2);
  }
  
  .viewport-indicator {
    position: absolute;
    border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.7), inset 0 0 3px rgba(255, 255, 255, 0.3);
    pointer-events: none;
    border-radius: 3px;
    animation: pulse 2s infinite ease-in-out;
    background-color: rgba(255, 255, 255, 0.1);
    z-index: 3; /* Lower than center tile to ensure center is visible */
  }
  
  @keyframes pulse {
    0% { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8), inset 0 0 3px rgba(255, 255, 255, 0.3); }
    50% { box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.4), inset 0 0 8px rgba(255, 255, 255, 0.1); }
    100% { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8), inset 0 0 3px rgba(255, 255, 255, 0.3); }
  }
</style>
