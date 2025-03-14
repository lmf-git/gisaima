<script>
  import { derived } from 'svelte/store';
  import { 
    map, 
    mapReady,
    coordinates,
    GRID_COLS_FACTOR,
    GRID_ROWS_FACTOR,
    updateHoveredTile, 
    moveCenterTo
  } from '../../lib/stores/map.js';
  import { browser } from '$app/environment';
  import Close from '../../components/icons/Close.svelte';

  // Simplify state variables
  let open = $state(true);
  let dd = $state(false);
  let windowWidth = $state(browser ? window.innerWidth : 0);

  // Constants
  const MINI_TILE_SIZE_EM = 0.5;
  const BREAKPOINT = 768;
  const DRAG_THRESHOLD = 5;
  
  // Calculate minimap dimensions - keep this unchanged
  const tileCountX = $derived($mapReady ? $map.cols * GRID_COLS_FACTOR : 48);
  const tileCountY = $derived($mapReady ? $map.rows * GRID_ROWS_FACTOR : 32);
  const MINIMAP_WIDTH_EM = $derived(tileCountX * MINI_TILE_SIZE_EM);
  const MINIMAP_HEIGHT_EM = $derived(tileCountY * MINI_TILE_SIZE_EM);
  const viewRangeX = $derived(Math.floor(tileCountX / 2));
  const viewRangeY = $derived(Math.floor(tileCountY / 2));
  
  // Update area calculation - keep this unchanged
  const area = $derived({
    startX: $map.centerCoord.x - Math.floor($map.cols / 2),
    startY: $map.centerCoord.y - Math.floor($map.rows / 2),
    width: $map.cols,
    height: $map.rows
  });
  
  // State variables
  let isDrag = $state(false);
  let dragX = $state(0);
  let dragY = $state(0);
  let minimap = $state(null);
  let wasDrag = $state(false);
  let dist = $state(0);
  let touchStartX = $state(0);
  let touchStartY = $state(0);
  let isTouching = $state(false);
  
  // Create a simpler derived store that just adds display coordinates
  const minimapGrid = derived(
    [coordinates, map],
    ([$expandedGrid, $map]) => {
      if (!$expandedGrid || $expandedGrid.length === 0 || !open || !$map.isReady) {
        return [];
      }
      
      // Calculate displayX and displayY for each cell
      return $expandedGrid.map(cell => {
        // Calculate position relative to center for minimap display
        const displayX = cell.x - $map.centerCoord.x + viewRangeX;
        const displayY = cell.y - $map.centerCoord.y + viewRangeY;
        
        // Check if this cell is within the main view
        const isVisible = 
          cell.x >= area.startX && 
          cell.x < area.startX + area.width &&
          cell.y >= area.startY && 
          cell.y < area.startY + area.height;
        
        // Pre-calculate highlight state directly on the cell
        const highlighted = !isMoving && $map.hoveredTile && 
          cell.x === $map.hoveredTile.x && 
          cell.y === $map.hoveredTile.y;
        
        return {
          x: cell.x,
          y: cell.y,
          displayX,
          displayY,
          isCenter: cell.isCenter,
          isVisible,
          color: cell.color,
          highlighted
        };
      });
    },
    []
  );
  
  // Movement and interaction state
  const isMoving = $derived($map.isDragging || $map.keyboardNavigationInterval !== null || isDrag);
  
  function highlightMiniTile(cell) {
    if (!isMoving) {
      updateHoveredTile(cell.x, cell.y);
    }
  }
  
  // Remove the isTileHighlighted function since we now have it as a property

  // Click handling
  function handleMinimapClick(event) {
    if (wasDrag || !$mapReady) {
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
    if (!$mapReady) return;
    
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigateToPosition(Math.floor(tileCountX / 2), Math.floor(tileCountY / 2));
    }
  }
  
  function navigateToPosition(tileX, tileY) {
    const worldX = Math.round($map.centerCoord.x - viewRangeX + tileX);
    const worldY = Math.round($map.centerCoord.y - viewRangeY + tileY);
    
    moveCenterTo(worldX, worldY);
  }

  // Drag handling
  function handleMinimapDragStart(event) {
    if (event.button !== 0 || !$mapReady) return;
    
    isDrag = true;
    dragX = event.clientX;
    dragY = event.clientY;
    dist = 0;
    wasDrag = false;
    
    event.preventDefault();
  }
  
  function handleMinimapDrag(event) {
    if (!isDrag || !$mapReady) return;
    
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
    
    moveCenterTo($map.centerCoord.x - cellsMovedX, $map.centerCoord.y - cellsMovedY);
    
    dragX = event.clientX;
    dragY = event.clientY;
  }
  
  function handleMinimapDragEnd() {
    if (!isDrag) return;
    isDrag = false;
  }
  
  function globalMinimapMouseUp() {
    if (isDrag) handleMinimapDragEnd();
  }
  
  function globalMinimapMouseMove(event) {
    if (isDrag) handleMinimapDrag(event);
  }

  // Add local implementation of setMinimapVisibility
  function setMinimapVisibility(isVisible) {
    map.update(state => ({
      ...state,
      minimapVisible: isVisible
    }));
  }
  
  // Visibility and localStorage
  function initializeVisibility() {
    if (browser) {
      const storedVisibility = localStorage.getItem('minimapVisible');
      
      open = storedVisibility === 'true' || 
        (storedVisibility === null && windowWidth >= BREAKPOINT);
      
      setMinimapVisibility(open); // Now using local function
      dd = true;
    }
  }
  
  function updateMinimapVisibility(isOpen) {
    open = isOpen;
    setMinimapVisibility(isOpen); // Now using local function
    
    if (browser) {
      localStorage.setItem('minimapVisible', isOpen.toString());
    }
  }
  
  function toggleMinimap() {
    updateMinimapVisibility(!open);
  }

  // Initialize on component load
  $effect(() => {
    if (!dd) {
      initializeVisibility();
    }
  });

  function handleResize() {
    if (browser) {
      windowWidth = window.innerWidth;
    }
  }

  // Touch handling
  function handleTouchStart(event) {
    if (!$mapReady) return;
    
    event.preventDefault();
    
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isTouching = true;
  }
  
  function handleTouchMove(event) {
    if (!isTouching || !$mapReady) return;
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
    
    moveCenterTo($map.centerCoord.x - cellsMovedX, $map.centerCoord.y - cellsMovedY);
    
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }
  
  function handleTouchEnd() {
    if (!isTouching) return;
    isTouching = false;
  }

</script>

<svelte:window
  onmouseup={globalMinimapMouseUp}
  onmousemove={globalMinimapMouseMove}
  onmouseleave={globalMinimapMouseUp}
  onresize={handleResize}
/>

<!-- Always render the container and toggle button -->
<div class="map-container" class:touch-active={isTouching} class:ready={$mapReady}>
  <button 
    class="toggle-button" 
    onclick={toggleMinimap} 
    aria-label={open ? "Hide minimap" : "Show minimap"}
    class:ready={$mapReady}>
    {#if open}
      <Close size="1.2em" color="rgba(0, 0, 0, 0.8)" />
    {:else}
      <span class="toggle-text">M</span>
    {/if}
  </button>
  
  {#if open}
    <div 
      class="minimap"
      class:ready={$mapReady}
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
      {#if $mapReady && $minimapGrid.length > 0}
        <div class="minimap-grid" style="--grid-cols: {tileCountX}; --grid-rows: {tileCountY};">
          {#each $minimapGrid as cell}
            <div
              class="tile"
              class:center={cell.isCenter}
              class:visible={cell.isVisible}
              class:highlighted={cell.highlighted}
              style="
                background-color: {cell.highlighted ? 'white' : cell.color};
                grid-column-start: {cell.displayX + 1};
                grid-row-start: {cell.displayY + 1};
              "
              onmouseenter={() => highlightMiniTile(cell)} 
              role="presentation"
              aria-hidden="true">
            </div>
          {/each}
          
          <div 
            class="visible-area-frame"
            style="
              grid-column-start: {viewRangeX + area.startX - $map.centerCoord.x + 1};
              grid-row-start: {viewRangeY + area.startY - $map.centerCoord.y + 1};
              grid-column-end: span {area.width};
              grid-row-end: span {area.height};
            "
            aria-hidden="true">
          </div>
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
    transition: box-shadow 0.2s ease;
    outline: none;
    opacity: 0;
    transform: translateX(100%);
  }

  .minimap-grid {
    display: grid;
    grid-template-columns: repeat(var(--grid-cols), var(--mini-tile-size, 0.5em));
    grid-template-rows: repeat(var(--grid-rows), var(--mini-tile-size, 0.5em));
    --mini-tile-size: 0.5em;
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
    width: var(--mini-tile-size);
    height: var(--mini-tile-size);
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