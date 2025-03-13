<script>
  import { 
    mapState, 
    getTerrainData, 
    updateHoveredTile, 
    updateMinimapRange,
    moveMapTo,
    setMinimapVisibility
  } from '../../lib/stores/map.js';
  import { browser } from '$app/environment';
  import Close from '../../components/icons/Close.svelte';
  // Add missing import for onDestroy
  import { onDestroy } from 'svelte';

  // Simplify state variables
  let open = $state(true);
  let initialized = $state(false);
  let windowWidth = $state(browser ? window.innerWidth : 0);

  // Constants
  const MINI_TILE_SIZE_EM = 0.5;
  // Replace fixed dimensions with dynamic ones based on grid size
  const MINIMAP_COLS_FACTOR = 3.5;
  const MINIMAP_ROWS_FACTOR = 2.85;
  
  // Calculate minimap tile counts based on main grid dimensions
  const tileCountX = $derived(
    $mapState.isReady ? $mapState.cols * MINIMAP_COLS_FACTOR : 48
  );
  const tileCountY = $derived(
    $mapState.isReady ? $mapState.rows * MINIMAP_ROWS_FACTOR : 32
  );
  
  // Calculate dimensions from the derived tile counts
  const MINIMAP_WIDTH_EM = $derived(tileCountX * MINI_TILE_SIZE_EM);
  const MINIMAP_HEIGHT_EM = $derived(tileCountY * MINI_TILE_SIZE_EM);
  
  const LOADING_THROTTLE = 200;
  const BREAKPOINT = 768;
  
  const viewRangeX = $derived(Math.floor(tileCountX / 2));
  const viewRangeY = $derived(Math.floor(tileCountY / 2));
  
  const area = $derived({
    startX: $mapState.targetCoord.x - Math.floor($mapState.cols / 2),
    startY: $mapState.targetCoord.y - Math.floor($mapState.rows / 2),
    width: $mapState.cols,
    height: $mapState.rows,
    centerX: $mapState.targetCoord.x,
    centerY: $mapState.targetCoord.y
  });
  
  let isLoad = $state(false);
  let loadTimer = null;
  
  let isDrag = $state(false);
  let dragX = $state(0);
  let dragY = $state(0);
  
  // Use proper Svelte 5 state for DOM reference
  let minimap = $state(null);
  
  let wasDrag = $state(false);
  let dist = $state(0);
  const DRAG_THRESHOLD = 5;
  
  let minimapGrid = $state([]);
  let lastUpdateTime = 0;
  
  // Track last coordinates to prevent redundant updates
  let lastCenterX = $state(0);
  let lastCenterY = $state(0);
  
  // Add cleanup and memory management
  let minimapGridCacheSize = 0;
  const MAX_MINIMAP_GRID_SIZE = 5000;
  
  // Track only necessary state to determine if grid needs regeneration
  const mapCoords = $derived({
    x: $mapState.targetCoord.x,
    y: $mapState.targetCoord.y
  });
  
  // Improved grid generation that only regenerates when needed
  function generateMinimapGrid() {
    if (!$mapState.isReady || !open) return minimapGrid;
    
    isLoad = true;
    
    // Skip generation if coordinates haven't changed and we have data
    if ($mapState.targetCoord.x === lastCenterX && 
        $mapState.targetCoord.y === lastCenterY && 
        minimapGrid.length > 0) {
      isLoad = false;
      return minimapGrid;
    }
    
    // Update last known coordinates
    lastCenterX = $mapState.targetCoord.x;
    lastCenterY = $mapState.targetCoord.y;
    
    // Update range info
    updateMinimapRange(lastCenterX, lastCenterY, viewRangeX, viewRangeY);
    
    // Generate the grid in one pass
    const newGrid = [];
    
    try {
      for (let y = -viewRangeY; y <= viewRangeY; y++) {
        for (let x = -viewRangeX; x <= viewRangeX; x++) {
          const globalX = lastCenterX + x;
          const globalY = lastCenterY + y;
          
          // Get terrain data
          const terrainData = getTerrainData(globalX, globalY);
          
          // Calculate visibility once
          const isVisible = 
            globalX >= area.startX && 
            globalX < area.startX + area.width &&
            globalY >= area.startY && 
            globalY < area.startY + area.height;
          
          // Add to new grid
          newGrid.push({
            x: globalX,
            y: globalY,
            displayX: x + viewRangeX,
            displayY: y + viewRangeY,
            isCenter: x === 0 && y === 0,
            isVisible,
            color: terrainData.color
          });
        }
      }
      
      // Update the grid all at once
      minimapGrid = newGrid;
      lastUpdateTime = Date.now();
    } catch (error) {
      console.error("Error generating minimap grid:", error);
    } finally {
      isLoad = false;
    }
    
    return minimapGrid;
  }
  
  // Clean up resources on component destruction
  onDestroy(() => {
    // Clear any pending timers
    if (loadTimer) {
      clearTimeout(loadTimer);
    }
    
    // Clear minimap grid to free memory
    minimapGrid = [];
  });

  // Only react to coordinate changes
  $effect(() => {
    if ($mapState.isReady && open && 
        (mapCoords.x !== lastCenterX || 
         mapCoords.y !== lastCenterY || 
         minimapGrid.length === 0)) {
      generateMinimapGrid();
    }
  });

  // Update range info even when minimap is closed, but throttled
  let lastRangeUpdate = 0;
  $effect(() => {
    if ($mapState.isReady) {
      const now = Date.now();
      if (now - lastRangeUpdate > 250) {
        updateMinimapRange($mapState.targetCoord.x, $mapState.targetCoord.y, viewRangeX, viewRangeY);
        lastRangeUpdate = now;
      }
    }
  });

  function handleMinimapClick(event) {
    if (wasDrag || !$mapState.isReady) {
      event.stopPropagation();
      return;
    }
    
    const minimapRect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - minimapRect.left;
    const clickY = event.clientY - minimapRect.top;
    
    const tileX = Math.floor(clickX / (minimapRect.width / tileCountX));
    const tileY = Math.floor(clickY / (minimapRect.height / tileCountY));
    
    navigateToPosition(tileX, tileY);
    
    event.stopPropagation();
  }

  function handleKeyDown(event) {
    if (!$mapState.isReady) return;
    
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      
      const centerTileX = Math.floor(tileCountX / 2);
      const centerTileY = Math.floor(tileCountY / 2);
      
      navigateToPosition(centerTileX, centerTileY);
    }
  }
  
  function navigateToPosition(tileX, tileY) {
    const worldX = Math.round($mapState.targetCoord.x - viewRangeX + tileX);
    const worldY = Math.round($mapState.targetCoord.y - viewRangeY + tileY);
    
    moveMapTo(worldX, worldY);
  }
  
  const isMoving = $derived($mapState.isDragging || $mapState.keyboardNavigationInterval !== null || isDrag);
  
  function highlightMiniTile(cell) {
    if (!isMoving) {
      updateHoveredTile(cell.x, cell.y);
    }
  }
  
  const isTileHighlighted = (cell) => 
    !isMoving && $mapState.hoveredTile && 
    cell.x === $mapState.hoveredTile.x && 
    cell.y === $mapState.hoveredTile.y;

  function handleMinimapDragStart(event) {
    if (event.button !== 0 || !$mapState.isReady) return;
    
    isDrag = true;
    dragX = event.clientX;
    dragY = event.clientY;
    dist = 0;
    wasDrag = false;
    
    event.preventDefault();
  }
  
  function handleMinimapDrag(event) {
    if (!isDrag || !$mapState.isReady) return;
    
    const deltaX = event.clientX - dragX;
    const deltaY = event.clientY - dragY;
    
    dist += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (dist > DRAG_THRESHOLD) {
      wasDrag = true;
    }
    
    const minimapRect = minimap.getBoundingClientRect();
    const pixelsPerTileX = minimapRect.width / tileCountX;
    const pixelsPerTileY = minimapRect.height / tileCountY;
    
    const cellsMovedX = Math.round(deltaX / pixelsPerTileX);
    const cellsMovedY = Math.round(deltaY / pixelsPerTileY);
    
    if (cellsMovedX === 0 && cellsMovedY === 0) return;
    
    const newTargetX = $mapState.targetCoord.x - cellsMovedX;
    const newTargetY = $mapState.targetCoord.y - cellsMovedY;
    
    moveMapTo(newTargetX, newTargetY);
    
    dragX = event.clientX;
    dragY = event.clientY;
  }
  
  function handleMinimapDragEnd() {
    if (!isDrag) return;
    isDrag = false;
  }
  
  function globalMinimapMouseUp() {
    if (isDrag) {
      handleMinimapDragEnd();
    }
  }
  
  function globalMinimapMouseMove(event) {
    if (isDrag) {
      handleMinimapDrag(event);
    }
  }

  let minimapContainerWidth = $state(900); // Default fallback value
  
  // Combined initialization logic
  function initializeVisibility() {
    if (browser) {
      const storedVisibility = localStorage.getItem('minimapVisible');
      
      // Set the local and global visibility state
      open = storedVisibility === 'true' || 
        (storedVisibility === null && windowWidth >= BREAKPOINT);
      
      setMinimapVisibility(open);
      initialized = true;
    }
  }
  
  // Combined state update function for changing visibility
  function updateMinimapVisibility(isOpen) {
    open = isOpen;
    setMinimapVisibility(isOpen);
    
    if (browser) {
      localStorage.setItem('minimapVisible', isOpen.toString());
    }
    
    // Regenerate grid if opening
    if (isOpen && $mapState.isReady) {
      generateMinimapGrid();
    }
  }
  
  // Simplified toggle function
  function toggleMinimap() {
    updateMinimapVisibility(!open);
  }

  // Initialize on component load (once)
  $effect(() => {
    if (!initialized) {
      initializeVisibility();
    }
  });

  function handleResize() {
    if (browser) {
      windowWidth = window.innerWidth;
    }
  }

  // Touch support for mobile devices
  let touchStartX = $state(0);
  let touchStartY = $state(0);
  let isTouching = $state(false);
  
  function handleTouchStart(event) {
    if (!$mapState.isReady) return;
    
    // Always prevent default to stop page scrolling
    event.preventDefault();
    
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isTouching = true;
  }
  
  function handleTouchMove(event) {
    if (!isTouching || !$mapState.isReady) return;
    event.preventDefault();
    
    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    
    const minimapRect = minimap.getBoundingClientRect();
    const pixelsPerTileX = minimapRect.width / tileCountX;
    const pixelsPerTileY = minimapRect.height / tileCountY;
    
    const cellsMovedX = Math.round(deltaX / pixelsPerTileX);
    const cellsMovedY = Math.round(deltaY / pixelsPerTileY);
    
    if (cellsMovedX === 0 && cellsMovedY === 0) return;
    
    const newTargetX = $mapState.targetCoord.x - cellsMovedX;
    const newTargetY = $mapState.targetCoord.y - cellsMovedY;
    
    moveMapTo(newTargetX, newTargetY);
    
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }
  
  function handleTouchEnd() {
    if (!isTouching) return;
    isTouching = false;
  }

  // Always update range info even when minimap is closed
  $effect(() => {
    if ($mapState.isReady && ($mapState.targetCoord.x !== undefined)) {
      updateMinimapRange($mapState.targetCoord.x, $mapState.targetCoord.y, viewRangeX, viewRangeY);
    }
  });

  // Effect to update global minimap visibility state when local state changes
  $effect(() => {
    setMinimapVisibility(open);
  });

  // Add a derived state to track grid ready status
  const isGridReady = $derived($mapState.isReady);
</script>

<svelte:window
  onmouseup={globalMinimapMouseUp}
  onmousemove={globalMinimapMouseMove}
  onmouseleave={globalMinimapMouseUp}
  onresize={handleResize}
/>

<!-- Always render the container and toggle button -->
<div class="map-container" class:touch-active={isTouching} class:ready={isGridReady}>
  <button 
    class="toggle-button" 
    onclick={toggleMinimap} 
    aria-label={open ? "Hide minimap" : "Show minimap"}
    class:ready={isGridReady}>
    {#if open}
      <Close size="1.2em" color="rgba(0, 0, 0, 0.8)" />
    {:else}
      <span class="toggle-text">M</span>
    {/if}
  </button>
  
  {#if open}
    <div 
      class="minimap"
      class:ready={isGridReady}
      style="width: {MINIMAP_WIDTH_EM}em; height: {MINIMAP_HEIGHT_EM}em;"
      bind:this={minimap}
      onclick={handleMinimapClick}
      onmousedown={handleMinimapDragStart}
      onkeydown={handleKeyDown}
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}
      ontouchcancel={handleTouchEnd}
      tabindex="0"
      role="button"
      aria-label="Mini map for navigation"
      class:drag={isDrag}
      class:touch-drag={isTouching}>
      {#if $mapState.isReady && minimapGrid.length > 0}
        {#each minimapGrid as cell}
          <div
            class="tile"
            class:center={cell.isCenter}
            class:visible={cell.isVisible}
            class:highlighted={isTileHighlighted(cell)} 
            style="
              background-color: {isTileHighlighted(cell) ? 'white' : cell.color};
              width: {MINI_TILE_SIZE_EM}em;
              height: {MINI_TILE_SIZE_EM}em;
              left: {cell.displayX * MINI_TILE_SIZE_EM}em;
              top: {cell.displayY * MINI_TILE_SIZE_EM}em;
            "
            onmouseenter={() => highlightMiniTile(cell)} 
            role="presentation"
            aria-hidden="true">
        </div>
        {/each}
        
        <div 
          class="visible-area-frame"
          style="
            left: {(viewRangeX + area.startX - $mapState.targetCoord.x) * MINI_TILE_SIZE_EM}em;
            top: {(viewRangeY + area.startY - $mapState.targetCoord.y) * MINI_TILE_SIZE_EM}em;
            width: {area.width * MINI_TILE_SIZE_EM}em;
            height: {area.height * MINI_TILE_SIZE_EM}em;
          "
          aria-hidden="true">
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .map-container {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 998;
  }
  
  .toggle-button {
    position: absolute;
    top: 0.5em;
    right: 0.5em;
    min-width: 2em;
    height: 2em;
    background-color: rgba(255, 255, 255, 0.85); /* Increased opacity from 0.6 to 0.85 */
    border: 0.05em solid rgba(255, 255, 255, 0.2); /* Standardize border */
    border-radius: 0.3em;
    color: rgba(0, 0, 0, 0.8);
    padding: 0.3em 0.6em;
    font-size: 1em;
    font-weight: bold;
    cursor: pointer;
    z-index: 1001; /* Standardize z-index to 1001 */
    display: flex;
    align-items: center;
    justify-content: center;
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    transition: all 0.2s ease;
    backdrop-filter: blur(0.5em); /* Add consistent backdrop blur */
    -webkit-backdrop-filter: blur(0.5em);
    opacity: 0;
    transform: translateY(-1em);
  }
  
  /* Only animate when grid is ready */
  .toggle-button.ready {
    animation: fadeInToggle 0.7s ease-out 0.5s forwards;
  }
  
  .toggle-text {
    font-weight: bold;
    color: rgba(0, 0, 0, 0.8);
  }
  
  @keyframes fadeInToggle {
    0% {
      opacity: 0;
      transform: translateY(-1em);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .toggle-button:hover {
    background-color: rgba(255, 255, 255, 0.95); /* Increased hover opacity from 0.8 to 0.95 */
    border-color: rgba(255, 255, 255, 0.5);
  }
  
  .minimap {
    position: absolute;
    top: 0;
    right: 0;
    overflow: hidden;
    background: var(--color-panel-bg);
    border: 1px solid var(--color-panel-border);
    box-shadow: 0 0.1875em 0.625em var(--color-shadow);
    cursor: grab;
    transition: box-shadow 0.2s ease, width 0.3s ease, height 0.3s ease;
    outline: none;
    /* Keep opacity 0 and don't animate until ready */
    opacity: 0;
    transform: translateX(100%);
  }

  /* Only animate when grid is ready */
  .minimap.ready {
    animation: slideInFromRight 0.8s ease-out 0.5s forwards;
  }
  
  .minimap:hover {
    box-shadow: 0 0.15em 0.3em var(--color-shadow);
  }
  
  .minimap:focus {
    box-shadow: 0 0 0 0.2em var(--color-bright-accent);
  }
  
  @keyframes slideInFromRight {
    0% {
      transform: translateX(100%);
      opacity: 0;
    }
    100% {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  .tile {
    position: absolute;
    box-sizing: border-box;
    transition: background-color 0.2s ease;
  }
  
  .tile.center {
    opacity: 0.8;
    border: 0.125em solid white;
    box-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
  }
  
  .tile.visible {
    z-index: 2;
  }
  
  div.tile.highlighted {
    z-index: 4;
    background-color: white;
    opacity: 0.8;
  }
  
  .minimap.drag,
  .minimap.touch-drag {
    cursor: grabbing;
  }

  .visible-area-frame {
    position: absolute;
    border: 0.125em solid white;
    box-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    pointer-events: none;
    z-index: 4;
  }

  @media (max-width: 900px) {
    .toggle-button {
      top: 0.5em;
      right: 0.5em;
    }
  }

  /* Add a small enhancement for touch devices */
  @media (hover: none) {
    .minimap {
      cursor: default; /* Remove grab cursor on touch devices */
    }
    
    .minimap.drag,
    .minimap.touch-drag {
      cursor: default;
    }
    
    .toggle-button {
      padding: 0.4em 0.7em; /* Slightly larger touch target */
    }
  }

  /* Prevent scrolling when touch interacting */
  .map-container.touch-active {
    touch-action: none;
  }
</style>