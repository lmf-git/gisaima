<script>
  import { onMount, createEventDispatcher } from "svelte";
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
  let offsetX = 0, offsetY = 0;
  let centerX = 0, centerY = 0;
  
  // Calculate minimap dimensions
  const resize = () => {
    if (!minimapElement) return;
    
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
    
    // Update offsets based on target coordinates - maintain consistency with main map
    offsetX = centerX + targetCoord.x / scaleFactor;
    offsetY = centerY + targetCoord.y / scaleFactor;

    if (!isReady) isReady = true;
  };

  // Initialize when mounted
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

  // Generate reactive grid array for the minimap
  $: minimapGridArray = isReady
    ? Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x) => {
          // Transform coordinates to match main map but at different scale
          const globalX = (x - offsetX) * scaleFactor;
          const globalY = (y - offsetY) * scaleFactor;
          const terrainData = terrain.getTerrainData(globalX, globalY);
          
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

  // Reactively update offsets when targetCoord changes
  // This is the key to syncing with main map movement
  $: if (isReady) {
    offsetX = centerX + targetCoord.x / scaleFactor;
    offsetY = centerY + targetCoord.y / scaleFactor;
  }

  // Calculate the viewport indicator dimensions and position
  $: viewportIndicator = isReady ? {
    width: Math.min(Math.max(mainViewportSize.cols / scaleFactor, 1), cols),
    height: Math.min(Math.max(mainViewportSize.rows / scaleFactor, 1), rows),
    left: centerX - (mainViewportSize.cols / (scaleFactor * 2)),
    top: centerY - (mainViewportSize.rows / (scaleFactor * 2))
  } : { width: 0, height: 0, left: 0, top: 0 };

  // Handle individual mini-tile click - FIXED
  function handleTileClick(cell) {
    // Create a completely new object to ensure reactivity
    const newCoords = { 
      x: cell.x, 
      y: cell.y 
    };
    
    console.log("Minimap tile clicked at:", newCoords);
    
    // Dispatch event FIRST to ensure parent knows about the change
    dispatch('positionchange', newCoords);
    
    // Then update local state
    targetCoord = newCoords;
    
    // Force offset update
    offsetX = centerX + targetCoord.x / scaleFactor;
    offsetY = centerY + targetCoord.y / scaleFactor;
  }
  
  // Improved minimap click handler 
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
      
      // Find the cell at this position
      const clickedCell = minimapGridArray.find(
        cell => cell.gridX === tileX && cell.gridY === tileY
      );
      
      if (clickedCell) {
        handleTileClick(clickedCell);
      }
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
          ></div>
        {/each}
      </div>
      
      <!-- Viewport indicator -->
      <div 
        class="viewport-indicator"
        style="
          width: {viewportIndicator.width * tileSize}em;
          height: {viewportIndicator.height * tileSize}em;
          left: {viewportIndicator.left * tileSize}em;
          top: {viewportIndicator.top * tileSize}em;
        "
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
  }
  
  /* Add hover effect for mini-tiles */
  .mini-tile:hover {
    filter: brightness(1.3);
    border: 0.05em solid rgba(255, 255, 255, 0.7);
    z-index: 1;
  }
  
  /* Style for center tile */
  .mini-tile.center {
    border: 0.08em solid rgba(255, 255, 255, 0.8);
    z-index: 2;
  }
  
  .viewport-indicator {
    position: absolute;
    border: 2px solid white;
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    border-radius: 2px;
    animation: pulse 2s infinite ease-in-out;
  }
  
  @keyframes pulse {
    0% { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8); }
    50% { box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.4); }
    100% { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8); }
  }
</style>
