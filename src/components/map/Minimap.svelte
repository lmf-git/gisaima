<script>
  import { derived } from 'svelte/store';
  import { 
    map, 
    mapReady,
    coordinates,
    GRID_COLS_FACTOR,
    GRID_ROWS_FACTOR,
    updateHoveredTile, 
    moveTarget
  } from '../../lib/stores/map.js';
  import { browser } from '$app/environment';
  import Close from '../../components/icons/Close.svelte';

  // Simplify state variables
  let open = $state(true);
  let dd = $state(false);
  let windowWidth = $state(browser ? window.innerWidth : 0);

  // Constants
  const BREAKPOINT = 768;
  const DRAG_THRESHOLD = 5;
  
  // Calculate minimap dimensions - keep this unchanged
  const tileCountX = $derived($mapReady ? $map.cols * GRID_COLS_FACTOR : 48);
  const tileCountY = $derived($mapReady ? $map.rows * GRID_ROWS_FACTOR : 32);
  const viewRangeX = $derived(Math.floor(tileCountX / 2));
  const viewRangeY = $derived(Math.floor(tileCountY / 2));
  
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
  
  // Filter coordinates for minimap - much simpler now, doesn't remap
  const grid = $derived(coordinates);
  
  
  function navigateToPosition(tileX, tileY) {
    const worldX = Math.round($map.target.x - viewRangeX + tileX); // Renamed from centerCoord
    const worldY = Math.round($map.target.y - viewRangeY + tileY); // Renamed from centerCoord
    
    moveTarget(worldX, worldY); // Renamed from moveCenterTo
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
    
    moveTarget($map.target.x - cellsMovedX, $map.target.y - cellsMovedY); // Renamed from centerCoord and moveCenterTo
    
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
    
    moveTarget($map.target.x - cellsMovedX, $map.target.y - cellsMovedY); // Renamed from centerCoord and moveCenterTo
    
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
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div 
      class="minimap"
      class:ready={$mapReady}
      aria-hidden="true"
      bind:this={minimap}
      onclick={() => moveTarget($map.hoveredTile.x, $map.hoveredTile.y)}
      onmousedown={handleMinimapDragStart}
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}
      ontouchcancel={handleTouchEnd}
      class:drag={isDrag}
      class:touch-drag={isTouching}>
      {#if $mapReady && $grid.length > 0}
        <div class="minimap-grid" style="--grid-cols: {tileCountX}; --grid-rows: {tileCountY};">
          {#each $grid as cell}
            {@const relativeX = cell.x - $map.target.x + viewRangeX} 
            {@const relativeY = cell.y - $map.target.y + viewRangeY} 
            {@const isTarget = cell.x === $map.target.x && cell.y === $map.target.y}
            <div
              class="tile"
              class:center={isTarget} 
              class:visible={cell.isInMainView}
              class:highlighted={cell.highlighted}
              style="
                background-color: {cell.color};
                grid-column-start: {relativeX + 1};
                grid-row-start: {relativeY + 1};
              "
              onmouseenter={() => updateHoveredTile(cell.x, cell.y)} 
              role="presentation"
              aria-hidden="true">
            </div>
          {/each}
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
    transition: background-color 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease;
    position: relative; /* Add this for proper stacking context */
  }
  
  /* Make center tile more stable */
  .tile.center {
    z-index: 5; /* Always on top */
    opacity: 1;
    border: none; /* Remove border */
    position: relative;
  }

  .tile.center::after {
    content: '';
    position: absolute;
    top: 0; 
    left: 0;
    width: 100%;
    height: 100%;
    border: 0.125em solid white; /* Add border with ::after */
    box-shadow: 0 0 0.2em rgba(255, 255, 255, 0.8);
    box-sizing: border-box;
    pointer-events: none;
    z-index: 5;
  }
  
  .tile.visible {
    z-index: 2;
    filter: brightness(1.2);
  }
  
  /* Change highlight approach to avoid background-color conflict */
  .tile.highlighted {
    z-index: 4;
    filter: brightness(1.5); /* Use brightness filter instead of setting background-color */
    box-shadow: inset 0 0 0 0.1em rgba(255, 255, 255, 0.9), 0 0 0.25em rgba(255, 255, 255, 0.7); /* Add white inner and outer glow */
    opacity: 1;
  }
  
  .minimap.drag,
  .minimap.touch-drag {
    cursor: grabbing;
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