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
  
  // Add drag tracking state
  let isDragging = $state(false);
  let dragStartX = $state(0);
  let dragStartY = $state(0);
  let dragThreshold = $state(5); // Minimum pixels to consider as drag vs click
  let dragDistance = $state(0);
  let wasDrag = $state(false);
  let lastDragUpdate = $state(0);
  const DRAG_THROTTLE = 50; // ms between updates

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
  
  // Add drag handlers
  function handleDragStart(event) {
    // Only handle left mouse button or touch events
    if (event.button !== undefined && event.button !== 0) return;
    
    // Prevent default to stop text selection during drag
    if (event.preventDefault) event.preventDefault();
    
    isDragging = true;
    dragStartX = event.clientX || event.touches?.[0]?.clientX || 0;
    dragStartY = event.clientY || event.touches?.[0]?.clientY || 0;
    dragDistance = 0;
    wasDrag = false;
    
    debugLog("Drag started", { x: dragStartX, y: dragStartY });
  }
  
  function handleDragMove(event) {
    if (!isDragging) return;
    
    // Prevent default to stop text selection and scrolling
    if (event.preventDefault) event.preventDefault();
    
    const currentX = event.clientX || event.touches?.[0]?.clientX;
    const currentY = event.clientY || event.touches?.[0]?.clientY;
    
    // Validate coordinates
    if (currentX === undefined || currentY === undefined || 
        isNaN(currentX) || isNaN(currentY)) {
      return;
    }
    
    // Calculate drag distance for distinguishing drags from clicks
    const deltaX = currentX - dragStartX;
    const deltaY = currentY - dragStartY;
    dragDistance += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (dragDistance > dragThreshold) {
      wasDrag = true;
    }
    
    // Apply throttling to prevent excessive updates
    const currentTime = Date.now();
    if (currentTime - lastDragUpdate < DRAG_THROTTLE) {
      return;
    }
    
    lastDragUpdate = currentTime;
    
    if (!cardElement || !wasDrag) return;
    
    // Calculate movement in world coordinates
    const cardRect = cardElement.getBoundingClientRect();
    const pixelsPerTileX = cardRect.width / cols;
    const pixelsPerTileY = cardRect.height / rows;
    
    // Skip if we can't calculate reasonable tile sizes
    if (pixelsPerTileX === 0 || pixelsPerTileY === 0) return;
    
    // Calculate number of tiles moved
    const tilesMovedX = Math.round(deltaX / pixelsPerTileX);
    const tilesMovedY = Math.round(deltaY / pixelsPerTileY);
    
    if (tilesMovedX === 0 && tilesMovedY === 0) return;
    
    // Update center coordinates (move in opposite direction of drag)
    centerState = {
      x: centerState.x - tilesMovedX * summaryFactor,
      y: centerState.y - tilesMovedY * summaryFactor,
      source: 'drag'
    };
    
    // Update drag start position for next move
    dragStartX = currentX;
    dragStartY = currentY;
    
    // Regenerate terrain with new center
    if (wasDrag) {
      generateTerrainGrid();
    }
  }
  
  function handleDragEnd(event) {
    const wasActuallyDragging = isDragging && wasDrag;
    
    isDragging = false;
    wasDrag = false;
    
    debugLog("Drag ended, was actual drag:", wasActuallyDragging);
    
    return wasActuallyDragging;
  }
  
  // Handle global mouse/touch events
  function handleWindowMouseMove(event) {
    if (isDragging) {
      handleDragMove(event);
    }
  }
  
  function handleWindowMouseUp(event) {
    if (isDragging) {
      handleDragEnd(event);
    }
  }

  // Function to navigate to map at specific coordinates
  function navigateToTile(x, y) {
    // Don't navigate if this was a drag operation
    if (wasDrag) return;
    
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
    // Don't handle click if this was a drag
    if (wasDrag) return;
    
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
      
      // Add global event listeners for drag handling
      if (browser) {
        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
        window.addEventListener('touchmove', handleWindowMouseMove, { passive: false });
        window.addEventListener('touchend', handleWindowMouseUp);
        window.addEventListener('mouseleave', handleWindowMouseUp);
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
      
      // Clean up global event listeners
      if (browser) {
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
        window.removeEventListener('touchmove', handleWindowMouseMove);
        window.removeEventListener('touchend', handleWindowMouseUp);
        window.removeEventListener('mouseleave', handleWindowMouseUp);
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
  class:dragging={isDragging && wasDrag}
>
  {#if !mounted || !terrainGrid.length}
    <div class="loading-placeholder">
      <div class="loading-indicator"></div>
    </div>
  {:else}
    <div 
      class="terrain-grid"
      style="--grid-cols: {cols}; --grid-rows: {rows};"
      onmousedown={handleDragStart}
      ontouchstart={handleDragStart}
      class:dragging={isDragging && wasDrag}
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
          disabled={!joined || (isDragging && wasDrag)}
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
    touch-action: none; /* Prevent browser handling of touch gestures */
  }

  .world-card-container.dragging {
    cursor: grabbing !important;
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
    cursor: grab; /* Show grab cursor to indicate draggable */
    touch-action: none; /* Disable browser touch actions */
  }

  .terrain-grid.dragging {
    cursor: grabbing; /* Change cursor when dragging */
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

  /* Only apply cursor pointer to joined worlds if not in dragging mode */
  button.terrain-tile.joined:not(.dragging) {
    cursor: pointer;
  }
  
  /* Add specific style for dragging state */
  .world-card-container.dragging .terrain-tile {
    cursor: grabbing !important;
    pointer-events: none; /* Prevent interaction with tiles during drag */
  }
</style>
