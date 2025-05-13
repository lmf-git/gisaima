<script>
  import { onMount } from 'svelte';
  
  import { TerrainGenerator } from 'gisaima-shared/map/noise.js';

  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';

  import { getWorldCenterCoordinates } from '../../../lib/stores/game.js';
  
  // Combine all props into a single $props() call
  const { 
    worldId = '', 
    seed = 0, 
    tileSize = 9,
    summaryFactor = 75,
    joined = false,
    world = null,
    worldCenter = null,
    debug = false,
    // Add the event handler as a regular prop
    loaded = (detail) => {}
  } = $props();
  
  // Simplified state
  let terrainGrid = $state([]);
  let mounted = $state(false);
  let cardElement;
  let resizeObserver;
  let cols = $state(0);
  let rows = $state(0);
  let initialized = $state(false);
  
  // Keep track of center coordinates
  let centerState = $state({
    x: null,
    y: null,
    source: null
  });
  
  // Log state changes if debug is enabled
  function debugLog(...args) {
    if (debug) {
      console.log(`[WorldCard:${worldId}]`, ...args);
    }
  }
  
  // Simplify the center coordinates tracking to ensure reactivity
  $effect(() => {
    let newCenter = { x: 0, y: 0, source: 'default' };
    
    // Use pre-computed center if provided (highest priority)
    if (worldCenter && typeof worldCenter.x === 'number' && typeof worldCenter.y === 'number') {
      newCenter = { x: worldCenter.x, y: worldCenter.y, source: 'worldCenter prop' };
    }
    // Otherwise compute from world info if available
    else if (world?.center && typeof world.center.x === 'number' && typeof world.center.y === 'number') {
      newCenter = { x: world.center.x, y: world.center.y, source: 'world prop' };
    }
    // Final fallback: get coordinates from game store
    else {
      const coords = getWorldCenterCoordinates(worldId, world);
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

  // Hover state tracking for interactivity
  let hoveredTileX = $state(null);
  let hoveredTileY = $state(null);
  
  function isHovered(x, y) {
    return hoveredTileX === x && hoveredTileY === y;
  }
  
  function handleTileHover(x, y) {
    if (!joined) return;
    hoveredTileX = x;
    hoveredTileY = y;
  }
  
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
      
      // Generate terrain when dimensions change and component is active
      if (mounted && cols > 0 && rows > 0) {
        generateTerrainGrid();
      }
    }
  }

  // Simplified terrain generation - focused only on direct generation
  function generateTerrainGrid() {
    if (!seed || typeof seed !== 'number' || cols <= 0 || rows <= 0 || !centerState.x || !centerState.y) {
      debugLog("Cannot generate terrain: missing required data");
      return;
    }
    
    try {
      debugLog(`Generating terrain with center at ${centerState.x},${centerState.y}`);
      
      const generator = new TerrainGenerator(seed, cols * rows * 2);
      const grid = [];
      
      const centerX = Math.floor(cols / 2);
      const centerY = Math.floor(rows / 2);
      
      // Use explicit center from the centerState
      const worldCenterX = centerState.x;
      const worldCenterY = centerState.y;
      
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          // Calculate the base world coordinates centered on world center
          const baseWorldX = worldCenterX + (x - centerX) * summaryFactor;
          const baseWorldY = worldCenterY + (y - centerY) * summaryFactor;
          
          // Sample from the center of the area
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
      
      // Update terrain grid
      terrainGrid = grid;
      initialized = true;
      
      // Call the loaded prop directly instead of dispatching an event
      loaded({ worldId });
      
    } catch (err) {
      console.error(`Error generating terrain for ${worldId}:`, err);
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
    
    // Navigate using the tile's actual world coordinates
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
      console.log(`WorldCard mounted for ${worldId}`);
      
      // Calculate grid dimensions
      resizeWorldGrid();
      
      mounted = true;
      
      // Setup resize observer
      try {
        resizeObserver = new ResizeObserver(resizeWorldGrid);
        resizeObserver.observe(cardElement);
      } catch (error) {
        console.error('ResizeObserver error:', error);
      }
      
      // Generate terrain immediately
      setTimeout(() => generateTerrainGrid(), 10);
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
  
  // Update terrain when center changes or component mounts
  $effect(() => {
    if (!mounted || !centerState.x || !centerState.y || cols <= 0 || rows <= 0) return;
    
    // Only generate if we don't have terrain yet
    if (!initialized || terrainGrid.length === 0) {
      setTimeout(() => generateTerrainGrid(), 0);
    }
  });
</script>

<div 
  class="world-card-container"
  bind:this={cardElement}
  data-world-id={worldId}
  data-render-status={initialized ? 'completed' : 'pending'}
  aria-label="World terrain preview"
>
  {#if !mounted || !terrainGrid.length}
    <div class="loading-placeholder">
      <div class="loading-indicator"></div>
    </div>
  {:else}
    <div 
      class="terrain-grid"
      style="--grid-cols: {cols}; --grid-rows: {rows};"
    >
      {#each terrainGrid as tile (tile.x + ',' + tile.y)}
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

  .loading-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.2);
  }

  .loading-indicator {
    width: 30px;
    height: 30px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: var(--color-pale-green);
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
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
    cursor: default;
  }

  button.terrain-tile.joined {
    cursor: pointer;
  }

  button.terrain-tile:focus-visible {
    outline: none;
  }
  
  .terrain-tile.center {
    position: relative;
    z-index: 2;
  }
  
  .terrain-tile.joined.hovered::before {
    content: '';
    position: absolute;
    inset: 0;
    background-color: rgba(255, 255, 255, 0.6);
    z-index: 2;
    pointer-events: none;
  }
  
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
  
  .terrain-tile.interactive {
    cursor: pointer;
  }
  
  .terrain-tile.interactive.hovered::before {
    background-color: rgba(255, 255, 255, 0.7);
    z-index: 2;
    pointer-events: none;
  }
  
  .terrain-tile.interactive:hover::after {
    opacity: 1;
    border-color: rgba(255, 255, 255, 0.9);
    box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.3);
    z-index: 4;
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
