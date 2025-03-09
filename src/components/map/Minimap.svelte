<script>
  import { onMount, createEventDispatcher } from "svelte";
  import { browser } from "$app/environment";
  import Close from "../icons/Close.svelte";

  const dispatch = createEventDispatcher();
  
  // Props
  export let terrain;
  export let terrainCache;
  export let targetCoord = { x: 0, y: 0 };
  export let mainViewportSize = { cols: 0, rows: 0 };
  export let position = "bottom-right";
  export let size = "20%";

  // Minimap settings
  const tileSize = 0.8; // Tiny tiles
  const scaleFactor = 5; // How many more tiles to show than the main view
  
  // State variables
  let minimapElement;
  let cols = 0, rows = 0;
  let isReady = false;
  let centerX = 0, centerY = 0;
  let offsetX = 0, offsetY = 0; // Add offset variables like in Grid component
  
  // Get terrain data with caching
  function getCachedTerrainData(x, y) {
    const intX = Math.floor(x);
    const intY = Math.floor(y);
    const key = `${intX},${intY}`;
    
    if (terrainCache.has(key)) {
      return terrainCache.get(key);
    }
    
    const terrainData = terrain.getTerrainData(intX, intY);
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
    
    terrainCache.set(key, stableData);
    return stableData;
  }
  
  // Calculate minimap dimensions
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
    
    // FIXED: Update offsets exactly like in the Grid component
    offsetX = centerX + targetCoord.x;
    offsetY = centerY + targetCoord.y;

    if (!isReady) isReady = true;
  };

  onMount(() => {
    const resizeObserver = new ResizeObserver(resize);
    if (minimapElement) {
      resizeObserver.observe(minimapElement);
      resize();
    }

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
    };
  });

  // FIXED: Update offsets whenever targetCoord changes
  $: {
    if (isReady) {
      offsetX = centerX + targetCoord.x;
      offsetY = centerY + targetCoord.y;
    }
  }

  // FIXED: Use the exact same coordinate system as the grid, just with smaller tiles
  $: minimapGridArray = isReady
    ? Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x) => {
          // Use the exact same coordinate calculation as in Grid.svelte
          const globalX = Math.floor(x - offsetX);
          const globalY = Math.floor(y - offsetY);
          
          const terrainData = getCachedTerrainData(globalX, globalY);
          
          return {
            x: globalX,
            y: globalY,
            gridX: x,
            gridY: y,
            isCenter: x === centerX && y === centerY,
            ...terrainData
          };
        })
      ).flat()
    : [];

  // Calculate viewport indicator
  $: viewportWidth = isReady ? 
    Math.min(Math.max(mainViewportSize.cols / scaleFactor, 3), cols) : 0;
  
  $: viewportHeight = isReady ? 
    Math.min(Math.max(mainViewportSize.rows / scaleFactor, 3), rows) : 0;

  // Handle individual tile click - FIXED
  function handleTileClick(cell) {
    // Add debugging
    console.log(`Minimap tile clicked: cell at (${cell.x}, ${cell.y}), biome: ${cell.biome?.name || 'unknown'}`);
    
    // CRITICAL FIX: Explicitly create a new coordinates object and ensure it has integer values
    const newCoords = { 
      x: Math.floor(cell.x), 
      y: Math.floor(cell.y) 
    };
    
    // Make sure to dispatch first - this is crucial for proper event handling
    dispatch('positionchange', newCoords);
    console.log(`Minimap dispatched positionchange with:`, newCoords);
    
    // CRITICAL: Don't update targetCoord directly here - parent needs to handle it
    // We're now using two-way binding in the parent, so we should let it update this prop
  }
  
  // Handle minimap background click - FIXED with similar approach
  const handleMinimapClick = (event) => {
    if (event.target === minimapElement || !event.target.classList.contains('mini-tile')) {
      const rect = minimapElement.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      
      const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const tileSizePx = tileSize * baseFontSize;
      
      const tileX = Math.floor(clickX / tileSizePx);
      const tileY = Math.floor(clickY / tileSizePx);
      
      // Find the cell if it exists
      const clickedCell = minimapGridArray.find(cell => 
        cell.gridX === tileX && cell.gridY === tileY);
      
      if (clickedCell) {
        // Use the same handler for consistent behavior
        handleTileClick(clickedCell);
      } else {
        // Calculate coordinates and dispatch
        const globalX = Math.floor(tileX - offsetX);
        const globalY = Math.floor(tileY - offsetY);
        
        const newCoords = { x: globalX, y: globalY };
        console.log(`Minimap background clicked, calculated:`, newCoords);
        dispatch('positionchange', newCoords);
      }
    }
  };
  
  // Handle close button click
  function handleCloseClick(event) {
    event.stopPropagation();
    dispatch('close');
  }

  // ENHANCED: Handle keyboard navigation for minimap tiles
  function handleKeydown(e, cell) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleTileClick(cell);
    }
  }
</script>

<div 
  class="minimap-container" 
  class:top-left={position === "top-left"}
  class:top-right={position === "top-right"}
  class:bottom-left={position === "bottom-left"}
  class:bottom-right={position === "bottom-right"}
  style="--minimap-size: {size};"
  role="region"
  aria-label="Minimap"
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
    role="grid"
    tabindex="0"
    aria-label="Minimap grid. Use arrow keys to navigate."
  >
    {#if isReady}
      <div class="grid" role="presentation">
        {#each minimapGridArray as cell}
          <!-- FIXED: Use button instead of div for interactive tiles -->
          <button
            class="mini-tile"
            class:center={cell.isCenter}
            style="background-color: {cell.color};"
            on:click|stopPropagation={() => handleTileClick(cell)}
            on:keydown={(e) => handleKeydown(e, cell)}
            tabindex="0"
            title="{cell.biome.name} ({cell.x},{cell.y})"
            data-x={cell.x}
            data-y={cell.y}
            aria-label="Map position {cell.x},{cell.y}, {cell.biome.displayName || cell.biome.name}"
          ></button>
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
        role="presentation"
        aria-hidden="true"
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
    padding: 0;
    background: none;
  }
  
  /* Add hover effect for mini-tiles */
  .mini-tile:hover {
    filter: brightness(1.3);
    border: 0.05em solid rgba(255, 255, 255, 0.7);
    z-index: 1;
  }
  
  /* Add focus styles for keyboard navigation */
  .mini-tile:focus {
    outline: 0.1em solid rgba(255, 255, 255, 0.9);
    z-index: 4;
  }

  /* Style for center tile */
  .mini-tile.center {
    border: 0.15em solid white;
    box-shadow: 0 0 0.5em white, inset 0 0 0.3em white;
    z-index: 5;
    position: relative;
    filter: brightness(1.3) saturate(1.2);
    transform: scale(1.3);
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
