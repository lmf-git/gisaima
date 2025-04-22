<script>
  import { onMount } from 'svelte';
  import { TerrainGenerator } from '../../functions/shared/map/noise.js';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { getWorldCenterCoordinates } from '../lib/stores/game.js';
  
  // Props with defaults - fix the default tileSize value
  const { 
    worldId = '', 
    seed = 0, 
    tileSize = 9, // More reasonable default size that matches Grid component better
    summaryFactor = 75,
    delayed = false,
    joined = false, // New prop to track if world is joined
    info = null, // Add world info prop to access center coordinates
    worldCenter = null, // Allow passing precomputed world center directly
  } = $props();
  
  // Local state
  let terrainGrid = $state([]);
  let mounted = $state(false);
  let cardElement;
  let resizeObserver;
  let cols = $state(0);
  let rows = $state(0);
  let isActive = $state(!delayed);
  
  // Add a specific mutable state object to store and track the center coordinates
  // This helps with debugging and ensuring reactivity
  let centerState = $state({
    x: null,
    y: null,
    source: null
  });
  
  // Track the last center used to generate terrain to avoid redundant updates
  let lastUsedCenter = $state({x: null, y: null});
  
  // Simplify the center coordinates tracking to ensure reactivity
  $effect(() => {
    let newCenter = { x: 0, y: 0, source: 'default' };
    
    // Use pre-computed center if provided (highest priority)
    if (worldCenter && typeof worldCenter.x === 'number' && typeof worldCenter.y === 'number') {
      newCenter = { x: worldCenter.x, y: worldCenter.y, source: 'worldCenter prop' };
    }
    // Otherwise compute from world info if available
    else if (info?.center && typeof info.center.x === 'number' && typeof info.center.y === 'number') {
      newCenter = { x: info.center.x, y: info.center.y, source: 'info prop' };
    }
    // Final fallback: get coordinates from game store
    else {
      const coords = getWorldCenterCoordinates(worldId, info);
      if (coords && typeof coords.x === 'number' && typeof coords.y === 'number') {
        newCenter = { x: coords.x, y: coords.y, source: 'game store' };
      }
    }
    
    // Only update if the center has actually changed
    if (centerState.x !== newCenter.x || centerState.y !== newCenter.y) {
      console.log(`${worldId}: Center coordinates updated to ${newCenter.x},${newCenter.y} from ${newCenter.source}`);
      centerState = newCenter;
    }
  });
  
  // Add state to track hovered tile
  let hoveredTileX = $state(null);
  let hoveredTileY = $state(null);
  
  // Check if a specific tile is being hovered
  function isHovered(x, y) {
    return hoveredTileX === x && hoveredTileY === y;
  }
  
  // Set the currently hovered tile
  function handleTileHover(x, y) {
    // Only track hover state for joined worlds
    if (!joined) return;
    hoveredTileX = x;
    hoveredTileY = y;
  }
  
  // Clear the hover state
  function clearHover() {
    hoveredTileX = null;
    hoveredTileY = null;
  }
  
  // Ensure odd number of columns/rows for proper centering
  const ensureOdd = (num) => num % 2 === 0 ? num + 1 : num;
  
  // Calculate grid dimensions based on container size
  function resizeWorldGrid() {
    if (!cardElement) return;
    
    // Get actual dimensions of container element
    const width = cardElement.clientWidth;
    const height = cardElement.clientHeight;
    
    console.log(`WorldCard resize: container ${width}x${height}, tileSize=${tileSize}px`);
    
    // Calculate tile counts based on available space and tile size
    // Add maximum limits to prevent too many tiles
    const maxCols = 13; // Maximum number of columns
    const maxRows = 9;  // Maximum number of rows
    
    let newCols = Math.max(3, Math.floor(width / tileSize));
    let newRows = Math.max(3, Math.floor(height / tileSize));
    
    // Apply maximum limits
    newCols = Math.min(newCols, maxCols);
    newRows = Math.min(newRows, maxRows);
    
    // Force odd number for proper centering
    newCols = ensureOdd(newCols);
    newRows = ensureOdd(newRows);
    
    console.log(`WorldCard grid dimensions: ${newCols}x${newRows} tiles`);
    
    // Only update if dimensions have changed
    if (newCols !== cols || newRows !== rows) {
      cols = newCols;
      rows = newRows;
      
      // Directly generate grid if active - no need for requestAnimationFrame
      if (mounted && seed && isActive) {
        terrainGrid = generateTerrainGrid(seed);
      }
    }
  }

  // Generate terrain data for the grid with world center as the focal point
  function generateTerrainGrid(seed) {
    if (!seed || typeof seed !== 'number' || cols <= 0 || rows <= 0) return [];
    
    try {
      // Create a small cache based on grid size for better performance
      const generator = new TerrainGenerator(seed, cols * rows * 2);
      const grid = [];
      
      const centerX = Math.floor(cols / 2);
      const centerY = Math.floor(rows / 2);
      
      // Use explicit center from the centerState
      const worldCenterX = centerState.x;
      const worldCenterY = centerState.y;
      
      // Track that we've used these coordinates
      lastUsedCenter = { x: worldCenterX, y: worldCenterY };
      
      console.log(`Generating terrain for ${worldId} with center at ${worldCenterX},${worldCenterY}`);
      
      // Fix the bug in the for loop condition
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          // Calculate the base world coordinates for this summarized tile
          // Centered on world center rather than 0,0
          const baseWorldX = worldCenterX + (x - centerX) * summaryFactor;
          const baseWorldY = worldCenterY + (y - centerY) * summaryFactor;
          
          // Note: This doesn't calculate chunk keys, so it doesn't need the Math.floor fix
          // Simply sample from the center of the area
          const centerSampleX = baseWorldX + Math.floor(summaryFactor / 2);
          const centerSampleY = baseWorldY + Math.floor(summaryFactor / 2);
          const terrainData = generator.getTerrainData(centerSampleX, centerSampleY);
          
          grid.push({
            x,
            y,
            worldX: baseWorldX,
            worldY: baseWorldY,
            color: terrainData.color,
            isCenter: x === centerX && y === centerY,
            biomeName: terrainData.biome?.name || 'unknown'
          });
        }
      }
      
      return grid;
    } catch (err) {
      console.error('Error generating terrain grid:', err);
      return [];
    }
  }
  
  // Initialize with a simple placeholder grid for immediate display
  function createPlaceholderGrid() {
    if (cols <= 0 || rows <= 0) return [];
    
    const placeholderColors = [
      "#1A4F76", "#4A91AA", "#5A6855", "#607D55", "#7B8F5D", 
      "#8DAD70", "#91A86E", "#A8A76C"
    ];
    
    const centerX = Math.floor(cols / 2);
    const centerY = Math.floor(rows / 2);
    
    // Create a very simple placeholder grid
    const grid = [];
    const placeholderSeed = seed || worldId.length;
    
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const colorIndex = Math.abs((x * 3 + y * 7 + placeholderSeed) % placeholderColors.length);
        
        grid.push({
          x, 
          y,
          color: placeholderColors[colorIndex],
          isCenter: x === centerX && y === centerY,
          biomeName: 'loading'
        });
      }
    }
    
    return grid;
  }
  
  // Improve activation function for delayed cards with better error handling
  function activateCard() {
    if (!isActive) {
      isActive = true;
      if (mounted && seed && cols > 0 && rows > 0) {
        try {
          console.log(`Activating terrain grid for ${worldId}`);
          terrainGrid = generateTerrainGrid(seed);
        } catch (error) {
          console.error(`Error generating terrain for ${worldId}:`, error);
          // Fall back to placeholder grid on error
          terrainGrid = createPlaceholderGrid();
        }
      }
    }
  }
  
  // Function to navigate to map at specific coordinates
  function navigateToTile(x, y) {
    if (!browser || !joined || !worldId) return;
    
    // Create a cleaner URL
    const url = new URL('/map', window.location.origin);
    url.searchParams.set('world', worldId);
    url.searchParams.set('x', x.toString());
    url.searchParams.set('y', y.toString());
    
    // Navigate to the map with the calculated coordinates
    goto(url.pathname + url.search);
  }
  
  // Handle click on any tile
  function handleTileClick(tile, event) {
    if (!joined) return;
    
    // Navigate using the tile's actual world coordinates (not relative grid position)
    navigateToTile(tile.worldX, tile.worldY);
    
    event.stopPropagation();
  }
  
  // Handle keyboard interaction for all tiles
  function handleTileKeydown(tile, event) {
    if (!joined) return;
    
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigateToTile(tile.worldX, tile.worldY);
    }
  }
  
  onMount(() => {
    if (cardElement) {
      console.log(`WorldCard mounted for ${worldId}, delayed: ${delayed}`);
      
      // Calculate grid dimensions
      resizeWorldGrid();
      
      // Generate initial terrain grid only if not delayed
      if (!delayed) {
        console.log(`Immediate terrain generation for ${worldId}`);
        // Show placeholder immediately, then generate actual grid
        terrainGrid = createPlaceholderGrid();
        
        // Generate the actual terrain (once, no animation frame needed)
        setTimeout(() => {
          if (isActive && mounted) {
            terrainGrid = generateTerrainGrid(seed);
          }
        }, 10);
      } else {
        console.log(`Delayed terrain generation queued for ${worldId}`);
      }
      
      mounted = true;
      
      // Setup resize observer - this only triggers when actual resizing happens
      try {
        resizeObserver = new ResizeObserver(resizeWorldGrid);
        resizeObserver.observe(cardElement);
      } catch (error) {
        console.error('ResizeObserver error:', error);
      }
    }
    
    return () => {
      if (resizeObserver) {
        try {
          resizeObserver.disconnect();
        } catch (error) {
          console.error('Error disconnecting ResizeObserver:', error);
        }
      }
    };
  });
  
  // When delayed prop changes to false, activate the card - with simplified reactive logic
  $effect(() => {
    if (!delayed && !isActive && mounted) {
      console.log(`Delayed card ${worldId} now ready to activate`);
      // Show placeholder immediately
      terrainGrid = createPlaceholderGrid();
      activateCard();
    }
  });
  
  // Update terrain when seed or center changes and card is active
  $effect(() => {
    // Skip if not ready
    if (!mounted || !seed || !isActive || cols <= 0 || rows <= 0) return;
    
    // Track centerState as a dependency 
    const currentCenterX = centerState.x;
    const currentCenterY = centerState.y;
    
    // Skip regeneration if the center hasn't changed from what we last used
    if (lastUsedCenter.x === currentCenterX && lastUsedCenter.y === currentCenterY) {
      return;
    }
    
    // Skip generation if we don't have valid coordinates
    if (currentCenterX === null || currentCenterY === null) {
      console.log(`Skipping terrain generation for ${worldId}: missing valid center coordinates`);
      return;
    }
    
    try {
      console.log(`Regenerating terrain for ${worldId} with seed ${seed} and center ${currentCenterX},${currentCenterY}`);
      terrainGrid = generateTerrainGrid(seed);
    } catch (error) {
      console.error(`Error updating terrain for ${worldId}:`, error);
      // Fall back to placeholder on error
      if (terrainGrid.length === 0) {
        terrainGrid = createPlaceholderGrid();
      }
    }
  });
</script>

<div 
  class="world-card-container"
  bind:this={cardElement}
  data-world-id={worldId}
  aria-label="World terrain preview"
>
  {#if mounted && (isActive || !delayed) && terrainGrid.length > 0}
    <div 
      class="terrain-grid"
      style="--grid-cols: {cols}; --grid-rows: {rows};"
    >
      {#each terrainGrid as tile (tile.x + ',' + tile.y)}
        <!-- Add role attribute to fix the a11y warning -->
        <svelte:element
          this={joined ? "button" : "div"}
          class="terrain-tile" 
          class:center={tile.isCenter}
          class:joined={joined}
          class:interactive={joined}
          class:hovered={joined && isHovered(tile.x, tile.y)}
          style="background-color: {tile.color};"
          aria-label={joined 
            ? `View ${tile.biomeName} at coordinates ${tile.worldX},${tile.worldY}` 
            : tile.biomeName
          }
          title={joined 
            ? `View ${tile.biomeName} at coordinates ${tile.worldX},${tile.worldY}` 
            : tile.biomeName
          }
          onclick={joined ? (e) => handleTileClick(tile, e) : null}
          onmouseenter={() => handleTileHover(tile.x, tile.y)}
          onmouseleave={clearHover}
          onkeydown={joined ? (e) => handleTileKeydown(tile, e) : null}
          disabled={!joined}
          type={joined ? "button" : null}
          role={joined ? "button" : "presentation"}
        ></svelte:element>
      {/each}
    </div>
  {/if}
</div>

<style>
  .world-card-container {
    width: 100%;
    height: 100%;
    background-color: var(--color-dark-blue);
    border-radius: 4px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    will-change: transform;
  }
  
  .terrain-grid {
    display: grid;
    grid-template-columns: repeat(var(--grid-cols), 1fr);
    grid-template-rows: repeat(var(--grid-rows), 1fr);
    width: 100%;
    height: 100%;
    transform: translate3d(0, 0, 0);
  }
  
  .terrain-tile {
    /* Use 100% to fill grid cells */
    width: 100%;
    height: 100%;
    position: relative;
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    appearance: none;
    cursor: default; /* Default cursor for non-joined worlds */
  }

  /* Only apply cursor pointer to joined worlds */
  button.terrain-tile.joined {
    cursor: pointer;
  }

  /* Only show outline on focus for joined worlds */
  button.terrain-tile:focus-visible {
    outline: none;
  }
  
  /* Remove the default center styling */
  .terrain-tile.center {
    position: relative;
    z-index: 2;
  }
  
  /* Add hover effect with pseudo-element to override the background color */
  .terrain-tile.joined.hovered::before {
    content: '';
    position: absolute;
    inset: 0;
    background-color: rgba(255, 255, 255, 0.6);
    z-index: 2;
    pointer-events: none;
  }
  
  /* Only add visual highlight for joined worlds */
  .terrain-tile.center.joined::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 2px solid rgba(255, 255, 255, 0.5);
    z-index: 3;
    opacity: 0.5;
    transition: opacity 0.2s ease, border-color 0.2s ease;
  }
  
  /* Interactive behaviors for joined worlds */
  .terrain-tile.interactive {
    cursor: pointer;
  }
  
  /* Enhance hover effect on interactive tiles */
  .terrain-tile.interactive.hovered::before {
    background-color: rgba(255, 255, 255, 0.7);
    z-index: 2;
    pointer-events: none;
  }
  
  .terrain-tile.interactive:hover::after {
    opacity: 1;
    border-color: rgba(255, 255, 255, 0.9);
    box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.3);
    z-index: 4; /* Ensure the border appears above the hover highlight */
  }
  
  button.terrain-tile:focus-visible::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    opacity: 1;
    border: 2px solid white;
    box-shadow: inset 0 0 15px rgba(255, 255, 255, 0.4);
    z-index: 4;
  }

  button.terrain-tile[disabled] {
    cursor: default;
    pointer-events: none;
  }
</style>
