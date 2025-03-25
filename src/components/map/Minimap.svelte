<script>
  import { derived } from 'svelte/store';
  import { 
    map, 
    ready,
    coordinates,
    highlightedStore,  // Add highlightedStore import
    EXPANDED_COLS_FACTOR,
    EXPANDED_ROWS_FACTOR,
    setHighlighted,  // Renamed from updateHoveredTile
    moveTarget
  } from '../../lib/stores/map.js';
  import { browser } from '$app/environment';
  import Close from '../../components/icons/Close.svelte';

  // Simplify state variables
  let open = $state(true);
  let closing = $state(false);  // New state to track closing animation
  let dd = $state(false);
  let windowWidth = $state(browser ? window.innerWidth : 0);
  let isDrag = $state(false);
  let dragX = $state(0);
  let dragY = $state(0);
  let minimap = $state(null);
  let wasDrag = $state(false);
  let dist = $state(0);

  let isTouching = $state(false);

  // Constants
  const BREAKPOINT = 768;
  const DRAG_THRESHOLD = 5;
  const ANIMATION_DURATION = 800;  // Match the slide-in duration
  
  // Calculate minimap dimensions
  const tileCountX = $derived($ready ? $map.cols * EXPANDED_COLS_FACTOR : 48);
  const tileCountY = $derived($ready ? $map.rows * EXPANDED_ROWS_FACTOR : 32);
  const viewRangeX = $derived(Math.floor(tileCountX / 2));
  const viewRangeY = $derived(Math.floor(tileCountY / 2));
  
  // Filter coordinates for minimap
  const grid = $derived(coordinates);
  
  // Remove navigateToPosition - unused now that we use hoveredTile directly

  // Add minimapDragAction for Minimap-specific logic
  function minimapDragAction(event) {
    if (event.button !== undefined && event.button !== 0) return false;
    
    // Start drag
    if (event.type === 'dragstart' || event.type === 'touchstart') {
      isDrag = true;
      dragX = event.clientX || event.touches?.[0]?.clientX;
      dragY = event.clientY || event.touches?.[0]?.clientY;
      dist = 0;
      wasDrag = false;
      
      return true;
    }
    
    // Process drag
    else if ((event.type === 'dragmove' || event.type === 'touchmove') && isDrag) {
      const currentX = event.clientX || event.touches?.[0]?.clientX;
      const currentY = event.clientY || event.touches?.[0]?.clientY;
      
      const deltaX = currentX - dragX;
      const deltaY = currentY - dragY;
      
      dist += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      if (dist > DRAG_THRESHOLD) {
        wasDrag = true;
      }
      
      const minimapRect = minimap.getBoundingClientRect();
      const pixelsPerTileX = minimapRect.width / tileCountX;
      const pixelsPerTileY = minimapRect.height / tileCountY;
      
      const cellsMovedX = Math.round(deltaX / pixelsPerTileX);
      const cellsMovedY = Math.round(deltaY / pixelsPerTileY);
      
      if (cellsMovedX === 0 && cellsMovedY === 0) return false;
      
      moveTarget($map.target.x - cellsMovedX, $map.target.y - cellsMovedY);
      
      dragX = currentX;
      dragY = currentY;
      
      return true;
    }
    
    // End drag
    else if (event.type === 'dragend' || event.type === 'touchend') {
      const wasDragging = isDrag;
      isDrag = false;
      return wasDragging;
    }
    
    return false;
  }
  
  // Drag handling
  function handleMinimapDragStart(event) {
    if (event.button !== 0 || !$ready) return;
    
    // Create a new event object with only the properties we need
    // Instead of trying to call preventDefault on the synthetic event
    minimapDragAction({
      type: 'dragstart',
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button
    });
    
    // Call preventDefault on the original DOM event
    if (event.preventDefault) {
      event.preventDefault();
    }
  }
  
  function handleMinimapDrag(event) {
    if (!isDrag || !$ready) return;
    
    // Create a new event object with only the properties we need
    minimapDragAction({
      type: 'dragmove',
      clientX: event.clientX,
      clientY: event.clientY
    });
  }
  
  function handleMinimapDragEnd() {
    if (!isDrag) return;
    minimapDragAction({ type: 'dragend' });
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
      minimap: isVisible
    }));
  }
  
  // Visibility and localStorage
  function initializeVisibility() {
    if (browser) {
      const storedVisibility = localStorage.getItem('minimap');
      
      open = storedVisibility === 'true' || 
        (storedVisibility === null && windowWidth >= BREAKPOINT);
      
      setMinimapVisibility(open); // Now using local function
      dd = true;
    }
  }
  
  // Function to handle minimap visibility with animation
  function updateMinimapVisibility(isOpen) {
    if (open && !isOpen) {
      // Handle closing with animation
      closing = true;
      setTimeout(() => {
        open = false;
        closing = false;
        setMinimapVisibility(false);
        if (browser) {
          localStorage.setItem('minimap', 'false');
        }
      }, ANIMATION_DURATION);
    } else {
      // For opening or direct state changes
      open = isOpen;
      setMinimapVisibility(isOpen);
      
      if (browser) {
        localStorage.setItem('minimap', isOpen.toString());
      }
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
    if (!$ready) return;
    
    // Always use the original DOM event's preventDefault
    if (event.preventDefault) {
      event.preventDefault();
    }
    
    isTouching = true;
    
    minimapDragAction({
      type: 'touchstart',
      touches: event.touches
    });
  }
  
  function handleTouchMove(event) {
    if (!isTouching || !$ready) return;
    
    // Always use the original DOM event's preventDefault
    if (event.preventDefault) {
      event.preventDefault();
    }
    
    minimapDragAction({
      type: 'touchmove',
      touches: event.touches
    });
  }
  
  function handleTouchEnd() {
    minimapDragAction({ type: 'dragend' });
    isTouching = false;
  }

  // Click handler now uses highlightedStore instead of map.highlighted
  function handleMinimapClick() {
    if (wasDrag || !$ready || !$highlightedStore) return;  // Use highlightedStore instead
    moveTarget($highlightedStore.x, $highlightedStore.y);  // Use highlightedStore instead
  }
</script>

<svelte:window
  onmouseup={globalMinimapMouseUp}
  onmousemove={globalMinimapMouseMove}
  onmouseleave={globalMinimapMouseUp}
  onresize={handleResize}
/>

<!-- Always render the container and toggle button -->
<div class="map-container" class:touch-active={isTouching} class:ready={$ready}>
  <button 
    class="toggle-button" 
    onclick={toggleMinimap} 
    aria-label={open ? "Hide minimap" : "Show minimap"}
    class:ready={$ready}>
    {#if open || closing}
      <Close size="1.2em" extraClass="close-icon-dark" />
    {:else}
      <span class="toggle-text">M</span>
    {/if}
  </button>
  
  {#if open || closing}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div 
      class="minimap"
      class:ready={$ready}
      class:closing={closing}
      aria-hidden="true"
      bind:this={minimap}
      onclick={handleMinimapClick}
      onmousedown={handleMinimapDragStart}
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}
      ontouchcancel={handleTouchEnd}
      class:drag={isDrag}
      class:touch-drag={isTouching}>
      {#if $ready && $grid.length > 0}
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
              class:has-structure={cell.structure}
              class:has-spawn={cell.structure?.type === 'spawn'}
              class:has-players={cell.players?.length > 0}
              class:has-groups={cell.groups?.length > 0}
              style="
                --tile-color: {cell.color};
                grid-column-start: {relativeX + 1};
                grid-row-start: {relativeY + 1};
              "
              onmouseenter={() => setHighlighted(cell.x, cell.y)}
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
    border: 0.0625em solid var(--color-panel-border);
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
  
  /* New animation for closing */
  .minimap.closing {
    animation: slideOutToRight 0.8s ease-in forwards;
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
  
  /* Add the slide-out animation */
  @keyframes slideOutToRight {
    0% {
      transform: translateX(0);
      opacity: 1;
    }
    100% {
      transform: translateX(100%);
      opacity: 0;
    }
  }
  
  .tile {
    width: var(--mini-tile-size);
    height: var(--mini-tile-size);
    box-sizing: border-box;
    position: relative;
    z-index: 1;
    background-color: var(--tile-color); /* Set background from CSS var instead of inline */
  }
  
  /* Base tile content indicator using borders */
  .tile.has-structure {
    border-bottom: 0.15em solid rgba(255, 255, 255, 0.6);
    border-left: 0.15em solid rgba(255, 255, 255, 0.6);
  }
  
  .tile.has-players {
    border-top: 0.15em solid rgba(100, 100, 255, 0.7);
    border-left: 0.15em solid rgba(100, 100, 255, 0.7);
  }
  
  .tile.has-groups {
    border-top: 0.15em solid rgba(255, 100, 100, 0.7);
    border-right: 0.15em solid rgba(255, 100, 100, 0.7);
  }
  
  /* Special indicator for spawn points */
  .tile.has-spawn {
    border: 0.15em solid rgba(0, 255, 255, 0.8);
    border-radius: 50%;
  }
  
  /* Use ::before for the visible highlight effect */
  .tile.visible::before {
    content: "";
    position: absolute;
    inset: 0;
    background-color: rgba(255, 255, 255, 0.2);
    z-index: 2;
    pointer-events: none;
  }
  
  /* Use ::after for the hover highlight effect */
  .tile.highlighted::after {
    content: "";
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 0 0.1em white, 0 0 0.2em white;
    z-index: 3;
    pointer-events: none;
  }
  
  /* Make center tile more stable - using both border and ::after */
  .tile.center {
    z-index: 5;
    border: 0.125em solid white;
  }
  
  .tile.center::after {
    content: '';
    position: absolute;
    inset: 0;
    box-shadow: 0 0 0.25em rgba(255, 255, 255, 0.8);
    pointer-events: none;
    z-index: 5;
  }
  
  /* Remove filter effects since we're using overlays now */
  .tile.visible {
    z-index: 2;
  }
  
  .tile.highlighted {
    z-index: 4;
  }
  
  /* Handle special cases where multiple features overlap */
  .tile.has-structure.has-players {
    border-left: 0.15em solid rgba(177, 177, 255, 0.7);
  }
  
  .tile.has-structure.has-spawn {
    border: 0.15em solid rgba(0, 255, 255, 0.8);
    border-radius: 50%;
  }
  
  /* Spawn always takes precedence in border styling */
  .tile.has-spawn.has-players,
  .tile.has-spawn.has-groups,
  .tile.has-spawn.has-players.has-groups {
    border: 0.15em solid rgba(0, 255, 255, 0.8);
    border-radius: 50%;
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

  :global(.close-icon-dark) {
    color: rgba(0, 0, 0, 0.8);
    stroke: rgba(0, 0, 0, 0.8);
  }

  .toggle-button > :global(.close-icon-dark) {
    color: rgba(0, 0, 0, 0.8);
    stroke: rgba(0, 0, 0, 0.8);
  }
</style>