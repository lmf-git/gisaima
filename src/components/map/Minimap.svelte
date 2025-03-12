<script>
  import { 
    mapState, 
    getTerrainData, 
    updateHoveredTile, 
    updateMinimapRange,
    moveMapTo 
  } from '../../lib/stores/map.js';
  import { browser } from '$app/environment';

  // Simplify state variables
  let open = $state(true);
  let initialized = $state(false);
  let windowWidth = $state(browser ? window.innerWidth : 0);

  // Constants
  const MINI_TILE_SIZE_EM = 0.5;
  const MINIMAP_WIDTH_EM = 24;
  const MINIMAP_HEIGHT_EM = 16;
  const LOADING_THROTTLE = 200;
  const BREAKPOINT = 900; // px
  
  const tileCountX = $derived(Math.floor(MINIMAP_WIDTH_EM / MINI_TILE_SIZE_EM));
  const tileCountY = $derived(Math.floor(MINIMAP_HEIGHT_EM / MINI_TILE_SIZE_EM));
  
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
  
  function generateMinimapGrid() {
    if (!$mapState.isReady || !open) return [];
    
    isLoad = true;
    const now = Date.now();
    
    if (now - lastUpdateTime < LOADING_THROTTLE && $mapState.isDragging) {
      if (loadTimer) clearTimeout(loadTimer);
      loadTimer = setTimeout(() => generateMinimapGrid(), LOADING_THROTTLE);
      return minimapGrid;
    }
    
    const result = [];
    const centerX = $mapState.targetCoord.x;
    const centerY = $mapState.targetCoord.y;
    
    updateMinimapRange(centerX, centerY, viewRangeX, viewRangeY);
    
    try {
      for (let y = -viewRangeY; y <= viewRangeY; y++) {
        for (let x = -viewRangeX; x <= viewRangeX; x++) {
          const globalX = centerX + x;
          const globalY = centerY + y;
          const terrainData = getTerrainData(globalX, globalY);
          
          const isVisible = 
            globalX >= area.startX && 
            globalX < area.startX + area.width &&
            globalY >= area.startY && 
            globalY < area.startY + area.height;
          
          const isCenter = x === 0 && y === 0;
          
          result.push({
            x: globalX,
            y: globalY,
            displayX: x + viewRangeX,
            displayY: y + viewRangeY,
            isCenter,
            isVisible,
            color: terrainData.color
          });
        }
      }
      
      lastUpdateTime = now;
      minimapGrid = result;
    } catch (error) {
      console.error("Error generating minimap grid:", error);
    } finally {
      isLoad = false;
    }
    
    return result;
  }
  
  // Simplified effect for grid generation
  $effect(() => {
    // Generate grid when map is ready and minimap is open
    if ($mapState.isReady && open && ($mapState.targetCoord.x !== undefined)) {
      generateMinimapGrid();
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
  
  function toggleMinimap() {
    open = !open;
    
    // Store preference in localStorage
    if (browser) {
      localStorage.setItem('minimapVisible', open.toString());
    }
    
    // If we're opening the minimap and map is ready, generate grid
    if (open && $mapState.isReady) {
      generateMinimapGrid();
    }
  }
  
  // Simplified initialization for small screens
  function initializeVisibility() {
    if (browser) {
      const storedVisibility = localStorage.getItem('minimapVisible');
      
      if (storedVisibility !== null) {
        // Use stored preference if available
        open = storedVisibility === 'true';
      } else {
        // Default based on screen size
        open = windowWidth >= BREAKPOINT;
      }
      
      initialized = true;
    }
  }
  
  // Initialize on component load
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
</script>

<svelte:window
  onmouseup={globalMinimapMouseUp}
  onmousemove={globalMinimapMouseMove}
  onmouseleave={globalMinimapMouseUp}
  onresize={handleResize}
/>

<!-- Always render the container and toggle button -->
<div class="map-container">
  <button 
    class="toggle-button" 
    onclick={toggleMinimap} 
    aria-label={open ? "Hide minimap" : "Show minimap"}>
    {#if open}
      ×
    {:else}
      M
    {/if}
  </button>
  
  {#if open}
    <div 
      class="minimap" 
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
    width: 2em;
    height: 2em;
    background: var(--color-panel-bg);
    border: 1px solid var(--color-panel-border);
    border-radius: 0.25em;
    color: white;
    font-size: 1em;
    font-weight: bold;
    cursor: pointer;
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0.1em 0.3em var(--color-shadow);
    transition: all 0.2s ease;
    opacity: 0; /* Start invisible */
    animation: fadeInToggle 0.7s ease-out 0.3s forwards; /* Add slight delay for better UX */
  }
  
  @keyframes fadeInToggle {
    0% {
      opacity: 0;
      transform: translateY(-0.5em) scale(0.9);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }
  
  .toggle-button:hover {
    background: var(--color-panel-hover);
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
    transition: box-shadow 0.2s ease;
    outline: none;
    animation: slideInFromRight 0.8s ease-out forwards;
    opacity: 0;
    transform: translateX(100%);
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
      padding: 0.3em; /* Slightly larger touch target */
      font-size: 1.1em;
    }
  }
</style>